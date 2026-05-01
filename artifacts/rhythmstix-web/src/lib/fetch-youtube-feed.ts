/** Video items returned by `/api/youtube-feed` and `/api/social/youtube`. */
export type YoutubeFeedClientItem = {
  id: string;
  title: string;
  description?: string;
  date: string;
  videoId: string;
  thumbnail?: string;
  url: string;
};

/**
 * Load the YouTube RSS mirror. Tries the lightweight serverless route first,
 * then the Express route (same payload) if the first fails — useful when
 * Vercel rewrites send `/api/*` only to the catch-all function.
 */
export async function fetchYoutubeFeedClient(): Promise<YoutubeFeedClientItem[]> {
  const endpoints = ["/api/youtube-feed", "/api/social/youtube"] as const;
  let lastError: Error | null = null;

  for (const url of endpoints) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) throw new Error("Response is not JSON");
      const data: unknown = await res.json();
      if (!Array.isArray(data)) throw new Error("Expected JSON array");
      return data as YoutubeFeedClientItem[];
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  throw lastError ?? new Error("YouTube feed unavailable");
}
