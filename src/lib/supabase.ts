import { createClient } from '@supabase/supabase-js'

export const supabaseUrl: string | undefined = import.meta.env.VITE_SUPABASE_URL
export const anonKey: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY

// Sans configuration, l'application tourne en mode démo sur des données fictives.
export const supabase = supabaseUrl && anonKey ? createClient(supabaseUrl, anonKey) : null
