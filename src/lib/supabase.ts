import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = "https://tiuscycrfsmcgixvfkkz.supabase.co"
const SUPABASE_ANON_KEY = "sb_publishable_gemyr0pkJ98FS7Uu16gdwg_tmIocylH"

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
