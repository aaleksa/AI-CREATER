# Auteur

Tell us what you want to create. We'll do the rest.

Auteur is not a Canva clone. It is a simple AI content studio: the user never chooses a model, a prompt stack, or a voice engine. They pick a format, write a sentence, and the studio runs Idea → Script → Visuals → Voice → Captions → Create.

Full specification (current build + future expansion): [docs/TZ.md](docs/TZ.md).

The first studio is **Instagram Reels, TikTok, and still Image / Posts**. A Reel is 150 credits; a still post is 37 (idea + four pictures). Ads and YouTube stay later.

## Product

| Screen | What it does |
| --- | --- |
| Landing | Promise, not a tool list |
| Sign up / Sign in | Account + 100 free credits |
| Create | “What do you want to create?” |
| Studio | Six steps, one Reel |
| Brand kit | Logo, colours, font, tone, Instagram |
| Credits | Plans, extra packs, real AI cost log |
| Library | Every project |

A finished Reel costs **150 credits** (5 + 10 + 40 + 30 + 10 + 55). A still post costs **37** (5 + 4×8).

Plans (provisional until real unit cost is measured):

- Free — £0 — 200 credits
- Creator — £9.99 — 1,000
- Pro — £24.99 — 3,500
- Business — £49.99 — 8,000

## Architecture

```
React (Vite)
    │
    ▼
Node.js API
    │
    ├── Text AI   (OpenAI if OPENAI_API_KEY is set, otherwise studio preview)
    ├── Image AI
    ├── Voice AI
    └── Video renderer (vertical preview in the studio)
    │
    ▼
SQLite  →  users, plans, credit_balances, credit_transactions,
           ai_generations, subscriptions, brand_kits, projects
```

Stripe is wired for subscriptions and credit packs. Without `STRIPE_SECRET_KEY`, checkout runs in studio mode and grants credits immediately so you can test the loop.

`ai_generations` stores `user_id`, `type`, `provider`, `model`, `actual_cost_gbp`, `credits_used`, `status` — so you can see the real cost of every AI call.

## Run locally

```bash
cd backend && cp .env.example .env && npm install && npm run dev
cd frontend && npm install && npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

Optional in `backend/.env`:

- `OPENAI_API_KEY` — live copy and (when available) DALL·E frames
- `STRIPE_SECRET_KEY` — real Checkout instead of studio grants

## Intentionally not in v1

No CapCut-level editor, no 100 models, no mobile + web + desktop at once, no template marketplace, no social scheduler, no custom model, no crypto.
