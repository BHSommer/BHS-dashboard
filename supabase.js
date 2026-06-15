import { createClient } from "@supabase/supabase-js";

// These values come from your Netlify environment variables (see SETUP.md).
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);
