# Технічне завдання: Auteur

**Продукт:** Auteur — AI Content Creator  
**Репозиторій:** AI-CREATER  
**Версія документа:** 1.0  
**Дата:** 14 вересня 2026  
**Статус реалізації:** MVP v1 зібраний і запущений локально (web)

Цей документ описує **поточну реалізацію як є** і **майбутнє розширення**. Його можна використовувати як ТЗ для розробки, онбордингу й плану релізів.

---

## 1. Паспорт продукту

### 1.1 Що це

Auteur — не копія Canva і не відеоредактор рівня CapCut. Це проста студія контенту, де людина **не повинна знати**, як працюють 5–6 різних AI-сервісів.

Користувач не вибирає модель, prompt, resolution, voice model. Він каже, що хоче створити. Система сама вирішує: який AI, яка картинка, який голос, який формат, які субтитри.

**Головна обіцянка (не «We have AI»):**

> Tell us what you want to create. We'll do the rest.

Приклад: «Мені потрібна реклама мого салону краси для Instagram» — система сама збирає ролик.

### 1.2 Для кого

Власники малого бізнесу, креатори, маркетологи, які хочуть Reels / TikTok / пізніше пости й рекламу, але не хочуть освоювати стек генеративних інструментів.

### 1.3 Мова інтерфейсу

Поточний UI — англійська (промпти, студія, тарифи в GBP). Продуктова документація може бути українською.

### 1.4 Платформа MVP

Тільки **web**. Не одночасно mobile + web + desktop.

---

## 2. Продуктова рамка MVP

### 2.1 Що входить у першу версію

Повний шлях:

**Text → Script → Image/Video frames → Voice (кастинг) → Captions → Final (прев’ю Reel)**

Перший робочий формат — **Instagram Reel** і **TikTok**: вертикальне 30-секундне відео (прев’ю в студії).

Користувач:

1. Обирає формат.
2. Пише одне речення.
3. У студії **вручну** проходить 6 кроків кнопками *Make … · N credits*.
4. Бачить результат у телефоні 9:16.

### 2.2 Що свідомо НЕ входить у v1

| Не робити зараз | Чому |
| --- | --- |
| Власний редактор рівня CapCut | Роздуває MVP |
| 100 AI-моделей у меню | Ламає головну обіцянку |
| Mobile + web + desktop одночасно | Три команди підтримки |
| Складна система шаблонів | Пізніше, якщо буде попит |
| Social-media scheduler | Інший продукт |
| Власна AI-модель | Нестерпно дорого на старті |
| Blockchain / crypto token | Не стосується задачі |
| Експорт готового MP4 на S3 | Наступний реліз після прев’ю |
| Реальний TTS (MP3) | Зараз лише кастинг голосу текстом |
| Автозапуск усіх 6 кроків без кліків | Відхилено: лишаємо ручне підтвердження кроку |

---

## 3. Користувацький сценарій (як є)

1. Людина відкриває лендінг.
2. Реєструється (ім’я, email, пароль ≥ 6 символів) → отримує **200 credits** і порожній Brand Kit.
3. На екрані *What do you want to create?* обирає **Instagram Reel** або **TikTok**.
4. Пише, наприклад: *Create a 30-second Reel about the best places to visit in London.*
5. Натискає *Continue with Instagram Reel* — створюється проєкт, credits ще не знімаються.
6. Відкривається студія. Зліва телефон, справа один поточний крок.
7. Послідовно: Idea (5) → Script (10) → Visuals (40) → Voice (30) → Captions (10) → Create (55). Разом **150 credits**.
8. Після Create статус `ready`. Проєкт є в Library.

Інші картки (Video, Image/Post, Advertisement, Social post) видно, але **не в першій студії** — API відповідає 400.

---

## 4. Карта екранів (поточна реалізація)

| # | Маршрут | Доступ | Призначення |
| --- | --- | --- | --- |
| 1 | `/` | публічний | Лендінг з обіцянкою |
| 2 | `/signup` | публічний | Реєстрація |
| 3 | `/login` | публічний | Вхід |
| 4 | `/app` | приватний | *What do you want to create?* |
| 5 | `/app/studio/:id` | приватний | 6 кроків + телефон 9:16 |
| 6 | `/app/brand` | приватний | Brand Kit |
| 7 | `/app/billing` | приватний | Плани, пакети, лог собівартості |
| 8 | `/app/library` | приватний | Список проєктів |

Оболонка `/app`: сайдбар (Create, Library, Brand kit, Credits), баланс credits, ім’я, план, Sign out.

Сесія: JWT у `localStorage` (`auteur.token`). Без токена — редірект на `/login`. Вихід зі студії на логін лише при **401**, не при збої мережі.

---

## 5. Екрани докладно

### 5.1 Landing `/`

- Назва: Aut**eur**
- H1: *Tell us what you want to create. We’ll do the rest.*
- Пояснення: не треба обирати модель чи voice engine.
- CTA: *Create a Reel* → signup, *Sign in*
- Підказка: перша студія — Reels & TikTok

### 5.2 Sign up / Login

Поля signup: Name, Email, Password.  
Login: Email, Password.  
Помилки з API показуються текстом (`err`).

Після успіху: зберегти token, перейти на `/app`.

### 5.3 Create `/app`

Заголовок: **What do you want to create?**

Картки форматів:

| id | Емодзі | Назва | У MVP |
| --- | --- | --- | --- |
| `video` | 🎬 | Video | ні |
| `instagram_reel` | 📱 | Instagram Reel | **так** |
| `tiktok` | 🎵 | TikTok | **так** |
| `image_post` | 🖼️ | Image / Post | ні |
| `advertisement` | 📢 | Advertisement | ні |
| `social_post` | ✍️ | Social media post | ні |

Промпт — одне текстове поле. Приклади підставляються при виборі картки. Мінімум 8 символів (перевірка на API).

Кнопка: *Continue with {Format}*. Створює проєкт `POST /projects` і відкриває студію.

### 5.4 Studio `/app/studio/:id`

**Верх:** тип формату + повний промпт користувача (не змінюється).

**Пігулки кроків:** 1. Idea … 6. Create. Поточний обведений, виконані підсвічені.

**Зліва — телефон (прев’ю готового ролика):**

- Співвідношення 9:16, кадр на всю ширину колонки.
- До генерації: градієнт-заглушка.
- Після Idea: знизу title концепції.
- Після Script: текст сцени; під телефоном список сцен (клік перемикає кадр).
- Після Visuals: картинка або градієнт сцени.
- Після Captions: субтитр поверх кадру.

Це **покадрове прев’ю**, не MP4-плеєр.

**Справа — панель одного поточного кроку (не всі кроки одразу):**

- Заголовок `Step — {Label}` або `Ready`
- Короткий текст, що зараз робить студія / результат кроку
- Кнопка `Make {step} · N credits`
- Помилка + посилання Buy credits, якщо не вистачає балансу
- `Used on this Reel: X credits`

Користувач **підтверджує кожен крок**. Автозапуску всього пайплайну немає (свідоме рішення).

### 5.5 Brand kit `/app/brand`

Поля: Business name, Logo URL, Primary/Secondary colour, Font, Tone of voice, Website, Instagram.

Кольори валідуються як `#RRGGBB`. Наступні генерації підмішують бренд у промпти AI.

Один kit на користувача (унікальний `user_id`).

### 5.6 Credits `/app/billing`

- Баланс
- Плани Free / Creator / Pro / Business
- Buy credits (пакети)
- Список `ai_generations`: type, provider/model, status, credits, £ собівартість

Без Stripe-ключа checkout у **studio mode** одразу нараховує credits (для тесту).

### 5.7 Library `/app/library`

Список проєктів: промпт, тип, статус, credits, дата. Клік → та сама студія.

---

## 6. Пайплайн студії (поточна логіка)

Кроки й ціна в credits (`backend/src/config.ts`):

| Крок API | UI | Credits | Що зберігається |
| --- | --- | --- | --- |
| `idea` | Idea | 5 | `idea_json`: title, hook, concept, audience, visualDirection |
| `script` | Script | 10 | `script_json`: durationSec, cta, scenes[] |
| `visuals` | Visuals | 40 | `visuals_json`: sceneId, imageUrl, prompt |
| `voice` | Voice | 30 | `voice_json`: voice, script, notes |
| `captions` | Captions | 10 | `captions_json`: cues[{ start, end, text }] |
| `render` | Create | 55 | `status=ready`, `output_url` прев’ю |

**Разом: 150 credits** на один Reel.

Правила:

1. Крок можна виконати лише якщо є залежність (script потребує idea, visuals/voice/captions — script).
2. Повторний виклик уже зробленого кроку **не тарифікується** і повертає наявні дані.
3. Credits знімаються **після успіху**. Падіння AI не списує баланс.
4. Перед генерацією перевіряється баланс; інакше HTTP 402.
5. Кожна спроба пише рядок у `ai_generations` (`running` → `succeeded` / `failed`).

Сцена скрипта (структура):

```json
{
  "id": 1,
  "time": "0–3s",
  "onScreen": "…",
  "voiceover": "…",
  "visualPrompt": "…"
}
```

Типовий mock-скрипт — 5 сцен на 30 секунд.

**Чесна межа v1:**

- Voice = кастинг і текст, не MP3.
- Create = замок прев’ю, не файл MP4 на S3.
- Без `OPENAI_API_KEY` тексти й кадри — studio preview (градієнти).
- З ключем: GPT-4o-mini для JSON, DALL·E 3 для кадрів 1024×1792.

Brand Kit, якщо заповнений, додається в system/user контекст (назва, тон, колір, шрифт, Instagram, сайт).

---

## 7. Архітектура (як зібрано)

```
React (Vite, порт 5173)
        │  proxy /auth /projects /brand /billing /health
        ▼
Node.js API (Express, порт 4000)
        │
        ├── Text AI     OpenAI gpt-4o-mini  або  auteur-studio preview
        ├── Image AI    OpenAI DALL·E 3     або  градієнт-кадри
        ├── Voice AI    JSON-кастинг        (TTS — фаза 2)
        └── Renderer    прев’ю 9:16 в браузері  (MP4 + S3 — фаза 2)
        │
        ▼
SQLite (node:sqlite)  backend/data/auteur.db
        │
Stripe Checkout (опційно)  або studio-mode grant
```

Продуктове ім’я в коді: `auteur`. Репозиторій: `AI-CREATER`.

### 7.1 Стек

| Шар | Технологія |
| --- | --- |
| Frontend | React 19, Vite 6, React Router 7, TypeScript |
| Backend | Node.js, Express 4, TypeScript, tsx |
| БД | SQLite через `node:sqlite` (без better-sqlite3: не збирається на Node 26) |
| Auth | JWT 14 днів, bcryptjs |
| Платежі | Stripe Checkout; без ключа — studio mode |
| AI | openai SDK, опційний ключ |

### 7.2 Структура репозиторію

```
AI-CREATER/
  frontend/          web-додаток
  backend/           API + SQLite
    src/routes/      auth, projects, brand, billing
    src/services/    ai, credits, pipeline
    src/db/          schema, seed, wrapper SQLite
  docs/TZ.md         цей документ
  README.md
```

`.env`, `node_modules`, `data/`, `*.db` у git не входять.

### 7.3 Запуск

```bash
cd backend && cp .env.example .env && npm install && npm run start
cd frontend && npm install && npm run dev
```

Відкрити http://localhost:5173  

Опційно в `backend/.env`: `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, `JWT_SECRET`.

---

## 8. База даних

Усі таблиці створюються при старті API. Плани upsert-яться щоразу (щоб оновити credits Free).

### 8.1 `users`

`id`, `email` (unique, lowercase), `password_hash`, `name`, `created_at`

### 8.2 `plans`

| id | name | price_gbp (пенс) | monthly_credits |
| --- | --- | --- | --- |
| free | Free | 0 | 200 |
| creator | Creator | 999 (£9.99) | 1 000 |
| pro | Pro | 2499 (£24.99) | 3 500 |
| business | Business | 4999 (£49.99) | 8 000 |

Ціни **провізорні**, поки не виміряно реальну собівартість відео.

### 8.3 `subscriptions`

`user_id`, `plan_id`, `status` (`active` / `canceled`), Stripe ids, `current_period_end`.

При реєстрації: план `free`, status `active`.

### 8.4 `credit_balances`

Один рядок на користувача. `credits` INTEGER.

### 8.5 `credit_transactions`

`amount` (плюс грант, мінус spend), `type` (`grant` / `spend` / `purchase`), `description`, опційно `generation_id`.

### 8.6 `brand_kits`

Один kit на user: `business_name`, `logo_url`, `primary_color`, `secondary_color`, `font`, `tone_of_voice`, `website`, `instagram`.

Якщо після збою реєстрації kit відсутній — створюється при login / `/auth/me`.

### 8.7 `projects`

`type`, `prompt`, `status` (`draft` / `ready`), `current_step`, JSON-поля кроків, `output_url`, `credits_used`.

### 8.8 `ai_generations` (критично для власника)

На кожен AI-запит:

- `user_id`, `project_id`
- `type` (крок: idea, script, …)
- `provider`, `model`
- `actual_cost_gbp`
- `credits_used`
- `status` (`running` / `succeeded` / `failed`)
- `created_at`

Мета: бачити **реальну собівартість** кожного виклику й коригувати credits.

Транзакції SQLite — через SAVEPOINT (щоб вкладені grant/spend не ламали signup).

---

## 9. API

База: `http://localhost:4000`. З Vite — той самий origin через proxy.

Авторизація: `Authorization: Bearer <jwt>` на всіх приватних маршрутах.

| Метод | Шлях | Auth | Опис |
| --- | --- | --- | --- |
| GET | `/health` | ні | `{ ok, product: "auteur" }` |
| POST | `/auth/signup` | ні | `{ name, email, password }` → `{ token, user }` |
| POST | `/auth/login` | ні | `{ email, password }` → `{ token, user }` |
| GET | `/auth/me` | так | user, subscription, credits; гарантує баланс і brand kit |
| GET | `/projects` | так | список проєктів + `fullVideoCost` |
| POST | `/projects` | так | `{ type, prompt }` → 201 `{ project }` |
| GET | `/projects/:id` | так | один проєкт + costs |
| POST | `/projects/:id/steps/:step` | так | `idea` \| `script` \| `visuals` \| `voice` \| `captions` \| `render` |
| GET | `/brand` | так | `{ brandKit }` |
| PUT | `/brand` | так | оновлення полів kit |
| GET | `/billing/plans` | ні | плани + packs |
| GET | `/billing/credits` | так | balance, transactions, generations |
| POST | `/billing/checkout` | так | `{ planId }` або `{ packId }` → `{ mode, url }` |

Типові коди: 400 валідація, 401 сесія, 402 credits, 404 проєкт, 409 email зайнятий, 500 студія.

Формат проєкту в JSON (camelCase на клієнті): `id`, `type`, `prompt`, `status`, `currentStep`, `idea`, `script`, `visuals`, `voice`, `captions`, `outputUrl`, `creditsUsed`, `createdAt`.

Пакети credits:

| id | credits | price |
| --- | --- | --- |
| pack_200 | 200 | £4.99 |
| pack_600 | 600 | £12.99 |
| pack_1500 | 1 500 | £29.99 |

---

## 10. Credits і монетизація

### 10.1 Правило продукту

Користувач купує **credits**, не «токени моделі». Списання прив’язане до кроку пайплайну, не до того, яку модель обрали всередині.

Приклад: 200 на старті → повний Reel −150 → лишається 50.

Free = 200, щоб **один Reel (150) можна було закінчити**. Раніше 100 credits на Free робили продукт неможливим — це виправлено.

### 10.2 Stripe

Якщо `STRIPE_SECRET_KEY` порожній: checkout одразу дає credits / міняє план (studio mode), `mode: "studio"`.

Якщо ключ є: Stripe Checkout, `mode: "stripe"`, успіх/скасування на `/app/billing?success=1`.

Webhook у v1 не обов’язковий для studio mode; для продакшену Stripe — окреме завдання (фаза 2).

### 10.3 Після вимірювання собівартості

Змінювати лише:

- `CREDIT_COSTS`
- `monthly_credits` у `plans`
- `CREDIT_PACKS`

UI підхопить суму 150 як суму кроків, якщо її рахувати з конфіга. Зараз на головному підказка захардкоджена як «150 credits».

---

## 11. Безпека й надійність (поточний рівень)

- Паролі: bcrypt.
- JWT: секрет з env (дефолт лише для local).
- Проєкти читаються тільки свої (`user_id`).
- JSON від моделі парситься з fallback, щоб не валити студію.
- Кольори Brand Kit: лише `#RRGGBB`.
- CORS: localhost і 127.0.0.1:5173.
- Реєстрація в одній транзакції: user + subscription + 200 credits + brand kit.

Не в v1: refresh-token, 2FA, ролі admin, rate limit, мультитенантність команд.

---

## 12. Критерії приймання MVP

- [x] Реєстрація дає 200 credits і пускає в `/app`
- [x] Reel і TikTok створюють проєкт зі студією
- [x] Закриті формати не створюють проєкт
- [x] Шість кроків з кнопками і окремими credits
- [x] Телефон 9:16 показує кадр/текст за сценами
- [x] Повтор кроку не знімає credits вдруге
- [x] 402 при нестачі credits
- [x] Brand Kit зберігається і впливає на генерацію
- [x] Billing показує плани, пакети, лог generations
- [x] Library відкриває старий проєкт
- [x] Без OpenAI ключа пайплайн проходиться preview-контентом
- [ ] MP4-файл і завантаження (не входить у приймання v1)
- [ ] Реальний голос MP3 (не входить у v1)

---

## 13. Майбутнє розширення

Розширювати **шарами**, не новим «меню моделей». Користувач як і раніше пише речення на початку. Система всередині обирає провайдера.

### 13.1 Принцип розширення в коді

Майже завжди три точки:

1. Формат — `FORMATS` у `Home.tsx` + `MVP_READY` / `FORMAT_TYPES` у `pipeline.ts`
2. Кроки — `CREDIT_COSTS` + гілки `runStep` + пігулки Studio
3. AI — `backend/src/services/ai.ts` (або окремі `pipelines/post.ts`, `pipelines/ad.ts`)

Екрани акаунта, credits, Brand Kit, Library **не дублювати**.

Цільова карта пайплайнів:

```
reels/tiktok:  idea → script → visuals → voice → captions → render
post:          idea → copy → image → render
ad:            idea → script → visuals → voice → captions → render  (інший тон + CTA)
youtube:       idea → script → visuals → voice → captions → render  (16:9, довше)
slides:        idea → outline → visuals → render
```

Studio малює кроки з карти формату, не з захардкодженого списку назавжди.

---

### Фаза 2 — «справжній ролик» (наступний логічний реліз)

Мета: з прев’ю зробити файл, який можна викласти в Instagram/TikTok.

| Задача | Деталі |
| --- | --- |
| TTS | ElevenLabs або OpenAI TTS → MP3 з `voice_json.script` |
| Рендер | Remotion або ffmpeg: кадри + голос + burned-in captions, 1080×1920, ~30 с |
| Зберігання | AWS S3 (як у початковій схемі), `output_url` = публічний/підписаний URL |
| Завантаження | Кнопка Download на Ready |
| Собівартість | Писати реальний £ у `ai_generations`; перерахувати credits |

UI студії той самий: 6 кроків, телефон. Міняється лише крок Create і Voice.

Архітектура після фази 2:

```
… → Voice AI (TTS) → Video Renderer → S3 → Final Video
```

Stripe webhook: підтвердження підписки / пакета без studio mode.

---

### Фаза 3 — пости й реклама

Увімкнути картки, які вже на головному:

**Image / Post**

- Кроки: Idea → Copy (текст поста) → Image → Create
- Прев’ю: квадрат 1:1 або 4:5, не телефон 9:16
- Дешевші credits, ніж Reel

**Advertisement**

- Той самий вертикальний пайплайн, але CTA, офер, тон «реклама без вигляду реклами»
- Brand Kit обов’язковий для сильної фішки («ролик одразу в стилі закладу»)

**Social media post**

- Довгий copy + варіанти заголовків + хештеги, без відео

Не відкривати всі формати одночасно. Спочатку один, заміряти usage.

---

### Фаза 4 — Brand Kit як головна перевага

Вже рано в продукті — так і треба. Далі:

- Кілька брендів на акаунт (кав’ярня / другий заклад)
- Завантаження лого (файл, не лише URL)
- Прив’язка tone of voice → конкретний TTS voice id
- Кольори → стиль субтитрів і підкладок
- Лого на фінальному кадрі / ватермарк за бажанням
- Бізнес-план: команда, спільні бренди

Слоган розширення: *Create a Reel promoting my coffee shop* — студія вже знає, як має виглядати бренд.

---

### Фаза 5 — довші формати

- **Video / YouTube:** 16:9, 60–180 с, інші credits
- **Presentations / business:** слайди, не Reels
- Горизонтальний прев’ю-плеєр замість телефону, якщо `type !== instagram_reel|tiktok`

---

### Фаза 6 — платформи й дистрибуція (лише після реального використання)

- React Native (ті самі API)
- Публікація в Instagram/TikTok через офіційні API (не «сірий» постинг)
- Легкий шедулер — окремий модуль, не ядро студії
- Не власний CapCut: максимум trim / swap scene, якщо користувачі просять після Ready

---

### Фаза 7 — операційне

- Xano можна замінити/додати пізніше; зараз Node + SQLite достатньо. Міграція: ті самі таблиці.
- Postgres, коли з’являться команди й обсяг.
- Admin: маржа по `actual_cost_gbp` vs credits, алерти якщо Reel у мінусі.
- i18n (UA/EN), якщо зайдете на локальний ринок.
- Rate limit, черги (Bull/SQS) на довгий рендер.
- Не своя LLM і не crypto.

---

## 14. Рекомендований порядок робіт після v1

1. Виміряти собівартість preview vs live OpenAI на 10–20 роликах.  
2. Фаза 2: TTS + рендер MP4 + S3 + Download.  
3. Увімкнути Stripe webhook і продакшен-ключі.  
4. Відкрити **один** новий формат (пост).  
5. Поглибити Brand Kit (лого-файл, кілька брендів).  
6. Ads / YouTube — лише за фактом утримання користувачів Reels.

---

## 15. Нефункціональні вимоги (орієнтир на ріст)

| Тема | v1 | Далі |
| --- | --- | --- |
| Час кроку Idea/Script | < 5 с preview, < 15 с з GPT | SLA окремо |
| Visuals | секунди (градієнт) або десятки секунд (DALL·E) | черга + прогрес |
| Рендер MP4 | немає | < 2 хв на 30 с ролик |
| Доступність | local single instance | API + worker + S3 |
| Логи | console + `ai_generations` | структуровані логи / Datadog |

---

## 16. Глосарій

| Термін | Значення |
| --- | --- |
| Studio | Екран 6 кроків і телефон |
| Credits | Внутрішня валюта; не токени моделі |
| Brand Kit | Одноразові правила вигляду й тону |
| Studio mode | Checkout без Stripe, credits одразу |
| Preview AI | Відповіді без зовнішнього ключа |
| Ready | Крок Create виконано; у v1 це прев’ю, не обов’язково MP4 |

---

## 17. Відкриті рішення (зафіксувати перед фазою 2)

1. Провайдер TTS і голоси за замовчуванням (British female як у mock).  
2. Рендерер: Remotion vs ffmpeg.  
3. Бакети S3: public vs signed URLs, TTL.  
4. Чи дозволити регенерацію одного кроку за повторну оплату (зараз повтор безкоштовний і не перегенеровує).  
5. Чи лишати ручні кнопки кроків після появи довгого рендеру, чи показати прогрес-бар Create.  
6. Фінальні ціни credits після 2–4 тижнів реальних інвойсів OpenAI/TTS.

---

*Кінець ТЗ. Поточний код у `frontend/` та `backend/` є імплементацією розділів 1–12. Розділи 13–17 — план розширення, не зроблені екрани.*
