import { Database } from "@/types/database";
import { createClient, SupabaseClient as MainSupabaseClient } from "@supabase/supabase-js";
import { config } from "@/config";

const supabaseUrl = config.supabase.url;
const supabaseKey = config.supabase.key;

export type SupabaseClient = MainSupabaseClient<Database>;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase credentials");
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);
