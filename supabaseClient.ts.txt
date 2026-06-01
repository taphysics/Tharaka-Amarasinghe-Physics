import { createClient } from '@supabase/supabase-js'

// import.meta එක (any) විදිහට ගත්තම TypeScript කෑගසන්නේ නැත
const metaEnv = (import.meta as any).env

const supabaseUrl = metaEnv.VITE_SUPABASE_URL
const supabaseAnonKey = metaEnv.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)