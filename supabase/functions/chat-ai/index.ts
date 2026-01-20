// Supabase Edge Function for AI Chat
// Handles OpenAI API integration with message history

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'
const OPENAI_RESPONSES_API_URL = 'https://api.openai.com/v1/responses'
const GOOGLE_CLASSROOM_API = 'https://classroom.googleapis.com/v1'
const GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3'

// Tool function definitions for OpenAI
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_user_classes',
      description: "Get list of user's Google Classroom classes/courses",
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_class_assignments',
      description: 'Get assignments for a specific Google Classroom class',
      parameters: {
        type: 'object',
        properties: {
          courseId: {
            type: 'string',
            description: 'The Google Classroom course ID'
          }
        },
        required: ['courseId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_assignment_details',
      description: 'Get detailed information about a specific assignment',
      parameters: {
        type: 'object',
        properties: {
          courseId: { type: 'string' },
          courseWorkId: { type: 'string' }
        },
        required: ['courseId', 'courseWorkId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_student_submissions',
      description: 'Get student submissions for an assignment',
      parameters: {
        type: 'object',
        properties: {
          courseId: { type: 'string' },
          courseWorkId: { type: 'string' }
        },
        required: ['courseId', 'courseWorkId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_drive_files',
      description: "Search for files in user's Google Drive",
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: "Search query (e.g., 'homework', 'assignment', filename)"
          }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_drive_file',
      description: 'Read content from a Google Drive file (PDF, DOCX, TXT)',
      parameters: {
        type: 'object',
        properties: {
          fileId: {
            type: 'string',
            description: 'Google Drive file ID'
          }
        },
        required: ['fileId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_upcoming_deadlines',
      description: 'Get a complete overview of assignments: deadlines due in the next X days, assignments WITHOUT due dates (still need to be done!), and any past-due assignments. Always mention ALL categories to the student.',
      parameters: {
        type: 'object',
        properties: {
          days_ahead: {
            type: 'number',
            description: 'Number of days to look ahead for deadlines (default: 7)'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_class_materials',
      description: 'Get course materials and resources shared by the teacher for a class',
      parameters: {
        type: 'object',
        properties: {
          courseId: {
            type: 'string',
            description: 'The Google Classroom course ID'
          }
        },
        required: ['courseId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_announcements',
      description: 'Get recent announcements from a class posted by the teacher',
      parameters: {
        type: 'object',
        properties: {
          courseId: {
            type: 'string',
            description: 'The Google Classroom course ID'
          }
        },
        required: ['courseId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_assignment_help_context',
      description: 'BEST TOOL for helping with assignments! Gets EVERYTHING in one call: assignment details from Classroom + searches Google Drive for related notes/files + reads their content. Use this when a student asks for help with a specific assignment.',
      parameters: {
        type: 'object',
        properties: {
          courseId: {
            type: 'string',
            description: 'The Google Classroom course ID'
          },
          courseWorkId: {
            type: 'string',
            description: 'The assignment/courseWork ID'
          },
          topic: {
            type: 'string',
            description: 'The topic or subject of the assignment (e.g., "stoicism", "photosynthesis") - used to search Drive for related files'
          }
        },
        required: ['courseId', 'courseWorkId', 'topic']
      }
    }
  }
]

// System prompt for student-focused AI assistant
const SYSTEM_PROMPT = `You are PlexyAI, a friendly and helpful AI study assistant for students.

## Your Approach
- Be a supportive tutor who helps students understand and learn
- Ask clarifying questions when requests are vague
- Use an encouraging, patient tone
- Adapt explanations to the student's level

## IMPORTANT: Use Your Tools!
You have access to the student's Google Classroom and Drive. USE THEM PROACTIVELY:

When student mentions homework, assignments, class, or coursework:
1. Use get_user_classes to see their enrolled courses
2. Use get_class_assignments to find the specific assignment
3. Use get_assignment_details to understand requirements

When student asks about deadlines or what's due:
- Use get_upcoming_deadlines to show their upcoming work

When student needs class resources:
- Use get_class_materials and get_announcements

## CRITICAL: When Helping With a Specific Assignment
When a student asks for help with a specific assignment (like "help me with my stoicism assignment"):

USE THE get_assignment_help_context TOOL! This is the BEST tool for helping with assignments because it:
- Gets the assignment details from Classroom
- Searches their Google Drive for related notes/files
- Reads the content of those files
- Returns EVERYTHING in one call!

Just call it with the courseId, courseWorkId, and the topic (e.g., "stoicism").

If you find related files in their Drive, mention them: "I found some notes in your Drive that might help..."

ALWAYS check their actual Classroom/Drive when relevant - it gives you real context!

## Academic Help Guidelines (Balanced Approach)

FOR SIMPLE FACTUAL QUESTIONS - Give direct answers:
- Definitions ("What is photosynthesis?")
- Formulas ("What's the quadratic formula?")
- Historical facts ("When did WW2 end?")
- Quick explanations of concepts

FOR COMPLEX ASSIGNMENTS - Guide, don't do it for them:
- Essays/papers: Help outline, suggest structure, review drafts - don't write it
- Multi-step math problems: Explain the approach, help with stuck points
- Analysis questions: Ask guiding questions, help them think through it
- Research projects: Help find sources, suggest directions

NEVER:
- Write complete essays or papers
- Solve entire problem sets
- Do take-home exams

ALWAYS:
- Explain concepts clearly with examples
- Help break down complex problems
- Provide hints and guidance when stuck
- Answer factual questions directly
- Review and give feedback on their work

## Response Style
- Clear, encouraging language
- Break complex topics into digestible parts
- Use examples to illustrate concepts
- Celebrate their effort and progress

Remember: Help them LEARN, not just get answers. But don't be so restrictive that you're unhelpful!

## RESPONSE FORMAT (CRITICAL - READ CAREFULLY!)

You MUST ALWAYS respond with valid JSON. Every single response must be one of these two formats:

### FORMAT 1: Plain text response (USE THIS MOST OF THE TIME!)
{"type":"text","content":"Your response text here. Can include markdown formatting."}

USE TEXT FORMAT FOR:
- Follow-up questions and answers ("yes, expand on that" → text response)
- Explanations and elaborations
- Conversational replies
- Clarifying questions
- Simple factual answers
- ANY response that continues a conversation

### FORMAT 2: Rich response with cards (USE SPARINGLY!)
{"type":"rich","textBefore":"Optional intro","data":{...card data...},"textAfter":"Optional follow-up"}

USE RICH FORMAT ONLY FOR:
- INITIAL analysis requests (first time analyzing a topic)
- Showing deadlines/assignments from Classroom
- Creating an outline (first time)
- Showing resources/files found
- Step-by-step guides (first time)

NEVER use rich format for:
- Follow-up explanations ("expand on theme 1" → use TEXT, not another card)
- Continuing a conversation
- Answering questions about previous content
- Any response that builds on previous messages

## CRITICAL RULES:
1. Your ENTIRE response must be valid JSON - nothing before or after
2. Do NOT wrap JSON in markdown code blocks (\`\`\`json)
3. Do NOT add any text outside the JSON
4. The response must start with { and end with }

## EXAMPLES:

Plain text:
{"type":"text","content":"Photosynthesis is the process by which plants convert sunlight into energy. The basic equation is: 6CO2 + 6H2O + light → C6H12O6 + 6O2"}

Analysis:
{"type":"rich","textBefore":"Here's my analysis of Macbeth's themes:","data":{"type":"analysis","title":"Analysis: Themes in Macbeth","tags":["Shakespeare","Tragedy"],"intro":"Macbeth explores dark themes of ambition and guilt.","sections":[{"label":"KEY THEME 1","title":"Ambition","content":"Macbeth's unchecked ambition drives him to murder."},{"label":"KEY THEME 2","title":"Guilt","content":"Both Macbeth and Lady Macbeth are consumed by guilt."}]},"textAfter":"Would you like me to expand on any theme?"}

Deadlines:
{"type":"rich","textBefore":"Here are your upcoming deadlines:","data":{"type":"deadlines","title":"Your Deadlines","summary":"2 assignments this week","items":[{"title":"Math Homework","course":"Algebra","dueDate":"2024-01-20","status":"due_soon"}]},"textAfter":"Need help with any?"}

## CARD DATA TYPES:

analysis: {"type":"analysis","title":"...","tags":[...],"intro":"...","sections":[{"label":"...","title":"...","content":"..."}]}

outline: {"type":"outline","title":"...","sections":[{"heading":"...","points":["..."]}]}

deadlines: {"type":"deadlines","title":"...","summary":"...","items":[{"title":"...","course":"...","dueDate":"...","status":"..."}]}

steps: {"type":"steps","title":"...","intro":"...","steps":[{"number":1,"title":"...","content":"..."}]}

resources: {"type":"resources","title":"...","intro":"...","items":[{"name":"...","type":"...","preview":"..."}]}

assignment: {"type":"assignment","title":"...","course":"...","description":"...","maxPoints":100,"dueDate":"..."}`

interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'function' | 'tool'
  content: string
  name?: string
  function_call?: {
    name: string
    arguments: string
  }
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
  }>
  tool_call_id?: string
}

interface FileAttachment {
  name: string           // File name
  type: string           // MIME type
  content: string        // Base64 encoded content or text content
  encoding?: 'base64' | 'text'  // How content is encoded (default: base64)
}

interface UploadedFile {
  file_url: string       // Public URL from Supabase Storage
  filename: string       // Original filename for display
  path?: string          // Storage path for cleanup
}

interface RequestBody {
  message: string
  conversation_id?: string
  google_token?: string // Optional: Google access token from frontend
  attachments?: FileAttachment[] // Optional: attached files (legacy, will be processed locally)
  file_urls?: UploadedFile[] // Optional: pre-uploaded file URLs from Supabase Storage
}

interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

// Sanitize text for PostgreSQL - removes null bytes and other problematic characters
function sanitizeForPostgres(text: string): string {
  if (!text) return ''
  // Remove null bytes and other control characters that PostgreSQL can't handle
  return text
    .replace(/\x00/g, '') // Remove null bytes
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // Remove other control chars except \t, \n, \r
}

// Extract text content from an attached file
function extractFileContent(attachment: FileAttachment): string {
  try {
    const { name, type, encoding } = attachment
    let content = attachment.content

    console.log(`extractFileContent called for: ${name}, type: ${type}, encoding: ${encoding || 'base64'}`)

    // If content is already text, return it
    if (encoding === 'text') {
      return `[File: ${name}]\n${content}`
    }

    // Decode base64 content
    let decodedContent: string
    let binaryBytes: Uint8Array
    try {
      console.log(`Decoding base64 content (${content?.length || 0} chars)...`)

      // Check if content exists
      if (!content) {
        return `[File: ${name}] - No content provided`
      }

      // Strip data URL prefix if present (e.g., "data:application/pdf;base64,")
      if (content.startsWith('data:')) {
        const commaIndex = content.indexOf(',')
        if (commaIndex !== -1) {
          console.log(`Stripping data URL prefix: ${content.substring(0, Math.min(commaIndex + 1, 50))}...`)
          content = content.substring(commaIndex + 1)
        }
      }

      // Clean base64 string (remove whitespace and newlines)
      const cleanBase64 = content.replace(/[\s\n\r]/g, '')

      // Decode base64 to binary string
      const binaryString = atob(cleanBase64)
      console.log(`Decoded to ${binaryString.length} bytes`)

      // Convert to Uint8Array for text decoding
      binaryBytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        binaryBytes[i] = binaryString.charCodeAt(i)
      }
      decodedContent = new TextDecoder('utf-8', { fatal: false }).decode(binaryBytes)
      console.log(`TextDecoder result: ${decodedContent.length} chars`)
    } catch (e: any) {
      console.error('Error decoding base64:', e.message || e)
      return `[File: ${name}] - Could not decode file content: ${e.message || 'Base64 decode failed'}`
    }

    // Handle different file types
    if (type === 'text/plain' || type.startsWith('text/')) {
      return `[File: ${name}]\n${decodedContent}`
    }

    if (type === 'application/json') {
      try {
        const jsonContent = JSON.parse(decodedContent)
        return `[File: ${name}]\n${JSON.stringify(jsonContent, null, 2)}`
      } catch {
        return `[File: ${name}]\n${decodedContent}`
      }
    }

    if (type === 'text/csv' || name.endsWith('.csv')) {
      return `[CSV File: ${name}]\n${decodedContent}`
    }

    if (type === 'text/markdown' || name.endsWith('.md')) {
      return `[Markdown File: ${name}]\n${decodedContent}`
    }

    // PDF - try basic text extraction
    if (type === 'application/pdf') {
      // Look for text streams in PDF
      const textMatches = decodedContent.match(/\(([^)]+)\)/g)
      if (textMatches && textMatches.length > 10) {
        const extractedText = textMatches
          .map(m => m.slice(1, -1))
          .filter(t => t.length > 1 && !/^[\x00-\x1F]+$/.test(t))
          .join(' ')
        if (extractedText.length > 50) {
          // Sanitize to remove null bytes and control characters
          const sanitizedText = sanitizeForPostgres(extractedText.substring(0, 15000))
          return `[PDF: ${name}]\n${sanitizedText}`
        }
      }
      return `[PDF: ${name}] - PDF text extraction limited. Content may be image-based.`
    }

    // DOCX - try to extract text from XML
    if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        name.endsWith('.docx')) {
      // DOCX is a ZIP with XML - try to find readable text
      const textContent = decodedContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      const cleanText = textContent.replace(/[^\x20-\x7E\n\u00C0-\u024F]/g, '').trim()
      if (cleanText.length > 50) {
        return `[DOCX: ${name}]\n${cleanText.substring(0, 15000)}`
      }
      return `[DOCX: ${name}] - Could not extract readable text. Try copying content as plain text.`
    }

    // DOC (old format)
    if (type === 'application/msword' || name.endsWith('.doc')) {
      const cleanText = decodedContent.replace(/[^\x20-\x7E\n]/g, ' ').replace(/\s+/g, ' ').trim()
      if (cleanText.length > 50) {
        return `[DOC: ${name}]\n${cleanText.substring(0, 15000)}`
      }
      return `[DOC: ${name}] - Could not extract readable text from old Word format.`
    }

    // For other types, try to read as text
    const cleanContent = sanitizeForPostgres(decodedContent)
    if (cleanContent.length > 0 && cleanContent.length < 50000) {
      return `[File: ${name}]\n${cleanContent}`
    }

    return `[File: ${name}] - File type (${type}) not fully supported for text extraction.`
  } catch (error: any) {
    console.error('Error extracting file content:', error)
    const errorMessage = error?.message || String(error) || 'Unknown error'
    return `[File: ${attachment.name}] - Error extracting content: ${errorMessage}`
  }
}

// Extract file content using OpenAI Files API + Responses API (supports PDF, DOCX, etc.)
async function extractFileWithOpenAI(
  attachment: FileAttachment,
  openaiApiKey: string
): Promise<string> {
  let uploadedFileId: string | null = null
  const fileType = attachment.type
  const fileName = attachment.name
  const fileExt = fileName.toLowerCase().split('.').pop() || ''

  try {
    console.log(`Extracting file with OpenAI Files + Responses API: ${fileName} (${fileType})`)

    let base64Content = attachment.content

    // Strip data URL prefix if present
    if (base64Content.startsWith('data:')) {
      const commaIndex = base64Content.indexOf(',')
      if (commaIndex !== -1) {
        base64Content = base64Content.substring(commaIndex + 1)
      }
    }

    // Clean base64 string
    base64Content = base64Content.replace(/[\s\n\r]/g, '')

    // Decode base64 to binary
    const binaryString = atob(base64Content)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    // Step 1: Upload file to OpenAI Files API
    console.log('Uploading file to OpenAI Files API...')
    const formData = new FormData()
    const blob = new Blob([bytes], { type: fileType || 'application/octet-stream' })
    formData.append('file', blob, fileName)
    formData.append('purpose', 'user_data')

    const uploadResponse = await fetch('https://api.openai.com/v1/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: formData
    })

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text()
      console.error('Files API upload error:', uploadResponse.status, errorText)
      throw new Error(`Files API upload error: ${uploadResponse.status} - ${errorText}`)
    }

    const uploadData = await uploadResponse.json()
    uploadedFileId = uploadData.id
    console.log(`File uploaded successfully, file_id: ${uploadedFileId}`)

    // Step 2: Use file_id in Responses API
    console.log('Calling Responses API with file_id...')
    const response = await fetch(OPENAI_RESPONSES_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_file',
                file_id: uploadedFileId
              },
              {
                type: 'input_text',
                text: 'Please extract and return ALL the text content from this document. Return ONLY the extracted text, nothing else. Preserve the structure and formatting as much as possible.'
              }
            ]
          }
        ],
        max_output_tokens: 8000
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Responses API error:', response.status, errorText)
      throw new Error(`Responses API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    console.log('Responses API response structure:', JSON.stringify(data, null, 2).substring(0, 500))

    // Extract the text content from the response
    let extractedText = ''

    if (data.output && Array.isArray(data.output)) {
      for (const item of data.output) {
        if (item.type === 'message' && item.content) {
          for (const contentItem of item.content) {
            if (contentItem.type === 'output_text' || contentItem.type === 'text') {
              extractedText += contentItem.text || ''
            }
          }
        }
      }
    } else if (data.output_text) {
      // Direct output_text field
      extractedText = data.output_text
    } else if (data.choices && data.choices[0]?.message?.content) {
      // Fallback for different response format
      extractedText = data.choices[0].message.content
    }

    if (!extractedText || extractedText.length < 10) {
      console.log('No meaningful text extracted from file')
      return `[${fileExt.toUpperCase()}: ${fileName}] - Could not extract text content from this file.`
    }

    // Sanitize for PostgreSQL
    const sanitizedText = sanitizeForPostgres(extractedText)
    console.log(`Successfully extracted ${sanitizedText.length} characters from file`)

    return `[${fileExt.toUpperCase()}: ${fileName}]\n${sanitizedText}`
  } catch (error: any) {
    console.error('Error extracting file with OpenAI:', error)
    return `[${fileExt.toUpperCase()}: ${fileName}] - File extraction failed: ${error.message || 'Unknown error'}. Try uploading to Google Drive for better support.`
  } finally {
    // Clean up: Delete the uploaded file from OpenAI
    if (uploadedFileId) {
      try {
        console.log(`Cleaning up: deleting file ${uploadedFileId}`)
        await fetch(`https://api.openai.com/v1/files/${uploadedFileId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
          }
        })
      } catch (deleteError) {
        console.log('Failed to delete uploaded file (non-critical):', deleteError)
      }
    }
  }
}

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

// Get Google access token from database (google_tokens table)
async function getGoogleToken(
  supabase: any,
  userId: string,
  requestToken?: string
): Promise<string | null> {
  // First, try token from request (for backwards compatibility)
  if (requestToken) {
    console.log('Using Google token from request')
    return requestToken
  }

  try {
    // Fetch token from google_tokens table
    const { data: tokenData, error: fetchError } = await supabase
      .from('google_tokens')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (fetchError || !tokenData) {
      console.log('No Google token found in database for user:', userId)
      return null
    }

    // Check if access token is still valid (with 5 min buffer)
    const expiresAt = tokenData.expires_at ? new Date(tokenData.expires_at) : null
    const isExpired = !expiresAt || expiresAt.getTime() < Date.now() + 5 * 60 * 1000

    if (!isExpired && tokenData.access_token) {
      console.log('Returning existing valid Google token for user:', userId)
      return tokenData.access_token
    }

    // Token is expired, need to refresh
    console.log('Google token expired, refreshing for user:', userId)

    const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID')
    const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')

    if (!googleClientId || !googleClientSecret) {
      console.error('Missing Google OAuth credentials in environment')
      return null
    }

    // Refresh the token with Google
    const refreshResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: googleClientId,
        client_secret: googleClientSecret,
        refresh_token: tokenData.refresh_token,
        grant_type: 'refresh_token',
      }),
    })

    if (!refreshResponse.ok) {
      const errorText = await refreshResponse.text()
      console.error('Google token refresh failed:', errorText)

      // If refresh token is invalid, delete it from database
      if (refreshResponse.status === 400 || refreshResponse.status === 401) {
        await supabase
          .from('google_tokens')
          .delete()
          .eq('user_id', userId)
        console.log('Deleted invalid Google token for user:', userId)
      }
      return null
    }

    const refreshData = await refreshResponse.json()
    const newAccessToken = refreshData.access_token
    const newExpiresIn = refreshData.expires_in || 3600
    const newExpiresAt = new Date(Date.now() + newExpiresIn * 1000).toISOString()

    // Update token in database
    const { error: updateError } = await supabase
      .from('google_tokens')
      .update({
        access_token: newAccessToken,
        expires_at: newExpiresAt,
        // Google may return a new refresh token (rare but possible)
        ...(refreshData.refresh_token && { refresh_token: refreshData.refresh_token }),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)

    if (updateError) {
      console.error('Error updating Google token:', updateError)
    }

    console.log('Google token refreshed successfully for user:', userId)
    return newAccessToken
  } catch (error) {
    console.error('Error getting Google token:', error)
    return null
  }
}

// Call Google Classroom API
async function callGoogleClassroomAPI(endpoint: string, token: string): Promise<any> {
  try {
    const url = `${GOOGLE_CLASSROOM_API}${endpoint}`
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Google Classroom API error (${response.status}):`, errorText)
      throw new Error(`Google Classroom API error: ${response.status} - ${errorText}`)
    }
    
    return await response.json()
  } catch (error) {
    console.error('Error calling Google Classroom API:', error)
    throw error
  }
}

// Call Google Drive API
async function callGoogleDriveAPI(endpoint: string, token: string, options: any = {}): Promise<any> {
  try {
    const url = `${GOOGLE_DRIVE_API}${endpoint}`
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Google Drive API error (${response.status}):`, errorText)
      throw new Error(`Google Drive API error: ${response.status} - ${errorText}`)
    }
    
    // For file downloads, return the response directly
    if (endpoint.includes('alt=media')) {
      return response
    }
    
    return await response.json()
  } catch (error) {
    console.error('Error calling Google Drive API:', error)
    throw error
  }
}

// Read content from a Google Drive file
async function readDriveFileContent(fileId: string, token: string): Promise<string> {
  try {
    // First get file metadata to check MIME type
    const metadata = await callGoogleDriveAPI(`/files/${fileId}?fields=id,name,mimeType`, token)
    const mimeType = metadata.mimeType || ''
    const fileName = metadata.name || 'Unknown'

    console.log(`Reading file: ${fileName}, mimeType: ${mimeType}`)

    // Google Docs - use export to plain text
    if (mimeType === 'application/vnd.google-apps.document') {
      console.log('Exporting Google Doc as plain text...')
      const exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`
      const response = await fetch(exportUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Error exporting Google Doc:', errorText)
        throw new Error(`Failed to export Google Doc: ${response.status}`)
      }

      return await response.text()
    }

    // Google Sheets - export as CSV
    if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      console.log('Exporting Google Sheet as CSV...')
      const exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/csv`
      const response = await fetch(exportUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error(`Failed to export Google Sheet: ${response.status}`)
      }

      return await response.text()
    }

    // Google Slides - export as plain text
    if (mimeType === 'application/vnd.google-apps.presentation') {
      console.log('Exporting Google Slides as plain text...')
      const exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`
      const response = await fetch(exportUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error(`Failed to export Google Slides: ${response.status}`)
      }

      return await response.text()
    }

    // For regular files, download content
    const fileResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    if (!fileResponse.ok) {
      throw new Error(`Failed to download file: ${fileResponse.status}`)
    }

    // Handle different file types
    if (mimeType === 'text/plain' || mimeType.includes('text')) {
      return await fileResponse.text()
    } else if (mimeType === 'application/pdf') {
      // PDF - try to get text content (basic extraction)
      const arrayBuffer = await fileResponse.arrayBuffer()
      // Simple PDF text extraction (looks for text streams)
      const uint8Array = new Uint8Array(arrayBuffer)
      const text = new TextDecoder('utf-8', { fatal: false }).decode(uint8Array)

      // Try to extract readable text from PDF
      const textMatches = text.match(/\(([^)]+)\)/g)
      if (textMatches && textMatches.length > 10) {
        const extractedText = textMatches
          .map(m => m.slice(1, -1))
          .filter(t => t.length > 1 && !/^[\x00-\x1F]+$/.test(t))
          .join(' ')
        if (extractedText.length > 100) {
          return `[Extracted from PDF: ${fileName}]\n\n${extractedText}`
        }
      }

      return `[PDF file: ${fileName}. Size: ${arrayBuffer.byteLength} bytes. For better PDF reading, please upload to Google Docs first.]`
    } else if (mimeType.includes('wordprocessingml') || mimeType.includes('msword')) {
      // DOCX/DOC file - try to extract text from XML
      const arrayBuffer = await fileResponse.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)
      const text = new TextDecoder('utf-8', { fatal: false }).decode(uint8Array)

      // DOCX files are ZIP archives with XML - try to find text content
      const textContent = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      const cleanText = textContent.replace(/[^\x20-\x7E\n]/g, '').trim()

      if (cleanText.length > 100) {
        return `[Extracted from ${fileName}]\n\n${cleanText.substring(0, 10000)}`
      }

      return `[DOCX file: ${fileName}. For better reading, please open in Google Docs and share that version.]`
    } else {
      // Try to read as text for other types
      try {
        const text = await fileResponse.text()
        if (text && text.length > 0) {
          return text
        }
        return `[File type: ${mimeType}. No readable text content found.]`
      } catch {
        return `[File type: ${mimeType}. Content extraction not supported for this file type.]`
      }
    }
  } catch (error) {
    console.error('Error reading Drive file:', error)
    throw error
  }
}

// Execute tool function
async function executeTool(
  toolName: string,
  args: any,
  googleToken: string | null
): Promise<string> {
  try {
    // Check Google token for tools that require it
    const googleTools = ['get_user_classes', 'get_class_assignments', 'get_assignment_details',
                         'get_student_submissions', 'search_drive_files', 'read_drive_file',
                         'get_upcoming_deadlines', 'get_class_materials', 'get_announcements',
                         'get_assignment_help_context']
    
    if (googleTools.includes(toolName) && !googleToken) {
      return JSON.stringify({ 
        error: 'Google account not connected', 
        message: 'Please connect your Google account in settings to use this feature.' 
      })
    }

    switch (toolName) {
      case 'get_user_classes':
        try {
          const classes = await callGoogleClassroomAPI('/courses?studentId=me', googleToken!)
          return JSON.stringify(classes)
        } catch (error: any) {
          console.error('Error getting user classes:', error)
          return JSON.stringify({ 
            error: 'Failed to fetch classes', 
            message: error.message || 'Unable to retrieve your classes. Please try again.' 
          })
        }

      case 'get_class_assignments':
        if (!args.courseId) {
          return JSON.stringify({ error: 'courseId is required' })
        }
        try {
          const assignments = await callGoogleClassroomAPI(
            `/courses/${args.courseId}/courseWork`,
            googleToken!
          )
          return JSON.stringify(assignments)
        } catch (error: any) {
          console.error('Error getting assignments:', error)
          return JSON.stringify({ 
            error: 'Failed to fetch assignments', 
            message: error.message || 'Unable to retrieve assignments. Please check the course ID.' 
          })
        }

      case 'get_assignment_details':
        if (!args.courseId || !args.courseWorkId) {
          return JSON.stringify({ error: 'courseId and courseWorkId are required' })
        }
        try {
          const assignment = await callGoogleClassroomAPI(
            `/courses/${args.courseId}/courseWork/${args.courseWorkId}`,
            googleToken!
          )
          return JSON.stringify(assignment)
        } catch (error: any) {
          console.error('Error getting assignment details:', error)
          return JSON.stringify({ 
            error: 'Failed to fetch assignment details', 
            message: error.message || 'Unable to retrieve assignment details.' 
          })
        }

      case 'get_student_submissions':
        if (!args.courseId || !args.courseWorkId) {
          return JSON.stringify({ error: 'courseId and courseWorkId are required' })
        }
        try {
          const submissions = await callGoogleClassroomAPI(
            `/courses/${args.courseId}/courseWork/${args.courseWorkId}/studentSubmissions`,
            googleToken!
          )
          return JSON.stringify(submissions)
        } catch (error: any) {
          console.error('Error getting submissions:', error)
          return JSON.stringify({ 
            error: 'Failed to fetch submissions', 
            message: error.message || 'Unable to retrieve submissions.' 
          })
        }

      case 'search_drive_files':
        if (!args.query) {
          return JSON.stringify({ error: 'query is required' })
        }
        try {
          // Escape query for URL
          const escapedQuery = encodeURIComponent(args.query)
          const searchResults = await callGoogleDriveAPI(
            `/files?q=name contains '${escapedQuery}' or fullText contains '${escapedQuery}'&fields=files(id,name,mimeType,modifiedTime,size)`,
            googleToken!
          )
          return JSON.stringify(searchResults)
        } catch (error: any) {
          console.error('Error searching Drive files:', error)
          return JSON.stringify({ 
            error: 'Failed to search files', 
            message: error.message || 'Unable to search your Drive files.' 
          })
        }

      case 'read_drive_file':
        if (!args.fileId) {
          return JSON.stringify({ error: 'fileId is required' })
        }
        try {
          const fileContent = await readDriveFileContent(args.fileId, googleToken!)
          return JSON.stringify({ content: fileContent })
        } catch (error: any) {
          console.error('Error reading Drive file:', error)
          return JSON.stringify({
            error: 'Failed to read file',
            message: error.message || 'Unable to read the file. It may be too large or in an unsupported format.'
          })
        }

      case 'get_upcoming_deadlines':
        try {
          const daysAhead = args.days_ahead || 7
          // First get all courses
          const coursesData = await callGoogleClassroomAPI('/courses?studentId=me', googleToken!)
          const courses = coursesData.courses || []

          const allDeadlines: any[] = []
          const assignmentsWithoutDueDate: any[] = []
          const pastDueAssignments: any[] = []
          const now = new Date()
          const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000)

          // Get assignments from each course (limit to 5 for performance)
          for (const course of courses.slice(0, 5)) {
            try {
              const assignments = await callGoogleClassroomAPI(
                `/courses/${course.id}/courseWork`,
                googleToken!
              )
              if (assignments.courseWork) {
                for (const work of assignments.courseWork) {
                  if (work.dueDate) {
                    const dueDate = new Date(
                      work.dueDate.year,
                      work.dueDate.month - 1,
                      work.dueDate.day,
                      work.dueTime?.hours || 23,
                      work.dueTime?.minutes || 59
                    )
                    if (dueDate >= now && dueDate <= futureDate) {
                      allDeadlines.push({
                        course: course.name,
                        courseId: course.id,
                        title: work.title,
                        dueDate: dueDate.toISOString(),
                        type: work.workType,
                        id: work.id
                      })
                    } else if (dueDate < now) {
                      // Past due - might still need to be completed
                      pastDueAssignments.push({
                        course: course.name,
                        courseId: course.id,
                        title: work.title,
                        dueDate: dueDate.toISOString(),
                        type: work.workType,
                        id: work.id
                      })
                    }
                  } else {
                    // No due date set - still needs to be done!
                    assignmentsWithoutDueDate.push({
                      course: course.name,
                      courseId: course.id,
                      title: work.title,
                      description: work.description?.substring(0, 100),
                      type: work.workType,
                      id: work.id
                    })
                  }
                }
              }
            } catch (e) {
              // Skip courses with errors
            }
          }

          // Sort by due date
          allDeadlines.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())

          return JSON.stringify({
            deadlines_this_period: allDeadlines,
            deadlines_count: allDeadlines.length,
            assignments_without_due_date: assignmentsWithoutDueDate,
            no_due_date_count: assignmentsWithoutDueDate.length,
            past_due_assignments: pastDueAssignments.slice(0, 5), // Limit to 5 most recent
            past_due_count: pastDueAssignments.length,
            looking_ahead_days: daysAhead,
            summary: `Found ${allDeadlines.length} assignment(s) due in the next ${daysAhead} days. ${assignmentsWithoutDueDate.length > 0 ? `Also ${assignmentsWithoutDueDate.length} assignment(s) with no due date set.` : ''} ${pastDueAssignments.length > 0 ? `${pastDueAssignments.length} past due.` : ''}`
          })
        } catch (error: any) {
          console.error('Error getting deadlines:', error)
          return JSON.stringify({
            error: 'Failed to fetch deadlines',
            message: error.message || 'Unable to retrieve upcoming deadlines.'
          })
        }

      case 'get_class_materials':
        if (!args.courseId) {
          return JSON.stringify({ error: 'courseId is required' })
        }
        try {
          const materials = await callGoogleClassroomAPI(
            `/courses/${args.courseId}/courseWorkMaterials`,
            googleToken!
          )
          return JSON.stringify(materials)
        } catch (error: any) {
          console.error('Error getting class materials:', error)
          return JSON.stringify({
            error: 'Failed to fetch materials',
            message: error.message || 'Unable to retrieve course materials.'
          })
        }

      case 'get_announcements':
        if (!args.courseId) {
          return JSON.stringify({ error: 'courseId is required' })
        }
        try {
          const announcements = await callGoogleClassroomAPI(
            `/courses/${args.courseId}/announcements`,
            googleToken!
          )
          return JSON.stringify(announcements)
        } catch (error: any) {
          console.error('Error getting announcements:', error)
          return JSON.stringify({
            error: 'Failed to fetch announcements',
            message: error.message || 'Unable to retrieve class announcements.'
          })
        }

      case 'get_assignment_help_context':
        if (!args.courseId || !args.courseWorkId || !args.topic) {
          return JSON.stringify({ error: 'courseId, courseWorkId, and topic are required' })
        }
        try {
          console.log('=== COMPOSITE TOOL: get_assignment_help_context ===')
          console.log('Getting full context for assignment help...')

          // 1. Get assignment details from Classroom
          let assignmentDetails: any = null
          try {
            assignmentDetails = await callGoogleClassroomAPI(
              `/courses/${args.courseId}/courseWork/${args.courseWorkId}`,
              googleToken!
            )
            console.log('✅ Got assignment details:', assignmentDetails.title)
          } catch (e: any) {
            console.log('⚠️ Could not get assignment details:', e.message)
          }

          // 2. Search Drive for related files using the topic
          let driveFiles: any[] = []
          try {
            const searchQuery = encodeURIComponent(args.topic)
            const searchResults = await callGoogleDriveAPI(
              `/files?q=name contains '${searchQuery}' or fullText contains '${searchQuery}'&fields=files(id,name,mimeType,modifiedTime)&pageSize=5`,
              googleToken!
            )
            driveFiles = searchResults.files || []
            console.log(`✅ Found ${driveFiles.length} related files in Drive`)
          } catch (e: any) {
            console.log('⚠️ Could not search Drive:', e.message)
          }

          // 3. Read content of found files (up to 3 files, skip large ones)
          const filesWithContent: any[] = []
          for (const file of driveFiles.slice(0, 3)) {
            try {
              // Skip files that are likely too large or unsupported
              if (file.mimeType?.includes('video') || file.mimeType?.includes('audio')) {
                filesWithContent.push({
                  name: file.name,
                  mimeType: file.mimeType,
                  content: '[Media file - content not readable]'
                })
                continue
              }

              const content = await readDriveFileContent(file.id, googleToken!)
              filesWithContent.push({
                name: file.name,
                mimeType: file.mimeType,
                content: content.substring(0, 2000) // Limit content length
              })
              console.log(`✅ Read content from: ${file.name}`)
            } catch (e: any) {
              console.log(`⚠️ Could not read file ${file.name}:`, e.message)
              filesWithContent.push({
                name: file.name,
                mimeType: file.mimeType,
                content: '[Could not read file content]'
              })
            }
          }

          console.log('=== COMPOSITE TOOL COMPLETE ===')

          // Return comprehensive context
          return JSON.stringify({
            assignment: assignmentDetails ? {
              title: assignmentDetails.title,
              description: assignmentDetails.description,
              maxPoints: assignmentDetails.maxPoints,
              dueDate: assignmentDetails.dueDate,
              dueTime: assignmentDetails.dueTime,
              workType: assignmentDetails.workType,
              materials: assignmentDetails.materials,
              link: assignmentDetails.alternateLink
            } : null,
            related_files_from_drive: filesWithContent,
            files_found_count: driveFiles.length,
            search_topic: args.topic,
            summary: `Found assignment "${assignmentDetails?.title || 'Unknown'}" and ${driveFiles.length} related file(s) in Drive.`
          })
        } catch (error: any) {
          console.error('Error in get_assignment_help_context:', error)
          return JSON.stringify({
            error: 'Failed to get assignment context',
            message: error.message || 'Unable to retrieve assignment help context.'
          })
        }

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` })
    }
  } catch (error: any) {
    console.error(`Unexpected error executing tool ${toolName}:`, error)
    return JSON.stringify({ 
      error: 'Tool execution failed', 
      message: error.message || 'An unexpected error occurred while executing the tool.' 
    })
  }
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client using environment variables (automatically available in Edge Functions)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Create admin client for database operations and token validation
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Extract token from Authorization header and verify user directly
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          details: authError?.message || 'Invalid token'
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    let body: RequestBody
    try {
      body = await req.json()
    } catch (parseError: any) {
      console.error('Error parsing request JSON:', parseError)
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body', details: parseError?.message }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    const { message, conversation_id, google_token, attachments, file_urls } = body

    // Log request body for debugging
    console.log('=== REQUEST BODY DEBUG ===')
    console.log('Message:', message)
    console.log('Conversation ID:', conversation_id)
    console.log('Has google_token:', !!google_token)
    console.log('Attachments count:', attachments?.length || 0)
    if (attachments && attachments.length > 0) {
      attachments.forEach((att: any, i: number) => {
        console.log(`Attachment ${i}: name=${att?.name}, type=${att?.type}, content_length=${att?.content?.length || 0}, encoding=${att?.encoding}`)
      })
    }
    console.log('=========================')

    if (!message || typeof message !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Process file attachments if present
    let attachmentContext = ''

    if (attachments && attachments.length > 0) {
      console.log(`Processing ${attachments.length} file attachment(s)...`)
      const fileContents: string[] = []

      for (const attachment of attachments) {
        try {
          console.log(`Processing: ${attachment.name} (${attachment.type})`)
          console.log(`Content length: ${attachment.content?.length || 0} characters`)

          // Validate attachment
          if (!attachment.content || attachment.content.length === 0) {
            console.log(`Warning: Empty content for ${attachment.name}`)
            fileContents.push(`[File: ${attachment.name}] - Empty file content`)
            continue
          }

          // Limit file size (base64 is ~33% larger than binary, so 10MB base64 = ~7.5MB file)
          const MAX_BASE64_SIZE = 10 * 1024 * 1024 // 10MB
          if (attachment.content.length > MAX_BASE64_SIZE) {
            console.log(`Warning: File ${attachment.name} is too large (${attachment.content.length} chars)`)
            fileContents.push(`[File: ${attachment.name}] - File too large to process (max ~7.5MB)`)
            continue
          }

          // Check if file type should use OpenAI Files API + Responses API
          const isPdf = attachment.type === 'application/pdf' || attachment.name?.toLowerCase().endsWith('.pdf')
          const isDocx = attachment.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                         attachment.name?.toLowerCase().endsWith('.docx')
          const isDoc = attachment.type === 'application/msword' || attachment.name?.toLowerCase().endsWith('.doc')

          // Use OpenAI for PDF, DOCX, DOC files
          if (isPdf || isDocx || isDoc) {
            console.log(`Document detected: ${attachment.name} - using OpenAI Files + Responses API for extraction`)
            const apiKey = Deno.env.get('OPENAI_API_KEY')
            if (apiKey) {
              const extractedContent = await extractFileWithOpenAI(attachment, apiKey)
              fileContents.push(extractedContent)
            } else {
              console.error('No OpenAI API key available for file extraction')
              fileContents.push(`[File: ${attachment.name}] - File processing unavailable. Please upload to Google Drive instead.`)
            }
            continue
          }

          // Other files: use basic text extraction
          const content = extractFileContent(attachment)
          fileContents.push(content)
        } catch (attachmentError: any) {
          console.error(`Error processing attachment ${attachment.name}:`, attachmentError)
          fileContents.push(`[File: ${attachment.name}] - Error processing: ${attachmentError.message || 'Unknown error'}`)
        }
      }

      attachmentContext = '\n\n--- ATTACHED FILES ---\n' + fileContents.join('\n\n') + '\n--- END OF ATTACHED FILES ---\n'
      console.log(`Attachment context length: ${attachmentContext.length} characters`)
    }

    // Process pre-uploaded file URLs (from Supabase Storage via upload-file function)
    // Use Responses API directly with file_url + user's message for a more natural interaction
    let useResponsesApiForFiles = false
    let pdfFileUrls: UploadedFile[] = []

    if (file_urls && file_urls.length > 0) {
      console.log(`Processing ${file_urls.length} uploaded file(s) via URLs...`)

      // Check if all files are PDFs (Responses API with file_url only supports PDFs)
      pdfFileUrls = file_urls.filter(f =>
        f.filename.toLowerCase().endsWith('.pdf') ||
        f.file_url.toLowerCase().includes('.pdf')
      )

      const nonPdfFiles = file_urls.filter(f =>
        !f.filename.toLowerCase().endsWith('.pdf') &&
        !f.file_url.toLowerCase().includes('.pdf')
      )

      if (pdfFileUrls.length > 0) {
        // We'll use Responses API directly with the user's message + file
        useResponsesApiForFiles = true
        console.log(`Will use Responses API directly for ${pdfFileUrls.length} PDF file(s)`)
      }

      // For non-PDF files, add a note (DOCX not supported with file_url)
      if (nonPdfFiles.length > 0) {
        const unsupportedFiles = nonPdfFiles.map(f => f.filename).join(', ')
        attachmentContext += `\n\n[Note: The following files are not supported for direct analysis: ${unsupportedFiles}. Only PDF files are supported. Please convert to PDF and try again.]`
        console.log(`Non-PDF files not supported: ${unsupportedFiles}`)
      }
    }

    // Get or create conversation_id
    let finalConversationId = conversation_id
    if (!finalConversationId) {
      // Create new conversation
      finalConversationId = crypto.randomUUID()
    }

    // Combine message with attachment context for storage and processing
    // Sanitize to ensure no null bytes or control characters that PostgreSQL can't handle
    const fullUserMessage = sanitizeForPostgres(
      attachmentContext ? message + attachmentContext : message
    )

    // Save user message to database (with attachments if any)
    const { error: userMessageError } = await supabase
      .from('chat_messages')
      .insert({
        user_id: user.id,
        role: 'user',
        content: fullUserMessage,
        conversation_id: finalConversationId,
      })

    if (userMessageError) {
      console.error('Error saving user message:', userMessageError)
      return new Response(
        JSON.stringify({ error: 'Failed to save user message' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Retrieve conversation history
    const { data: history, error: historyError } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('user_id', user.id)
      .eq('conversation_id', finalConversationId)
      .order('created_at', { ascending: true })
      .limit(50) // Limit to last 50 messages for context

    if (historyError) {
      console.error('Error retrieving history:', historyError)
      return new Response(
        JSON.stringify({ error: 'Failed to retrieve conversation history' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Format messages for OpenAI API
    let messages: ChatMessage[] = (history || []).map((msg: any) => ({
      role: msg.role,
      content: msg.content,
    }))

    // Get Google token for tool execution (try from request first, then session)
    console.log('=== GETTING GOOGLE TOKEN ===')
    console.log('Token from request:', google_token ? google_token.substring(0, 20) + '...' : 'null')
    console.log('User ID:', user.id)
    
    const googleToken = await getGoogleToken(supabase, user.id, google_token)
    
    // Log token status for debugging
    if (googleToken) {
      console.log('✅ Google token available for user:', user.id)
      console.log('Token (first 20 chars):', googleToken.substring(0, 20) + '...')
    } else {
      console.log('❌ No Google token available for user:', user.id)
    }
    console.log('============================')

    // Get OpenAI API key from environment variable
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!

    // Tool execution loop - handle multiple tool calls
    let aiResponse = ''
    let maxIterations = 5 // Prevent infinite loops
    let iteration = 0

    // If PDF files are attached, use Responses API directly with the user's message
    // This provides a more natural interaction where the AI sees the file + question together
    if (useResponsesApiForFiles && pdfFileUrls.length > 0) {
      console.log('Using Responses API directly for PDF file analysis...')

      try {
        // Build content array with text and files
        const contentArray: any[] = [
          {
            type: 'input_text',
            text: message
          }
        ]

        // Add each PDF file
        for (const file of pdfFileUrls) {
          contentArray.push({
            type: 'input_file',
            file_url: file.file_url
          })
          console.log(`Added PDF to request: ${file.filename} (${file.file_url})`)
        }

        // Add system context as part of the input
        const systemContext = `You are a helpful academic assistant for students. Be clear, accurate, and educational in your responses. If analyzing documents, provide thorough analysis and answer the user's specific question about the content.`

        const response = await fetch(OPENAI_RESPONSES_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiApiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            instructions: systemContext,
            input: [
              {
                role: 'user',
                content: contentArray
              }
            ],
            max_output_tokens: 4000
          })
        })

        if (!response.ok) {
          const errorText = await response.text()
          console.error('Responses API error:', errorText)
          // Fall back to regular chat completions
          console.log('Falling back to Chat Completions API...')
        } else {
          const data = await response.json()
          console.log('Responses API response received')

          // Extract the response text
          if (data.output && Array.isArray(data.output)) {
            for (const item of data.output) {
              if (item.type === 'message' && item.content) {
                for (const contentItem of item.content) {
                  if (contentItem.type === 'output_text' || contentItem.type === 'text') {
                    aiResponse += contentItem.text || ''
                  }
                }
              }
            }
          } else if (data.output_text) {
            aiResponse = data.output_text
          }

          if (aiResponse) {
            console.log(`Got response from Responses API: ${aiResponse.length} characters`)

            // Save AI response to database
            const { error: aiMessageError } = await supabase
              .from('chat_messages')
              .insert({
                user_id: user.id,
                role: 'assistant',
                content: aiResponse,
                conversation_id: finalConversationId,
              })

            if (aiMessageError) {
              console.error('Error saving AI message:', aiMessageError)
            }

            // Return response directly
            return new Response(
              JSON.stringify({
                message: aiResponse,
                conversation_id: finalConversationId,
              }),
              {
                status: 200,
                headers: {
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*',
                },
              }
            )
          }
        }
      } catch (responsesApiError: any) {
        console.error('Error with Responses API:', responsesApiError)
        // Fall through to Chat Completions
      }
    }

    // Standard Chat Completions flow (for non-file requests or as fallback)
    try {
      while (iteration < maxIterations) {
        iteration++

        // Add system prompt as first message
        const messagesWithSystem: ChatMessage[] = [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages
        ]

        // Call OpenAI API with tools
        const openaiResponse = await fetch(OPENAI_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiApiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: messagesWithSystem,
            tools: TOOLS,
            tool_choice: 'auto',
            temperature: 0.5,  // Lowered for more consistent academic responses
            max_tokens: 2000,
          }),
        })

        if (!openaiResponse.ok) {
          const errorData = await openaiResponse.text()
          console.error('OpenAI API error:', errorData)
          
          // If it's a rate limit or temporary error, return a helpful message
          if (openaiResponse.status === 429) {
            return new Response(
              JSON.stringify({ 
                error: 'Rate limit exceeded', 
                message: 'OpenAI API rate limit reached. Please try again in a moment.' 
              }),
              { status: 429, headers: { 'Content-Type': 'application/json' } }
            )
          }
          
          return new Response(
            JSON.stringify({ error: 'Failed to get AI response', details: errorData }),
            { status: openaiResponse.status, headers: { 'Content-Type': 'application/json' } }
          )
        }

        const openaiData = await openaiResponse.json()
        const assistantMessage = openaiData.choices[0]?.message || {}

        // Check if AI wants to call tools
        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
          // Add assistant message with tool calls to conversation
          messages.push({
            role: 'assistant',
            content: assistantMessage.content || '',
            tool_calls: assistantMessage.tool_calls
          })

          // Execute each tool call
          for (const toolCall of assistantMessage.tool_calls) {
            const toolName = toolCall.function.name
            let toolArgs: any = {}
            
            try {
              toolArgs = JSON.parse(toolCall.function.arguments)
            } catch (e) {
              console.error('Error parsing tool arguments:', e)
              toolArgs = {}
            }

            console.log(`Executing tool: ${toolName} with args:`, toolArgs)

            try {
              // Execute tool
              const toolResult = await executeTool(toolName, toolArgs, googleToken)

              // Add tool result to conversation
              messages.push({
                role: 'tool',
                content: toolResult,
                tool_call_id: toolCall.id
              })
            } catch (toolError: any) {
              console.error(`Error executing tool ${toolName}:`, toolError)
              // Add error result to conversation so AI knows what went wrong
              messages.push({
                role: 'tool',
                content: JSON.stringify({ 
                  error: 'Tool execution failed', 
                  message: toolError.message || 'An error occurred while executing the tool.' 
                }),
                tool_call_id: toolCall.id
              })
            }
          }

          // Continue loop to get final response from AI
          continue
        } else {
          // No more tool calls, get final response
          aiResponse = assistantMessage.content || ''
          break
        }
      }

      // If we hit max iterations, use the last response
      if (iteration >= maxIterations && !aiResponse) {
        aiResponse = 'I apologize, but I encountered an issue processing your request. The system may have reached the maximum number of tool calls. Please try rephrasing your question or try again.'
      }
    } catch (error: any) {
      console.error('Error in tool execution loop:', error)
      aiResponse = 'I apologize, but I encountered an error while processing your request. Please try again.'
    }

    // Save AI response to database
    const { error: aiMessageError } = await supabase
      .from('chat_messages')
      .insert({
        user_id: user.id,
        role: 'assistant',
        content: aiResponse,
        conversation_id: finalConversationId,
      })

    if (aiMessageError) {
      console.error('Error saving AI message:', aiMessageError)
      // Still return the response even if saving fails
    }

    // Return response
    return new Response(
      JSON.stringify({
        message: aiResponse,
        conversation_id: finalConversationId,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  } catch (error: any) {
    console.error('Error in chat-ai function:', error)
    console.error('Error stack:', error?.stack)
    const errorMessage = error?.message || String(error) || 'Unknown error'
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  }
})

