import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { settingsManager } from "../local/settings-manager";

let clientInstance: SupabaseClient | null = null;
let currentUrl = "";
let currentKey = "";

export function getSupabaseClient(): SupabaseClient | null {
  const settings = settingsManager.getSettings();
  const url =
    settings.supabaseUrl?.trim() ||
    (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_SUPABASE_URL?.trim()) ||
    (typeof process !== "undefined" && process.env?.VITE_SUPABASE_URL?.trim()) ||
    "";
  const key =
    settings.supabaseAnonKey?.trim() ||
    (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_SUPABASE_ANON_KEY?.trim()) ||
    (typeof process !== "undefined" && process.env?.VITE_SUPABASE_ANON_KEY?.trim()) ||
    "";

  if (!url || !key) {
    return null;
  }

  if (
    clientInstance &&
    currentUrl === url &&
    currentKey === key
  ) {
    return clientInstance;
  }

  currentUrl = url;
  currentKey = key;
  clientInstance = createClient(currentUrl, currentKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  return clientInstance;
}
