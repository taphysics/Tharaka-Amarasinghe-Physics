// @ts-ignore
import { createClient } from '@supabase/supabase-js'

// @ts-ignore
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
// @ts-ignore
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvcGVwa3B3bW56eWd5bmp3c3poIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NDQwNjcsImV4cCI6MjA5NTQyMDA2N30.2__GFOakLAsFm1pMxRLcp_S4zM7uqyuTs0HfezFfmQA')
}

export const supabase = createClient(supabaseUrl || 'https://yopepkpwmnzygynjwszh.supabase.co', supabaseAnonKey || 'placeholder')