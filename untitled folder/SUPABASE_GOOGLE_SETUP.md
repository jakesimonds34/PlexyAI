# Supabase Google OAuth Setup Guide

## ✅ What's Already Configured

### 1. Google Auth Provider in Supabase

**Status:** ✅ Already set up

In your Supabase Dashboard:
- Go to **Authentication** → **Providers**
- **Google** provider is enabled
- **Client ID** and **Client Secret** are configured
- **Callback URL** matches: `https://zjtnptmbyaffsqrikrzi.supabase.co/auth/v1/callback`

**No action needed** - this is already correct.

---

### 2. Required OAuth Scopes

When configuring Google OAuth in Supabase, ensure these scopes are requested:

**Required Scopes:**
- `https://www.googleapis.com/auth/classroom.courses.readonly` - Read classes
- `https://www.googleapis.com/auth/classroom.coursework.me.readonly` - Read assignments
- `https://www.googleapis.com/auth/classroom.coursework.students.readonly` - Read submissions
- `https://www.googleapis.com/auth/drive.readonly` - Read Drive files (optional)

**Note:** Supabase automatically includes these scopes when you enable Google OAuth. The `provider_token` you receive will have all necessary permissions.

---

### 3. Database Tables

**Status:** ✅ Created via `google_classroom_setup.sql`

Tables created:
- `classes` - Stores Google Classroom courses
- `assignments` - Stores coursework/assignments
- `submissions` - Stores student submissions

All tables have:
- Row Level Security (RLS) enabled
- Policies for user isolation
- Indexes for performance

---

### 4. RLS Policies

**Status:** ✅ Already configured

Policies exist for:
- `profiles` table (read, insert, update own data)
- `classes` table (read, insert, update, delete own data)
- `assignments` table (read, insert, update, delete own data)
- `submissions` table (read, insert, update, delete own data)

**No additional policies needed** - everything is user-isolated.

---

## 🔄 How It Works

### Step 1: User Connects Google

When user clicks "Connect Google" in onboarding:
1. Supabase handles OAuth flow
2. User authorizes on Google
3. Supabase stores the session
4. You receive `session.provider_token` (Google access token)

### Step 2: Extract Token

```javascript
const { data: { session } } = await supabase.auth.getSession();
const googleAccessToken = session.provider_token;
```

### Step 3: Use Token for Google APIs

```javascript
fetch('https://classroom.googleapis.com/v1/courses?studentId=me', {
    headers: {
        'Authorization': `Bearer ${googleAccessToken}`
    }
})
```

### Step 4: Save to Supabase

After fetching from Google APIs, save to your Supabase tables:
- Classes → `classes` table
- Assignments → `assignments` table
- Submissions → `submissions` table

---

## 🔑 Token Management

### Automatic Token Refresh

The `google_auth_utils.js` file handles:
- ✅ Getting tokens from Supabase session
- ✅ Automatic token refresh on 401 errors
- ✅ Storing tokens in sessionStorage for quick access

### Token Expiration

Google access tokens expire after ~1 hour. The code automatically:
1. Detects 401 (Unauthorized) responses
2. Refreshes the token via Supabase
3. Retries the failed request

---

## 📋 Final Checklist

### In Supabase Dashboard:

- [x] Google provider enabled
- [x] Client ID and Secret configured
- [x] Callback URL correct
- [x] RLS policies enabled
- [x] Database tables created

### In Your Code:

- [x] `google_auth_utils.js` included
- [x] Token extraction from session
- [x] Google API calls with token
- [x] Data saved to Supabase tables
- [x] Automatic token refresh

---

## 🧪 Testing

1. **Test Google Connection:**
   - Complete onboarding
   - Connect Google account
   - Check browser console for "Google Classroom data synced successfully"

2. **Test Token Access:**
   ```javascript
   const token = await window.googleAuthUtils.getGoogleAccessToken(supabase);
   console.log('Token available:', token !== null);
   ```

3. **Test API Call:**
   ```javascript
   const response = await window.googleAuthUtils.fetchWithGoogleAuth(
       'https://classroom.googleapis.com/v1/courses?studentId=me',
       {},
       supabase
   );
   const data = await response.json();
   console.log('Courses:', data);
   ```

---

## 🚨 Troubleshooting

### "No Google access token available"

**Cause:** User hasn't connected Google account yet.

**Solution:** Ensure user completes Google OAuth flow in onboarding step 9.

---

### "Token refresh failed"

**Cause:** Refresh token expired or invalid.

**Solution:** User needs to reconnect Google account. Supabase will handle re-authentication.

---

### "Failed to fetch courses"

**Cause:** 
1. Token expired (should auto-refresh)
2. Missing scopes (check Supabase Google provider config)
3. User doesn't have Classroom access

**Solution:** 
- Check Supabase Google provider has correct scopes
- Verify user has Google Classroom account
- Check browser console for detailed error

---

## 📚 Additional Resources

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Google Classroom API](https://developers.google.com/classroom)
- [Google OAuth Scopes](https://developers.google.com/identity/protocols/oauth2/scopes)

---

**You're all set!** 🎉 The integration is complete and ready to use.

