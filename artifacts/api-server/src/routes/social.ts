import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { linkedinPostsTable, siteContentTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAdmin } from "./auth";
import { fetchYoutubeFeedForApi } from "../lib/youtube-rss-feed";

const router = Router();

/** @deprecated Prefer GET /api/youtube-feed (works without DB on Vercel). */
router.get("/social/youtube", async (_req: Request, res: Response) => {
  const result = await fetchYoutubeFeedForApi();
  if (result.ok) {
    res.json(result.videos);
    return;
  }
  res.status(result.status).json({ error: result.error });
});

router.get("/social/linkedin", async (_req: Request, res: Response) => {
  const posts = await db.select().from(linkedinPostsTable).orderBy(desc(linkedinPostsTable.date));
  const mapped = posts.map((p) => ({
    id: `li:${p.id}`,
    source: "linkedin" as const,
    title: p.title,
    description: p.description,
    url: p.url,
    date: p.date.toISOString(),
  }));
  res.json(mapped);
});

router.post("/social/linkedin", requireAdmin, async (req: Request, res: Response) => {
  const { title, description, url, date } = req.body;
  if (!title || !url) {
    res.status(400).json({ error: "title and url are required" });
    return;
  }
  const [post] = await db.insert(linkedinPostsTable).values({
    title,
    description: description || "",
    url,
    date: date ? new Date(date) : new Date(),
  }).returning();
  res.json(post);
});

router.delete("/social/linkedin/:id", requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  await db.delete(linkedinPostsTable).where(eq(linkedinPostsTable.id, id));
  res.json({ success: true });
});

router.get("/social/hidden", async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(siteContentTable).where(eq(siteContentTable.key, "hidden_social_posts"));
    const hidden: string[] = rows.length > 0 ? JSON.parse(rows[0].value) : [];
    res.json(hidden);
  } catch {
    res.json([]);
  }
});

router.put("/social/hidden", requireAdmin, async (req: Request, res: Response) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) {
    res.status(400).json({ error: "ids must be an array of strings" });
    return;
  }
  const value = JSON.stringify(ids);
  const existing = await db.select().from(siteContentTable).where(eq(siteContentTable.key, "hidden_social_posts"));
  if (existing.length > 0) {
    await db.update(siteContentTable).set({ value, updatedAt: new Date() }).where(eq(siteContentTable.key, "hidden_social_posts"));
  } else {
    await db.insert(siteContentTable).values({ key: "hidden_social_posts", value });
  }
  res.json({ success: true });
});

export default router;
