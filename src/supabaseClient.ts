import { createClient } from '@supabase/supabase-js'

// කෙළින්ම ඔයාගේ ඇත්තම Supabase දත්ත මෙතනට ලබා දී ඇත
const supabaseUrl = 'https://yopepkpwmnzygynjwszh.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvcGVwa3B3bW56eWd5bmp3c3poIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NDQwNjcsImV4cCI6MjA5NTQyMDA2N30.2__GFOakLAsFm1pMxRLcp_S4zM7uqyuTs0HfezFfmQA'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)