const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

export async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);

  // try to parse JSON either way
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const message = data?.detail || data?.raw || `Request failed (${res.status})`;
    throw new Error(message);
  }

  return data;
}