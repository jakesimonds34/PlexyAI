# Supabase Setup Instructions

## Overview
Your application is now configured to use Supabase for user authentication and data storage. The following fields are being stored:
- **email** - User's email address
- **password** - Securely hashed by Supabase Auth
- **name** - User's full name
- **age** - User's age
- **grade** - User's grade level
- **account_created_at** - Timestamp when account was created
- **last_login_at** - Timestamp of last login (updated on each login)

## Setup Steps

### 1. Create the Users Table
Run the SQL script in `supabase_setup.sql` in your Supabase SQL Editor:

1. Go to your Supabase project: https://zjtnptmbyaffsqrikrzi.supabase.co
2. Navigate to SQL Editor
3. Copy and paste the contents of `supabase_setup.sql`
4. Run the script

This will create:
- The `users` table with all required fields
- Row Level Security (RLS) policies
- Automatic timestamp updates
- Indexes for performance

### 2. Configure Authentication
1. Go to Authentication > Settings in your Supabase dashboard
2. Ensure "Enable email signup" is enabled
3. Configure email templates if desired
4. Set up email confirmation (optional, but recommended for production)

### 3. Verify API Keys
The following credentials are already configured in the code:
- **Project URL**: https://zjtnptmbyaffsqrikrzi.supabase.co
- **Publishable Key**: sb_publishable_3XarO12Z7F95Ued04wjCWA_6yqQEqe6

These are used in:
- `onboarding/onboarding-step8.html` - User registration
- `login.html` - User authentication
- `onboarding/onboarding-step9.html` - Session management

## How It Works

### User Registration (Onboarding Step 8)
1. User completes onboarding steps 1-7
2. In step 8, user creates password
3. Account is created in Supabase Auth
4. User profile is inserted into `users` table
5. User ID is stored in sessionStorage

### User Login
1. User enters email and password
2. Supabase authenticates credentials
3. User profile is fetched from `users` table
4. `last_login_at` is updated
5. Session is stored in sessionStorage/localStorage

### "Keep Me Signed In" Feature
- When checked, session is stored in localStorage with 30-day expiration
- Session includes Supabase auth token
- On return, session is automatically restored
- Expired sessions are automatically cleaned up

## Database Schema

```sql
users (
    id UUID PRIMARY KEY (references auth.users),
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    age INTEGER,
    grade TEXT,
    account_created_at TIMESTAMPTZ NOT NULL,
    last_login_at TIMESTAMPTZ,
    google_connected BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

## Security Features

1. **Row Level Security (RLS)**: Users can only access their own data
2. **Password Hashing**: Handled automatically by Supabase Auth
3. **Session Management**: Secure token-based authentication
4. **30-Day Expiration**: Remember me sessions expire after 30 days

## Testing

After setup:
1. Complete the onboarding flow
2. Verify user appears in Supabase Auth > Users
3. Verify user profile appears in `users` table
4. Test login with created credentials
5. Test "Keep me signed in" functionality

## Troubleshooting

### Users table not found
- Run the SQL script in `supabase_setup.sql`

### Authentication errors
- Check that email signup is enabled in Auth settings
- Verify API keys are correct

### RLS policy errors
- Ensure RLS policies are created (included in SQL script)
- Check that user is authenticated before accessing data

### Session restoration issues
- Check browser console for errors
- Verify Supabase session tokens are valid
- Clear localStorage and try again

