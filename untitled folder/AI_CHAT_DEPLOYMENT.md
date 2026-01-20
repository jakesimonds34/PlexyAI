# AI Chat Deployment Guide

This guide explains how to deploy the AI chat functionality using Supabase Edge Functions and OpenAI API.

## Prerequisites

- Supabase project (already configured)
- OpenAI API key
- Supabase CLI installed (optional, for CLI deployment)

## Step 1: Database Setup

1. **Open Supabase Dashboard:**
   - Go to https://zjtnptmbyaffsqrikrzi.supabase.co
   - Navigate to **SQL Editor**

2. **Run the Migration:**
   - Open `chat_messages_setup.sql`
   - Copy the entire SQL script
   - Paste into SQL Editor
   - Click **Run** to execute

3. **Verify Table Creation:**
   - Go to **Table Editor**
   - Verify `chat_messages` table exists
   - Check that RLS policies are enabled

## Step 2: Configure Environment Variables

1. **Go to Supabase Dashboard:**
   - Navigate to **Settings** → **Edge Functions** → **Secrets**

2. **Add Required Secrets:**
   
   **a) OpenAI API Key:**
   - Click **Add new secret**
   - Name: `OPENAI_API_KEY`
   - Value: Your OpenAI API key
   - Click **Save**
   
   **b) Supabase Anon Key (for authentication):**
   - Click **Add new secret**
   - Name: `SUPABASE_ANON_KEY`
   - Value: `sb_publishable_3XarO12Z7F95Ued04wjCWA_6yqQEqe6` (your anon/public key)
   - Click **Save**

3. **Automatic Environment Variables:**
   - `SUPABASE_URL` - Automatically available
   - `SUPABASE_SERVICE_ROLE_KEY` - Automatically available (service role key)
   - No manual configuration needed for these

## Step 3: Deploy Edge Function

### Option A: Using Supabase CLI (Recommended)

1. **Install Supabase CLI** (if not already installed):
   ```bash
   npm install -g supabase
   ```

2. **Login to Supabase:**
   ```bash
   supabase login
   ```

3. **Link your project:**
   ```bash
   supabase link --project-ref zjtnptmbyaffsqrikrzi
   ```

4. **Deploy the function:**
   ```bash
   supabase functions deploy chat-ai
   ```

### Option B: Using Supabase Dashboard

1. **Go to Edge Functions:**
   - Navigate to **Edge Functions** in Supabase Dashboard
   - Click **Create a new function**

2. **Upload Function:**
   - Function name: `chat-ai`
   - Copy contents of `supabase/functions/chat-ai/index.ts`
   - Paste into the editor
   - Click **Deploy**

## Step 4: Test the Function

1. **Test from Frontend:**
   - Open `chatbot.html` in your browser
   - Send a test message
   - Verify AI response appears

2. **Test from Browser Console:**
   ```javascript
   const { data: { session } } = await supabaseClient.auth.getSession();
   const response = await fetch('https://zjtnptmbyaffsqrikrzi.supabase.co/functions/v1/chat-ai', {
     method: 'POST',
     headers: {
       'Authorization': `Bearer ${session.access_token}`,
       'Content-Type': 'application/json',
       'apikey': 'sb_publishable_3XarO12Z7F95Ued04wjCWA_6yqQEqe6',
     },
     body: JSON.stringify({
       message: 'Hello, how can you help me?'
     })
   });
   const data = await response.json();
   console.log(data);
   ```

## Step 5: Verify Message History

1. **Check Database:**
   - Go to **Table Editor** → `chat_messages`
   - Verify messages are being saved
   - Check that `user_id`, `role`, and `content` are populated correctly

2. **Test Conversation Continuity:**
   - Send multiple messages in the chat
   - Verify `conversation_id` remains the same
   - Check that AI responses reference previous messages

## Troubleshooting

### Error: "OpenAI API key not configured"
- **Solution:** Verify `OPENAI_API_KEY` is set in Supabase Dashboard → Settings → Edge Functions → Secrets

### Error: "Unauthorized"
- **Solution:** Ensure user is logged in and session token is valid

### Error: "Failed to get AI response"
- **Solution:** 
  - Check OpenAI API key is valid
  - Verify OpenAI account has credits
  - Check Edge Function logs in Supabase Dashboard

### Messages not saving to database
- **Solution:**
  - Verify RLS policies are enabled
  - Check that `chat_messages` table exists
  - Review Edge Function logs for errors

## Function Configuration

### OpenAI Model
Currently using: `gpt-4o-mini`

To change the model, edit `supabase/functions/chat-ai/index.ts`:
```typescript
model: 'gpt-4o-mini', // Change to 'gpt-4', 'gpt-3.5-turbo', etc.
```

### Message History Limit
Currently limited to last 50 messages per conversation.

To change, edit the limit in `index.ts`:
```typescript
.limit(50) // Change to desired number
```

### Temperature
Currently set to 0.7 (balanced creativity).

To change, edit in `index.ts`:
```typescript
temperature: 0.7, // Range: 0.0 (deterministic) to 2.0 (creative)
```

## Security Notes

- ✅ RLS policies ensure users can only access their own messages
- ✅ API keys are stored securely in Supabase secrets
- ✅ User authentication is verified on every request
- ✅ CORS is enabled for frontend access

## Cost Considerations

- OpenAI API charges per token used
- `gpt-4o-mini` is cost-effective for chat applications
- Monitor usage in OpenAI Dashboard
- Consider implementing rate limiting for production

## Next Steps

- [ ] Add conversation management (list, delete conversations)
- [ ] Implement message editing/deletion
- [ ] Add typing indicators
- [ ] Implement streaming responses for better UX
- [ ] Add error retry logic
- [ ] Implement rate limiting

