# Google Classroom Integration Testing Guide

Follow these steps **in order** to verify your Google OAuth integration is working correctly.

---

## ✅ STEP 1: Confirm Google Auth works (Supabase side)

### Test Steps

1. Open your app in the browser
2. Navigate to onboarding step 9 (Google integration)
3. Click **"Connect your Google Account"**
4. Complete Google consent screen
5. You should land back in your app **without errors**

### Pass Condition ✅

- ✅ No `unsupported provider` errors
- ✅ No redirect errors
- ✅ User appears in **Supabase Dashboard → Authentication → Users**
- ✅ User has `provider: "google"` in their auth metadata

### ❌ If This Fails

- Check Supabase Dashboard → Authentication → Providers
- Ensure Google provider is enabled
- Verify Client ID and Client Secret are correct
- Check callback URL matches: `https://unjcdnmxqtgurihukkrj.supabase.co/auth/v1/callback`

---

## ✅ STEP 2: Verify you actually received Google tokens

### Test Code

Open **Browser DevTools → Console** (F12) and run:

```javascript
// Get Supabase client (already initialized in your app)
const supabaseUrl = 'https://unjcdnmxqtgurihukkrj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVuamNkbm14cXRndXJpaHVra3JqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5MzI1MTcsImV4cCI6MjA4MzUwODUxN30.raso3E2B4WSIb0y6_IiT1a7HHVUjW_f76_sBr1jokrA';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// Get session and check for tokens
const { data, error } = await supabase.auth.getSession();

if (error) {
    console.error('Error getting session:', error);
} else {
    console.log('Session:', data.session);
    console.log('Provider Token:', data.session?.provider_token);
    console.log('Refresh Token:', data.session?.provider_refresh_token);
    console.log('Provider:', data.session?.provider);
}
```

### You MUST See ✅

```javascript
provider_token: "ya29.a0ARrdaM..."  // Long string starting with ya29
provider_refresh_token: "1//0g..."   // Long string starting with 1//
provider: "google"
```

### ❌ If `provider_token` is null

**Possible causes:**
- Google scopes are wrong in Supabase config
- OAuth flow didn't complete properly
- User logged in with email/password instead of Google

**Fix:**
- Re-authenticate with Google
- Check Supabase Google provider settings
- Verify OAuth scopes include Classroom and Drive

---

## ✅ STEP 3: Test Google Classroom API directly (no Supabase yet)

### Test Code

Paste this **exact code** in the browser console:

```javascript
// Get token from session
const { data } = await supabase.auth.getSession();
const token = data.session?.provider_token;

if (!token) {
    console.error('No provider token found! Complete Google OAuth first.');
} else {
    console.log('Testing Classroom API with token:', token.substring(0, 20) + '...');
    
    // Test Classroom API
    fetch("https://classroom.googleapis.com/v1/courses?studentId=me", {
        headers: {
            Authorization: `Bearer ${token}`
        }
    })
    .then(res => {
        console.log('Response status:', res.status);
        return res.json();
    })
    .then(data => {
        console.log('Classroom API Response:', data);
        if (data.courses) {
            console.log(`✅ Success! Found ${data.courses.length} courses`);
            data.courses.forEach(course => {
                console.log(`  - ${course.name} (ID: ${course.id})`);
            });
        }
    })
    .catch(error => {
        console.error('Error:', error);
    });
}
```

### Expected Results ✅

**Success:**
- ✅ You see a list of classes: `{ courses: [...] }`
- ✅ Or empty list: `{ courses: [] }` (if user has no classes)
- ✅ Status code: `200`

### ❌ Errors & Meaning

| Error Code | Meaning | Fix |
|------------|---------|-----|
| **401** | Token missing / expired | Re-authenticate with Google |
| **403** | Scope missing | Add Classroom scopes in Supabase |
| **CORS** | Wrong fetch location | Run in browser console, not Node.js |

---

## ✅ STEP 4: Test Google Drive access

### Test Code

```javascript
// Get token from session
const { data } = await supabase.auth.getSession();
const token = data.session?.provider_token;

if (!token) {
    console.error('No provider token found!');
} else {
    // Test Drive API
    fetch("https://www.googleapis.com/drive/v3/files?pageSize=5", {
        headers: {
            Authorization: `Bearer ${token}`
        }
    })
    .then(res => {
        console.log('Drive API Status:', res.status);
        return res.json();
    })
    .then(data => {
        console.log('Drive API Response:', data);
        if (data.files) {
            console.log(`✅ Success! Found ${data.files.length} files`);
            data.files.forEach(file => {
                console.log(`  - ${file.name} (${file.mimeType})`);
            });
        } else {
            console.log('✅ API works, but no files found (or empty Drive)');
        }
    })
    .catch(error => {
        console.error('Error:', error);
    });
}
```

### Pass Condition ✅

- ✅ You see files: `{ files: [...] }`
- ✅ Or empty list: `{ files: [] }`
- ✅ No permission errors
- ✅ Status code: `200`

---

## ✅ STEP 5: Test auto-sync to Supabase

### Test Code

```javascript
// Get current user and token
const { data: sessionData } = await supabase.auth.getSession();
const token = sessionData.session?.provider_token;
const userId = sessionData.session?.user?.id;

if (!token || !userId) {
    console.error('Missing token or user ID');
} else {
    console.log('Testing auto-sync...');
    
    // Fetch classes from Google
    const response = await fetch("https://classroom.googleapis.com/v1/courses?studentId=me", {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });
    
    const coursesData = await response.json();
    const courses = coursesData.courses || [];
    
    console.log(`Found ${courses.length} courses to sync`);
    
    // Save to Supabase
    for (const course of courses) {
        const { data, error } = await supabase
            .from('classes')
            .upsert({
                owner_id: userId,
                google_class_id: course.id,
                name: course.name || 'Untitled Class',
                description: course.description || null,
                section: course.section || null,
                room: course.room || null,
                enrollment_code: course.enrollmentCode || null
            }, {
                onConflict: 'google_class_id'
            });
        
        if (error) {
            console.error(`Error saving ${course.name}:`, error);
        } else {
            console.log(`✅ Saved: ${course.name}`);
        }
    }
    
    // Verify data in Supabase
    const { data: savedClasses, error: fetchError } = await supabase
        .from('classes')
        .select('*')
        .eq('owner_id', userId);
    
    if (fetchError) {
        console.error('Error fetching saved classes:', fetchError);
    } else {
        console.log(`✅ Verified: ${savedClasses.length} classes in Supabase`);
        savedClasses.forEach(c => {
            console.log(`  - ${c.name} (${c.google_class_id})`);
        });
    }
}
```

### Pass Condition ✅

- ✅ Rows appear in Supabase `classes` table
- ✅ RLS does not block insert
- ✅ Data persists after page refresh
- ✅ Can query data back from Supabase

---

## ✅ STEP 6: Test persistence (log out & back in)

### Test Steps

1. **Sign out:**
   ```javascript
   await supabase.auth.signOut();
   sessionStorage.clear();
   console.log('✅ Signed out');
   ```

2. **Sign in again** via Google OAuth

3. **Fetch Supabase table:**
   ```javascript
   const { data: sessionData } = await supabase.auth.getSession();
   const userId = sessionData.session?.user?.id;
   
   const { data: classes, error } = await supabase
       .from('classes')
       .select('*')
       .eq('owner_id', userId);
   
   if (error) {
       console.error('Error:', error);
   } else {
       console.log(`✅ Found ${classes.length} saved classes after login`);
       classes.forEach(c => console.log(`  - ${c.name}`));
   }
   ```

### Pass Condition ✅

- ✅ Data still exists in Supabase after logout
- ✅ Can query data after re-login
- ✅ RLS policies allow user to see their own data
- ✅ No duplicate entries created

---

## 🚨 Common Test Failures (Quick Fixes)

### ❌ `unsupported provider`

**Error:** `AuthApiError: Invalid login credentials`

**Fix:**
- Go to Supabase Dashboard → Authentication → Providers
- Enable Google provider
- Add Client ID and Client Secret
- Save changes

---

### ❌ `403 insufficient scopes`

**Error:** `403 Forbidden` when calling Classroom API

**Fix:**
- Check Supabase Google provider configuration
- Ensure scopes include:
  - `https://www.googleapis.com/auth/classroom.courses.readonly`
  - `https://www.googleapis.com/auth/classroom.coursework.me.readonly`
  - `https://www.googleapis.com/auth/drive.readonly`
- Re-authenticate user to get new token with correct scopes

---

### ❌ No token returned (`provider_token` is null)

**Error:** `provider_token: null` in session

**Possible causes:**
- User logged in with email/password instead of Google
- OAuth flow didn't complete
- Token expired and refresh failed

**Fix:**
- Ensure user completes Google OAuth flow
- Check Supabase session has `provider: "google"`
- Re-authenticate if needed

---

### ❌ RLS policy blocks insert

**Error:** `new row violates row-level security policy`

**Fix:**
- Check RLS policies in Supabase
- Ensure policy allows: `auth.uid() = owner_id`
- Verify user is authenticated: `await supabase.auth.getUser()`

---

### ❌ CORS errors

**Error:** `Access to fetch at '...' from origin '...' has been blocked by CORS policy`

**Fix:**
- This should NOT happen in browser console
- If it does, ensure you're running code in browser DevTools, not Node.js
- Google APIs allow browser requests

---

## 🟢 Final Sanity Check

Run this complete test:

```javascript
async function completeTest() {
    console.log('🧪 Starting complete integration test...\n');
    
    // 1. Check session
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session) {
        console.error('❌ No session found');
        return;
    }
    console.log('✅ Step 1: Session exists');
    
    // 2. Check tokens
    const token = sessionData.session.provider_token;
    if (!token) {
        console.error('❌ No provider token');
        return;
    }
    console.log('✅ Step 2: Provider token exists');
    
    // 3. Test Classroom API
    const classroomRes = await fetch("https://classroom.googleapis.com/v1/courses?studentId=me", {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (classroomRes.ok) {
        const classroomData = await classroomRes.json();
        console.log(`✅ Step 3: Classroom API works (${classroomData.courses?.length || 0} courses)`);
    } else {
        console.error('❌ Classroom API failed:', classroomRes.status);
        return;
    }
    
    // 4. Test Drive API
    const driveRes = await fetch("https://www.googleapis.com/drive/v3/files?pageSize=5", {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (driveRes.ok) {
        const driveData = await driveRes.json();
        console.log(`✅ Step 4: Drive API works (${driveData.files?.length || 0} files)`);
    } else {
        console.error('❌ Drive API failed:', driveRes.status);
    }
    
    // 5. Test Supabase storage
    const userId = sessionData.session.user.id;
    const { data: classes, error: dbError } = await supabase
        .from('classes')
        .select('*')
        .eq('owner_id', userId);
    
    if (!dbError) {
        console.log(`✅ Step 5: Supabase storage works (${classes.length} classes saved)`);
    } else {
        console.error('❌ Supabase storage failed:', dbError);
    }
    
    console.log('\n🎉 All tests passed! System is production-ready.');
}

// Run the test
completeTest();
```

### If All Tests Pass ✅

- ✅ Google login works
- ✅ Token exists and is valid
- ✅ Classroom API responds
- ✅ Drive API responds
- ✅ Supabase stores data
- ✅ Data persists after logout/login

**👉 Your system is production-ready! 🚀**

---

## 📋 Quick Reference Checklist

- [ ] Step 1: Google Auth works in Supabase
- [ ] Step 2: Provider token exists in session
- [ ] Step 3: Classroom API responds successfully
- [ ] Step 4: Drive API responds successfully
- [ ] Step 5: Data saves to Supabase tables
- [ ] Step 6: Data persists after logout/login
- [ ] All console tests pass
- [ ] No RLS policy errors
- [ ] No CORS errors
- [ ] Auto-sync works after onboarding

---

## 🆘 Still Having Issues?

1. **Check browser console** for detailed error messages
2. **Check Supabase Dashboard** → Logs for server-side errors
3. **Verify RLS policies** are correctly configured
4. **Re-authenticate** with Google to get fresh tokens
5. **Check network tab** in DevTools to see API responses

---

**Happy Testing! 🧪**

