-- Google Classroom Integration Setup
-- Run this SQL in your Supabase SQL Editor

-- Create classes table
CREATE TABLE IF NOT EXISTS classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    google_class_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    section TEXT,
    room TEXT,
    enrollment_code TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create assignments table
CREATE TABLE IF NOT EXISTS assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    google_assignment_id TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    due_date TIMESTAMPTZ,
    max_points NUMERIC,
    state TEXT, -- 'PUBLISHED', 'DRAFT', 'DELETED', 'ARCHIVED'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create submissions table
CREATE TABLE IF NOT EXISTS submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID REFERENCES assignments(id) ON DELETE CASCADE,
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    google_submission_id TEXT UNIQUE NOT NULL,
    state TEXT, -- 'NEW', 'CREATED', 'TURNED_IN', 'RETURNED', 'RECLAIMED_BY_STUDENT'
    assigned_grade NUMERIC,
    draft_grade NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

-- Policies for classes table
CREATE POLICY "Users can view own classes" ON classes
    FOR SELECT
    USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert own classes" ON classes
    FOR INSERT
    WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own classes" ON classes
    FOR UPDATE
    USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own classes" ON classes
    FOR DELETE
    USING (auth.uid() = owner_id);

-- Policies for assignments table
CREATE POLICY "Users can view own assignments" ON assignments
    FOR SELECT
    USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert own assignments" ON assignments
    FOR INSERT
    WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own assignments" ON assignments
    FOR UPDATE
    USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own assignments" ON assignments
    FOR DELETE
    USING (auth.uid() = owner_id);

-- Policies for submissions table
CREATE POLICY "Users can view own submissions" ON submissions
    FOR SELECT
    USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert own submissions" ON submissions
    FOR INSERT
    WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own submissions" ON submissions
    FOR UPDATE
    USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own submissions" ON submissions
    FOR DELETE
    USING (auth.uid() = owner_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_classes_owner_id ON classes(owner_id);
CREATE INDEX IF NOT EXISTS idx_classes_google_class_id ON classes(google_class_id);
CREATE INDEX IF NOT EXISTS idx_assignments_class_id ON assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_assignments_owner_id ON assignments(owner_id);
CREATE INDEX IF NOT EXISTS idx_assignments_google_assignment_id ON assignments(google_assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment_id ON submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_owner_id ON submissions(owner_id);
CREATE INDEX IF NOT EXISTS idx_submissions_google_submission_id ON submissions(google_submission_id);

