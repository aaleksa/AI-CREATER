import type { Request, Response, NextFunction } from "express";

const hits = new Map<string, number[]>();

export function rateLimit(max: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.user?.id || req.ip || "anon";
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      res.status(429).json({ error: "Too many generation requests. Wait a moment, then try again." });
      return;
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}
