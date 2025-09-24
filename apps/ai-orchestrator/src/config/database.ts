import { config } from "./env";

export const databaseConfig = {
  url: config.supabase.url,
  key: config.supabase.key,
};