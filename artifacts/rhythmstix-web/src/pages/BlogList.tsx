import { useState, useMemo } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { useWPPosts } from "@/hooks/use-wp";
import { decodeHtml } from "@/lib/wordpress";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, ArrowRight, Shield, Lock, X,
  Youtube, Linkedin, FileText, Play, Plus, Trash2, ExternalLink, Square, CheckSquare
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { YouTubeModalOverlay } from "@/components/YouTubeModal";
import { fetchYoutubeFeedClient } from "@/lib/fetch-youtube-feed";

type ContentSource = "wordpress" | "youtube" | "linkedin";

interface UnifiedPost {
  id: string;
  source: "wordpress" | "youtube" | "linkedin";
  title: string;
  excerpt: string;
  date: string;
  slug?: string;
  videoId?: string;
  thumbnail?: string;
  url?: string;
}

function useAdminCheck() {
  return useQuery({
    queryKey: ["admin-check"],
    queryFn: async () => {
      const res = await fetch("/api/auth/admin-check", { credentials: "include" });
      const data = await res.json();
      return data.authenticated as boolean;
    },
    staleTime: 60 * 1000,
  });
}

function useHiddenPosts() {
  return useQuery({
    queryKey: ["hidden-posts"],
    queryFn: async () => {
      const res = await fetch("/api/hidden-posts", { credentials: "include" });
      return res.json() as Promise<number[]>;
    },
    staleTime: 30 * 1000,
  });
}

function useHiddenSocial() {
  return useQuery({
    queryKey: ["hidden-social"],
    queryFn: async () => {
      const res = await fetch("/api/social/hidden", { credentials: "include" });
      return res.json() as Promise<string[]>;
    },
    staleTime: 30 * 1000,
  });
}

function useYouTubeVideos(enabled: boolean) {
  return useQuery({
    queryKey: ["youtube-feed"],
    queryFn: () => fetchYoutubeFeedClient(),
    staleTime: 10 * 60 * 1000,
    enabled,
  });
}

function useLinkedinPosts(enabled: boolean) {
  return useQuery({
    queryKey: ["linkedin-posts"],
    queryFn: async () => {
      const res = await fetch("/api/social/linkedin");
      if (!res.ok) throw new Error(`LinkedIn feed HTTP ${res.status}`);
      const data: unknown = await res.json();
      if (!Array.isArray(data)) throw new Error("Invalid LinkedIn feed JSON");
      return data as { id: string; title: string; description?: string; date: string; url: string }[];
    },
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&hellip;/g, "...").replace(/&nbsp;/g, " ").trim();
}

const SOURCE_ICONS = {
  wordpress: FileText,
  youtube: Youtube,
  linkedin: Linkedin,
};

const SECTION_LABELS: Record<ContentSource, string> = {
  wordpress: "Blog",
  youtube: "YouTube",
  linkedin: "LinkedIn",
};

export default function BlogList() {
  const { data: wpPosts, isLoading: wpLoading, isFetched: wpFetched } = useWPPosts(50);
  const { data: ytVideos, isLoading: ytLoading, isError: ytError } = useYouTubeVideos(wpFetched);
  const { data: liPosts, isLoading: liLoading } = useLinkedinPosts(wpFetched);
  const { data: isAdmin } = useAdminCheck();
  const { data: hiddenWpPosts = [] } = useHiddenPosts();
  const { data: hiddenSocial = [] } = useHiddenSocial();
  const queryClient = useQueryClient();

  const [adminMode, setAdminMode] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState("");
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [showAddLinkedin, setShowAddLinkedin] = useState(false);
  const [liTitle, setLiTitle] = useState("");
  const [liDesc, setLiDesc] = useState("");
  const [liUrl, setLiUrl] = useState("");

  const adminLoginMutation = useMutation({
    mutationFn: async (password: string) => {
      const res = await fetch("/api/auth/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });
      if (!res.ok) throw new Error("Invalid password");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-check"] });
      setShowAdminLogin(false);
      setAdminPassword("");
      setAdminError("");
      setAdminMode(true);
    },
    onError: () => setAdminError("Invalid password"),
  });

  const toggleWpMutation = useMutation({
    mutationFn: async (postId: number) => {
      const current = hiddenWpPosts || [];
      const newHidden = current.includes(postId)
        ? current.filter((id) => id !== postId)
        : [...current, postId];
      const res = await fetch("/api/hidden-posts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ postIds: newHidden }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return newHidden;
    },
    onSuccess: (newHidden) => {
      queryClient.setQueryData(["hidden-posts"], newHidden);
    },
  });

  const toggleSocialMutation = useMutation({
    mutationFn: async (id: string) => {
      const current = hiddenSocial || [];
      const newHidden = current.includes(id)
        ? current.filter((h) => h !== id)
        : [...current, id];
      const res = await fetch("/api/social/hidden", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids: newHidden }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return newHidden;
    },
    onSuccess: (newHidden) => {
      queryClient.setQueryData(["hidden-social"], newHidden);
    },
  });

  const addLinkedinMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/social/linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: liTitle, description: liDesc, url: liUrl }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["linkedin-posts"] });
      setLiTitle("");
      setLiDesc("");
      setLiUrl("");
      setShowAddLinkedin(false);
    },
  });

  const deleteLinkedinMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/social/linkedin/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["linkedin-posts"] });
    },
  });

  const unifiedPosts: UnifiedPost[] = useMemo(() => {
    const items: UnifiedPost[] = [];

    if (wpPosts) {
      for (const p of wpPosts) {
        items.push({
          id: `wp:${p.id}`,
          source: "wordpress",
          title: decodeHtml(p.title.rendered),
          excerpt: stripHtml(p.excerpt.rendered),
          date: p.date,
          slug: p.slug,
        });
      }
    }

    if (Array.isArray(ytVideos)) {
      for (const v of ytVideos) {
        if (!v?.videoId) continue;
        items.push({
          id: v.id,
          source: "youtube",
          title: v.title,
          excerpt: v.description?.substring(0, 200) || "",
          date: v.date,
          videoId: v.videoId,
          thumbnail: v.thumbnail,
          url: v.url || `https://www.youtube.com/watch?v=${v.videoId}`,
        });
      }
    }

    if (Array.isArray(liPosts)) {
      for (const l of liPosts) {
        items.push({
          id: l.id,
          source: "linkedin",
          title: l.title,
          excerpt: l.description?.substring(0, 200) || "",
          date: l.date,
          url: l.url,
        });
      }
    }

    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return items;
  }, [wpPosts, ytVideos, liPosts]);

  const isHidden = (post: UnifiedPost) => {
    if (post.source === "wordpress") {
      const wpId = parseInt(post.id.replace("wp:", ""));
      return hiddenWpPosts.includes(wpId);
    }
    return hiddenSocial.includes(post.id);
  };

  const postsForSource = (source: ContentSource) =>
    unifiedPosts.filter((p) => {
      if (!adminMode && isHidden(p)) return false;
      return p.source === source;
    });

  const visibleCount = useMemo(() => {
    return unifiedPosts.filter((p) => adminMode || !isHidden(p)).length;
  }, [unifiedPosts, adminMode, hiddenWpPosts, hiddenSocial]);

  /** First paint: wait for WordPress only. YouTube/LinkedIn start after WP settles. */
  const showFullPageSpinner = visibleCount === 0 && wpLoading;
  const stillFetchingMore =
    visibleCount > 0 && ((!wpFetched && wpLoading) || ytLoading || liLoading);

  function handleToggleHide(post: UnifiedPost) {
    if (post.source === "wordpress") {
      const wpId = parseInt(post.id.replace("wp:", ""));
      toggleWpMutation.mutate(wpId);
    } else {
      toggleSocialMutation.mutate(post.id);
    }
  }

  function handleAdminToggle() {
    if (isAdmin) {
      setAdminMode(!adminMode);
    } else {
      setShowAdminLogin(true);
    }
  }

  const sourceCounts = useMemo(() => {
    const counts: Record<ContentSource, number> = { wordpress: 0, youtube: 0, linkedin: 0 };
    for (const p of unifiedPosts) {
      if (adminMode || !isHidden(p)) {
        counts[p.source]++;
      }
    }
    return counts;
  }, [unifiedPosts, adminMode, hiddenWpPosts, hiddenSocial]);

  const hiddenCount = useMemo(() => {
    return unifiedPosts.filter((p) => isHidden(p)).length;
  }, [unifiedPosts, hiddenWpPosts, hiddenSocial]);

  const sectionOrder: ContentSource[] = ["wordpress", "youtube", "linkedin"];

  function sectionLoading(source: ContentSource): boolean {
    if (source === "wordpress") return wpLoading;
    if (!wpFetched) return true;
    if (source === "youtube") return ytLoading;
    return liLoading;
  }

  const youtubeFeedFailed = wpFetched && ytError;

  function renderPostCard(post: UnifiedPost, index: number) {
    const hidden = isHidden(post);
    return (
      <motion.div
        key={post.id}
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: index * 0.04 }}
        className="relative group/card"
      >
        <div
          className={cn(
            "bg-card rounded-2xl border border-[#3a9ca5]/10 hover:border-[#3a9ca5]/40 transition-all duration-300 hover:shadow-lg hover:shadow-[#3a9ca5]/10 overflow-hidden",
            hidden && adminMode && "opacity-50 border-dashed border-red-300"
          )}
        >
          {adminMode && (
            <div className="flex items-center gap-3 px-5 pt-4 pb-0">
              <button
                type="button"
                onClick={() => handleToggleHide(post)}
                disabled={toggleWpMutation.isPending || toggleSocialMutation.isPending}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                  hidden
                    ? "bg-red-50 border-red-200 text-red-600 hover:bg-red-100"
                    : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                )}
              >
                {hidden ? (
                  <>
                    <Square className="w-3.5 h-3.5" />
                    Hidden — click to show
                  </>
                ) : (
                  <>
                    <CheckSquare className="w-3.5 h-3.5" />
                    Visible — click to hide
                  </>
                )}
              </button>
              {post.source === "linkedin" && (
                <button
                  type="button"
                  onClick={() => {
                    const liId = parseInt(post.id.replace("li:", ""));
                    if (confirm("Delete this LinkedIn post?")) deleteLinkedinMutation.mutate(liId);
                  }}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 transition-all"
                  title="Delete permanently"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              )}
            </div>
          )}

          {post.source === "youtube" ? (
            <div className="flex gap-4 p-4">
              <button
                type="button"
                onClick={() => setActiveVideoId(post.videoId || null)}
                className="group/thumb relative shrink-0 w-44 h-24 sm:w-52 sm:h-[7.25rem] rounded-xl overflow-hidden cursor-pointer"
              >
                <img
                  src={`https://img.youtube.com/vi/${post.videoId}/mqdefault.jpg`}
                  alt={post.title}
                  className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-black/20 group-hover/thumb:bg-black/30 transition-colors flex items-center justify-center">
                  <div className="w-9 h-9 rounded-full bg-red-600 flex items-center justify-center shadow-md">
                    <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                  </div>
                </div>
              </button>
              <div className="flex-grow min-w-0 py-0.5">
                <p className="text-xs text-muted-foreground mb-1.5">
                  {new Date(post.date).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
                <button
                  type="button"
                  onClick={() => setActiveVideoId(post.videoId || null)}
                  className="text-left group w-full"
                >
                  <h2 className="text-base font-semibold mb-1 text-foreground group-hover:text-[#3a9ca5] transition-colors line-clamp-2">
                    {post.title}
                  </h2>
                </button>
                {post.excerpt && (
                  <p className="text-muted-foreground text-xs line-clamp-2">{post.excerpt}</p>
                )}
                {post.url && (
                  <a
                    href={post.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:text-red-800 hover:underline mt-2"
                  >
                    Watch on YouTube <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div className="p-5">
              <p className="text-xs text-muted-foreground mb-2.5">
                {new Date(post.date).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>

              {post.source === "wordpress" ? (
                <Link href={`/post/${post.slug}`} className="group block">
                  <h2 className="text-lg font-semibold mb-1.5 text-foreground group-hover:text-[#3a9ca5] transition-colors">
                    {post.title}
                  </h2>
                  <p className="text-muted-foreground text-sm line-clamp-2 mb-2.5">{post.excerpt}</p>
                  <span className="inline-flex items-center text-[#3a9ca5] text-sm font-medium">
                    Read More <ArrowRight className="w-4 h-4 ml-1" />
                  </span>
                </Link>
              ) : (
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block"
                >
                  <h2 className="text-lg font-semibold mb-1.5 text-foreground group-hover:text-[#0077b5] transition-colors">
                    {post.title}
                  </h2>
                  {post.excerpt && (
                    <p className="text-muted-foreground text-sm line-clamp-2 mb-2.5">{post.excerpt}</p>
                  )}
                  <span className="inline-flex items-center text-[#0077b5] text-sm font-medium">
                    View on LinkedIn <ExternalLink className="w-3.5 h-3.5 ml-1" />
                  </span>
                </a>
              )}
            </div>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-grow pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold text-[#3a9ca5]">Latest Content</h1>
              <div className="w-16 h-1 rounded-full bg-gradient-to-r from-[#3a9ca5] to-[#4cb5bd] mt-2" />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleAdminToggle}
              className={cn(
                "text-xs gap-1.5",
                adminMode ? "text-[#3a9ca5]" : "text-muted-foreground/50 hover:text-muted-foreground"
              )}
            >
              <Shield className="w-3.5 h-3.5" />
              {adminMode ? "Exit Admin" : "Admin"}
            </Button>
          </div>

          {showAdminLogin && !isAdmin && (
            <div className="mb-6 bg-card rounded-xl border border-border p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Lock className="w-4 h-4" />
                  Admin Login
                </div>
                <button onClick={() => { setShowAdminLogin(false); setAdminError(""); }} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form
                onSubmit={(e) => { e.preventDefault(); adminLoginMutation.mutate(adminPassword); }}
                className="flex gap-2"
              >
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Admin password"
                  className="flex-grow px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[#3a9ca5]/30"
                />
                <Button type="submit" size="sm" className="bg-[#3a9ca5] hover:bg-[#2d8890] text-white">
                  Login
                </Button>
              </form>
              {adminError && <p className="text-red-500 text-xs mt-2">{adminError}</p>}
            </div>
          )}

          {adminMode && (
            <div className="mb-4 space-y-3">
              <div className="bg-[#3a9ca5]/5 border border-[#3a9ca5]/20 rounded-xl px-4 py-3 text-sm text-[#3a9ca5]">
                <strong>Admin mode:</strong> Tick the checkbox on any post to hide it from visitors. Untick to show it again.
                {hiddenCount > 0 && (
                  <span className="ml-1 font-medium">({hiddenCount} post{hiddenCount !== 1 ? "s" : ""} currently hidden)</span>
                )}
              </div>
              <Button
                onClick={() => setShowAddLinkedin(!showAddLinkedin)}
                variant="outline"
                size="sm"
                className="gap-1.5 border-[#0077b5]/30 text-[#0077b5]"
              >
                <Plus className="w-3.5 h-3.5" />
                Add LinkedIn Post
              </Button>
            </div>
          )}

          <AnimatePresence>
            {showAddLinkedin && adminMode && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-card rounded-xl border border-[#0077b5]/20 p-5 mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                      <Linkedin className="w-4 h-4 text-[#0077b5]" />
                      Add LinkedIn Post
                    </h3>
                    <button onClick={() => setShowAddLinkedin(false)} className="text-muted-foreground hover:text-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    Copy the title, description and URL from your LinkedIn post to add it to your blog feed.
                  </p>
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={liTitle}
                      onChange={(e) => setLiTitle(e.target.value)}
                      placeholder="Post title"
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[#0077b5]/30"
                    />
                    <textarea
                      value={liDesc}
                      onChange={(e) => setLiDesc(e.target.value)}
                      placeholder="Description / excerpt"
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[#0077b5]/30 resize-none"
                    />
                    <input
                      type="url"
                      value={liUrl}
                      onChange={(e) => setLiUrl(e.target.value)}
                      placeholder="LinkedIn post URL (e.g. https://www.linkedin.com/posts/...)"
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[#0077b5]/30"
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={() => addLinkedinMutation.mutate()}
                        disabled={!liTitle.trim() || !liUrl.trim() || addLinkedinMutation.isPending}
                        className="bg-[#0077b5] hover:bg-[#005e93] text-white"
                        size="sm"
                      >
                        {addLinkedinMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                        Add Post
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setShowAddLinkedin(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {showFullPageSpinner && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-[#3a9ca5]" />
              <p className="text-sm text-muted-foreground">Loading latest content…</p>
            </div>
          )}

          {stillFetchingMore && !showFullPageSpinner && (
            <div className="flex items-center justify-center gap-2 py-2 mb-4 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#3a9ca5]" />
              <span>Updating feed…</span>
            </div>
          )}

          {!showFullPageSpinner && visibleCount === 0 && (
            <div className="text-center py-20">
              <p className="text-muted-foreground">No posts to show.</p>
            </div>
          )}

          {!showFullPageSpinner && visibleCount > 0 && (
            <Accordion type="multiple" defaultValue={[]} className="space-y-3 w-full">
              {sectionOrder.map((source) => {
                const Icon = SOURCE_ICONS[source];
                const posts = postsForSource(source);
                const count = sourceCounts[source];
                const loading = sectionLoading(source);
                return (
                  <AccordionItem
                    key={source}
                    value={source}
                    className="border-b-0 border border-[#3a9ca5]/15 rounded-2xl bg-card px-1 sm:px-2 data-[state=open]:shadow-md data-[state=open]:shadow-[#3a9ca5]/5"
                  >
                    <AccordionTrigger className="px-3 sm:px-4 py-4 text-base font-semibold text-[#3a9ca5] hover:no-underline [&[data-state=open]]:border-b border-border/60">
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-left">
                        <span className="inline-flex items-center gap-2">
                          <Icon className="w-5 h-5 shrink-0 opacity-90" />
                          {SECTION_LABELS[source]}
                        </span>
                        <span className="text-sm font-normal text-muted-foreground tabular-nums">
                          {loading && count === 0 ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Loading…
                            </span>
                          ) : (
                            <>{count} {count === 1 ? "item" : "items"}</>
                          )}
                        </span>
                        {source === "youtube" && youtubeFeedFailed && (
                          <span className="text-xs font-medium text-amber-700">Feed unavailable</span>
                        )}
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="px-3 sm:px-4">
                      {source === "youtube" && youtubeFeedFailed && (
                        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                          <strong>YouTube feed unavailable.</strong>{" "}
                          Uses <code className="text-xs bg-amber-100/80 px-1 rounded">/api/youtube-feed</code> or{" "}
                          <code className="text-xs bg-amber-100/80 px-1 rounded">/api/social/youtube</code>. Locally run{" "}
                          <code className="text-xs bg-amber-100/80 px-1 rounded">pnpm dev</code> or{" "}
                          <code className="text-xs bg-amber-100/80 px-1 rounded">pnpm dev:api</code>. On Vercel, set the project
                          <strong className="font-semibold"> Root Directory</strong> to the repo root (not{" "}
                          <code className="text-xs bg-amber-100/80 px-1 rounded">artifacts/rhythmstix-web</code>) so{" "}
                          <code className="text-xs bg-amber-100/80 px-1 rounded">api/youtube-feed.ts</code> deploys, and remove any
                          custom rewrite that sends all <code className="text-xs bg-amber-100/80 px-1 rounded">/api/*</code> to a
                          single catch-all.
                        </div>
                      )}
                      {loading && posts.length === 0 && !youtubeFeedFailed && (
                        <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
                          <Loader2 className="w-5 h-5 animate-spin text-[#3a9ca5]" />
                          Loading…
                        </div>
                      )}
                      {!loading && posts.length === 0 && !(source === "youtube" && youtubeFeedFailed) && (
                        <p className="py-8 text-center text-sm text-muted-foreground">Nothing here yet.</p>
                      )}
                      {posts.length > 0 && (
                        <div className="grid gap-5 pt-2 pb-1">{posts.map((post, i) => renderPostCard(post, i))}</div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </div>
      </main>
      <Footer />

      {activeVideoId && (
        <YouTubeModalOverlay
          videoId={activeVideoId}
          isOpen={true}
          onClose={() => setActiveVideoId(null)}
        />
      )}
    </div>
  );
}
