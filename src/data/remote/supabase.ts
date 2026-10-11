import { createClient, SupabaseClient } from "@supabase/supabase-js";

let clientInstance: SupabaseClient | null = null;
let currentUrl = "";
let currentKey = "";

export function getSupabaseClient(): SupabaseClient | null {
  // Unit test (Vitest) KHÔNG bao giờ được nối Supabase thật: .env trỏ production và vài luồng
  // (nhập ZIP, đồng sở hữu) gọi pushChanges() thật ⇒ từng đẩy dữ liệu mẫu lên production.
  // Test cần Supabase thì spyOn/mock hàm này.
  if (typeof process !== "undefined" && process.env?.VITEST) return null;
  const url =
    (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_SUPABASE_URL?.trim()) ||
    (typeof process !== "undefined" && process.env?.VITE_SUPABASE_URL?.trim()) ||
    "";
  const key =
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

