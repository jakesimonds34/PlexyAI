# Chat AI Edge Function

This Supabase Edge Function handles AI chat conversations using OpenAI API.

## Setup

1. **Set Environment Variables in Supabase Dashboard:**
   - Go to Settings → Edge Functions → Secrets
   - Add `OPENAI_API_KEY` with your OpenAI API key

2. **Deploy the Function:**
   ```bash
   supabase functions deploy chat-ai
   ```

3. **Run Database Migration:**
   - Execute `chat_messages_setup.sql` in Supabase SQL Editor

## Usage

### Request
```javascript
const response = await fetch('https://YOUR_PROJECT.supabase.co/functions/v1/chat-ai', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${supabaseAccessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    message: 'Hello, how can you help me?',
    conversation_id: 'optional-uuid' // Optional, creates new conversation if not provided
  })
})
```

### Response
```json
{
  "message": "AI response text",
  "conversation_id": "uuid-of-conversation"
}
```

## Features

- ✅ User authentication via Supabase Auth
- ✅ Message history stored in database
- ✅ Conversation grouping via conversation_id
- ✅ OpenAI GPT-4o-mini integration
- ✅ Automatic message saving
- ✅ CORS enabled

