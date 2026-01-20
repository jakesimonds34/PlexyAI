import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    console.log("=== AUTH DEBUG ===");
    console.log("Auth header present:", !!authHeader);
    console.log("Auth header value:", authHeader ? authHeader.substring(0, 50) + "..." : "NULL");

    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract just the token part (remove "Bearer " prefix if present)
    const token = authHeader.replace("Bearer ", "");
    console.log("Token length:", token.length);
    console.log("Token starts with:", token.substring(0, 20));

    // Initialize Supabase client with service role for database access
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    console.log("Supabase URL:", supabaseUrl);
    console.log("Anon key present:", !!supabaseAnonKey);
    console.log("Service key present:", !!supabaseServiceKey);

    // Service client for database operations (bypasses RLS)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user by passing the token directly to getUser()
    console.log("Calling getUser(token)...");
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    console.log("getUser result - user:", user?.id || "NULL");
    console.log("getUser result - error:", userError ? JSON.stringify(userError) : "NULL");

    if (userError || !user) {
      console.error("Auth error details:", {
        errorMessage: userError?.message,
        errorStatus: userError?.status,
        errorCode: userError?.code,
        fullError: JSON.stringify(userError)
      });
      return new Response(
        JSON.stringify({
          error: "Invalid user token",
          details: userError?.message || "Unknown auth error",
          code: userError?.code
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("User authenticated:", user.id);

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const action = body.action || "get"; // "get", "store", "refresh"

    if (action === "store") {
      // Store refresh token after OAuth login
      const { refresh_token, access_token, expires_in, scope } = body;

      if (!refresh_token) {
        return new Response(
          JSON.stringify({ error: "No refresh token provided" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const expires_at = expires_in
        ? new Date(Date.now() + expires_in * 1000).toISOString()
        : null;

      // Upsert token (insert or update if exists)
      const { error: upsertError } = await supabaseAdmin
        .from("google_tokens")
        .upsert({
          user_id: user.id,
          refresh_token,
          access_token,
          expires_at,
          scope,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: "user_id",
        });

      if (upsertError) {
        console.error("Error storing token:", upsertError);
        return new Response(
          JSON.stringify({ error: "Failed to store token" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Token stored successfully for user:", user.id);
      return new Response(
        JSON.stringify({ success: true, message: "Token stored" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get or refresh token
    // First, check if we have a stored token
    const { data: tokenData, error: fetchError } = await supabaseAdmin
      .from("google_tokens")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (fetchError || !tokenData) {
      console.log("No token found for user:", user.id);
      return new Response(
        JSON.stringify({
          error: "No Google token found",
          needsReauth: true,
          message: "Please connect your Google account"
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if access token is still valid (with 5 min buffer)
    const expiresAt = tokenData.expires_at ? new Date(tokenData.expires_at) : null;
    const isExpired = !expiresAt || expiresAt.getTime() < Date.now() + 5 * 60 * 1000;

    if (action === "get" && !isExpired && tokenData.access_token) {
      // Return existing valid token
      console.log("Returning existing valid token for user:", user.id);
      return new Response(
        JSON.stringify({
          access_token: tokenData.access_token,
          expires_at: tokenData.expires_at,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Need to refresh the token
    console.log("Refreshing token for user:", user.id);

    // Get Google OAuth credentials from environment variables
    const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
    const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

    // Refresh the token with Google
    const refreshResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: googleClientId,
        client_secret: googleClientSecret,
        refresh_token: tokenData.refresh_token,
        grant_type: "refresh_token",
      }),
    });

    if (!refreshResponse.ok) {
      const errorText = await refreshResponse.text();
      console.error("Google refresh failed:", errorText);

      // If refresh token is invalid, user needs to reauth
      if (refreshResponse.status === 400 || refreshResponse.status === 401) {
        // Delete invalid token
        await supabaseAdmin
          .from("google_tokens")
          .delete()
          .eq("user_id", user.id);

        return new Response(
          JSON.stringify({
            error: "Token refresh failed",
            needsReauth: true,
            message: "Please reconnect your Google account"
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Failed to refresh token" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const refreshData = await refreshResponse.json();
    const newAccessToken = refreshData.access_token;
    const newExpiresIn = refreshData.expires_in || 3600;
    const newExpiresAt = new Date(Date.now() + newExpiresIn * 1000).toISOString();

    // Update token in database
    const { error: updateError } = await supabaseAdmin
      .from("google_tokens")
      .update({
        access_token: newAccessToken,
        expires_at: newExpiresAt,
        // Google may return a new refresh token (rare but possible)
        ...(refreshData.refresh_token && { refresh_token: refreshData.refresh_token }),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (updateError) {
      console.error("Error updating token:", updateError);
    }

    console.log("Token refreshed successfully for user:", user.id);
    return new Response(
      JSON.stringify({
        access_token: newAccessToken,
        expires_at: newExpiresAt,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in google-token function:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
