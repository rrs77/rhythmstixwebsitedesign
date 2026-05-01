/**
 * YouTube channel video list via public RSS (no API key).
 * Kept free of DB imports so it can run in a minimal serverless handler on Vercel.
 *
 * Default channel: https://www.youtube.com/@RhythmstixMusicForEducation
 */

export type YoutubeFeedVideo = {
  id: string;
  source: "youtube";
  videoId: string;
  title: string;
  description: string;
  thumbnail: string;
  date: string;
  url: string;
};

/** Channel ID for @RhythmstixMusicForEducation */
const DEFAULT_YOUTUBE_CHANNEL_ID = "UCooHhU7FKALUQ4CtqjDFMsw";

let ytCache: { channelId: string; data: YoutubeFeedVideo[]; fetchedAt: number } | null = null;
const YT_CACHE_TTL = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20_000;

export function configuredYoutubeChannelId(): string {
  const fromEnv = process.env.YOUTUBE_CHANNEL_ID?.trim() || process.env.YT_CHANNEL_ID?.trim();
  if (fromEnv) return fromEnv;
  const url = process.env.YOUTUBE_CHANNEL_URL?.trim();
  if (url) {
    const fromPath = url.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/)?.[1];
    if (fromPath) return fromPath;
    const fromQuery = url.match(/channel_id=(UC[a-zA-Z0-9_-]+)/)?.[1];
    if (fromQuery) return fromQuery;
  }
  return DEFAULT_YOUTUBE_CHANNEL_ID;
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

export type YoutubeFeedApiResult =
  | { ok: true; videos: YoutubeFeedVideo[] }
  | { ok: false; status: number; error: string };

export async function fetchYoutubeFeedForApi(): Promise<YoutubeFeedApiResult> {
  const channelId = configuredYoutubeChannelId();

  if (
    ytCache &&
    ytCache.channelId === channelId &&
    Date.now() - ytCache.fetchedAt < YT_CACHE_TTL
  ) {
    return { ok: true, videos: ytCache.data };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
    const response = await fetch(rssUrl, {
      signal: controller.signal,
      headers: {
        Accept: "application/atom+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (compatible; RhythmstixFeed/1.0; +https://www.rhythmstix.co.uk)",
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (ytCache && ytCache.channelId === channelId) {
        return { ok: true, videos: ytCache.data };
      }
      return { ok: false, status: 502, error: "YouTube RSS request failed" };
    }

    const xml = await response.text();
    const videos = parseYouTubeRSS(xml);
    ytCache = { channelId, data: videos, fetchedAt: Date.now() };
    return { ok: true, videos };
  } catch {
    clearTimeout(timeoutId);
    if (ytCache && ytCache.channelId === channelId) {
      return { ok: true, videos: ytCache.data };
    }
    return { ok: false, status: 502, error: "YouTube RSS unavailable" };
  }
}
