import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  throw new Error('Missing Supabase environment variables');
}

export const supabaseConfig = {
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_KEY,
} as const;

export const supabase = createClient(
  supabaseConfig.supabaseUrl,
  supabaseConfig.supabaseKey,
); 