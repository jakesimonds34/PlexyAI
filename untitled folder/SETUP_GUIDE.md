# PlexyAI Setup Guide

This guide walks you through setting up Supabase and Google OAuth for the PlexyAI project.

---

## Prerequisites

- A Supabase account (https://supabase.com)
- A Google Cloud account (https://console.cloud.google.com)
- Supabase CLI installed (optional, for migrations)

---

## Part 1: Supabase Setup

### Step 1: Create a Supabase Project

1. Go to https://supabase.com/dashboard
2. Click **New Project**
3. Fill in:
   - **Name:** PlexyAI (or your preferred name)
   - **Database Password:** Generate a strong password and save it
   - **Region:** Choose the closest to your users
4. Click **Create new project**
5. Wait for the project to be ready (1-2 minutes)

### Step 2: Get Your Project Credentials

1. Go to **Project Settings** > **API**
2. Copy these values:
   - **Project URL:** `https://[your-project-ref].supabase.co`
   - **anon/public key:** `eyJhbGc...` (the long JWT token)

### Step 3: Run Database Migrations

Option A: **Using Supabase Dashboard (Recommended)**

1. Go to **SQL Editor** in your Supabase dashboard
2. Copy and paste the contents of `supabase/migrations/20240101000001_create_profiles.sql`
3. Click **Run**
4. Repeat for `supabase/migrations/20240101000002_create_google_classroom_tables.sql`

Option B: **Using Supabase CLI**

```bash
cd "untitled folder"
supabase link --project-ref [your-project-ref]
supabase db push
```

### Step 4: Enable Manual Linking

1. Go to **Authentication** > **Settings**
2. Scroll to **Security**
3. Enable **"Enable Manual Linking"**
4. Click **Save**

---

## Part 2: Google OAuth Setup

### Step 1: Create Google Cloud Project

1. Go to https://console.cloud.google.com
2. Click the project dropdown (top left) > **New Project**
3. Name it **PlexyAI** and click **Create**
4. Select the new project

### Step 2: Enable Required APIs

1. Go to **APIs & Services** > **Library**
2. Search and enable these APIs:
   - **Google Classroom API**
   - **Google Drive API**

### Step 3: Configure OAuth Consent Screen

1. Go to **APIs & Services** > **OAuth consent screen**
2. Select **External** and click **Create**
3. Fill in:
   - **App name:** PlexyAI
   - **User support email:** Your email
   - **Developer contact email:** Your email
4. Click **Save and Continue**
5. On **Scopes** page, click **Add or Remove Scopes** and add:
   ```
   https://www.googleapis.com/auth/classroom.courses.readonly
   https://www.googleapis.com/auth/classroom.coursework.me.readonly
   https://www.googleapis.com/auth/drive.readonly
   ```
6. Click **Save and Continue**
7. On **Test users** page, add your test email addresses
8. Click **Save and Continue**

### Step 4: Create OAuth Credentials

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. Select **Web application**
4. Name it **PlexyAI**
5. Add **Authorized JavaScript origins:**
   ```
   http://localhost:8080
   https://[your-project-ref].supabase.co
   https://yourdomain.com  (if you have one)
   ```
6. Add **Authorized redirect URIs:**
   ```
   https://[your-project-ref].supabase.co/auth/v1/callback
   ```
7. Click **Create**
8. Copy the **Client ID** and **Client Secret**

### Step 5: Configure Google Provider in Supabase

1. Go to Supabase Dashboard > **Authentication** > **Providers**
2. Find **Google** and click to expand
3. Enable the toggle
4. Paste:
   - **Client ID:** From Google Cloud Console
   - **Client Secret:** From Google Cloud Console
5. Click **Save**

---

## Part 3: Update Project Files

Update the Supabase credentials in these files:

### Files to Update

1. `login.html`
2. `dashboard.html`
3. `onboarding/onboarding-step7.html`
4. `onboarding/onboarding-step8.html`
5. `onboarding/onboarding-step9.html`

### What to Change

Find this code in each file:
```javascript
const supabaseUrl = 'https://unjcdnmxqtgurihukkrj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

Replace with your values:
```javascript
const supabaseUrl = 'https://[your-project-ref].supabase.co';
const supabaseKey = '[your-anon-key]';
```

---

## Part 4: Testing

### Test Email/Password Signup

1. Open `http://localhost:8080`
2. Go through onboarding steps 1-8
3. Create an account with email and password
4. Check Supabase Dashboard > **Authentication** > **Users** - user should appear

### Test Google Linking

1. Continue to step 9
2. Click **Connect Google Account**
3. Complete Google OAuth consent
4. Check Supabase Dashboard > **Authentication** > **Users**
5. The user should have Google identity linked

### Test Google Classroom API Access

After linking, verify the token:
```javascript
const { data } = await supabase.auth.getSession();
console.log('Google Token:', data.session?.provider_token);
```

---

## Troubleshooting

### "Manual linking is disabled"
- Go to Supabase > Authentication > Settings
- Enable "Enable Manual Linking"

### "redirect_uri_mismatch" from Google
- Check that the redirect URI in Google Cloud Console exactly matches:
  `https://[your-project-ref].supabase.co/auth/v1/callback`

### "Access blocked: This app's request is invalid"
- Ensure OAuth consent screen is configured
- Add test users if app is in testing mode

### User not appearing in Supabase
- Check browser console for errors
- Verify Supabase URL and anon key are correct

### Google token is null
- Ensure Google provider is enabled in Supabase
- Verify the scopes are correctly configured
- Try unlinking and relinking Google account

---

## Production Checklist

Before going live:

- [ ] Move Google OAuth app from "Testing" to "Production" status
- [ ] Update authorized origins to include production domain
- [ ] Use environment variables for Supabase credentials (not hardcoded)
- [ ] Enable Row Level Security (RLS) on all tables
- [ ] Set up proper CORS settings in Supabase
- [ ] Configure custom SMTP for auth emails (optional)

---

## Support

For issues with:
- **Supabase:** https://supabase.com/docs
- **Google Cloud:** https://cloud.google.com/docs
- **Google Classroom API:** https://developers.google.com/classroom
