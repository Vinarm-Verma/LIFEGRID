import { createClient } from "@supabase/supabase-js";

/*
|--------------------------------------------------------------------------
| LIFEGRID SUPABASE CONFIGURATION
|--------------------------------------------------------------------------
*/

const SUPABASE_URL = String(
  import.meta.env.VITE_SUPABASE_URL || ""
).trim();

const SUPABASE_PUBLISHABLE_KEY = String(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || ""
).trim();

/*
|--------------------------------------------------------------------------
| Supabase client
|--------------------------------------------------------------------------
|
| Never use placeholder.supabase.co.
| Never use a service-role key in frontend code.
|
*/

export const isSupabaseConfigured = Boolean(
  SUPABASE_URL &&
  SUPABASE_PUBLISHABLE_KEY &&
  (SUPABASE_URL.startsWith("https://") || SUPABASE_URL.startsWith("http://"))
);

export const supabase = isSupabaseConfigured
  ? createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: "pkce",
          storageKey: "lifegrid-auth",
        },
        global: {
          headers: {
            "x-application-name": "LIFEGRID",
          },
        },
      }
    )
  : null;

/*
|--------------------------------------------------------------------------
| API configuration
|--------------------------------------------------------------------------
*/

export const API_BASE_URL =
  String(
    import.meta.env.VITE_API_BASE_URL ||
      "http://127.0.0.1:8000/api"
  )
    .trim()
    .replace(/\/$/, "");

/*
|--------------------------------------------------------------------------
| Access token
|--------------------------------------------------------------------------
*/

export async function getAccessToken() {
  if (!supabase) return null;
  const {
    data,
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  return data?.session?.access_token || null;
}

/*
|--------------------------------------------------------------------------
| Authenticated API request
|--------------------------------------------------------------------------
*/

export async function authenticatedFetch(
  url,
  options = {}
) {
  if (!supabase) {
    throw new Error(
      "LIFEGRID authentication is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to web/.env."
    );
  }
  const sessionResult =
    await supabase.auth.getSession();

  if (sessionResult.error) {
    throw sessionResult.error;
  }

  const token =
    sessionResult.data?.session?.access_token || null;

  const headers = new Headers(
    options.headers || {}
  );

  headers.set(
    "Accept",
    "application/json"
  );

  if (token) {
    headers.set(
      "Authorization",
      `Bearer ${token}`
    );
  }

  /*
   * Add JSON content type automatically when
   * a request body is a normal JSON string.
   */

  if (
    options.body &&
    typeof options.body === "string" &&
    !headers.has("Content-Type")
  ) {
    headers.set(
      "Content-Type",
      "application/json"
    );
  }

  return fetch(url, {
    ...options,
    headers,
    cache:
      options.cache || "no-store",
  });
}

/*
|--------------------------------------------------------------------------
| API helper
|--------------------------------------------------------------------------
*/

export function apiUrl(path = "") {
  const cleanPath = String(path)
    .trim()
    .replace(/^\/+/, "");

  return `${API_BASE_URL}/${cleanPath}`;
}

/*
|--------------------------------------------------------------------------
| Safe sign out
|--------------------------------------------------------------------------
*/

export async function signOutSupabase() {
  try {
    if (!supabase) return;
    await supabase.auth.signOut();
  } catch (error) {
    console.error(
      "LIFEGRID sign out failed:",
      error
    );
  }
}