/**
 * Google Authentication Utilities
 * Handles Google OAuth token management and refresh
 */

/**
 * Get Google access token from Supabase session
 * @param {Object} supabase - Supabase client instance
 * @returns {Promise<string|null>} - Google access token or null
 */
async function getGoogleAccessToken(supabase) {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error || !session) {
            console.error('Error getting session:', error);
            return null;
        }
        
        // Check if we have a provider token (from Google OAuth)
        if (session.provider_token) {
            // Check if token is expired (rough check - Google tokens typically last 1 hour)
            // Store token in sessionStorage for quick access
            sessionStorage.setItem('googleAccessToken', session.provider_token);
            if (session.provider_refresh_token) {
                sessionStorage.setItem('googleRefreshToken', session.provider_refresh_token);
            }
            return session.provider_token;
        }
        
        // Fallback: check sessionStorage
        const storedToken = sessionStorage.getItem('googleAccessToken');
        if (storedToken) {
            return storedToken;
        }
        
        return null;
    } catch (error) {
        console.error('Error getting Google access token:', error);
        return null;
    }
}

/**
 * Refresh Google access token using Supabase
 * @param {Object} supabase - Supabase client instance
 * @returns {Promise<string|null>} - Refreshed Google access token or null
 */
async function refreshGoogleAccessToken(supabase) {
    try {
        // Supabase handles token refresh automatically
        // We just need to get the new session
        const { data: { session }, error } = await supabase.auth.refreshSession();
        
        if (error || !session) {
            console.error('Error refreshing session:', error);
            // If refresh fails, user may need to re-authenticate
            return null;
        }
        
        if (session.provider_token) {
            sessionStorage.setItem('googleAccessToken', session.provider_token);
            if (session.provider_refresh_token) {
                sessionStorage.setItem('googleRefreshToken', session.provider_refresh_token);
            }
            return session.provider_token;
        }
        
        return null;
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

// Export functions for use in other files
if (typeof window !== 'undefined') {
    window.googleAuthUtils = {
        getGoogleAccessToken,
        refreshGoogleAccessToken,
        fetchWithGoogleAuth,
        hasValidGoogleToken
    };
}

