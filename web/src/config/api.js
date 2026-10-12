/**
 * LIFEGRID API configuration.
 * VITE_API_BASE_URL may include /api or just the backend origin.
 */

const DEFAULT_API_URL = "http://127.0.0.1:8000/api";

function normalizeApiUrl(value) {
  const trimmed = String(value || DEFAULT_API_URL).trim().replace(/\/+$/, "");

  if (!trimmed) {
    return DEFAULT_API_URL;
  }

  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}

export const API_BASE_URL = normalizeApiUrl(
  import.meta.env.VITE_API_BASE_URL
);

export function apiUrl(path = "") {
  const cleanPath = String(path).replace(/^\/+/, "");
  return cleanPath ? `${API_BASE_URL}/${cleanPath}` : API_BASE_URL;
}
