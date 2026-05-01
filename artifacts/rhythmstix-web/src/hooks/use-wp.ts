import { useQuery, type QueryClient } from "@tanstack/react-query";
import { getPage, getPosts, getPost, getPages, getMedia } from "@/lib/wordpress";
import { fetchYoutubeFeedClient } from "@/lib/fetch-youtube-feed";

const WP_PAGE_STALE_MS = 30 * 60 * 1000;

export function wpPageSlugFromHref(href: string): string | null {
  if (!href.startsWith("/page/")) return null;
  const rest = href.slice("/page/".length);
  const slug = rest.split("/")[0]?.split("?")[0]?.trim();
  return slug || null;
}

export function prefetchWPPage(queryClient: QueryClient, slug: string) {
  if (!slug) return;
  return queryClient.prefetchQuery({
    queryKey: ["wp-page", slug],
    queryFn: () => getPage(slug),
    staleTime: WP_PAGE_STALE_MS,
  });
}

export function prefetchWPPageFromHref(queryClient: QueryClient, href: string) {
  const slug = wpPageSlugFromHref(href);
  if (slug) return prefetchWPPage(queryClient, slug);
}

export function useWPPage(slug: string) {
  return useQuery({
    queryKey: ["wp-page", slug],
    queryFn: () => getPage(slug),
    staleTime: WP_PAGE_STALE_MS,
    gcTime: 60 * 60 * 1000,
  });
}

export function useWPPost(slug: string) {
  return useQuery({
    queryKey: ["wp-post", slug],
    queryFn: () => getPost(slug),
    staleTime: 10 * 60 * 1000,
    gcTime: 45 * 60 * 1000,
  });
}

/** Blog list: longer stale time — WP is the slowest leg; avoid refetching on every visit. */
export const WP_POSTS_LIST_STALE_MS = 15 * 60 * 1000;

export function useWPPosts(perPage = 20) {
  return useQuery({
    queryKey: ["wp-posts", perPage],
    queryFn: () => getPosts(perPage),
    staleTime: WP_POSTS_LIST_STALE_MS,
    gcTime: 45 * 60 * 1000,
  });
}

/** Warm cache before navigating to /blog (nav hover / focus). WordPress first, then social feeds. */
export async function prefetchBlogFeed(queryClient: QueryClient, wpPerPage = 50) {
  await queryClient.prefetchQuery({
    queryKey: ["wp-posts", wpPerPage],
    queryFn: () => getPosts(wpPerPage),
    staleTime: WP_POSTS_LIST_STALE_MS,
  });
  void queryClient.prefetchQuery({
    queryKey: ["youtube-feed"],
    queryFn: () => fetchYoutubeFeedClient(),
    staleTime: 10 * 60 * 1000,
  });
  void queryClient.prefetchQuery({
    queryKey: ["linkedin-posts"],
    queryFn: async () => {
      const res = await fetch("/api/social/linkedin");
      if (!res.ok) throw new Error(`LinkedIn feed HTTP ${res.status}`);
      const data: unknown = await res.json();
      if (!Array.isArray(data)) throw new Error("Invalid LinkedIn feed JSON");
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useWPMedia(id: number) {
  return useQuery({
    queryKey: ["wp-media", id],
    queryFn: () => getMedia(id),
    enabled: id > 0,
    staleTime: 30 * 60 * 1000,
  });
}

export function useWPPages() {
  return useQuery({
    queryKey: ["wp-pages"],
    queryFn: () => getPages(),
    staleTime: 5 * 60 * 1000,
  });
}
