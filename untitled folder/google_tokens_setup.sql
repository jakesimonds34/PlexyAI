-- Google Tokens Table Setup
-- This table securely stores Google OAuth tokens for users
-- Refresh tokens are stored to allow automatic access token renewal

-- Create google_tokens table
CREATE TABLE IF NOT EXISTS google_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    refresh_token TEXT NOT NULL,
    access_token TEXT,
    token_type TEXT DEFAULT 'Bearer',
    expires_at TIMESTAMP WITH TIME ZONE,
    scope TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Create index for user_id lookups
CREATE INDEX IF NOT EXISTS idx_google_tokens_user_id ON google_tokens(user_id);

-- Enable Row Level Security
ALTER TABLE google_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only view their own tokens
CREATE POLICY "Users can view their own tokens"
    ON google_tokens
    FOR SELECT
    USING (auth.uid() = user_id);

-- RLS Policy: Users can insert their own tokens
CREATE POLICY "Users can insert their own tokens"
    ON google_tokens
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can update their own tokens
CREATE POLICY "Users can update their own tokens"
    ON google_tokens
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can delete their own tokens
CREATE POLICY "Users can delete their own tokens"
    ON google_tokens
    FOR DELETE
    USING (auth.uid() = user_id);

-- Service role policy for edge functions to access tokens
-- Edge functions use service role key which bypasses RLS
-- This is secure because service role key is only used server-side

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_google_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at on row update
CREATE TRIGGER update_google_tokens_updated_at
    BEFORE UPDATE ON google_tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_google_tokens_updated_at();

-- Add comments
COMMENT ON TABLE google_tokens IS 'Securely stores Google OAuth tokens for users';
COMMENT ON COLUMN google_tokens.refresh_token IS 'Google OAuth refresh token - used to obtain new access tokens';
COMMENT ON COLUMN google_tokens.access_token IS 'Current Google OAuth access token - may be expired';
COMMENT ON COLUMN google_tokens.expires_at IS 'When the current access token expires';
COMMENT ON COLUMN google_tokens.scope IS 'OAuth scopes granted by the user';
