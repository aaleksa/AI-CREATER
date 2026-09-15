# Технічне завдання: Auteur

**Продукт:** AI Content Creator  
**Репозиторій:** [github.com/aaleksa/AI-CREATER](https://github.com/aaleksa/AI-CREATER)  
**Версія документа:** 1.0 (на основі MVP у коді + початкового продуктового бачення)  
**Мова інтерфейсу першої версії:** English  
**Валюта:** GBP (£)

---

## 1. Суть продукту

Auteur — не копія Canva і не відеоредактор рівня CapCut.

Це проста студія, у якій людина **не повинна знати, як працюють 5–6 різних AI-сервісів**. Вона не вибирає модель, prompt, resolution чи voice engine.

Головна обіцянка:

> Tell us what you want to create. We’ll do the rest.

Користувач каже:

> «Мені потрібна реклама мого салону краси для Instagram»

Система сама вирішує: який AI, яка картинка, який голос, який формат, які субтитри, який стиль бренду.

### 1.1 Для кого

- власник малого бізнесу (кав’ярня, салон, студія), якому потрібен Reel / TikTok без оператора;
- сольний креатор, якому лінь збирати пайплайн з ChatGPT + Midjourney + ElevenLabs + CapCut;
- агентство на старті, якому треба багато однотипного вертикального контенту в одному бренді.

### 1.2 Що вважається успіхом MVP

Користувач заходить → обирає Instagram Reel або TikTok → пише одне речення → проходить 6 кроків → отримує готове 30-секундне вертикальне відео (або його студійний прев’ю) → credits списані → у логах є собівартість кожного AI-виклику.

Якщо цим реально користуються — далі додаються пости, реклама, YouTube, презентації, бізнес-контент.

---

## 2. Scope

### 2.1 У першій версії (зроблено / обов’язково)

| Блок | Статус у коді | Вимога |
| --- | --- | --- |
| Лендінг з обіцянкою, не зі списком моделей | зроблено | `/` |
| Реєстрація / вхід, JWT | зроблено | 200 free credits |
| Головний екран «What do you want to create?» | зроблено | 6 форматів |
| Instagram Reel + TikTok, повний пайплайн | зроблено | 6 кроків |
| Brand Kit | зроблено | впливає на AI-контекст |
| Credits, плани, докупівля | зроблено | Stripe або studio mode |
| Library проєктів | зроблено | повернення в студію |
| Лог `ai_generations` (собівартість) | зроблено | provider, model, cost, credits |

### 2.2 Свідомо не робимо в v1

- власний відеоредактор рівня CapCut;
- 100 AI-моделей на вибір користувача;
- мобільний + web + desktop одночасно (тільки web);
- складна система шаблонів / маркетплейс;
- шедулер у соцмережі;
- власна AI-модель;
- blockchain / crypto / токен;
- Canva-подібний canvas, шари, drag-and-drop;
- командні акаунти, ролі, SSO (пізніше для Business).

### 2.3 Формати на головному екрані

| ID | Назва | MVP |
| --- | --- | --- |
| `video` | Video | екран є, створення заблоковане |
| `instagram_reel` | Instagram Reel | повний пайплайн |
| `tiktok` | TikTok | повний пайплайн |
| `image_post` | Image / Post | «Coming after Reels» |
| `advertisement` | Advertisement | «Coming after Reels» |
| `social_post` | Social media post | «Coming after Reels» |

Повідомлення, якщо формат ще не готовий:

> This format is next. The first studio is Reels and TikTok — 30 seconds, vertical, done for you.

---

## 3. Користувацькі сценарії

### 3.1 Щасливий шлях (Reel)

1. Користувач відкриває лендінг, тисне **Start creating**.
2. Реєструється (ім’я, email, пароль ≥ 6 символів) → отримує **200 credits**, план Free, порожній Brand Kit.
3. Бачить «What do you want to create?», обирає **Instagram Reel**.
4. Пише, наприклад:  
   `Create a 30-second Reel about the best places to visit in London.`
5. Відкривається студія. Кроки:
   1. **Idea** (5 cr) — концепція, хук, візуальний напрям;
   2. **Script** (10 cr) — 30 с, 4–6 сцен, voiceover;
   3. **Visuals** (40 cr) — кадр на кожну сцену (9:16);
   4. **Voice** (30 cr) — кастинг голосу під тон бренду;
   5. **Captions** (10 cr) — таймкоди субтитрів;
   6. **Create** (55 cr) — фіксація Reel, статус `ready`.
6. Разом **150 credits**. Баланс: 200 → 50.
7. Проєкт з’являється в Library. Можна повернутися, кроки не тарифікуються повторно.

### 3.2 Brand Kit

Користувач один раз задає бренд. Далі промпт «Create a Reel promoting my coffee shop» вже має кольори, шрифт, тон, Instagram.

### 3.3 Недостатньо credits

Якщо на кроці не вистачає балансу — 402, текст *Not enough credits. Buy a pack or upgrade your plan.* і посилання на `/app/billing`.

### 3.4 Покупка

- підписка Creator / Pro / Business нараховує місячний пакет;
- Buy credits — разові пакети 200 / 600 / 1 500;
- без Stripe-ключа — studio mode (нарахування одразу, для тесту).

---

## 4. Екрани (15)

Усі приватні екрани — у спільному layout: логотип **Auteur**, навігація Create / Library / Brand kit / Credits, баланс, план, Sign out.

| # | Екран | URL | Доступ |
| --- | --- | --- | --- |
| 1 | Landing | `/` | публічний |
| 2 | Sign up | `/signup` | публічний |
| 3 | Sign in | `/login` | публічний |
| 4 | Create (формати + промпт) | `/app` | JWT |
| 5 | Studio — Idea | `/app/studio/:id` | JWT |
| 6 | Studio — Script | той самий | JWT |
| 7 | Studio — Visuals | той самий | JWT |
| 8 | Studio — Voice | той самий | JWT |
| 9 | Studio — Captions | той самий | JWT |
| 10 | Studio — Create / готовий Reel | той самий | JWT |
| 11 | Brand Kit | `/app/brand` | JWT |
| 12 | Credits / плани | `/app/billing` | JWT |
| 13 | Buy credits | блок на billing | JWT |
| 14 | Собівартість AI-запитів | блок на billing | JWT |
| 15 | Library | `/app/library` | JWT |

Кроки 5–10 — один маршрут студії з прогрес-баром, не окремі URL. Так простіше для MVP і менше втрати стану.

### 4.1 Вимоги до екранів

**Landing.** Заголовок-обіцянка, CTA «Create a Reel», без списку моделей.

**Auth.** Ім’я (тільки signup), email, пароль. Помилки зрозумілою мовою (дубль email, невірний пароль, API offline).

**Create.** Сітка 6 форматів. Reel/TikTok — активні. Інші — visually «soon», клік не стартує пайплайн. Промпт — одне речення, мінімум 8 символів. Підказка вартості: 150 credits, Free = 200.

**Studio.** Вертикальний прев’ю 9:16 ліворуч. Панель поточного кроку праворуч. Кнопка `Make {step} · N credits`. Після кроку оновлюється баланс у сайдбарі. Готовий проєкт: «Your Reel is ready. N credits used.»

**Brand Kit.** Поля: business name, logo URL, primary/secondary colour (hex), font, tone of voice, website, Instagram. Невалідний hex не ламає color picker.

**Billing.** 4 плани, 3 пакети credits, історія транзакцій поколінь AI (type, provider, model, status, credits, £ cost).

**Library.** Список проєктів: промпт, тип, статус, credits, дата. Порожній стан — CTA на Create.

---

## 5. Архітектура

```
React / Vite (web)
        │  proxy /auth /projects /brand /billing
        ▼
Node.js API  (Express, порт 4000)
        │
   ┌────┼──────────────┐
   ▼    ▼              ▼
Text AI  Image AI   Voice AI     ← OpenAI, якщо є ключ; інакше studio preview
   │     │              │
   └─────┼──────────────┘
         ▼
   Video renderer (вертикальний прев’ю 30 с)
         ▼
   SQLite  (локально)  →  пізніше Xano / Postgres
         ▼
   Stripe (підписки + пакети)  →  AWS S3 для фінального mp4 (фаза 2)
```

### 5.1 Стек зараз

| Шар | Технологія |
| --- | --- |
| Frontend | React 19, Vite 6, React Router 7, TypeScript |
| Backend | Node.js, Express, TypeScript, JWT, bcrypt |
| БД | SQLite (`node:sqlite`), файл `backend/data/auteur.db` |
| AI | OpenAI gpt-4o-mini + DALL·E 3 (опційно) |
| Платежі | Stripe Checkout (опційно) |

### 5.2 Міграція на Xano (коли знадобиться хмара без свого сервера)

Ті самі таблиці й ендпоінти. Node зараз — робочий еквівалент Xano API. Поля таблиць нижче вже під Xano (text / integer / decimal / datetime).

---

## 6. База даних

### 6.1 `users`

| Поле | Тип | Опис |
| --- | --- | --- |
| id | text PK | UUID |
| email | text unique | lowercase, trim |
| password_hash | text | bcrypt |
| name | text | |
| created_at | datetime | |

### 6.2 `plans`

| Поле | Тип | Опис |
| --- | --- | --- |
| id | text PK | `free`, `creator`, `pro`, `business` |
| name | text | |
| price_gbp | integer | **пенси** (999 = £9.99) |
| monthly_credits | integer | |
| stripe_price_id | text nullable | для живого Stripe |
| description | text | |

Сід:

| id | Ціна | Credits / міс |
| --- | --- | --- |
| free | £0 | 200 |
| creator | £9.99 | 1 000 |
| pro | £24.99 | 3 500 |
| business | £49.99 | 8 000 |

Ціни й пакети **провізорні**, поки не виміряно реальну собівартість відео.

### 6.3 `subscriptions`

| Поле | Тип | Опис |
| --- | --- | --- |
| id | text PK | |
| user_id | FK users | |
| plan_id | FK plans | |
| status | text | `active` / `canceled` |
| stripe_subscription_id | text nullable | |
| current_period_end | datetime nullable | |
| created_at | datetime | |

На signup створюється `plan_id = free`, `status = active`.

### 6.4 `credit_balances`

| Поле | Тип | Опис |
| --- | --- | --- |
| user_id | PK, FK users | один рядок на юзера |
| credits | integer | ніколи < 0 |
| updated_at | datetime | |

### 6.5 `credit_transactions`

| Поле | Тип | Опис |
| --- | --- | --- |
| id | text PK | |
| user_id | FK | |
| amount | integer | `+` грант/покупка, `-` spend |
| type | text | `grant` / `purchase` / `spend` |
| description | text | |
| generation_id | text nullable | зв’язок зі spend |
| created_at | datetime | |

Приклад: відео −150, баланс 200 → 50.

### 6.6 `ai_generations`

Критично для власника продукту: **реальна собівартість кожного виклику**.

| Поле | Тип | Опис |
| --- | --- | --- |
| id | text PK | |
| user_id | FK | |
| project_id | FK nullable | |
| type | text | `idea` / `script` / `visuals` / `voice` / `captions` / `render` |
| provider | text | `openai` / `auteur-studio` / `auteur-renderer` |
| model | text | `gpt-4o-mini`, `dall-e-3`, `preview`… |
| actual_cost_gbp | real | оцінка в £ |
| credits_used | integer | |
| status | text | `running` / `succeeded` / `failed` |
| meta_json | text nullable | |
| created_at | datetime | |

Правила:

- credits списуються **після успіху** кроку;
- повторний POST того самого завершеного кроку **не тарифікує** знову;
- якщо генерація впала — статус `failed`, баланс не чіпаємо.

### 6.7 `brand_kits`

Один kit на користувача.

| Поле | Тип | Опис |
| --- | --- | --- |
| id | text PK | |
| user_id | unique FK | |
| business_name | text | |
| logo_url | text | URL, не upload у v1 |
| primary_color | text | `#RRGGBB` |
| secondary_color | text | `#RRGGBB` |
| font | text | Fraunces / Outfit / Playfair Display / IBM Plex Sans |
| tone_of_voice | text | |
| website | text | |
| instagram | text | |
| updated_at | datetime | |

Передається в system-промпт усіх текстових кроків і в колірний грейд картинок.

### 6.8 `projects`

| Поле | Тип | Опис |
| --- | --- | --- |
| id | text PK | |
| user_id | FK | |
| type | text | див. формати |
| prompt | text | речення користувача |
| status | text | `draft` / `ready` |
| current_step | text | `prompt` / `idea` / `script` / `visuals` / `voice` / `captions` / `create` |
| idea_json | text | |
| script_json | text | |
| visuals_json | text | |
| voice_json | text | |
| captions_json | text | |
| output_url | text | прев’ю / пізніше S3 mp4 |
| credits_used | integer | сума по проєкту |
| created_at, updated_at | datetime | |

JSON-контракти:

**idea**

```json
{
  "title": "string",
  "hook": "string",
  "concept": "string",
  "audience": "string",
  "visualDirection": "string"
}
```

**script**

```json
{
  "durationSec": 30,
  "cta": "string",
  "scenes": [
    {
      "id": 1,
      "time": "0–3s",
      "onScreen": "string",
      "voiceover": "string",
      "visualPrompt": "string"
    }
  ]
}
```

**visuals** — масив `{ sceneId, imageUrl, prompt }`  
**voice** — `{ voice, script, notes }`  
**captions** — `{ cues: [{ start, end, text }] }` (секунди)

---

## 7. API

База: `http://localhost:4000`  
Фронт проксує ті самі шляхи з `http://localhost:5173`.  
Авторизація: `Authorization: Bearer <jwt>` (14 днів).  
Тіло: JSON. Помилка: `{ "error": "людський текст" }`.

| Метод | Шлях | Auth | Опис |
| --- | --- | --- | --- |
| GET | `/health` | ні | `{ ok, product }` |
| POST | `/auth/signup` | ні | `{ name, email, password }` → `{ token, user }` |
| POST | `/auth/login` | ні | `{ email, password }` → `{ token, user }` |
| GET | `/auth/me` | так | `{ user, subscription, credits }` |
| GET | `/projects` | так | список + `fullVideoCost` |
| POST | `/projects` | так | `{ type, prompt }` → 201 `{ project }` |
| GET | `/projects/:id` | так | проєкт + таблиця costs |
| POST | `/projects/:id/steps/:step` | так | `idea\|script\|visuals\|voice\|captions\|render` |
| GET | `/brand` | так | `{ brandKit }` |
| PUT | `/brand` | так | зберегти kit |
| GET | `/billing/plans` | ні | плани + packs |
| GET | `/billing/credits` | так | balance, transactions, generations |
| POST | `/billing/checkout` | так | `{ planId? , packId? }` → `{ mode, url }` |

Коди:

- 400 — валідація / невідомий крок / формат не з MVP;
- 401 — немає або прострочений токен;
- 402 — не вистачає credits;
- 404 — чужий або неіснуючий проєкт;
- 409 — email уже є;
- 500 — внутрішня помилка студії.

### 7.1 Правила пайплайну

Порядок обов’язковий: idea → script → visuals/voice/captions (visuals і voice потребують script; captions потребують script) → render.

Вартість кроку:

| step | credits |
| --- | --- |
| idea | 5 |
| script | 10 |
| visuals | 40 |
| voice | 30 |
| captions | 10 |
| render | 55 |
| **разом** | **150** |

Промпт: `trim`, мінімум 8 символів.

---

## 8. AI-пайплайн (рішення системи, не користувача)

Користувач ніколи не бачить назву моделі в UI створення.

| Крок | З ключем OpenAI | Без ключа |
| --- | --- | --- |
| Idea / Script / Voice / Captions | `gpt-4o-mini`, JSON | детермінований studio preview |
| Visuals | DALL·E 3, 1024×1792, вертикаль | 5 градієнтних кадрів 9:16 |
| Create | статус `ready`, `output_url` прев’ю | те саме |

Якщо відповідь моделі не JSON — fallback на preview, credits за успішний крок усе одно списуються тільки якщо крок завершився даними (preview теж вважається успіхом).

Промпт системи завжди містить Brand Kit, якщо він заповнений.

**Фаза 2 (не в поточному коді, обов’язково в ТЗ як наступний крок):**

- TTS (ElevenLabs або OpenAI speech) → аудіофайл;
- пакування mp4 (Remotion / ffmpeg): кадри + голос + burned-in captions, 1080×1920, 30 с;
- завантаження в S3, `output_url` = публічний HTTPS;
- кнопка Download.

---

## 9. Credits і монетизація

### 9.1 Інваріанти

- баланс не може піти в мінус;
- signup атомарний: user + free subscription + 200 credits + brand kit, або нічого;
- якщо в старого юзера немає балансу / kit — створюються при login / `/me`;
- Free **має** вистачати на **один** повний Reel (тому 200, не 100).

### 9.2 Пакети докупівлі

| id | Credits | Ціна |
| --- | --- | --- |
| pack_200 | 200 | £4.99 |
| pack_600 | 600 | £12.99 |
| pack_1500 | 1 500 | £29.99 |

### 9.3 Stripe

- є `STRIPE_SECRET_KEY` → Checkout Session, `mode: stripe`, редірект на `url`;
- немає ключа → `mode: studio`, credits нараховуються одразу (для розробки);
- success: `/app/billing?success=1`, cancel: `?canceled=1`;
- webhook (`STRIPE_WEBHOOK_SECRET`) — фаза 2: підтверджувати грант тільки після `checkout.session.completed`.

Перерахунок цін — після 20–50 реальних генерацій по `ai_generations.actual_cost_gbp`. Цільова маржа: credits-ціна кроку ≥ 3× собівартості.

---

## 10. Безпека й нефункціональні вимоги

- пароль ≥ 6 символів, hash bcrypt;
- JWT secret з env у проді;
- `.env`, `*.db`, `node_modules` не в git;
- користувач бачить лише свої projects / brand / credits;
- hex кольорів валідується (`#RRGGBB`);
- мережева помилка API **не** розлогінює (тільки 401);
- CORS: `APP_URL`, localhost:5173, 127.0.0.1:5173;
- UI web, desktop-first; адаптив до ~960px (не окремий мобільний застосунок).

---

## 11. Критерії приймання MVP

1. Новий користувач реєструється і бачить 200 credits.
2. Можна створити Reel з промптом про Лондон і пройти всі 6 кроків.
3. Після цього баланс = 50, у Library є проєкт зі статусом ready.
4. Повторний Idea на тому ж проєкті не списує 5 credits.
5. Video / Post / Ad / Social post не створюють проєкт, показують «next».
6. Brand Kit зберігається і з’являється в тексті Idea (tone / назва бізнесу).
7. Creator plan у studio mode додає 1 000 credits.
8. На billing видно рядок generation з provider і credits_used.
9. Без API ключів увесь шлях працює preview-контентом.
10. `GET /health` = 200.

---

## 12. Дорожня карта після MVP

**Фаза 2 — справжній файл.** TTS + renderer + S3 + Download. Webhook Stripe.

**Фаза 3 — формати.** Instagram post (1:1 / 4:5), advertisement 15/30 с, captions-only social post.

**Фаза 4 — бренд сильніше.** Upload лого в сховище, шрифт у кадрі, intro/outro картка з назвою бізнесу.

**Фаза 5 — ріст.** YouTube Shorts, карусель, презентації, бізнес-контент. Шедулер — тільки якщо просять існуючі користувачі.

Не починати фазу N+1, доки фаза N не дає повторних генерацій (не одноразових реєстрацій).

---

## 13. Локальний запуск (для розробки за цим ТЗ)

```bash
cd backend && cp .env.example .env && npm install && npm run start
cd frontend && npm install && npm run dev
```

Відкрити [http://localhost:5173](http://localhost:5173).

Опційно в `backend/.env`: `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, `JWT_SECRET`, `APP_URL`.

---

## 14. Глосарій

| Термін | Значення |
| --- | --- |
| Studio | екран 6 кроків одного проєкту |
| Preview / auteur-studio | локальна генерація без платних API |
| Credits | внутрішня валюта, не крипта |
| Brand Kit | профіль вигляду й тону, не редактор |
| Ready | проєкт пройшов Create, credits за render списані |
