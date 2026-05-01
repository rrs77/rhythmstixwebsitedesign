import { Router, type Request, type Response } from "express";
import { fetchYoutubeFeedForApi } from "../lib/youtube-rss-feed";

const router = Router();

/** Same videos as the old WordPress “channel feed” — public RSS, merged on /blog */
router.get("/youtube-feed", async (_req: Request, res: Response) => {
  const result = await fetchYoutubeFeedForApi();
  if (result.ok) {
    res.json(result.videos);
    return;
  }
  res.status(result.status).json({ error: result.error });
});

export default router;
