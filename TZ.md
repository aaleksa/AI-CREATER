# Технічне завдання: Auteur

**Продукт:** AI Content Creator  
**Репозиторій:** [github.com/aaleksa/AI-CREATER](https://github.com/aaleksa/AI-CREATER)  
**Версія документа:** 1.1  
**Мова інтерфейсу першої версії:** English  
**Валюта:** GBP (£)

Документ фіксує: продуктову рамку, **що вже є в коді**, **що ще обов’язково для прийняття MVP**, і як розширювати далі.

---

## 1. Суть продукту

Auteur — не копія Canva і не відеоредактор рівня CapCut.

Це проста студія, у якій людина **не повинна знати, як працюють 5–6 різних AI-сервісів**. Вона не вибирає модель, prompt, resolution чи voice engine.

Головна обіцянка:

> Tell us what you want to create. We’ll do the rest.

Користувач каже:

> «Мені потрібна реклама мого салону краси для Instagram»

Система сама вирішує: який AI, яка картинка, який голос, який формат, які субтитри, який стиль бренду — і **віддає файл, який можна викласти**.

Обіцянка не виконується, поки на виході немає реального відеофайлу. Прев’ю в браузері (розкадровка) — проміжний стан коду, не прийнятий MVP.

### 1.1 Для кого (v1 — одна персона)

**v1 заточений тільки під власника малого бізнесу:** кав’ярня, салон краси, фітнес-студія, кабінет — людина, якій потрібен регулярний Reel / TikTok у своєму бренді, без оператора й без стеку нейромереж.

Brand Kit — головна фіча саме для цієї персони: consistency вигляду й тону.

**Не персони MVP** (прибрати з пріоритетів, не проектувати під них екрани):

| Кого не беремо в v1 | Чому | Коли |
| --- | --- | --- |
| Сольний креатор | хоче «свій голос», особистість, авторський стиль — інший продукт | після утримання малого бізнесу |
| Агентство | хоче batch, кілька клієнтів, варіанти A/B, командний доступ | Business / окремий трек |

Це свідомо звужує roadmap: **batch-генерація, мультиакаунт клієнтів, «мій голос як інфлюенсер» — не робити зараз.**

### 1.2 Що вважається успіхом MVP

Користувач (власник малого бізнесу) заходить → обирає Instagram Reel або TikTok → пише одне речення → проходить 6 кроків → **отримує готовий 30-секундний вертикальний відеофайл (mp4)** → credits списані → в логах є собівартість кожного AI-виклику.

«Студійний прев’ю без файлу» **не** є успіхом MVP. Це генератор сторібордів. Поки немає TTS + базового рендеру — продукт не показувати зовнішнім користувачам як «готовий Reel».

Якщо цим реально користуються повторно (див. критерії в §11) — далі пости, реклама, YouTube.

### 1.3 Рів (чому це не ще один шар над OpenAI)

Саме по собі «система вибирає модель / голос / стиль» — уже роблять HeyGen, Fliki, Predis. Це **гігієна**, не рів. Копіюється за тиждень.

Справжній рів Auteur — три речі, які треба закладати в продукт, не лише в голові:

1. **Brand Kit, який навчається.** Не тільки hex і тон у формі. Після 2–3 роликів система дивиться попередні Reels цього бізнесу (хуки, темп, слова, кадри, що користувач не відхилив) і підкручує наступні. Статичні кольори — v1-мінімум; навчання з історії — обов’язковий напрям одразу після першого mp4, інакше Kit = таблиця з CSS.
2. **Вузька ніша малого бізнесу, не генераліст.** Готові сценарні каркаси під салони, кав’ярні, фітнес (не маркетплейс на 100 шаблонів, а 3 вертикалі). Генералістські конкуренти цього не роблять добре.
3. **Прозора собівартість як UX для бізнесу**, не лише внутрішній лог власника Auteur. На billing користувач бачить: цей Reel коштував N credits / орієнтовно £X собівартості API. Малий бізнес хоче контролювати витрати. Агентствам це теж зайде пізніше — у v1 показуємо власнику кав’ярні.

Без цих трьох пунктів продукт — прошарок над чужим API.

---

## 2. Scope

### 2.1 Розведення: код зараз vs прийнятий MVP

| Блок | У коді зараз | Обов’язково для прийняття MVP |
| --- | --- | --- |
| Лендінг, auth, JWT, 200 free credits | так | так |
| Create: Reel / TikTok + промпт | так | так |
| 6 кроків студії, credits, Brand Kit, Library | так | так |
| `ai_generations` (собівартість) | так | так; плюс показ користувачу (§1.3.3) |
| Idea / Script / Visuals / Captions | так (текст + кадри) | так |
| Voice | **лише інструкція для голосу (JSON), без аудіо** | **TTS → аудіофайл** |
| Create | **статус `ready` + прев’ю в браузері, без mp4** | **базовий рендер локального mp4** (кадри + голос + субтитри, без ефектів) |
| S3, кнопка Download у хмарі, high quality | немає | **не MVP** — наступний реліз після файлу |

**Критичне правило:** не показувати продукт зовні з обіцянкою «готовий Reel», доки немає файлу. TTS + простий рендер (ffmpeg або Remotion, без Ken Burns / transitions) — частина MVP, не «фаза 2».

Що лишається *після* прийняття MVP (коли файл уже є):

- завантаження в AWS S3;
- кнопка Download з постійним URL;
- вища якість / стабілізація / музика;
- Stripe webhook замість studio mode.

### 2.2 Свідомо не робимо в v1

- власний відеоредактор рівня CapCut;
- 100 AI-моделей на вибір користувача;
- мобільний + web + desktop одночасно (тільки web);
- складна система шаблонів / маркетплейс (окрім 3 нішевих каркасів у §1.3);
- шедулер у соцмережі;
- власна AI-модель;
- blockchain / crypto / токен;
- Canva-подібний canvas, шари, drag-and-drop;
- командні акаунти, ролі, SSO;
- batch / кілька варіантів на один промпт (агентство);
- клонування «мого голосу» креатора.

### 2.3 Формати на головному екрані

| ID | Назва | MVP |
| --- | --- | --- |
| `video` | Video | екран є, створення заблоковане |
| `instagram_reel` | Instagram Reel | повний пайплайн + **mp4** |
| `tiktok` | TikTok | повний пайплайн + **mp4** |
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
5. Відкривається студія. Кроки (кнопка на кожен):
   1. **Idea** (5 cr) — концепція, хук, візуальний напрям;
   2. **Script** (10 cr) — 30 с, 4–6 сцен, текст voiceover;
   3. **Visuals** (40 cr) — кадр на кожну сцену (9:16);
   4. **Voice** (30 cr) — спочатку JSON-інструкція голосу, потім **TTS → аудіо** (див. §6.8);
   5. **Captions** (10 cr) — таймкоди субтитрів;
   6. **Create** (55 cr) — **збірка mp4** + статус `ready`.
6. Разом **150 credits**. Баланс: 200 → 50.
7. Користувач має файл (локально / тимчасовий URL). Проєкт у Library. Повтор кроку не тарифікується.

### 3.2 Brand Kit

Користувач один раз задає бренд. Далі промпт «Create a Reel promoting my coffee shop» вже має кольори, шрифт, тон, Instagram. Після кількох готових роликів Kit має **підхоплювати патерни** з історії (не лише форму) — див. §1.3.

### 3.3 Недостатньо credits

Якщо на кроці не вистачає балансу — 402, текст *Not enough credits. Buy a pack or upgrade your plan.* і посилання на `/app/billing`.

### 3.4 Покупка

- підписка Creator / Pro / Business нараховує місячний пакет (**залучення**);
- Buy credits — разові пакети (**маржа**) — стратегія в §9.4;
- без Stripe-ключа — studio mode (нарахування одразу, тільки для розробки).

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
| 14 | Собівартість (UX для бізнесу) | блок на billing | JWT |
| 15 | Library | `/app/library` | JWT |

Кроки 5–10 — один маршрут студії з прогрес-баром, не окремі URL.

### 4.1 Вимоги до екранів

**Landing.** Заголовок-обіцянка, CTA «Create a Reel». Поки немає mp4 у білді — **не показувати лендінг зовні** (або тимчасово змінити copy на план/розкадровку; обрана стратегія: добити файл, copy не зменшувати).

**Auth.** Ім’я (тільки signup), email, пароль. Помилки зрозумілою мовою.

**Create.** Сітка 6 форматів. Reel/TikTok — активні. Інші — «soon». Промпт — одне речення, мінімум 8 символів. Підказка вартості: 150 credits, Free = 200 (**цифри заморожені**, §9).

**Studio.** Вертикальний прев’ю 9:16 ліворуч. Панель **одного** поточного кроку праворуч + кнопка `Make {step} · N credits`. Після Create — плеєр/посилання на **mp4**, не лише градієнт.

**Brand Kit.** Поля: business name, logo URL, primary/secondary colour (hex), font, tone of voice, website, Instagram. Невалідний hex не ламає color picker.

**Billing.** 4 плани, 3 пакети, історія generation. Користувач бачить credits_used і орієнтовну £ собівартість по своїх роликах (прозора витрата, §1.3.3). Планові £/міс у UI підписати як provisional, доки не зміряно пайплайн з TTS+рендером.

**Library.** Список проєктів: промпт, тип, статус, credits, дата, наявність файлу.

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
Text AI  Image AI   Voice / TTS     ← OpenAI (і TTS-провайдер), якщо є ключ; інакше preview
   │     │              │
   └─────┼──────────────┘
         ▼
   Video renderer  (обов’язково для MVP: локальний mp4, 1080×1920, без ефектів)
         ▼
   SQLite  (локально)  →  пізніше Xano / Postgres
         ▼
   Stripe (підписки + пакети)
         ▼
   AWS S3 + Download URL   ← НЕ MVP; після того, як файл уже збирається локально
```

### 5.1 Стек зараз

| Шар | Технологія |
| --- | --- |
| Frontend | React 19, Vite 6, React Router 7, TypeScript |
| Backend | Node.js, Express, TypeScript, JWT, bcrypt |
| БД | SQLite (`node:sqlite`), файл `backend/data/auteur.db` |
| AI | OpenAI gpt-4o-mini + DALL·E 3 (опційно) |
| Платежі | Stripe Checkout (опційно) |
| TTS / render | **ще немає в коді; блокер прийняття MVP** |

### 5.2 Міграція на Xano

Ті самі таблиці й ендпоінти. Node зараз — робочий еквівалент Xano API.

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

Сід (**заморожено до виміру собівартості повного пайплайну з TTS + рендером**, див. §9):

| id | Ціна | Credits / міс |
| --- | --- | --- |
| free | £0 | 200 |
| creator | £9.99 | 1 000 |
| pro | £24.99 | 3 500 |
| business | £49.99 | 8 000 |

Ці цифри **не є фактом продуктового бачення**. Команда розробки не повинна трактувати £9.99 / пакети як затверджену економіку. Після 20–50 роликів з TTS+mp4 — перерахунок.

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

На signup: `plan_id = free`, `status = active`.

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

### 6.6 `ai_generations`

Критично: **реальна собівартість кожного виклику** (і для команди, і як UX на billing).

| Поле | Тип | Опис |
| --- | --- | --- |
| id | text PK | |
| user_id | FK | |
| project_id | FK nullable | |
| type | text | `idea` / `script` / `visuals` / `voice` / `tts` / `captions` / `render` |
| provider | text | `openai` / `auteur-studio` / TTS-провайдер / `auteur-renderer` |
| model | text | |
| actual_cost_gbp | real | оцінка в £ |
| credits_used | integer | |
| status | text | `running` / `succeeded` / `failed` |
| meta_json | text nullable | |
| created_at | datetime | |

Правила:

- credits списуються **після успіху** кроку;
- повторний POST завершеного кроку **не тарифікує**;
- падіння → `failed`, баланс не чіпаємо.

### 6.7 `brand_kits`

Один kit на користувача в v1.

| Поле | Тип | Опис |
| --- | --- | --- |
| id | text PK | |
| user_id | unique FK | |
| business_name | text | |
| logo_url | text | URL, не upload у першому білді |
| primary_color | text | `#RRGGBB` |
| secondary_color | text | `#RRGGBB` |
| font | text | Fraunces / Outfit / Playfair Display / IBM Plex Sans |
| tone_of_voice | text | |
| website | text | |
| instagram | text | |
| vertical | text nullable | `salon` / `cafe` / `fitness` — ніша для каркасів |
| updated_at | datetime | |

Далі (не блокер першого mp4, але рів): таблиця/поля історії прийнятих роликів для «навчання» Kit.

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
| voice_json | text | **інструкція голосу, не аудіо** |
| audio_url | text nullable | **результат TTS; порожньо = крок Voice ще не завершений для MVP** |
| captions_json | text | |
| output_url | text | **шлях/URL mp4**; прев’ю без файлу ≠ ready для прийняття |
| credits_used | integer | |
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

**voice_json (інструкція, не медіа).** Назва поля в API можна показувати як `voiceDirection`, щоб ні розробник, ні UI не вважали крок «озвучено».

```json
{
  "voicePreset": "warm_british_female",
  "script": "повний текст для TTS, зліплений зі сцен",
  "notes": "Natural pace. Pause after the hook. Never sound like an ad read."
}
```

У поточному коді контракт ще `{ voice, script, notes }` **без аудіо** — це *voice direction*, не завершений Voice. Для MVP крок `voice`:

1. записати `voice_json` (direction);
2. викликати TTS;
3. записати `audio_url`;
4. окремий рядок `ai_generations` type=`tts` з `actual_cost_gbp`.

Поки `audio_url` порожній, крок Voice для прийняття MVP **не done**. UI не підписувати «Voice ready», якщо є лише JSON.

**captions** — `{ cues: [{ start, end, text }] }` (секунди)

---

## 7. API

База: `http://localhost:4000`  
Фронт проксує з `http://localhost:5173`.  
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
| GET | `/projects/:id/file` | так | віддати mp4 (після Create) |
| GET | `/brand` | так | `{ brandKit }` |
| PUT | `/brand` | так | зберегти kit |
| GET | `/billing/plans` | ні | плани + packs (**провізорні**) |
| GET | `/billing/credits` | так | balance, transactions, generations |
| POST | `/billing/checkout` | так | `{ planId? , packId? }` → `{ mode, url }` |

Коди: 400 валідація; 401 токен; 402 credits; 404 проєкт; 409 email; 500 студія.

### 7.1 Правила пайплайну

Порядок: idea → script → visuals / voice / captions (потребують script) → render.

| step | credits | Що вважається успіхом |
| --- | --- | --- |
| idea | 5 | `idea_json` |
| script | 10 | `script_json` |
| visuals | 40 | кадри на сцени |
| voice | 30 | `voice_json` **і** `audio_url` (TTS) |
| captions | 10 | cues |
| render | 55 | **існує mp4**, `status=ready` |
| **разом** | **150** | |

Промпт: `trim`, мінімум 8 символів.

---

## 8. AI-пайплайн (рішення системи, не користувача)

Користувач ніколи не бачить назву моделі в UI створення. Це гігієна. Рів — §1.3.

| Крок | З ключами | Без ключів |
| --- | --- | --- |
| Idea / Script / Captions / voice *direction* | `gpt-4o-mini`, JSON | studio preview JSON |
| Visuals | DALL·E 3, 1024×1792 | градієнт-кадри 9:16 |
| Voice *аудіо* | TTS (OpenAI speech або ElevenLabs) | локальний/заглушка неприйнятна для зовнішнього демо; для dev — тиша + файл |
| Create | ffmpeg/Remotion → mp4 1080×1920 | той самий рендер на preview-кадрах |

Якщо JSON моделі битий — fallback на preview-текст. Credits лише після успішного артефакту кроку.

Brand Kit (і ніша salon/cafe/fitness, якщо задана) завжди в контексті.

Нішеві каркаси (v1 після першого стабільного mp4, не окремий маркетплейс): 3 JSON-структури сцен «салон / кава / фітнес». Користувач усе одно пише речення; система підставляє каркас, не меню шаблонів.

---

## 9. Credits і монетизація

### 9.0 Заморозка цифр

Усі £ у цьому документі й у UI (**Creator £9.99, пакети £4.99 / £12.99 / £29.99, 150 credits за Reel**) пораховані на пайплайні **без TTS і рендеру**.

**Статус: FROZEN до виміру собівартості повного MVP-пайплайну (текст + картинки + TTS + mp4).**

Не використовувати ці числа як затверджений прайс для інвестора, реклами чи «факту в roadmap». Після 20–50 реальних роликів: перерахунок `CREDIT_COSTS`, планів і пакетів. Цільова маржа: ціна кроку в credits ≥ 3× `actual_cost_gbp`.

### 9.1 Інваріанти

- баланс не може піти в мінус;
- signup атомарний: user + free subscription + 200 credits + brand kit;
- Free **має** вистачати на **один** повний Reel (тому 200 ≥ 150);
- після зміни собівартості Free/150 можна переглянути разом із прайсом.

### 9.2 Пакети докупівлі (заморожені)

| id | Credits | Ціна |
| --- | --- | --- |
| pack_200 | 200 | £4.99 |
| pack_600 | 600 | £12.99 |
| pack_1500 | 1 500 | £29.99 |

### 9.3 Stripe

- є ключ → Checkout, `mode: stripe`;
- немає → `mode: studio` (тільки розробка);
- webhook — після стабільного mp4, не блокер першого файлу.

### 9.4 Unit-економіка: підписка vs пакети (явно)

На заморожених цифрах орієнтовно:

| Канал | £ / Reel (якщо Reel = 150 cr) | Роль |
| --- | --- | --- |
| Підписки | ≈ £0.94–1.50 / Reel | **залучення**: дешевий вхід, звичка |
| Пакети | ≈ £3.00–3.75 / Reel | **прибуток**: хто вичерпав ліміт |

Це не випадковість прайсу, а стратегія: підписка веде в продукт, докупівля credits несе маржу. Після розморозки зберегти цей розрив (пакети дорожчі за 1 Reel, ніж підписка), якщо unit-економіка з TTS+рендером це дозволяє. Якщо собівартість mp4 з’їсть підписку — спочатку підняти credits/ціну підписки, не зрівнювати пакети вниз.

---

## 10. Безпека й нефункціональні вимоги

- пароль ≥ 6 символів, hash bcrypt;
- JWT secret з env у проді;
- `.env`, `*.db`, `node_modules` не в git;
- лише свої projects / brand / credits;
- hex `#RRGGBB`;
- мережева помилка **не** розлогінює (тільки 401);
- CORS: `APP_URL`, localhost:5173, 127.0.0.1:5173;
- UI web, desktop-first.

---

## 11. Критерії приймання MVP

**Функціональні (без них продукт не демоїти як Reel):**

1. Новий користувач реєструється і бачить 200 credits.
2. Можна створити Reel з промптом і пройти всі 6 кроків → **на диску/за запитом є відтворюваний mp4 ~30 с 9:16** (не лише прев’ю в DOM).
3. Крок Voice не вважається done без аудіофайла (`audio_url`).
4. Після повного шляху баланс = 50 (при вартості 150), у Library статус ready **і** файл.
5. Повторний Idea на тому ж проєкті не списує 5 credits.
6. Video / Post / Ad / Social post не створюють проєкт.
7. Brand Kit зберігається і впливає на Idea.
8. На billing видно generation (provider, credits_used, £) **користувачу**.
9. Без платних ключів шлях для розробки не падає; **зовнішнє демо — тільки з TTS+рендером**.
10. `GET /health` = 200.

**Утримання (інакше «успіх MVP» суб’єктивний; фазу постів не починати):**

11. Не менше **30% користувачів, які закінчили перший Reel (є mp4), створюють другий проєкт протягом 14 днів.**
12. Не починати наступний формат (пост/реклама), доки §11.11 не виконано на вибірці **≥ 20** користувачів з готовим першим файлом — не на реєстраціях без другого ролика.

---

## 12. Дорожня карта

**Блокер зараз (частина MVP, не «фаза 2»):** TTS + базовий рендер mp4. Поки цього немає — не зовнішній запуск.

**Після прийняття MVP (коли файл уже є):**

- S3 + Download + якість вище;
- Stripe webhook;
- «навчання» Brand Kit з історії роликів;
- 3 нішеві каркаси (салон / кава / фітнес), поле `vertical`.

**Далі, тільки якщо є повторні генерації (§11.11):**

- Instagram post, advertisement, captions-only post;
- upload лого;
- YouTube / презентації;
- шедулер — лише за запитом існуючих користувачів;
- агентство / соло-креатор — окремі персони, не розмивати v1.

---

## 13. Локальний запуск

```bash
cd backend && cp .env.example .env && npm install && npm run start
cd frontend && npm install && npm run dev
```

Відкрити [http://localhost:5173](http://localhost:5173).

Опційно: `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, `JWT_SECRET`, `APP_URL`, пізніше ключ TTS.

---

## 14. Глосарій

| Термін | Значення |
| --- | --- |
| Studio | екран 6 кроків одного проєкту |
| Preview / auteur-studio | локальна генерація без платних API |
| Voice direction | JSON-інструкція голосу (`voice_json`); це ще не озвучка |
| TTS | синтез мовлення → `audio_url` |
| Credits | внутрішня валюта, не крипта |
| Brand Kit | профіль вигляду й тону; має еволюціонувати з історії |
| Ready (прийняття) | є mp4, credits за render списані |
| Frozen price | £ у документі, до виміру собівартості з TTS+рендером |
| FROZEN | не орієнтир для продакшен-прайсу |

---

## 15. Відкриті рішення перед зовнішнім демо

1. Провайдер TTS за замовчуванням.  
2. Рендерер: ffmpeg vs Remotion (для MVP достатньо найпростішого).  
3. Де лежить mp4 до S3 (диск сервера / tmp).  
4. Чи регенерація Voice/Create платна (зараз повтор безкоштовний і не перегенеровує).  
5. Перерахунок credits після перших інвойсів TTS+рендеру — обов’язковий чекпоінт, не «колись».
