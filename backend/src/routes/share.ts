import { Router } from "express";
import { findPreview, serializePreview } from "../services/share.js";
import { hasStillFile, hasVideoFile, stillFile, videoFile } from "../services/media.js";

function previewRow(reqToken: string) {
  const token = String(reqToken || "").trim();
  if (!token) return null;
  return findPreview(token);
}

export const shareRouter = Router();

shareRouter.get("/:token", (req, res) => {
  const row = previewRow(String(req.params.token));
  if (!row) {
    res.status(404).json({ error: "This preview has expired or does not exist." });
    return;
  }
  res.json(serializePreview(row));
});

shareRouter.get("/:token/file", (req, res) => {
  const row = previewRow(String(req.params.token));
  const id = row ? String(row.id) : "";
  if (!row || !hasVideoFile(id)) {
    res.status(404).json({ error: "This preview has expired or does not exist." });
    return;
  }
  res.type("video/mp4");
  res.sendFile(videoFile(id));
});

shareRouter.get("/:token/image/:sceneId", (req, res) => {
  const row = previewRow(String(req.params.token));
  const id = row ? String(row.id) : "";
  const sceneId = Number(req.params.sceneId);
  if (!row || !hasStillFile(id, sceneId)) {
    res.status(404).json({ error: "This preview has expired or does not exist." });
    return;
  }
  res.type("image/jpeg");
  res.sendFile(stillFile(id, sceneId));
});
