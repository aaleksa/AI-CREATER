# Auteur

Tell us what you want to create. We'll do the rest.

Auteur is not a Canva clone. It is a simple AI content studio: the user never chooses a model, a prompt stack, or a voice engine. They pick a format, write what they want, and the studio finishes a Reel or a still picture.

UI: **English and Ukrainian** (EN / УК, stored in the browser). The brief stays in the language they wrote. **Light and dark theme** (☀ / ☾, follows the device until you choose) and a phone layout with a bottom tab bar.

Full specification: [docs/TZ.md](docs/TZ.md) · [TZ.md](TZ.md) (v1.39).

The first studio is **one short video** (30 seconds, Instagram or TikTok — same file) and still **Image / Posts**. A Reel is 150 credits; a still post is 13 (idea + one picture). **Video** and **Advertisement** stay as two separate Create stubs (TZ §2.3). Social post is a third stub.

## Product

| Screen | What it does |
| --- | --- |
| Landing | Promise, not a tool list. Language switch. |
| Sign up / Sign in | Account + **400** free credits |
| Create | Short video or Image. For Image: kind (photo / invite / info / offer) and **where you will post it** (Instagram or Facebook post square or portrait, Stories / Reels, Facebook wide). The brief is the main field. Under **More options**: brand on/off, words in EN or UK on designed stills, up to 3 **example pictures** sent with the request, saved briefs |
| Studio | Reel: six steps. Image: Idea → Pictures. Brief, copy brief, example pictures (add or remove). The idea is written in the interface language. Click a take to select it (used for language, word edits and download). Brand on/off is read-only here |
| Brand kit | One page in four sections (Business, Look, Logo & photos, Contacts) with a live preview, a setup checklist and a sticky Save bar. Logo and up to 3 optional photos (place / person / product), colours, font, tone, niche, Instagram. Photos go into photo posts and Reels only when the scene is about them — never onto designed flyers. Your business address is printed on invitations and offers when the brief names no place, so you stop repeating it. Instagram and website end every Reel with a real call to action (“find us on Instagram…”) and can print one line on photo posts. Completeness counts colours, tone, name, niche, logo. Unsaved edits are flagged; logo and photo uploads no longer overwrite them. |
| Account | Name, email (needs password), change password, **download my data** (JSON), sign out on all devices, delete account (needs password) |
| Credits | Plans (current one highlighted), pack prices. Checkout hidden until Stripe. AI cost log hidden |
| Library | Every project — open, copy the brief, or **delete** |

A finished Reel costs **150 credits** (5 + 10 + 40 + 30 + 10 + 55). A still post costs **13** (5 + 8). Delete does not refund credits.

Plans (provisional until real unit cost is measured):

- Free — £0 — 400 credits
- Creator — £9.99 — 1,000
- Pro — £24.99 — 3,500
- Business — £49.99 — 8,000

## Image / Post (now)

- One finished OpenAI picture per Image / Post (photo, invite, info, offer). We do not compose a text layer. Invite / info / offer: the model paints the words on the image.
- Model: `OPENAI_IMAGE_MODEL` (default **gpt-image-2.5-sunburst**, same family as the OpenAI Images playground).
- **Format = where you post it.** Square 1:1 (Instagram / Facebook feed), portrait 4:5, Stories and Reels 9:16, Facebook wide 1.91:1. Default: photo square, flyers portrait 4:5. Older projects keep their shape (photo 1:1, flyer 2:3).
- **No cropping.** The image model paints the exact shape: `gpt-image-2.x` takes any size (multiple of 16, up to 3:1): 1024×1024, 1024×1280, 864×1536, 1536×800. Only if an account falls back to `gpt-image-1` / `dall-e-3` (square, 2:3, 3:2 only) do we paint the closest shape and trim it.
- **Example pictures.** Up to 3 per brief (PNG / JPG, 2 MB), independent of the Brand Kit. They go to `images.edit` with the request: take subject, style and mood, never copy letters or logos. Word edits and Same-picture do not resend them.
- The idea text follows the interface language (UK or EN), whatever language the brief is in.
- On Create, choose whether painted words follow the brief, or are English / Ukrainian. After the picture, **Same picture in EN/UK** is 8 credits: we read the words already painted on the selected take, translate them line by line (your brief is the glossary; names, dates and addresses too; no line is dropped) and return the picture on screen in that language. You can also **edit the words** on that picture (add or remove a line) for 8 credits.
- If **Use brand kit** is on (chosen on Create only), the picture prompt gets name, colours, font, tone, niche. Owner photos are sent to the model for photo posts and Reels, not for invite / info / offer flyers. Logo is optional — no nag in Studio.
- Previous takes stay in the project; restore is free.
- *Share a preview* and *Would you publish this post?* are **hidden** until the closed beta needs them.

## Architecture

```
React (Vite)
    │
    ▼
Node.js API
    │
    ├── Text    gpt-4o-mini
    ├── Image   gpt-image-2.5-sunburst (env)
    ├── Voice   OpenAI tts-1 (or macOS say in dev)
    └── Render  ffmpeg 1080×1920
    │
    ▼
SQLite  →  users, plans, credit_balances, credit_transactions,
           ai_generations, subscriptions, brand_kits, projects
```

Stripe Checkout exists, but **without `STRIPE_SECRET_KEY` it is closed** (Choose/Buy hidden, `POST /billing/checkout` returns 403). Closed beta stays on Free 400; we add credits by hand. There is no studio grant that changes the plan.

`ai_generations` still stores every AI call. The Credits screen does **not** list it (`SHOW_AI_COST_LOG=false`).

## Run locally

```bash
cd backend && cp .env.example .env && npm install && npm run dev
cd frontend && npm install && npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

Optional in `backend/.env`:

- `OPENAI_API_KEY` — live copy, **required for Pictures / Reel frames**, and TTS
- `OPENAI_IMAGE_MODEL` — playground model id (`gpt-image-2.5-sunburst` or `gpt-image-2.5-flare`)
- `STRIPE_SECRET_KEY` — opens Checkout; without it, buy buttons stay hidden

Do not commit `.env`. Do not spend OpenAI credits unless you mean to.

## Deploy (one server, e.g. Railway)

The API also serves the built web app, so there is one URL. From the repo root: `npm run build` (installs both parts and builds `frontend/dist`), then `npm start`. Needs Node 22.13+.

A root `Dockerfile` is included (Node 22, DejaVu font, builds the web app, sets `DATA_DIR=/data`), so Railway builds with Docker instead of auto-detection. Mount a Volume at `/data`.

Set in the host:

- `JWT_SECRET` — required in production, the server refuses to start with the default
- `OPENAI_API_KEY`, `APP_URL` (your public URL)
- `DATA_DIR` — path of a **persistent volume** (for example `/data`). The SQLite file and every upload and generated picture live there; without a volume they are wiped on each deploy
- the contact line on photos needs a system font (DejaVu is installed by the `Dockerfile`); check it after the first deploy

## Intentionally not in v1

No CapCut-level editor, no 100 models, no mobile + web + desktop at once, no template marketplace, no social scheduler, no custom model, no crypto.

After closed beta, if still storyboards are not publishable: **Kling** image-to-video on the existing scene stills (5–8 s clip per scene, same Create, owner never picks a vendor). See TZ §12.1. Not a kids-cartoon stack.
