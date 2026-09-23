# Технічне завдання: Auteur

**Продукт:** AI Content Creator  
**Репозиторій:** [github.com/aaleksa/AI-CREATER](https://github.com/aaleksa/AI-CREATER)  
**Версія документа:** 1.11  
**Мова інтерфейсу першої версії:** English  
**Валюта:** GBP (£)

Документ фіксує: продуктову рамку, **зафіксовані технічні рішення MVP** (§1.4), **що вже є в коді**, етап **закритої бети** окремо від публічного запуску, і як розширювати далі.

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

### 1.4 Зафіксовані рішення MVP (перший крок, не «перед демо»)

Оцінка термінів і собівартості **невалідна**, поки TTS і рендерер «на вибір». Нижче — прийнятий стек. §15 більше не містить цих пунктів як відкритих.

| Рішення | Вибір | Чому саме так |
| --- | --- | --- |
| **TTS** | OpenAI `tts-1`, голос `nova`, той самий `OPENAI_API_KEY`. Dev без ключа: macOS `say`. Тихий wav — тільки локальний fallback, **не бета і не демо**. | Один уже наявний ключ; не тягнемо другого вендора в MVP. |
| **Рендерер** | **ffmpeg** (`ffmpeg-static`): 1080×1920, H.264 + AAC, кадри (або колір бренду) + голос + SRT. Без Ken Burns, transitions, Remotion. | Найкоротший шлях до відтворюваного файлу. Remotion — ні, доки не потрібен складний motion. |
| **Captions ↔ аудіо** | **Scene-level**, не word-level. Cues зі скрипта, пропорційно підігнані під фактичну тривалість `voice.mp3`. | OpenAI TTS **не віддає word timestamps**. Word-level — окремий API (ElevenLabs alignment) **після бети**, якщо сцена-рівень ламає читабельність. |
| **Де файл** | `backend/data/media/{projectId}/voice.mp3` і `reel.mp4`. Не системний tmp. S3 — не MVP. | Передбачуваний шлях, gitignore `data/`. |
| **TTL / ліміт** | **Диференційовано.** Проміжні `voice.mp3` / кадри / `.srt` — **7 днів**. Готовий `reel.mp4` — **90 днів** (або до S3). Ліміт архіву **залежить від плану** (§5.3), не єдине «10 для всіх». Перед витісненням — попередження в UI, не тихе видалення. На екрані Create: «завантажте зараз». | mp4 дешевший у зберіганні і дорожчий у регенерації (55 cr). 7 днів на все = повторна оплата за вже куплений ролик. |
| **Регенерація** | Повтор `POST` без прапора — **безкоштовний і не викликає AI** (залишити як є). `{ "regenerate": true }` — платно. **Перші 3 спроби** (1 Make + 2 retry) за ціною кроку; далі можна ще, **за 2× credits**, з confirm. Credits до виклику провайдера; якщо AI вже пішов — не повертаються. | Користувач вибирає: лишити / заплатити ще раз. Жорсткий 429 після 3 спроб убиває вибір і retention. 2× криє вендора, коли credits FROZEN. |
| **Idempotency** | Заголовок `Idempotency-Key` (або тіло) на `POST /steps/:step`. Повтор того самого ключа після success — 0 credits, без AI. Паралельний той самий крок — 409. | Подвійний клік / retry браузера не має списувати Voice двічі. |

ElevenLabs як дефолт — **відхилено для MVP**. Перегляд після бети, якщо (а) якість `tts-1` ріже retention або (б) scene-level субтитри неприйнятні.

### 1.5 Закрита бета ≠ публічний запуск

§1.2 і §4.1 забороняють показувати продукт зовні як «готовий Reel» без mp4 — це про репутацію. Собівартість (§9.0) і retention (§11.11) потребують **реальних людей**. Місток:

| Етап | Хто бачить продукт | Навіщо |
| --- | --- | --- |
| Внутрішній MVP | команда | файл збирається, credits, Brand Kit |
| **Закрита бета** | **5–10 запрошених** власників малого бізнесу (салон / кав’ярня / фітнес), інвайт, Free або ручні credits, **без реклами і без публічного «запуску»** | 20–50 реальних mp4 → `actual_cost_gbp`; якісні інтерв’ю; чорновий retention (на n=10 **не** приймати go/no-go по постах) |
| Публічний лендінг | будь-хто | після стабільного файлу, логів бети **і** §10.1 (privacy / content policy) |
| Платний CAC-тест | реклама | перевірка гіпотези §9.5, не змішувати з бетою |

Публічний ads-запуск до закритої бети — заборонений цим ТЗ.

---

## 2. Scope

### 2.1 Розведення: код зараз vs прийнятий MVP

| Блок | У коді зараз | Обов’язково для прийняття MVP |
| --- | --- | --- |
| Лендінг, auth, JWT, 200 free credits | так | так |
| Create: Reel / TikTok / Image Post + промпт | так | так |
| 6 кроків студії, credits, Brand Kit, Library | так | так |
| `ai_generations` (собівартість) | так | так; плюс показ користувачу (§1.3.3) |
| Idea / Script / Visuals / Captions | так (текст + кадри; captions = scene-level) | так; word-level не вимагається в MVP |
| Voice | TTS → `voice.mp3` (`audio_url`); JSON = direction | так; без файлу крок не done |
| Create | ffmpeg → `reel.mp4` 1080×1920, плеєр + Download | так |
| Регенерація кроку / одного кадру | `regenerate` + `sceneId` (8 cr) | так — §7.2–7.3 |
| Видалення акаунта | `DELETE /auth/account` | так для етапу 4; на беті вже є |
| Вертикаль Brand Kit | `salon` / `cafe` / `fitness` | так |
| S3, постійний Download URL, HQ | немає | **не MVP** |
| Закрита бета / публічний лендінг | код є; зовні не запускали | бета §1.5 перед ads |

**Критичне правило:** не показувати продукт *публічно* з обіцянкою «готовий Reel», доки немає файлу. TTS (OpenAI `tts-1`) + ffmpeg — **зафіксовані** (§1.4), не «фаза 2» і не відкритий вибір. Зовнішні *платні* користувачі — після закритої бети (§1.5).

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
| `image_post` | Image / Post | Idea + **4 stills** (JPG), **37 credits**, без voice/mp4 |
| `advertisement` | Advertisement | «Coming after Reels» |
| `social_post` | Social media post | «Coming after Reels» |

`image_post` — виняток з гейту §11.11: додано за явним запитом (картинки, не лише відео). Video / Ad / Social далі заблоковані.

Повідомлення, якщо формат ще не готовий:

> This format is next. Start with a Reel, TikTok, or still images.

---

## 3. Користувацькі сценарії

### 3.1 Щасливий шлях (Reel)

1. Користувач відкриває лендінг, тисне **Start creating**.
2. Реєструється (ім’я, email, пароль ≥ 6 символів) → отримує **200 credits**, план Free, порожній Brand Kit.
3. Бачить «What do you want to create?», обирає **Instagram Reel**.
4. Пише, що хоче створити. **Одне речення зазвичай вистачає**; якщо ні — короткий абзац (офер, адреса, для кого), до 2 000 символів. Не бриф на сторінку і не обов’язок «рівно одне речення».  
   Приклад: `Create a 30-second Reel about the best places to visit in London.`  
   Або довше: `Reel for my salon in Shoreditch. Tuesday walk-ins 20% off. Warm, not salesy. Show the chair, not stock hair.`
5. Відкривається студія. Кроки (кнопка на кожен):
   1. **Idea** (5 cr) — концепція, хук, візуальний напрям;
   2. **Script** (10 cr) — 30 с, 4–6 сцен, текст voiceover;
   3. **Visuals** (40 cr) — кадр на кожну сцену (9:16);
   4. **Voice** (30 cr) — спочатку JSON-інструкція голосу, потім **TTS → аудіо** (див. §6.8);
   5. **Captions** (10 cr) — таймкоди субтитрів;
   6. **Create** (55 cr) — **збірка mp4** + статус `ready`.
6. Разом **150 credits**. Баланс: 200 → 50.
7. Користувач має mp4 на диску, плеєр і Download у студії. Проєкт у Library.
8. Якщо голос або кадр не сподобався — користувач **вибирає**: лишити це (Make повторно = 0 credits, без AI) або **Regenerate** за credits кроку (§7.2). Перші два повтори — звичайна ціна. Далі все ще можна, але **2× credits** і confirm. Не обов’язково новий проєкт.

### 3.2 Brand Kit

Користувач один раз задає бренд. Далі промпт «Create a Reel promoting my coffee shop» вже має кольори, шрифт, тон, Instagram. Після кількох готових роликів Kit має **підхоплювати патерни** з історії (не лише форму) — див. §1.3.

### 3.3 Недостатньо credits

Якщо на кроці не вистачає балансу — 402, текст *Not enough credits. Buy a pack or upgrade your plan.* і посилання на `/app/billing`.

### 3.4 Покупка

- підписка Creator / Pro / Business нараховує місячний пакет (**залучення**);
- Buy credits — разові пакети (**маржа**) — стратегія в §9.4;
- без Stripe-ключа — studio mode (нарахування одразу, тільки для розробки).

### 3.5 Щасливий шлях (Image / Post)

1. На Create обирає **Image / Post**.
2. Пише, що має бути на фото (офер, місце, настрій). Приклад: `A warm photo post for my salon’s Tuesday walk-in offer.`
3. Студія — **2 кроки**, не 6:
   1. **Idea** (5 cr) — концепція каруселі, без скрипта й голосу;
   2. **Pictures** (32 cr max) — **4 квадратні stills** 1:1 (DALL·E `1024x1024`), оплата live × 8, поріг ≥3/4.
4. Разом **37 credits**. `script` / `voice` / `captions` / `render` на цьому типі — 400.
5. JPG пишуться як `still-{sceneId}.jpg`. Прев’ю квадратне. Download кожного кадру. Питання *Would you publish this post?*
6. Без voice, субтитрів і mp4. Готовий артефакт — картинки, не відео.

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

**Landing.** Заголовок-обіцянка, CTA «Create a Reel». Поки немає mp4 — не показувати як готовий продукт. Коли файл є: **закрита бета за інвайтом**, публічний лендінг — окремий етап (§1.5). Copy не зменшувати до «сторіборда».

**Auth.** Ім’я (тільки signup), email, пароль. Помилки зрозумілою мовою.

**Create.** Сітка 6 форматів. Reel / TikTok / Image Post — активні. Video, Ad, Social — «soon». Промпт — від 8 до 2 000 символів. Copy: речення може вистачити; якщо ні — офер, місце, для кого. Reel 150 cr · stills 37 cr.

**Studio.** Reel/TikTok: вертикальний прев’ю 9:16 (після Create — `<video>` з mp4), 6 кроків. Image Post: квадратний прев’ю 1:1, кроки Idea → Pictures, без Voice/Captions/Create. Бриф зверху — textarea, `Save brief` (PATCH, 0 credits); щоб застосувати — regenerate idea. Панель **одного** поточного кроку + `Make {step} · N credits`. Якщо крок уже є — `Not this {step}? Try again · N credits` (idea/script — confirm каскаду). Після 3 спроб кнопка лишається: `Keep this, or another try · 2×`. Кадри з `placeholder: true` видимі: бейдж *Couldn’t generate — regenerate this picture (8cr)*. Після Create (Reel) — Download mp4; після Pictures — Download JPG. **Файл варто завантажити зараз**; проміжні відео-артефакти можуть зникнути через 7 днів, `reel.mp4` і `still-*.jpg` тримаємо 90 днів.

**Brand Kit.** Поля: business name, logo URL, primary/secondary colour (hex), font, tone of voice, website, Instagram, **vertical** (salon / cafe / fitness). Невалідний hex не ламає color picker.

**Billing.** 4 плани, 3 пакети, таблиця вартості кроків (150 = повний Reel, 37 = still post), історія generation. Користувач бачить credits_used і орієнтовну £. Планові £/міс підписати **FROZEN**, доки бета не дасть логи TTS+рендеру.

**Library.** Список проєктів: промпт, тип, статус, credits, дата, наявність файлу. Якщо mp4 ще на диску — посилання в студію. Якщо термін вийшов — статус `expired` і підказка, що Create знову платний. Перед витісненням через ліміт плану — попередження, не тихе зникнення.

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
Text AI  Image AI   TTS
   gpt-4o-mini  DALL·E 3  OpenAI tts-1 (або macOS say у dev)
         │
         ▼
   ffmpeg  →  backend/data/media/{id}/reel.mp4   (1080×1920, без ефектів)
         ▼
   SQLite  (локально)  →  пізніше Xano / Postgres
         ▼
   Stripe (підписки + пакети)
         ▼
   AWS S3 + Download URL   ← НЕ MVP; після стабільного локального файлу + бети
```

### 5.1 Стек зараз

| Шар | Технологія |
| --- | --- |
| Frontend | React 19, Vite 6, React Router 7, TypeScript |
| Backend | Node.js, Express, TypeScript, JWT, bcrypt |
| БД | SQLite (`node:sqlite`), файл `backend/data/auteur.db` |
| AI | OpenAI `gpt-4o-mini` + DALL·E 3 (опційно) |
| TTS | OpenAI `tts-1` / `nova`; dev: macOS `say` |
| Рендер | ffmpeg через `ffmpeg-static`, 1080×1920 |
| Медіа | `backend/data/media/{projectId}/` |
| Платежі | Stripe Checkout (опційно) |

### 5.2 Міграція на Xano

Ті самі таблиці й ендпоінти. Node зараз — робочий еквівалент Xano API.

### 5.3 Політика файлів (до S3)

Проміжні артефакти дешеві в генерації відносно готового ролика; **готовий mp4 або stills — те, за що користувач заплатив.** Не можна ставити їм однаковий короткий TTL.

| Артефакт | TTL | Чому |
| --- | --- | --- |
| `voice.mp3`, `scene-*.jpg`, `captions.srt` | **7 днів** після `updated_at` | можна зібрати mp4 знову з credits, місце на диску |
| `reel.mp4` | **90 днів** після Create, або одразу після успішного S3 | зберігання дешеве; регенерація = 55 cr + залежності |
| `still-*.jpg` | **90 днів** (як mp4) | для Image Post це готовий файл, не проміжний кадр відео |
| Після S3 | локальна копія mp4 можна стерти; рядок проєкту й `output_url` лишаються | |

Ліміт **готових mp4 на диску** — від плану. **TTL 90 днів для mp4 однаковий для Free і Business** — свідомо проста політика; довший архів Business з’явиться разом із S3, не як окремий локальний TTL.

| План | Готових mp4 на диску |
| --- | --- |
| Free | 10 |
| Creator | 30 |
| Pro | 60 |
| Business | 120 |

Витіснення найстарішого mp4 — **тільки якщо** користувач на ліміті **і** підтвердив попередження в UI («найстаріший Reel буде знято з диска; завантажте, якщо ще потрібен»). Без підтвердження Create на ліміті → 409 з текстом, не тихе видалення. Рядок у Library лишається (`expired`, якщо файлу немає).

На екрані Create / Ready обов’язковий copy:

> Download this Reel now. We keep the mp4 for 90 days. Voice and frames may be cleared after 7 days. Recreating after that uses credits again.

### 5.4 Паралельний рендер (відомий ліміт бети)

Один Node-процес, ffmpeg як child process. **Максимум 2 одночасні Create.** Третій і далі чекають у черзі процесу (не 503 одразу). Закриття вкладки **не скасовує** рендер: робота живе на бекенді. Credits за Create резервуються **до** ffmpeg (як інші кроки). Для закритої бети 5–10 людей цього достатньо. Окрема черга (Bull/Redis) — **після бети**, не блокер інвайтів.

**Метрика №1 бети (рендер):** у `ai_generations.meta_json` / колонки `started_at`, `finished_at`, `duration_ms` для кожного кроку; для render ще `queueWaitMs`, `encodeMs`. Якщо середній `queueWaitMs` > 30 с — винести рендер з API-процесу до публічного запуску. Окремо дивитись TTS vs DALL·E vs ffmpeg: захлин може бути в послідовних OpenAI, не в ffmpeg.

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
| idempotency_key | text nullable | унікально з `user_id`, якщо задано |
| started_at, finished_at | datetime nullable | |
| duration_ms | integer nullable | стіна-годинник кроку |
| meta_json | text nullable | `queueWaitMs`, `encodeMs` для render |
| created_at | datetime | |

Правила:

- credits списуються **до** виклику провайдера (резерв). Після успіху Visuals з live < n — повертається різниця до `live × 8`. Якщо провайдер уже викликаний і крок упав — **credits лишаються** (ми вже заплатили OpenAI);
- повторний POST **без** `regenerate` **не тарифікує і не викликає AI**;
- `Idempotency-Key`: повтор success = той самий проєкт, 0 нового spend; `running` = 409;
- паралельний другий Make того ж кроку без ключа = 409;
- `regenerate: true` тарифікує знову і перезаписує артефакт; див. §7.2;
- після 3 спроб на `(project, step)` наступні **дозволені за 2× credits** (`EXTRA_ATTEMPT_MULTIPLIER`), не 429;
- падіння **до** виклику AI → `failed` + refund резерву.

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
| learned_summary_json | text nullable | агрегат §6.9.1; порожньо, поки < 3 ready |
| updated_at | datetime | |

Далі (не блокер першого mp4, але рів): таблиця/поля історії прийнятих роликів для «навчання» Kit.

### 6.8 `projects`

| Поле | Тип | Опис |
| --- | --- | --- |
| id | text PK | |
| user_id | FK | |
| type | text | див. формати |
| prompt | text | речення користувача |
| status | text | `draft` / `generating` / `ready` / `expired` |
| current_step | text | `prompt` / `idea` / `script` / `visuals` / `voice` / `captions` / `create` |
| idea_json | text | |
| script_json | text | |
| visuals_json | text | |
| voice_json | text | **інструкція голосу, не аудіо** |
| audio_url | text nullable | **результат TTS; порожньо = крок Voice ще не завершений для MVP** |
| captions_json | text | |
| output_url | text | **шлях/URL mp4**; прев’ю без файлу ≠ ready для прийняття |
| credits_used | integer | |
| preview_token | text nullable | публічний прев’ю, не постійний Download |
| preview_expires_at | datetime nullable | TTL **7 днів** від останнього Share |
| created_at, updated_at | datetime | |

Поля `idea_json`…`output_url` — **поточна** версія. Історія для навчання Kit — `project_step_versions` (§6.9).

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

**visuals** — масив `{ sceneId, imageUrl, prompt, placeholder? }`. `placeholder: true` = DALL·E відхилив або немає ключа.

**voice_json (інструкція, не медіа).** Назва поля в API можна показувати як `voiceDirection`, щоб ні розробник, ні UI не вважали крок «озвучено».

```json
{
  "voicePreset": "warm_british_female",
  "script": "повний текст для TTS, зліплений зі сцен",
  "notes": "Natural pace. Pause after the hook. Never sound like an ad read."
}
```

У коді крок `voice`: direction JSON (`voicePreset` + `script` + `notes`) → TTS → `audio_url`. Поки файлу немає, крок **не done**.

**captions** — `{ cues: [{ start, end, text }] }` у секундах.

MVP-вирівнювання: **не word-level**. Cues будуються зі сцен скрипта (частки 30 с або фактична тривалість аудіо, пропорційно). Спалити в mp4 через ffmpeg `subtitles=`. Це свідомий компроміс: OpenAI `tts-1` не дає таймкодів слів. Точне «слово = кадр» — post-MVP (ElevenLabs / whisper alignment), не блокер першого файлу і не блокер бети, якщо текст читається.

### 6.9 `project_step_versions` — з причиною відхилення

Кожен успішний крок пише знімок. Попередні `accepted = 0` після regenerate того ж кроку. Без **чому** версію відхилили навчання Kit неможливе.

| Поле | Тип | Опис |
| --- | --- | --- |
| id | PK | |
| project_id | FK | |
| step | text | idea / script / visuals / voice / captions / render |
| scene_id | integer nullable | лише для visuals, коли regenerate одного кадру |
| payload_json | text | знімок |
| accepted | integer | 1 = поточна версія |
| rejection_reason | text nullable | див. §6.11; коли `accepted` переходить у 0 через `regenerate` |
| generation_id | FK nullable | |
| created_at | datetime | |

### 6.9.1 Brand Kit Learning — правило-базований v1 (не ML)

Не тренувати модель. Агрегувати accepted vs rejected + причину в `brand_kits.learned_summary_json` і підмішувати в system prompt як текстові підказки.

**Тригер.** Після кожного **третього** `ready`/`expired` проєкту цього Brand Kit — фонова джоба. Не рахувати живцем на кожен запит. Поки < 3 ready — не рахувати (шум). `other` + note **не** парсити в v1; зберігати для ручного перегляду.

| Крок | Сигнал | Приклад у `learned_summary_json` |
| --- | --- | --- |
| idea | Найчастіша причина відхилення (≥50%) | `"avoid": ["too_salesy"]` |
| script | Медіанна довжина voiceover у accepted vs rejected | `"preferredPace": "concise"` |
| visuals | Частотні слова `prompt` accepted vs rejected | `"visualNotes": "warm natural light, avoid stock-photo look"` |
| voice | `voicePreset` ≥2 ready поспіль без reject | `"preferredVoice": "warm_british_female"` |

```json
{
  "generatedAt": "2026-09-23T12:00:00Z",
  "basedOnProjects": 4,
  "avoid": ["too_salesy"],
  "preferredPace": "concise",
  "preferredVoice": "warm_british_female",
  "visualNotes": "warm natural light, avoid stock-photo look"
}
```

У промпті після статичних полів Kit: блок *Patterns that worked for this business before* — **підказка**, не жорстке правило. У Brand Kit UI: *Auteur has learned from N of your Reels* (`basedOnProjects`).

### 6.10 `project_feedback`

Після готового mp4: *Would you publish this Reel?* `yes` / `edits` / `no` + причини. Не блокер Download. Метрика **publishability** важливіша за «технічно коректний mp4».

### 6.11 Feedback на рівні кроку

Коли користувач тисне *Not this {step}? Try again*, фіксуємо **чому** — сировина для §6.9.1 і продуктових рішень.

#### 6.11.1 `step_feedback`

| Поле | Тип | Опис |
| --- | --- | --- |
| id | PK | |
| project_id | FK | |
| step | text | |
| scene_id | integer nullable | |
| version_id | FK → project_step_versions | яку версію відхилили |
| reason | text | код причини |
| note | text nullable | вільний текст; обов’язковий лише для `other` |
| created_at | datetime | |

#### 6.11.2 Причини (dropdown)

| Крок | Причини |
| --- | --- |
| idea | `wrong_angle` / `too_salesy` / `not_our_audience` / `boring_hook` / `other` |
| script | `too_long_short` / `wrong_tone` / `weak_cta` / `not_our_voice` / `other` |
| visuals | `wrong_style` / `wrong_colors` / `doesnt_match_brand` / `low_quality` / `other` |
| voice | `wrong_pace` / `wrong_tone` / `sounds_robotic` / `wrong_gender_accent` / `other` |
| captions | `bad_timing` / `hard_to_read` / `other` |

`other` вимагає `note`. UI з’являється **опційно** після Regenerate, не блокує дію (Skip).

#### 6.11.3 API

Те саме `POST /projects/:id/steps/:step`:

```json
{ "regenerate": true, "sceneId": 3, "feedbackReason": "wrong_colors", "feedbackNote": "хочемо тепліші тони" }
```

`feedbackReason` необов’язковий. Якщо є — перед регенерацією рядок у `step_feedback` і `rejection_reason` на попередній версії. Окремий ендпоінт не потрібен.

### 6.12 Публічний preview-лінк (не шедулер, не соцмережа)

Власник хоче показати Reel партнеру / бариста / дружині **до** викладу. Це не публікація.

- `POST /projects/:id/share` (JWT) — токен + TTL 7 днів; повторний Share оновлює expiry.
- Сторінка `/preview/:token` (без логіну). Медіа: `GET /share/:token/file` і `/share/:token/image/:sceneId`.
- `GET /projects/:id/preview?token=` — той самий JSON без auth.
- Не постійний Download URL і не S3. Після TTL — 404. Кнопка в студії: *Share a preview*.

Порівняння версій Idea/Script: `GET` проєкту віддає дві останні в `versions`; `POST /projects/:id/versions/{idea|script}/:versionId/restore` ставить обрану `accepted=1`, **0 credits**, каскад як regenerate.

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
| GET | `/projects` | так | список + `fullVideoCost` + `fullImageCost` |
| POST | `/projects` | так | `{ type, prompt }` → 201 `{ project }` |
| GET | `/projects/:id` | так | проєкт + таблиця costs |
| PATCH | `/projects/:id` | так | `{ prompt }` — змінити бриф; credits 0; щоб застосувати — regenerate idea |
| POST | `/projects/:id/steps/:step` | так | `{ regenerate?, sceneId?, idempotencyKey?, feedbackReason?, feedbackNote? }` + `Idempotency-Key`; 20 req/хв |
| POST | `/projects/:id/feedback` | так | `{ publishable: yes\|edits\|no, reasons[] }` після mp4 |
| POST | `/projects/:id/share` | так | preview-лінк, TTL 7д |
| GET | `/projects/:id/preview` | ні | `?token=` — JSON прев’ю |
| GET | `/share/:token` | ні | JSON прев’ю |
| GET | `/share/:token/file` | ні | mp4 прев’ю |
| GET | `/share/:token/image/:sceneId` | ні | JPG прев’ю |
| POST | `/projects/:id/versions/:step/:versionId/restore` | так | idea/script, 0 credits |
| DELETE | `/auth/account` | так | спочатку Stripe `subscriptions.cancel`, потім дані |
| GET | `/projects/:id/file` | так | mp4 після Create |
| GET | `/projects/:id/image/:sceneId` | так | JPG still після Pictures |
| GET | `/projects/:id/audio` | так | mp3 після Voice |
| GET | `/brand` | так | `{ brandKit }` |
| PUT | `/brand` | так | зберегти kit |
| GET | `/billing/plans` | ні | плани + packs (**провізорні**) |
| GET | `/billing/credits` | так | balance, transactions, generations, **economics** (собівартість на готовий Reel) |
| POST | `/billing/checkout` | так | `{ planId? , packId? }` → `{ mode, url }` |

Коди: 400 валідація; 401 токен; 402 credits; 404 проєкт; 409 email **або крок уже running / той самий Idempotency-Key**; 429 rate limit; 500 студія.

### 7.1 Правила пайплайну

Reel / TikTok: idea → script → visuals / voice / captions (потребують script) → render.

Image / Post: idea → visuals (4 stills). `script` / `voice` / `captions` / `render` → 400.

| step | credits | Що вважається успіхом |
| --- | --- | --- |
| idea | 5 | `idea_json` |
| script | 10 | `script_json` (лише відео) |
| visuals | 40 max / **32 max** на пост | кадри; оплата **live × 8**, поріг ≥3/5 відео або ≥3/4 пост (§7.3) |
| visuals *один кадр* | **8** | `{ regenerate: true, sceneId }` |
| voice | 30 | `voice_json` **і** `audio_url` (TTS); немає на `image_post` |
| captions | 10 | cues (scene-level); немає на `image_post` |
| render | 55 | **існує mp4**, `status=ready`; немає на `image_post` |
| **разом Reel** | **150** | |
| **разом Image Post** | **37** | idea 5 + 4×8; `status=ready` після Pictures |

Промпт: `trim`, 8–2000 символів. Одне речення — норма; абзац дозволений.

### 7.2 Регенерація (UX і ціна)

Власник малого бізнесу, якому не зайшов голос або кадр, **не** має єдиним виходом починати новий проєкт — це вбиває retention.

| Дія | Credits | Ефект |
| --- | --- | --- |
| `POST /steps/:step` повторно, крок уже done, **без** `regenerate` | 0 | повернути поточний проєкт, **AI не викликати** |
| `POST /steps/:step` з `{ "regenerate": true }` | ціна кроку; з 4-ї спроби **2×** | новий виклик AI/TTS/ffmpeg, перезапис артефакту |
| `POST /steps/visuals` з `{ "regenerate": true, "sceneId": N }` | **8**; з 4-ї Visuals-спроби **16** | лише цей кадр; mp4 скидається |
| Недостатньо credits | 402 | лишити версію або докупити credits |
| Провайдер викликаний, крок упав | списані | refund немає — запит уже коштував нам грошей |

Каскад після успішної регенерації (наступні кроки знову **не done**, їхні файли/JSON чистяться):

| Перегенеровано | Скидається |
| --- | --- |
| idea | script, visuals, voice+audio, captions, mp4 |
| script | visuals, voice+audio, captions, mp4 |
| visuals | mp4 (повний набір або один `sceneId`; captions лишаються) |
| voice | **captions і mp4** (новий TTS = інша тривалість `voice.mp3`; старі cues, підігнані під попередній файл, роз’їдуться вже на scene-level) |
| captions | mp4 |
| render | лише новий mp4 |

Не сподобалось згенероване — **не** новий проєкт з нуля:

1. Поправити бриф у студії (`PATCH` prompt) → **Regenerate idea** (5 cr, каскад).
2. Ідея ок, текст ні — **Regenerate script** (10 cr).
3. Один кадр — **8 cr**.
4. Голос / субтитри / mp4 — кнопка кроку за тією ж ціною; наступні кроки скидаються.

Кнопка в панелі: *Not this {step}? Try again · N credits*. Після 3 спроб: *Keep this, or another try · 2×*. Confirm на extra.

Користувач завжди може **лишити** поточне (безкоштовно) або **заплатити ще раз**. Новий проєкт — опція, не тупик.

### 7.3 Часткова відмова Visuals

Крок Visuals = пачка кадрів. Повна ціна 40 = 5 × 8. **Не списувати 40, якщо цінність неповна.**

Поріг успіху: **≥ ceil(n × 3/5)** живих кадрів (для 5 сцен = **3**). Нижче порогу (є ключ OpenAI) — крок `failed`, credits **0**.

| Результат | Крок | Credits | Що бачить користувач |
| --- | --- | --- | --- |
| Живих кадрів нижче порогу (ключ є) | `failed` | **зарезервовані 40 лишаються** (вендор уже виставлений) | *We couldn’t generate enough frames (k of n). Try a simpler description.* |
| Живих ≥ порогу, частина placeholder | `succeeded` | **live × 8** (не 40) | Бейдж на кожному placeholder **до Voice** |
| Усі n кадрів живі | `succeeded` | **n × 8** (5 сцен = 40) | Звичайний прев’ю |
| Без ключа (dev) | `succeeded` | 40 | Усі кадри preview, без бейджа policy |

5xx від DALL·E: **один автоматичний retry** на кадр, потім як відмова (placeholder / поріг). 4xx policy — без retry, одразу placeholder.

Успішні API-виклики в пачці, яка впала по порогу, **вже оплачені credits** (резерв не повертається). `actual_cost_gbp` у логу `failed`.

Один кадр після succeeded: **8 credits** за `sceneId`.

---

## 8. AI-пайплайн (рішення системи, не користувача)

Користувач ніколи не бачить назву моделі в UI створення. Це гігієна. Рів — §1.3.

| Крок | З ключами | Без ключів |
| --- | --- | --- |
| Idea / Script / Captions / voice *direction* | `gpt-4o-mini`, JSON | studio preview JSON |
| Visuals | DALL·E 3, 1024×1792 | градієнт-кадри 9:16 |
| Voice *аудіо* | **OpenAI `tts-1` / `nova`** | macOS `say` (dev); тиша — не для бети |
| Create | **ffmpeg** 1080×1920 + SRT | той самий рендер на preview-кадрах |
| Captions | scene-level cues під тривалість аудіо | той самий алгоритм |

Якщо JSON моделі битий — fallback на preview-текст. Credits лише після успішного артефакту кроку.

Brand Kit (і ніша salon/cafe/fitness, якщо задана) завжди в контексті.

Нішеві каркаси: 3 JSON-структури сцен «салон / кава / фітнес» у preview-скрипті вже є; з ключем OpenAI — ті самі вертикалі в system prompt. Користувач пише речення; система підставляє каркас, не меню шаблонів.

---

## 9. Credits і монетизація

### 9.0 Заморозка цифр

Усі £ у цьому документі й у UI (**Creator £9.99, пакети £4.99 / £12.99 / £29.99, 150 credits за Reel**) пораховані на пайплайні **без TTS і рендеру**.

**Статус: FROZEN до виміру собівартості повного MVP-пайплайну (текст + картинки + TTS + mp4) на закритій беті (§1.5), не на внутрішніх 2–3 роликах команди.**

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

Стратегія §9.4 **неперевірювана**, поки рахуємо лише `actual_cost_gbp` за Reel. Рентабельність бізнесу = CAC / LTV / churn. Нижче — **робочі гіпотези**, не факти. Їх треба підтвердити або вбити на закритій беті та першому ads-тесті. Без цього «підписка = залучення» лишається внутрішньою логікою.

### 9.5 Бізнес-економіка (гіпотези, щоб §9.4 було чим перевірити)

Цифри **не для інвестора як факт**. Статус: HYPOTHESIS, поруч із FROZEN на прайсі.

| Метрика | Гіпотеза v1 | Як перевірити |
| --- | --- | --- |
| **CAC** власника малого бізнесу (UK, Instagram/Facebook) | Закрита бета: **£0** (інвайт). Платний тест: **£25–40 за користувача, який дійшов до першого mp4** (не за клік і не за signup) | Одна кампанія ≥ £300 spend **після** бети; рахувати cost / completed Reel, не / landing visit |
| **Reels / місяць** на активного | **4** (раз на тиждень — реалістичний «регулярний контент» кав’ярні/салону; не 30) | Медіана готових mp4 на юзера за 28 днів у беті та після запуску |
| **Тривалість підписки** | **2 місяці** медіана, якщо < 2 Reel/міс; **≥ 4 місяці**, якщо ≥ 4 Reel/міс | Stripe `current_period_end` + churn після webhook |
| **LTV (грубо, Creator)** | £9.99 × 3 міс ≈ **£30** до відтоку. Якщо CAC £30 — підписка **сама себе не окупає**; маржа має сидіти в пакетах і в тому, що Free не рекламуємо в ads | Порівняти CAC з LTV після ≥ 40 платних спроб |
| **Churn-сигнал** | Немає другого проєкту за 14 днів після першого mp4 → з високою ймовірністю не продовжить (зв’язок із §11.11) | Той самий когортний звіт |

Правило перевірки §9.4: якщо після ads-тесту **CAC ≥ LTV підписки** і пакети не докуповують — стратегія «підписка дешева для звички» провалена; не масштабувати ads, підняти Creator або звузити канал до інвайту/партнерств. Якщо CAC £25 і людина робить 4 Reel/міс на Creator — стратегія жива.

Собівартість генерації (§9.0) лишається окремим інваріантом: credits кроку ≥ 3× `actual_cost_gbp`. Це **маржа на Reel**, не заміна CAC/LTV.

### 9.6 Собівартість успішного Reel (не лише готових файлів)

`actual_cost_gbp` на один `status=ready` проєкт **недостатньо**. У `GET /billing/credits` → `economics`:

- text / image / tts / render;
- **failed** (виклики, що впали після провайдера);
- **retries** (повторні виклики того ж кроку);
- **total**;
- `readyReels`;
- `costPerReadyReelGbp` = total / ready (failed і regenerate входять у чисельник).

На billing: «Estimated API cost to us, not the price you pay.» 150 credits — внутрішня одиниця, не «ціна Reel для людини».

---

## 10. Безпека й нефункціональні вимоги

- пароль ≥ 6 символів, hash bcrypt;
- JWT secret з env у проді;
- `.env`, `*.db`, `node_modules`, `data/` не в git;
- лише свої projects / brand / credits;
- hex `#RRGGBB`;
- мережева помилка **не** розлогінює (тільки 401);
- CORS: `APP_URL`, localhost:5173, 127.0.0.1:5173;
- UI web, desktop-first;
- паралельний ffmpeg — §5.4.

### 10.1 Контент, бренди, privacy (блокер публічного лендінгу, не бети)

Закрита бета 5–10 інвайтів може йти без публічної privacy policy. **Етап «Публічний лендінг» (§1.5 / §12) заборонений**, доки немає:

1. **Content policy / відмова моделі.** TTS або Visuals нижче порогу §7.3 — `failed`, людський текст. Credits **не** повертаються, якщо провайдер уже викликаний. Частковий успіх ≥ порогу — `live × 8`, placeholder з бейджем **до Voice**.
2. **Чужі знаки.** Brand Kit — відповідальність користувача: лого/назва, які він вводить, вважаються його. Короткий disclaimer на Brand і на signup (не юридичний трактат). Перевірка товарних знаків автоматично — **не MVP**.
3. **GDPR / UK GDPR.** Перед публічним запуском: privacy policy, підстава обробки, **self-service `DELETE /auth/account`**. Перед стиранням рядків: якщо є `stripe_subscription_id` — **`subscriptions.cancel` у Stripe**, потім видалення проєктів/медіа/brand/credits/email. Інакше Stripe продовжить списувати картку. Ручне видалення адміном — запас для бети 5–10, не заміна ендпоінта.

---

## 11. Критерії приймання MVP

**Функціональні (без них продукт не демоїти як Reel):**

1. Новий користувач реєструється і бачить 200 credits.
2. Можна створити Reel з промптом і пройти всі 6 кроків → **на диску/за запитом є відтворюваний mp4 ~30 с 9:16** (не лише прев’ю в DOM).
3. Крок Voice не вважається done без аудіофайла (`audio_url`).
4. Після повного шляху баланс = 50 (при вартості 150), у Library статус ready **і** файл.
5. Повторний Idea **без** `regenerate` не списує 5 credits і **не викликає AI**; **з** `regenerate` — списує і каскадить; 4-та спроба Idea — **10 credits (2×)**, не 429 (§7.2).
6. Video / Ad / Social post не створюють проєкт. **Image / Post створює** (Idea + 4 stills, 37 cr; `GET /projects/:id/image/:sceneId`).
7. Brand Kit зберігається і впливає на Idea (включно з vertical).
8. На billing видно generation (provider, credits_used, £) **користувачу**.
9. Без платних ключів шлях для розробки не падає; **закрита бета і зовнішнє демо — тільки з TTS+рендером** (не `say`-тиша як «голос»).
10. `GET /health` = 200. `GET /projects/:id/file` віддає mp4, коли файл є.

**Утримання (інакше «успіх MVP» суб’єктивний; фазу постів не починати):**

11. Не менше **30% користувачів, які закінчили перший Reel (є mp4), створюють другий проєкт протягом 14 днів.**
12. Вибірка:
    - **n = 20** з першим файлом — **слабкий сигнал**. На цьому розмірі **не** приймати go/no-go лише по відсотку (6 людей; 1–2 випадковості = ±15–20 п.п.). Обов’язково **≥ 5 якісних розмов** (що не зайшло в голосі/кадрі/ціні). Рішення «продовжувати бету / різати фічу» — число **плюс** фідбек.
    - **Хард-гейт наступного формату** (пост/реклама): §11.11 виконано на вибірці **≥ 40** користувачів з готовим першим mp4 — не на реєстраціях без файлу, не на n=10 закритої бети.

13. Регенерація Voice або Visuals доступна в UI і тарифікується; єдиний шлях «новий проєкт» **не** є прийнятим UX.
14. Після mp4 в студії є питання *Would you publish this Reel?* (yes / edits / no). Відповідь не обов’язкова для Download, але збирається на беті. **Publishability** — окремий KPI від «файл зібрався».

---

## 12. Дорожня карта

Документ дисциплінує себе: **нові формати чекають retention-гейт n≥40**. Нижче — що вже в скоупі бети vs що за гейтом.

**Уже зараз (без нового формату; підсилює retention і publishability):**

1. Brand Kit learning (§6.9.1) — **є**.
2. Feedback на рівні кроку (§6.11) — **є**.
3. Публічний preview-лінк (§6.12) — **є** (показати партнеру, не викласти).
4. Порівняння двох останніх Idea/Script і restore без credits — **є**.

**Етапи доступу (як було):** закрита бета 5–10 → чекпоінт собівартості → privacy/delete → публічний лендінг → CAC-тест → гейт §11.11.

**Після §11.11 на n≥40, за цінністю (не хронологією старого списку):**

1. Image Post → карусель із текстом на слайдах (не лише 4 stills).
2. Word-level captions (ElevenLabs alignment) — раніше YouTube, бо ріже publishability.
3. Advertisement / generic Video.
4. S3, upload лого, YouTube / презентації.

**Не в скоупі зараз:** шедулер публікації. Окрема дешева перевірка пізніше — **нагадування створити** наступний Reel (email/push), не шедулер викладу; атакує гіпотезу 4 Reels/міс (§9.5).

---

## 13. Локальний запуск

```bash
cd backend && cp .env.example .env && npm install && npm run start
cd frontend && npm install && npm run dev
```

Відкрити [http://localhost:5173](http://localhost:5173).

Опційно: `OPENAI_API_KEY` (текст, DALL·E, **і TTS `tts-1`**), `STRIPE_SECRET_KEY`, `JWT_SECRET`, `APP_URL`. Окремий ключ TTS не потрібен.

---

## 14. Глосарій

| Термін | Значення |
| --- | --- |
| Studio | екран 6 кроків одного проєкту |
| Preview / auteur-studio | локальна генерація без платних API |
| Voice direction | JSON-інструкція голосу (`voice_json`); це ще не озвучка |
| TTS | OpenAI `tts-1` → `audio_url` / `voice.mp3` |
| Scene-level captions | субтитри по сценах скрипта, не по словах |
| Credits | внутрішня валюта, не крипта |
| Brand Kit | профіль вигляду й тону; має еволюціонувати з історії |
| Ready (прийняття) | Reel: є mp4 на диску, credits за render списані. Image Post: є `still-*.jpg` (або live visuals), credits за Pictures списані |
| Expired | рядок у Library є, файлу на диску немає |
| Frozen price | £ у документі, до виміру собівартості на беті |
| FROZEN | не орієнтир для продакшен-прайсу |
| HYPOTHESIS | CAC/LTV/churn у §9.5 — до ads-тесту |
| Закрита бета | 5–10 інвайтів, не публічний запуск |
| Regenerate | платний повтор; 1 Make + 2 retry за ціною кроку, далі 2× якщо користувач вибирає ще; POST без прапора — безкоштовний і без AI |
| Publishability | чи людина виклала б цей Reel; не те саме, що «mp4 зібрався» |
| Idempotency-Key | повтор того самого кліку не списує credits вдруге |

---

## 15. Що лишається відкритим (не стек)

TTS, ffmpeg, TTL, регенерація, часткові Visuals, self-service delete, ліміт ffmpeg, idempotency кроків, publishability, economics на billing — **закриті в коді / ТЗ**. Нижче чекпоінти:

1. Перерахунок `CREDIT_COSTS` / планів після **20–50 роликів закритої бети** за **cost per successful Reel** (§9.6), не лише сума succeeded.
2. Чи scene-level captions достатні, чи після бети брати ElevenLabs заради word-timestamps.
3. Чи гіпотеза CAC £25–40 жива після першого ads-тесту (§9.5) — якщо ні, не масштабувати рекламу.
4. Точна дата публічного лендінгу — після бети **і** §10.1 (privacy/content + delete), не навпаки.
5. Чи черга з 2 ffmpeg тримає бету; якщо середній `queueWaitMs` > 30 с — винести рендер з API-процесу до публічного запуску.
6. Три питання долі продукту: **чи публікують Reel**; **чи є другий за 14 днів (≥30%, n≥40)**; **чи додатна unit-економіка з failures+retries**. Нові формати — тільки якщо всі три не провалені.

---

## 16. Технічні ризики MVP (P0 / P1)

Не переписувати продуктову логіку. Це контракт для розробки до закритої бети.

**P0 — у бета-коді або жорстко до публічних платних:**

1. Idempotency AI/credits (`Idempotency-Key`) — **є**.
2. Резерв credits до провайдера — **є**.
3. Статус проєкту `draft | generating | ready | expired`; крок `running` у `ai_generations` — **є**.
4. Render не скасовується закриттям вкладки; лог `queueWaitMs` / `encodeMs` — **є**.
5. TTL-job проміжних 7д / mp4 90д — **є**.
6. JWT expiry (14д) + 401 не з мережі — **є**.
7. Authorization на project/file/audio — **є**.
8. Concurrent той самий крок — 409 — **є**.
9. Stripe webhook idempotency — **до публічних підписок**, не блокер інвайт-бети без Stripe.
10. Rate limit 20 POST steps / хв / юзер — **є**.

**P1 — одразу після стабільного mp4, раніше нових форматів:**

11. Brand learning з `project_step_versions` + `step_feedback` + `learned_summary_json` — **є** (§6.9.1, §6.11).
12. Beta dashboard: queue wait, cost per ready Reel, publishability %.
13. S3.
14. Окрема черга рендеру, якщо §5.4 червона.

**P2:** ElevenLabs, Remotion, mobile, scheduler, YouTube, team, voice clone, batch, agency, crypto — заборонені, доки §11.11 на n≥40.

Три питання, без яких не додавати формати:

1. Люди отримують Reel, **який хочуть викласти** (publishability), не лише коректний mp4.
2. ≥30% з першим mp4 роблять другий проєкт за 14 днів (n≥40 для хард-гейту).
3. Собівартість **доставленого** Reel (TTS + кадри + render + failed + regenerate) лишає маржу.
