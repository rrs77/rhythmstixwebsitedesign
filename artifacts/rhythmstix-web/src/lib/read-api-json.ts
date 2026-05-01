/** Use this copy anywhere fetch fails or the API returns an empty body. */
export const API_UNREACHABLE_MESSAGE =
  "Cannot reach the Rhythmstix API. Locally: run `pnpm dev` (or `pnpm dev:api` in a second terminal) with `.env` configured (`DATABASE_URL`, etc.). The Vite dev server proxies `/api` to port 3001 by default — set `API_URL` if your API uses another port. In production, confirm `/api` is deployed and env vars are set.";

/** Avoids "Unexpected end of JSON input" when the proxy returns an empty body (e.g. API down). */
export async function readApiJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(API_UNREACHABLE_MESSAGE);
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(
      "The server returned a non-JSON response. Check that the API is running and that /api is proxied correctly.",
    );
  }
}
