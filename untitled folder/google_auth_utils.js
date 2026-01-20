/**
 * Google Authentication Utilities
 * Handles Google OAuth token management via Supabase Edge Functions
 * Tokens are stored securely in the database, not localStorage/sessionStorage
 */

const GOOGLE_TOKEN_EDGE_FUNCTION = 'https://zjtnptmbyaffsqrikrzi.supabase.co/functions/v1/google-token';

// In-memory cache for current session (cleared on page refresh)
let cachedToken = null;
let cachedTokenExpiry = null;

/**
 * Get Google access token from Supabase edge function
 * @param {Object} supabase - Supabase client instance
 * @returns {Promise<string|null>} - Google access token or null
 */
async function getGoogleAccessToken(supabase) {
    try {
        // Check in-memory cache first (valid for current session only)
        if (cachedToken && cachedTokenExpiry && new Date(cachedTokenExpiry) > new Date()) {
            console.log('Using cached Google token');
            return cachedToken;
        }

        // Get current Supabase session for authentication
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error || !session) {
            console.error('Error getting session:', error);
            return null;
        }

        console.log('=== googleAuthUtils.getGoogleAccessToken DEBUG ===');

        // First check if we have a provider_token in the current session (fresh OAuth)
        if (session.provider_token) {
            console.log('✅ Found provider_token in current session');
            // Cache it for this session
            cachedToken = session.provider_token;
            // Assume 1 hour expiry for fresh tokens
            cachedTokenExpiry = new Date(Date.now() + 55 * 60 * 1000).toISOString();
            return session.provider_token;
        }

        // Fetch token from edge function (stored in database)
        console.log('Fetching token from edge function...');
        const response = await fetch(GOOGLE_TOKEN_EDGE_FUNCTION, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ action: 'get' })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Error from edge function:', errorData);

            if (errorData.needsReauth) {
                console.log('❌ User needs to reconnect Google account');
                return null;
            }

            return null;
        }

        const tokenData = await response.json();
        console.log('✅ Got token from edge function');

        // Cache the token
        cachedToken = tokenData.access_token;
        cachedTokenExpiry = tokenData.expires_at;

        return tokenData.access_token;

    } catch (error) {
        console.error('Error getting Google access token:', error);
        return null;
    }
}

/**
 * Refresh Google access token using Supabase edge function
 * @param {Object} supabase - Supabase client instance
 * @returns {Promise<string|null>} - Refreshed Google access token or null
 */
async function refreshGoogleAccessToken(supabase) {
    try {
        // Clear cache to force refresh
        cachedToken = null;
        cachedTokenExpiry = null;

        const { data: { session }, error } = await supabase.auth.getSession();

        if (error || !session) {
            console.error('Error getting session for refresh:', error);
            return null;
        }

        console.log('Refreshing Google token via edge function...');
        const response = await fetch(GOOGLE_TOKEN_EDGE_FUNCTION, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ action: 'refresh' })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Error refreshing token:', errorData);
            return null;
        }

        const tokenData = await response.json();
        console.log('✅ Token refreshed successfully');

        // Cache the new token
        cachedToken = tokenData.access_token;
        cachedTokenExpiry = tokenData.expires_at;

        return tokenData.access_token;

    } catch (error) {
        console.error('Error refreshing Google access token:', error);
        return null;
    }
}

/**
 * Make authenticated request to Google API with automatic token refresh
 * @param {string} url - Google API endpoint
 * @param {Object} options - Fetch options
 * @param {Object} supabase - Supabase client instance
 * @returns {Promise<Response>} - Fetch response
 */
async function fetchWithGoogleAuth(url, options = {}, supabase) {
    let accessToken = await getGoogleAccessToken(supabase);

    if (!accessToken) {
        throw new Error('No Google access token available. Please reconnect your Google account.');
    }

    // Add authorization header
    const headers = {
        'Authorization': `Bearer ${accessToken}`,
        ...options.headers
    };

    // Make the request
    let response = await fetch(url, {
        ...options,
        headers
    });

    // If unauthorized, try refreshing token once
    if (response.status === 401 && supabase) {
        console.log('Token expired, attempting refresh...');
        accessToken = await refreshGoogleAccessToken(supabase);

        if (accessToken) {
            // Retry the request with new token
            headers['Authorization'] = `Bearer ${accessToken}`;
            response = await fetch(url, {
                ...options,
                headers
            });
        } else {
            throw new Error('Token refresh failed. Please reconnect your Google account.');
        }
    }

    return response;
}

/**
 * Check if Google token is available and valid
 * @param {Object} supabase - Supabase client instance
 * @returns {Promise<boolean>} - True if token is available
 */
async function hasValidGoogleToken(supabase) {
    const token = await getGoogleAccessToken(supabase);
    return token !== null;
}

/**
 * Clear cached token (call on logout)
 */
function clearGoogleTokenCache() {
    cachedToken = null;
    cachedTokenExpiry = null;
    console.log('Google token cache cleared');
}

// Export functions for use in other files
if (typeof window !== 'undefined') {
    window.googleAuthUtils = {
        getGoogleAccessToken,
        refreshGoogleAccessToken,
        fetchWithGoogleAuth,
        hasValidGoogleToken,
        clearGoogleTokenCache
    };
}
