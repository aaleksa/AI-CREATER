import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { db } from "./db/index.js";
import { authRouter } from "./routes/auth.js";
import { projectsRouter } from "./routes/projects.js";
import { brandRouter } from "./routes/brand.js";
import { billingRouter } from "./routes/billing.js";
import { adminRouter } from "./routes/admin.js";
import { runMaintenance } from "./services/jobs.js";
import { shareRouter } from "./routes/share.js";
import { findPreview, serializePreview } from "./services/share.js";

const app = express();
// Behind one host proxy (Railway): per-IP limits such as signup must see the visitor, not the proxy.
app.set("trust proxy", 1);
app.use(
  cors({
    origin: [config.appUrl, "http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: true,
  })
);
app.use(express.json({ limit: "4mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, product: "auteur" });
});

app.use("/auth", authRouter);
app.get("/projects/:id/preview", (req, res) => {
  const token = String(req.query.token || "");
  const row = findPreview(token);
  if (!row || String(row.id) !== String(req.params.id)) {
    res.status(404).json({ error: "This preview has expired or does not exist." });
    return;
  }
  res.json(serializePreview(row));
});
app.use("/share", shareRouter);
app.use("/projects", projectsRouter);
app.use("/brand", brandRouter);
app.use("/billing", billingRouter);
app.use("/admin", adminRouter);

// In production one server serves the API and the built web app (frontend/dist), so there is one URL.
const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../frontend/dist");
if (fs.existsSync(path.join(webDir, "index.html"))) {
  app.use(express.static(webDir, { index: false, maxAge: "1h" }));
  app.get("*", (req, res, next) => {
    if (!req.accepts("html")) {
      next();
      return;
    }
    res.sendFile(path.join(webDir, "index.html"));
  });
}

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong in the studio." });
});

db.exec("SELECT 1");
runMaintenance();
setInterval(runMaintenance, 6 * 60 * 60 * 1000).unref();

app.listen(config.port, () => {
  console.log(`Auteur API on http://localhost:${config.port}`);
});
