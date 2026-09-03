import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { settingsManager } from "../local/settings-manager";

let clientInstance: SupabaseClient | null = null;
let currentUrl = "";
let currentKey = "";

export function getSupabaseClient(): SupabaseClient | null {
  const settings = settingsManager.getSettings();
  if (!settings.supabaseUrl || !settings.supabaseAnonKey) {
    return null;
  }

  if (
    clientInstance &&
    currentUrl === settings.supabaseUrl &&
    currentKey === settings.supabaseAnonKey
  ) {
    return clientInstance;
  }

  currentUrl = settings.supabaseUrl;
  currentKey = settings.supabaseAnonKey;
  clientInstance = createClient(currentUrl, currentKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  });

  return clientInstance;
}
