# Auteur

Tell us what you want to create. We'll do the rest.

Auteur is not a Canva clone. It is a simple AI content studio: the user never chooses a model, a prompt stack, or a voice engine. They pick a format, write what they want, and the studio finishes a Reel or a still picture.

UI: **English and Ukrainian** (EN / УК, stored in the browser). The brief stays in the language they wrote. **Light and dark theme** (☀ / ☾, follows the device until you choose) and a phone layout with a bottom tab bar.

Full specification: [docs/TZ.md](docs/TZ.md) · [TZ.md](TZ.md) (v1.77). AI cost per picture and per 400 credits: [docs/COSTS.md](docs/COSTS.md).

The first studio is **one short video** (30 seconds, Instagram or TikTok — same file) and still **Image / Posts**. A Reel is 150 credits; a still post is 13 (idea + one picture). **Video** and **Advertisement** stay as two separate Create stubs (TZ §2.3). Social post is a third stub.

## Product

| Screen | What it does |
| --- | --- |
| Landing | Promise, not a tool list. Language switch. |
| Sign up / Sign in | Account + **400** free credits. Every password field has an eye button to show / hide what you typed |
| Create | Short video or Image. For Image: kind (photo / invite / announcement / info / offer / new product / review / greeting / infographic / certificate) and **where you will post it** (Instagram or Facebook post square or portrait, Stories / Reels, Facebook wide). The brief is the main field. Under **More options**: brand on/off, words in EN or UK on designed stills, up to 3 **example pictures** sent with the request, saved briefs |
| Studio | Reel: six steps. Image: Idea → Pictures. Brief, copy brief, example pictures (add or remove). The idea is written in the interface language. Click a take to select it (used for language, word edits and download). Brand on/off is read-only here |
| Breadcrumbs | Every app page shows where you are (Create, Library, Brand kit, Credits, Account; in the Studio: where you came from › kind › project title › the step you are looking at) and **← Back**: it first closes a step being viewed, then goes back in this tab’s history, or to the previous crumb when there is none |
| Your own picture | A Create card: upload a finished picture (PNG / JPG / WebP up to 15 MB) or take one already made in another project (a copy of its selected take; the library filters by kind of picture and shows 24 at a time; a certificate is taken finished, with its words — pick whose when it has several people — so it can be reshaped or printed on A6). Free, no brief. Everything for pictures works (logo, AI edits, AI reshape, translation, takes) plus a **Size, print and certificate** block: another shape without AI with a live preview before you save it (cut around what to keep, or fit whole on blurred / white / black / own-colour bands; always from the last real picture; logo goes back to its corner), a print PDF A4 / A5 / A6 at 300 dpi (whole on white or filling the page), and **Make a certificate** from it |
| Brand kit | One page in four sections (Business, Look, Logo & photos, Contacts) with a live preview, a setup checklist and a sticky Save bar. Logo and up to 3 optional photos (place / person / product), colours, font, tone, niche, Instagram. **Your own font** (TTF / OTF, 2 MB): the preview uses it, your business name is printed in it exactly when there is no logo, and flyers get a font sample so the AI paints their words in that style (close, not letter-perfect; ≈ +$0.005–0.01 per flyer). **Nunito** and **Montserrat** ship with the app (OFL, `frontend/public/fonts`) and work the same way when picked from the list. The logo (or business name) can sit in any of the four corners; the @name line moves aside if they would overlap. In Studio, **Add logo** puts it on a picture you already made — free, no redraw, saved as a new version you can undo. A logo we placed can also be **moved** to another corner or **removed** (we keep a clean copy of the picture); the AI never gets the logo, so it never paints one. Instead it is told the logo's corner, shape and main colours (read from the file) and leaves a calm spot there in tones the logo reads well on, echoing its colours — then we place the exact file. Old takes can be deleted from the picture list one by one, or all at once with **Keep only the current picture**. Photos go into photo posts and Reels only when the scene is about them — never onto designed flyers. Your business address is printed on invitations and offers when the brief names no place, so you stop repeating it. Instagram and website end every Reel with a real call to action (“find us on Instagram…”) and can print one line on photo posts. Completeness counts colours, tone, name, niche, logo. Unsaved edits are flagged; logo and photo uploads no longer overwrite them. |
| Database (owner only) | `/app/admin`: live read-only view of every table, newest first. Visible only to emails in `ADMIN_EMAILS` (or ids in `ADMIN_USER_IDS`); password hashes and share tokens are never sent. **Import an account** adds one account exported with `backend/scripts/export-account.ts` (projects, brand kit, files) to the account with the same email, or creates it |
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

- One finished OpenAI picture per Image / Post (photo, invite, info, offer, announcement, review, greeting, infographic, new product). We do not compose a text layer. Every kind except photo and certificate is a designed page: the model paints the words on the image. **Review** keeps the client's quote word for word with their name; **Infographic** lays out 3–5 short points with only your numbers; **New product** makes the new thing the hero (an attached product photo is shown as that exact product); **Announcement** puts the headline and date biggest; **Greeting** signs off with the business name.
- Model: `OPENAI_IMAGE_MODEL` (default **gpt-image-2.5-sunburst**, same family as the OpenAI Images playground).
- **Format = where you post it.** Square 1:1 (Instagram / Facebook feed), portrait 4:5, Stories and Reels 9:16, Facebook wide 1.91:1. Default: photo square, flyers portrait 4:5. Older projects keep their shape (photo 1:1, flyer 2:3).
- **Nothing is written over your picture.** The Studio preview of a still shows only the picture. The old grey placeholder caption (“Finished picture”) is gone; captions on the preview are for Reels only.
- **Errors are written for the owner.** Users never see service names or settings (ComfyUI, OpenAI, API keys, `.env`, ffmpeg). They get a plain text that says whether to wait or reword (“We can’t make pictures right now. Try again in a few minutes.”, “We can’t make a picture from this description…”). The technical reason goes to the server log (`Image frame failed …`, `ComfyUI failed: …`, `Step … failed`). All such texts live in `backend/src/services/userErrors.ts`; each needs a Ukrainian line in `frontend/src/i18n/errors.ts`. UI hints follow the same rule: no provider names or settings.
- **No cropping.** The image model paints the exact shape: `gpt-image-2.x` takes any size (multiple of 16, up to 3:1): 1024×1024, 1024×1280, 1152×1536 (3:4), 864×1536, 1536×800. Only if `OPENAI_IMAGE_MODEL` is set by hand to an older model like `gpt-image-1` (square, 2:3, 3:2 only) do we paint the closest shape and trim it.
- **One image model, no fallback.** Pictures and word edits use only `OPENAI_IMAGE_MODEL` (default `gpt-image-2.5-sunburst`). If it fails, the owner sees an error — we never silently switch to `gpt-image-1`, which costs 3–5× more. See [docs/COSTS.md](docs/COSTS.md).
- **Change something on a finished picture** (8 credits): words, an object, the background or room for a logo — the AI changes only what you ask and keeps the rest. You can attach one small example picture (the thing to add, or the look to match).
- **Voice and captions match the script**: the voice reads exactly the scenes’ “Voiceover” text (`gpt-4o-mini-tts`, natural Ukrainian or English, `tts-1` fallback), in a voice you pick — warm, upbeat or calm female; warm, deep or even male — each with a ▶ sample. Captions are timed to the recorded voice word by word (`whisper-1`), in short lines that never cross scenes. Prices unchanged.
- **Scene headlines**: in a Reel with a voice, each scene’s “On screen” words show as a big headline at the top (same look as the captions, below the logo if it’s at the top); the captions at the bottom are what the voice says. Without a voice the on-screen words are the captions and there are no headlines. The phone preview in Studio shows the same.
- **Gift certificates (v1.77)**: a new picture kind — the AI paints only the design (no letters, calm centre), the studio prints the heading, name, gift, valid-until date and a code exactly; A5 landscape PDF (300 dpi) and PNG for each person, up to 50 from one design, free after the design.
- **Account email (v1.76)**: confirm the email with a 6-digit code typed in the studio or the link; “Forgot your password?” sends a one-hour, one-time link and signs out every device; sign-in is rate-limited; the old address hears about an email change. For letters to reach everyone, verify a domain in Resend and set `MAIL_FROM` and `APP_URL`.
- **Phone fixes (v1.75)**: no sideways scroll (Brand kit was wider than the screen), the step and its button right under the Reel preview, no iOS zoom on fields (16px), bigger tap targets, compact Home, Library buttons under the card, missing texts on Credits/Account restored, logo dragging easier with a finger.
- **Short explanations**: long hints in Studio are one short line with “More” that opens the full text in place (works on phones too).
- **Picture review fixes (v1.73)**: no doubled logo after 7 days (clean copies kept), logo actions use the right version after bringing one back, stuck runs give credits back, expired pictures say so; invitation details editable and printed exactly; the brief folds after the idea; fewer duplicates; picture words instead of Reel words; Home keeps a written brief.
- **Reel review fixes (v1.72)**: the daily clean-up no longer crashes the server on the caption-fonts folder; music is kept 90 days; a failed remake leaves the old video; every failed AI try gives its credits back; no redo buttons for switched-off steps; one “No voice”, one player, one error; honest paid/free texts; “Make the idea”, last step “Video”, voices shown by name.
- **The whole voice is heard**: fixed a cut where a longer Reel’s audio stopped around 20 s; scene times in Studio show where each scene really starts once the voice is recorded.
- **Headlines have their own settings**: a “Headlines” tab next to “Captions” — show or hide, look (clean, on a box, brand colour) and size (small, medium, large), separate from the captions. Free; a finished video updates straight away.
- **The video follows the voice**: each scene starts when the voice reaches its words and the video lasts as long as the voice, so nothing is cut and frames, headlines and captions change together.
- **Reel settings from the first step**: one card — voice (pick with ▶ samples, or no voice), captions (on/off, look), headlines, logo, music — shows from the very start under the step button, open until the video is made. Everything is applied when the video is made and can be changed later, free.
- **Turn the voice off on a finished Reel**: the Voice tab of the sound card has “Turn the voice off” — the video is remade without it, free and without AI; the on-screen words become the captions. The recording is kept (7 days), so “Bring the voice back · free” restores it with its captions.
- **Reels without a voice**: on the Voice step choose “No voice” — captions become the scenes’ on-screen words (free), the video gets a quiet audio track. “Add a voice” brings it back. Captions are optional the same way (“No captions”). The script (on-screen words, voiceover, call to action) and the captions (text and timing) can be edited by hand, free. “All in English” / “All in Ukrainian” translates the whole script into one language (names stay), free. Logo on a Reel is one layer over the whole video (same spot, soft light or dark plate so it reads on any photo) plus a 2.5-second end card with the big logo and the call to action; corner, size, the plate and the end card are set in Studio, and a finished video is re-made free. New Reel frames are painted with a calm patch exactly where the logo will sit on the 9:16 video. Captions are styled like Reels — clean (Montserrat ExtraBold with a soft shadow), on a band, or in the brand colour and font — placed above Instagram’s buttons; changing the look re-makes a finished video free. Redoing one frame (8 credits), editing caption words or removing captions re-makes a finished video free, too. Each script scene has an optional “What I want to see in the frame” — the owner’s own words, which win over the AI’s frame description when the frame is made or redone. A failed “Make the video” gives its credits back (no AI is involved); bringing back a script version with the same scenes keeps the frames; a free update never deletes a finished video. Going back a step keeps what still fits: the video is paid once per Reel and re-made free whenever its parts are there, voice recordings are kept by their words (going back to recorded words brings the voice and its captions back free), and “Finish the Reel” runs the missing steps in one go. Versions form a hidden tree: every script remembers its idea and every set of frames its script, so picking another idea brings back its script, frames and voice; “As a new Reel” starts a separate Reel from any idea or script version. The voice reads exactly the script’s words with gpt-4o-mini-tts in one of six voices (each with a sample to listen to), and captions are timed by the recorded voice itself (whisper-1 word timings). Optional music: upload your own track (MP3/M4A/WAV/OGG, up to 20 MB), set the volume and the start second; it loops, fades out and dips under the voice. On a finished video only the sound is remixed, free. The logo on Reel frames sits inside the part the 9:16 video keeps, clear of Instagram's bars.
- **Compact Reel screen in Studio**: steps on top, the brief folds into one line, a phone-sized preview with the scenes beside it, and a step panel with one main button plus two folded cards — “Sound and captions” and “Redo a step”. Looking back at a step opens it wide: the script as tidy rows (time, on-screen words, voiceover, call to action), edit and translate in one toolbar, older versions in a folded compact list.
- **Step breadcrumbs in Studio**: click a finished step (Idea, Script, Frames, Voice, Captions) to look back at what came out and bring back another version — free; one click returns to the current step.
- **Place the logo by hand** (free): drag it on the picture, resize it by its corner or a slider, save — it goes exactly there and stays there through AI edits.
- **Another shape for a finished picture** (8 credits): the AI lays the same picture out again for the new shape — it paints the new edges and moves the words, nothing is cut off. The old take stays in the list.
- **Download names say what the file is**: type, topic, language of the words and shape — e.g. `invitation_free-yoga-classes_UA_story-9x16.jpg` (in the interface language).
- **Example pictures.** Up to 3 per brief, independent of the Brand Kit. Any picture the browser opens works (big phone photos, WebP, HEIC in Safari): it is shrunk and turned into a JPG under 2 MB before upload — the server still only takes PNG / JPG up to 2 MB. Brand Kit photos work the same way; the logo stays PNG to keep transparency. They go to `images.edit` with the request: take subject, style and mood, never copy letters or logos. Word edits and Same-picture do not resend them.
- The idea text follows the interface language (UK or EN), whatever language the brief is in.
- **Check the shot before you pay for the picture.** The idea now ends with “We’ll shoot this”: one sentence plus what is in the frame, where, camera, people, light and the words on the picture. **Yes, shoot this · 8 credits** approves it and makes the picture in one click. **Change the shot · free** opens every field; **Save the shot** keeps exactly what you typed — no AI call, no credits. AI only gets your corrected shot when you press **Yes, shoot this**. A photo gets painted words only when the brief clearly asks for them or you type them yourself. Pictures will not start until the shot is approved, and the picture prompt is built from that approved shot, with the brief as facts — so fewer paid retakes of the same picture.
- On Create, choose whether painted words follow the brief, or are English / Ukrainian. After the picture, **Same picture in EN/UK** is 8 credits: we read the words already painted on the selected take, translate them line by line (your brief is the glossary; dates and times too; no line is dropped). Your business name, logo, logo slogan, DJ names, websites, @handles and postcodes stay exactly as written, and ordinary words are translated naturally, not word for word and return the picture on screen in that language. You can also **edit the words** on that picture (add or remove a line) for 8 credits.
- If **Use brand kit** is on (chosen on Create only), the picture prompt gets name, colours, font, tone, niche. Owner photos are sent to the model for photo posts and Reels, not for invite / info / offer flyers. Logo is optional — no nag in Studio.
- Previous takes stay in the project; restore is free. The list of picture takes folds away (**Picture takes (n)**, “Selected: Take N”); it stays open until you close it, and the browser remembers. Gift certificates fold the same way: only the one you are working on shows its fields, the rest are one line (name · gift · code) with a PDF button, plus Fold all / Unfold all. Certificates also pick a **font** for the big words (brand font, Montserrat, Classic — Playfair Display, Elegant — Cormorant Garamond, Script — Great Vibes; all OFL with Cyrillic, in `frontend/public/fonts`) and two **colours** (heading and gift, other text: Auto, 8 ready ones or your own); light words get a dark wash. Dates, code and contacts stay in Montserrat. The certificate preview is smaller, with a short how-to above it; the frame around the words shows on hover and only moves after a click on it (click outside or Esc locks it), so a stray drag changes nothing. The whole **Position, font and colour of the words** section folds to one line (for example “Classic · size 100%”), and the browser remembers. **↶ Back to the previous** steps back through font and colour changes (up to 20, while the page is open). **Logo** on a certificate: from the brand kit (also on a certificate made without the brand look), **your own file** for this certificate only (PNG / JPG / WebP up to 2 MB — works without the brand kit too) or none; it is printed above the heading and moves with the words — or click it on the preview and drag it anywhere on its own, resize it by the corner (the words stay put), and **Logo back above the heading** returns it. Place, size, font, colours and logo are saved **for the selected picture take only** — each design keeps its own look; the words and the list of people are shared. The certificate design prompt takes only colours, mood and trade from the brand and tells the AI not to paint the business name or a logo and to keep the centre (with its top, where the logo goes) empty.
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

Stripe Checkout exists, but **without `STRIPE_SECRET_KEY` it is closed** (Choose/Buy hidden, `POST /billing/checkout` returns 403). Closed beta stays on Free 400; we add credits by hand. **When real mail is set up, the 400 arrive only after the owner confirms their email** (link in a letter, valid 48 h; “Send again” banner in the app). “Set up” means `RESEND_API_KEY` plus a `MAIL_FROM` on your own verified domain — Resend’s test sender `onboarding@resend.dev` only reaches you, so with it (or with no key) sign-up works as before: 400 credits at once. `EMAIL_VERIFICATION=on|off` overrides this (`on` without a key prints the link in the API log). Until they confirm they can look around and write briefs, but every generation step answers 403 `email_unverified` — one person can’t farm credits with many accounts. Accounts made before this count as confirmed. There is no studio grant that changes the plan.

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
- `RESEND_API_KEY`, `MAIL_FROM` — send the “confirm your email” letter through [Resend](https://resend.com) (`MAIL_FROM` must use a domain verified there). Confirmation turns on by itself once both are set; see `EMAIL_VERIFICATION` in `.env.example`

Do not commit `.env`. Do not spend OpenAI credits unless you mean to.

## Icon

Browser tab icon: a serif **A** in cream with a copper crossbar on the dark brand background (`frontend/public/favicon.svg`, plus PNG sizes for iOS and a `.ico`). Same palette as the app.

## ComfyUI (optional, local only)

If you run [ComfyUI](https://github.com/comfyanonymous/ComfyUI) on your own machine, photos and Reel frames can be painted by it instead of OpenAI. Nothing changes for other users: it is off unless `COMFYUI_URL` is set, so a hosted server (Railway) keeps using OpenAI. **`COMFYUI_URL` set → ComfyUI paints; not set → OpenAI.**

1. Start ComfyUI (default `http://127.0.0.1:8188`) and note the checkpoint file name.
2. In `backend/.env` set `COMFYUI_URL=http://127.0.0.1:8188` and `COMFYUI_CHECKPOINT=<file name>`. Restart the API.
3. The default graph is `backend/comfy/workflow.example.json` (text → picture). To use your own, export it with **Save (API Format)**, put `{{prompt}}`, `{{negative}}`, `{{checkpoint}}`, `{{width}}`, `{{height}}`, `{{seed}}` where they belong, save it as `backend/comfy/workflow.json` (or point `COMFYUI_WORKFLOW` at it).

Rules: only plain text-to-picture goes to ComfyUI. Designed flyers with words, pictures that use your example or brand photos, and “change the words” edits stay on OpenAI. If ComfyUI is closed, slow (5 min limit; the job is then cancelled) or errors, the owner sees “We can’t make pictures right now…” (the ComfyUI reason is in the server log) and nothing is sent to OpenAI (so tests never cost money by surprise). Set `COMFYUI_FALLBACK=openai` if you prefer OpenAI to take over. Credits are the same either way. The sizes follow the post format; set `COMFYUI_MAX_SIDE` (768 is about twice as fast as 1024) and `COMFYUI_STEPS` / `COMFYUI_CFG` to trade quality for speed. Add `{{steps}}` and `{{cfg}}` to a custom workflow to use them.

## Deploy (one server, e.g. Railway)

The API also serves the built web app, so there is one URL. From the repo root: `npm run build` (installs both parts and builds `frontend/dist`), then `npm start`. Needs Node 22.13+.

A root `Dockerfile` is included (Node 22, DejaVu font, builds the web app, sets `DATA_DIR=/data`), so Railway builds with Docker instead of auto-detection. Mount a Volume at `/data`.

Set in the host:

- `JWT_SECRET` — required in production, the server refuses to start with the default
- `OPENAI_API_KEY`, `APP_URL` (your public URL)
- `ADMIN_EMAILS` — your email (comma-separated for more). Turns on the read-only Database page at `/app/admin`; unset means nobody can open it. It only works once that address is confirmed, so nobody can claim it by signing up with it. Stricter option: `ADMIN_USER_IDS` (account ids; open `/app/account?id` on the server to see yours)
- `DATA_DIR` — path of a **persistent volume** (for example `/data`). The SQLite file and every upload and generated picture live there; without a volume they are wiped on each deploy

**Moving your account from a local database.** In `backend`: `npx tsx scripts/export-account.ts you@example.com` saves one `.tar.gz` to Downloads (projects, versions, brand kit, files; no credits or plan). Sign up on the server with the same email, confirm it, add it to `ADMIN_EMAILS`, then open `/app/admin` → **Import an account** and pick the file. It is uploaded in 20 MB parts and unpacked as it arrives, so the volume needs free space only for the files themselves (about the size of the projects' media), not for the archive too; other accounts on the server are not touched, and importing again replaces the same projects.
- the contact line on photos needs a system font (DejaVu is installed by the `Dockerfile`); check it after the first deploy

## Intentionally not in v1

No CapCut-level editor, no 100 models, no mobile + web + desktop at once, no template marketplace, no social scheduler, no custom model, no crypto.

After closed beta, if still storyboards are not publishable: **Kling** image-to-video on the existing scene stills (5–8 s clip per scene, same Create, owner never picks a vendor). See TZ §12.1. Not a kids-cartoon stack.
