/**
 * Vercel serverless: GET /api/youtube-feed
 * Self-contained (no monorepo imports) so deployment always bundles and runs.
 * Logic mirrored from artifacts/api-server/src/lib/youtube-rss-feed.ts — update both if RSS handling changes.
 */
type YoutubeFeedVideo = {
  id: string;
  source: "youtube";
  videoId: string;
  title: string;
  description: string;
  thumbnail: string;
  date: string;
  url: string;
};

const DEFAULT_CHANNEL = "UCooHhU7FKALUQ4CtqjDFMsw";

let ytCache: { channelId: string; data: YoutubeFeedVideo[]; fetchedAt: number } | null = null;
const YT_CACHE_TTL = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20_000;

function channelId(): string {
  const id = process.env.YOUTUBE_CHANNEL_ID?.trim() || process.env.YT_CHANNEL_ID?.trim();
  if (id) return id;
  const url = process.env.YOUTUBE_CHANNEL_URL?.trim();
  if (url) {
    const fromPath = url.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/)?.[1];
    if (fromPath) return fromPath;
    const fromQuery = url.match(/channel_id=(UC[a-zA-Z0-9_-]+)/)?.[1];
    if (fromQuery) return fromQuery;
  }
  return DEFAULT_CHANNEL;
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

function parseYouTubeRSS(xml: string): YoutubeFeedVideo[] {
  const entries: YoutubeFeedVideo[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];
    let videoId = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1]?.trim() || "";
    if (!videoId) {
      const fromId = entry.match(/<id>yt:video:([^<]+)<\/id>/)?.[1]?.trim();
      if (fromId) videoId = fromId;
    }
    if (!videoId) continue;

    const title = entry.match(/<title>([^<]*)<\/title>/)?.[1] || "";
    const published = entry.match(/<published>([^<]+)<\/published>/)?.[1] || "";
    const descMatch = entry.match(/<media:description>([\s\S]*?)<\/media:description>/);
    const description = descMatch ? descMatch[1].trim() : "";
    const thumbDouble = entry.match(/<media:thumbnail[^>]*url="([^"]+)"/)?.[1] || "";
    const thumbSingle = entry.match(/<media:thumbnail[^>]*url='([^']+)'/)?.[1] || "";
    const thumbnail = thumbDouble || thumbSingle;

    entries.push({
      id: `yt:${videoId}`,
      source: "youtube",
      videoId,
      title: decodeXmlEntities(title),
      description: decodeXmlEntities(description),
      thumbnail,
      date: published,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    });
  }
  return entries;
}

async function loadFeed(): Promise<
  { ok: true; videos: YoutubeFeedVideo[] } | { ok: false; status: number; error: string }
> {
  const ch = channelId();
  if (ytCache && ytCache.channelId === ch && Date.now() - ytCache.fetchedAt < YT_CACHE_TTL) {
    return { ok: true, videos: ytCache.data };
  }

  const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(ch)}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(rssUrl, {
      signal: controller.signal,
      headers: {
        Accept: "application/atom+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (compatible; RhythmstixFeed/1.0; +https://www.rhythmstix.co.uk)",
      },
    });
    clearTimeout(t);

    if (!response.ok) {
      if (ytCache && ytCache.channelId === ch) return { ok: true, videos: ytCache.data };
      return { ok: false, status: 502, error: "YouTube RSS request failed" };
    }

    const xml = await response.text();
    const videos = parseYouTubeRSS(xml);
    ytCache = { channelId: ch, data: videos, fetchedAt: Date.now() };
    return { ok: true, videos };
  } catch {
    clearTimeout(t);
    if (ytCache && ytCache.channelId === ch) return { ok: true, videos: ytCache.data };
    return { ok: false, status: 502, error: "YouTube RSS unavailable" };
  }
}

export default async function handler(
  req: { method?: string },
  res: {
    status: (code: number) => typeof res;
    setHeader: (name: string, value: string) => void;
    json: (body: unknown) => void;
  },
): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const result = await loadFeed();
  if (result.ok) {
    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=1800");
    res.status(200).json(result.videos);
    return;
  }

  res.status(result.status).json({ error: result.error });
}
