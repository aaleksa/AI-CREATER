import { Router } from "express";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { v4 as uuid } from "uuid";

function hex(value: unknown, fallback: string) {
  const text = String(value || "");
  return /^#[0-9A-Fa-f]{6}$/.test(text) ? text : fallback;
}

export const brandRouter = Router();
brandRouter.use(requireAuth);

brandRouter.get("/", (req, res) => {
  const kit = db.prepare("SELECT * FROM brand_kits WHERE user_id = ?").get(req.user!.id);
  res.json({ brandKit: kit ?? null });
});

brandRouter.put("/", (req, res) => {
  const body = req.body ?? {};
  const fields = {
    business_name: String(body.business_name ?? ""),
    logo_url: String(body.logo_url ?? ""),
    primary_color: hex(body.primary_color, "#C45C26"),
    secondary_color: hex(body.secondary_color, "#F4EFE8"),
    font: String(body.font ?? "Fraunces"),
    tone_of_voice: String(body.tone_of_voice ?? ""),
    website: String(body.website ?? ""),
    instagram: String(body.instagram ?? ""),
    vertical: ["salon", "cafe", "fitness"].includes(String(body.vertical)) ? String(body.vertical) : "",
  };
  const existing = db.prepare("SELECT id FROM brand_kits WHERE user_id = ?").get(req.user!.id) as { id: string } | undefined;
  if (existing) {
    db.prepare(
      `UPDATE brand_kits SET
        business_name=@business_name, logo_url=@logo_url, primary_color=@primary_color,
        secondary_color=@secondary_color, font=@font, tone_of_voice=@tone_of_voice,
        website=@website, instagram=@instagram, vertical=@vertical, updated_at=datetime('now')
       WHERE user_id=@user_id`
    ).run({ ...fields, user_id: req.user!.id });
  } else {
    db.prepare(
      `INSERT INTO brand_kits (id, user_id, business_name, logo_url, primary_color, secondary_color, font, tone_of_voice, website, instagram, vertical)
       VALUES (@id, @user_id, @business_name, @logo_url, @primary_color, @secondary_color, @font, @tone_of_voice, @website, @instagram, @vertical)`
    ).run({ id: uuid(), user_id: req.user!.id, ...fields });
  }
  const kit = db.prepare("SELECT * FROM brand_kits WHERE user_id = ?").get(req.user!.id);
  res.json({ brandKit: kit });
});
