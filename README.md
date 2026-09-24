# Auteur

Tell us what you want to create. We'll do the rest.

Auteur is not a Canva clone. It is a simple AI content studio: the user never chooses a model, a prompt stack, or a voice engine. They pick a format, write what they want, and the studio finishes a Reel or a still picture.

UI: **English and Ukrainian** (EN / УК, stored in the browser). The brief stays in the language they wrote.

Full specification: [docs/TZ.md](docs/TZ.md) · [TZ.md](TZ.md) (v1.27).

The first studio is **one short video** (30 seconds, Instagram or TikTok — same file) and still **Image / Posts**. A Reel is 150 credits; a still post is 13 (idea + one picture). **Video** and **Advertisement** stay as two separate Create stubs (TZ §2.3). Social post is a third stub.

## Product

| Screen | What it does |
| --- | --- |
| Landing | Promise, not a tool list. Language switch. |
| Sign up / Sign in | Account + **400** free credits |
| Create | Short video or Image, optional photo / invite / info / offer, brand on/off, saved briefs to insert |
| Studio | Reel: six steps. Image: Idea → Pictures. Brief, copy brief, brand chips |
| Brand kit | Logo and up to 3 optional photos (place / person / product), colours, font, tone, niche, Instagram. Photos go into the picture prompt when brand is on. |
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
- Invite / info / offer: portrait **1024×1536**, shown 2:3 without cropping the footer.
- If **Use brand kit** is on, the picture prompt gets name, colours, font, tone, niche. Logo is optional — no nag in Studio.
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

## Intentionally not in v1

No CapCut-level editor, no 100 models, no mobile + web + desktop at once, no template marketplace, no social scheduler, no custom model, no crypto.

After closed beta, if still storyboards are not publishable: **Kling** image-to-video on the existing scene stills (5–8 s clip per scene, same Create, owner never picks a vendor). See TZ §12.1. Not a kids-cartoon stack.
