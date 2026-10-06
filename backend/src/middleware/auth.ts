import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { db } from "../db/index.js";

export type AuthUser = { id: string; email: string; name: string; tv?: number };

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** `tokenVersion` goes up on password change and "sign out everywhere": older tokens stop working. */
export function signToken(user: { id: string; email: string; name: string }, tokenVersion = 0) {
  return jwt.sign({ id: user.id, email: user.email, name: user.name, tv: tokenVersion }, config.jwtSecret, {
    expiresIn: "14d",
  });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as AuthUser;
    const row = db.prepare("SELECT token_version FROM users WHERE id = ?").get(decoded.id) as
      | { token_version: number }
      | undefined;
    if (!row || Number(row.token_version) !== Number(decoded.tv ?? 0)) {
      res.status(401).json({ error: "Session expired. Please sign in again." });
      return;
    }
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Session expired. Please sign in again." });
  }
}
