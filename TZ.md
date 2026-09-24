# Технічне завдання: Auteur

**Продукт:** AI Content Creator  
**Репозиторій:** [github.com/aaleksa/AI-CREATER](https://github.com/aaleksa/AI-CREATER)  
**Версія документа:** 1.27  
**Мова інтерфейсу:** English і українська (перемикач EN / УК, зберігається в браузері)  
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
| Дитячий мульт / «свій герой-кролик» | сценарій на 2–5 хв, 8–10 сцен, діалоги, Leonardo / Canva / ElevenLabs / CapCut — інший продукт | ніколи як ядро v1; не плутати з рухом у Reel (§12.1) |

Це свідомо звужує roadmap: **batch-генерація, мультиакаунт клієнтів, «мій голос як інфлюенсер», дитячий мультконвеєр — не робити зараз.**

### 1.2 Що вважається успіхом MVP

Користувач (власник малого бізнесу) заходить → обирає **Коротке відео** → пише одне речення → проходить 6 кроків → **отримує готовий 30-секундний вертикальний відеофайл (mp4)** для Instagram або TikTok → credits списані → в логах є собівартість кожного AI-виклику.

«Студійний прев’ю без файлу» **не** є успіхом MVP. Це генератор сторібордів. Поки немає TTS + базового рендеру — продукт не показувати зовнішнім користувачам як «готовий Reel».

Якщо цим реально користуються повторно (див. критерії в §11) — далі пости, реклама, YouTube.

### 1.3 Рів (чому це не ще один шар над OpenAI)

Саме по собі «система вибирає модель / голос / стиль» — уже роблять HeyGen, Fliki, Predis. Це **гігієна**, не рів. Копіюється за тиждень.

Справжній рів Auteur — три речі, які треба закладати в продукт, не лише в голові:

1. **Brand Kit, який навчається.** Не тільки hex і тон у формі. Після 2–3 роликів система дивиться попередні Reels цього бізнесу (хуки, темп, слова, кадри, що користувач не відхилив) і підкручує наступні. Статичні кольори — v1-мінімум; навчання з історії — обов’язковий напрям одразу після першого mp4, інакше Kit = таблиця з CSS.
2. **Вузька ніша малого бізнесу, не генераліст.** Готові сценарні каркаси під салони, кав’ярні, фітнес (не маркетплейс на 100 шаблонів, а 3 вертикалі). Генералістські конкуренти цього не роблять добре.
3. **Прозора собівартість** — у БД (`ai_generations`). На беті таблицю викликів **ховаємо** (`SHOW_AI_COST_LOG=false` у Billing): це внутрішня цифра, не екран салону. API `/billing/credits` усе одно віддає generations. Показати знову — коли бета попросить, не зараз.

Без цих трьох пунктів продукт — прошарок над чужим API.

### 1.4 Зафіксовані рішення MVP (перший крок, не «перед демо»)

Оцінка термінів і собівартості **невалідна**, поки TTS і рендерер «на вибір». Нижче — прийнятий стек. §15 більше не містить цих пунктів як відкритих.

| Рішення | Вибір | Чому саме так |
| --- | --- | --- |
| **TTS** | OpenAI `tts-1`, голос `nova`, той самий `OPENAI_API_KEY`. Dev без ключа: macOS `say`. Тихий wav — тільки локальний fallback, **не бета і не демо**. | Один уже наявний ключ; не тягнемо другого вендора в MVP. |
| **Рендерер** | **ffmpeg** (`ffmpeg-static`): 1080×1920, H.264 + AAC, кадри (або колір бренду) + голос + SRT. Без Ken Burns, transitions, Remotion. Рух у кадрі — **після бети**, §12.1 (Kling), не в MVP. | Найкоротший шлях до відтворюваного файлу. Remotion — ні. «Реальний рух» ≠ Ken Burns. |
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
| Лендінг, auth, JWT, 400 free credits | так | так |
| Create: Short video / Image Post + промпт | так | так |
| 6 кроків студії, credits, Brand Kit, Library | так | так |
| `ai_generations` (собівартість) | так (API) | так у логах. UI на Credits **схований** |
| Idea / Script / Visuals / Captions | так. Visuals **потребують** `OPENAI_API_KEY` (інакше 400). Captions = scene-level | так; word-level не вимагається в MVP |
| Voice | TTS → `voice.mp3` (`audio_url`); JSON = direction | так; без файлу крок не done |
| Create | ffmpeg → `reel.mp4` 1080×1920, плеєр + Download | так |
| Регенерація кроку / одного кадру | `regenerate` + `sceneId` (8 cr) | так — §7.2–7.3 |
| Видалення акаунта | `DELETE /auth/account` | так для етапу 4; на беті вже є |
| Вертикаль Brand Kit | `salon` / `cafe` / `fitness` | так |
| S3, постійний Download URL, HQ | немає | **не MVP** |
| Закрита бета / публічний лендінг | код є; зовні не запускали | бета §1.5 перед ads |
| `poster.ts` / compose | файл є, **не** в пайплайні | не підключати; картинка = відповідь OpenAI |
| Поля флаєра в Studio | код без UI | не потрібні: текст уже на JPG |

**Критичне правило:** не показувати продукт *публічно* з обіцянкою «готовий Reel», доки немає файлу. TTS (OpenAI `tts-1`) + ffmpeg — **зафіксовані** (§1.4), не «фаза 2» і не відкритий вибір. Зовнішні *платні* користувачі — після закритої бети (§1.5).

Що лишається *після* прийняття MVP (коли файл уже є):

- завантаження в AWS S3;
- кнопка Download з постійним URL;
- вища якість / стабілізація / музика;
- Stripe webhook, коли з’явиться публічний checkout (зараз без ключа — **403**, не studio-grant).

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

### 2.3 Формати на Create — що є і що буде

На екрані Create п’ять карток. Власник обирає **намір** (що хоче отримати). Модель, голос і вендора він **не** обирає.

**Працюють зараз дві.** Три інші показують «скоро» і проєкт не створюють.

> This format is next. Start with a short video or still images.

TikTok окремою карткою немає: той самий файл, що й Коротке відео. Старі проєкти `tiktok` = той самий пайплайн.

#### Що спільне для всіх кнопок

Один стек. Кнопки відрізняються лише тривалістю, розміром кадру і текстом сценарію.

| Навіщо | Зараз у коді | Потім, після бети |
| --- | --- | --- |
| Текст, ідея, сценарій | OpenAI `gpt-4o-mini` | те саме |
| Картинка | OpenAI `gpt-image-2.5-sunburst` | те саме |
| Голос | OpenAI `tts-1` (голос `nova`) | те саме |
| Збірка ролика | ffmpeg | те саме |
| Рух у кадрі | **немає** — картинка стоїть | **Kling**: бере вже готову картинку сцени і робить з неї короткий кліп 5–8 с. Потім ffmpeg склеює кліпи + наш голос |

Зараз у коді **немає** Kling, Runway, Veo, Seedance і ElevenLabs як голосу.

**Як з’явиться рух.** Не нова кнопка «Animate». Власник як і зараз тисне Коротке відео (або пізніше Рекламу / Відео). Після картинок система сама віддає кадр у Kling. Імена моделей на екрані не показуємо.

Kling також уміє зробити відео одразу з тексту, без картинки. **Цього не беремо першим:** тоді зникне крок з кадрами, Brand Kit на фото не втримається, сцени роз’їдуться. Свій звук Kling вимикаємо — голос у нас уже є. Довгий ролик Kling одним шматком не робить (зараз до ~15 с за виклик), тому 30 с чи 90 с = кілька сцен, склеєних у нас.

#### Чотири кнопки простими словами

**1. Коротке відео** (`instagram_reel`) — **вже працює**, 150 credits.

Для стрічки Instagram / TikTok. Власник пише речення на кшталт «30 секунд про атмосферу салону». На виході вертикальний ролик ~30 с (`reel.mp4`, 1080×1920): 4–6 картинок + голос + субтитри.

Після бети, якщо «просто картинки» мало хто хоче викладати — ті самі картинки оживить Kling. Кнопка не змінюється.

**2. Картинка / пост** (`image_post`) — **вже працює**, 13 credits.

Без голосу і без відео. Один JPG **цілком з OpenAI** (фото, запрошення, інфо, офер). Ми нічого не накладаємо. Kling не потрібен.

**3. Реклама** (`advertisement`) — **заглушка**. Окрема кнопка, не зливається з Коротким відео.

Для платного просування: «хочу клієнтів». У брифі мають бути офер або товар і для кого. Без цього система просить уточнити, не вигадує знижку. На виході короткий рекламний ролик 15–30 с (`ad.mp4`), частіше 9:16 або 1:1.

Технологія та сама: GPT → картинка OpenAI → `tts-1` → ffmpeg. Рух — той самий Kling, коли він уже живий на Короткому відео. Seedance — лише пізніше, якщо треба товар з кількох референс-фото. Credits перерахувати **до** відкриття кнопки.

**4. Відео** (`video`) — **заглушка**. Окрема кнопка, не «увімкнути рух» і не заміна Короткого відео.

Для ролика не в Reel: сайт, YouTube, екран у залі. Історія «як у нас фарбують / варять каву», без жорсткого оферу. На виході 45–90 с, часто 16:9 (`video.mp4`, 1920×1080).

Технологія та сама, лише більше сцен (8–12) і ширший кадр. Не Kling «з промпту на всю хвилину»: він не робить 90 с за раз, і ми втратимо свої картинки. Credits перерахувати **до** відкриття: сцен і картинок більше.

**5. Пост у соцмережі** (`social_post`) — теж заглушка. Поки не розписуємо: картинку вже закриває кнопка 2.

#### Що не плутати

- **Відео** ≠ рух. Рух буде всередині вже обраного формату, спочатку в Короткому відео.
- **Реклама** ≠ Коротке відео зі словом «знижка». Інший сценарій (офер → заклик записатися) і інший файл.
- Дві заглушки **не зводити** в одну картку. Інакше незрозуміло, що тиснути, і не зійдуться credits.
- Не віддавати фініш у CapCut / Canva.

#### Коли відкривати заглушки

1. Закрита бета: лише Коротке відео (сторіборд) і Картинка.
2. Якщо після 20–50 роликів картинок мало — Kling на **Коротке відео** (§12.1). Спочатку перерахувати credits: рух дорожчий за кадр.
3. Гейт §11.11 (щонайменше 40 людей з першим готовим mp4).
4. Відкрити **Рекламу**.
5. Потім відкрити **Відео**.

`image_post` уже відкритий як виняток (явний запит: не лише відео).

---

## 3. Користувацькі сценарії

### 3.1 Щасливий шлях (Reel)

1. Користувач відкриває лендінг, тисне **Start creating**.
2. Реєструється (ім’я, email, пароль ≥ 6 символів) → отримує **400 credits**, план Free, порожній Brand Kit.
3. Бачить «What do you want to create?», обирає **Коротке відео**.
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
6. Разом **150 credits**. Баланс: 400 → 250.
7. Користувач має mp4 на диску, плеєр і Download у студії. Проєкт у Library.
8. Якщо голос або кадр не сподобався — користувач **вибирає**: лишити це (Make повторно = 0 credits, без AI) або **Regenerate** за credits кроку (§7.2). Перші два повтори — звичайна ціна. Далі все ще можна, але **2× credits** і confirm. Не обов’язково новий проєкт.

### 3.2 Brand Kit

Користувач один раз задає бренд. Далі промпт «Create a Reel promoting my coffee shop» вже має кольори, шрифт, тон, Instagram, і якщо є — **лого та 2–3 фото** (зал / людина / товар). Після кількох готових роликів Kit має **підхоплювати патерни** з історії (не лише форму) — див. §1.3.

### 3.3 Недостатньо credits

Якщо на кроці не вистачає балансу — 402, текст *Not enough credits. Buy a pack or upgrade your plan.* і посилання на `/app/billing`.

### 3.4 Покупка

- підписка Creator / Pro / Business нараховує місячний пакет (**залучення**);
- Buy credits — разові пакети (**маржа**) — стратегія в §9.4;
- без `STRIPE_SECRET_KEY` checkout **закритий**: кнопки Choose / Buy сховані, `POST /billing/checkout` → **403**. Credits на беті — Free 400 або вручну. Studio-grant (нарахувати план без Stripe) **прибрано**.

### 3.5 Щасливий шлях (Image / Post)

1. На Create обирає **Image / Post** — **один** формат, не окремі продукти «фото / запрошення / інфо».
2. Опційно обирає **what kind of post** (`image_intent`):
   - **Just a photo** — настрій, місце, хто на кадрі;
   - **Invitation** — що за івент, коли, де;
   - **Information** — факт (години, зміна, нагадування);
   - **Offer** — офер, коли діє, для кого.
   Чип **не** новий `type`. Промпт картинок завжди з повного брифу — не шаблон «одна атмосфера».
3. Пише бриф. Можна довгий: що показати, яка інформація, програма. Приклади: photo `A quiet morning table at my café.`; invite повний текст івенту з годинами; info `Closed Monday 6 May.`; offer `Tuesday walk-in offer.`
4. Студія — **2 кроки** (13 credits разом). `script` / `voice` / `captions` / `render` — 400.
   1. **Idea** (5 cr). Концепція. Для **invite** ще `invite_json` (факти з брифу; на картинку не йде).
   2. **Pictures** (**8 cr**) — один запит в OpenAI, один готовий JPG. Модель малює **всю** сторінку: фото і, якщо треба, слова. Ми **не** складаємо шар. Можна перезняти цей кадр.
5. Download `still-1.jpg`. *Would you publish?* і *Share* **сховані**.
6. Без voice і mp4.

### 3.6 Картинки — як є

Для **photo, invite, info, offer** одне й те саме: Pictures віддає **повний знімок з OpenAI**. Окремого фону і нашого тексту немає і **не плануємо** в цьому документі.

| Kind | Idea | Pictures | Файл |
| --- | --- | --- | --- |
| **photo** | концепція | OpenAI, **1:1** | `still-1.jpg` = відповідь моделі |
| **invite** | концепція + `invite_json` (лише в БД) | OpenAI **1024×1536**: флаєр цілком, літери в пікселях | той самий JPG |
| **info / offer** | концепція, без `invite_json` | те саме: факт / офер малює модель | той самий JPG |

Власник пише бриф, тисне Idea → Pictures, завантажує JPG. Полів «дата / адреса» на екрані немає. `PATCH /invite` пише JSON і **не** перемальовує файл.

`poster.ts` (`composeInvitePoster` тощо) у репо є, пайплайн його **не** кличе. Не підключати, поки явно не змінять цей параграф.

Кадри **Короткого відео** — інше: промпт просить фото без літер; слова — голос і SRT.

---

## 4. Екрани (15)

Усі приватні екрани — у спільному layout: логотип **Auteur**, навігація Create / Library / Brand kit / Credits. Сайдбар знизу окремими блоками: кредити (лінк на Billing) → EN/УК → ім’я + план → Sign out.

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
| 14 | Лог AI-вартості | той самий billing; **схований** | JWT / API |
| 15 | Library | `/app/library` | JWT |

Кроки 5–10 — один маршрут студії з прогрес-баром, не окремі URL.

### 4.1 Вимоги до екранів

**Landing.** Заголовок-обіцянка, CTA «Create a Reel». Поки немає mp4 — не показувати як готовий продукт. Коли файл є: **закрита бета за інвайтом**, публічний лендінг — окремий етап (§1.5). Copy не зменшувати до «сторіборда». Перемикач **EN / УК** на лендінгу, auth і в сайдбарі; вибір у `localStorage` (`auteur.lang`). Бриф і відповідь AI лишаються мовою запиту.

**Auth.** Ім’я (тільки signup), email, пароль. Помилки зрозумілою мовою.

**Create.** Сітка 5 форматів — **§2.3**. **Коротке відео** / Картинка — активні. **Відео** і **Реклама** — окремі заглушки, не одна кнопка. Social — теж «soon». TikTok окремим чіпом **не** показуємо. Промпт — від 8 до 2 000 символів. Copy: речення може вистачити; якщо ні — офер, місце, для кого. Reel 150 cr · Image / Post 13 cr. Перемикач **Use brand kit / Ignore** (`use_brand`, дефолт так): з брендом у промпт картинки йдуть назва, кольори, шрифт, тон, ніша, **лого і опційні фото** (зал / людина / товар); без бренду — лише бриф. Те саме в студії — regenerate, щоб застосувати. UI показує, які поля кіту підуть на картинку.

**Studio.** Коротке відео: вертикальний прев’ю 9:16 (після Create — `<video>` з mp4), 6 кроків. Image Post: **photo** — 1:1. **invite / info / offer** — прев’ю **2:3** `contain`. На екрані JPG з OpenAI цілком. Полів флаєра немає; `PATCH …/invite` лише JSON. Зверху лише **Бриф** (textarea), `Save brief` (PATCH, 0 cr) і `Copy brief` (з fallback, якщо браузер блокує clipboard). Рядок `image post · …` і нагадування «кіт N% — додайте лого» **не показуємо** (лого опційне). На Create — список збережених брифів, клік вставляє. Після Pictures: Download JPG; takes поруч; *Share* і *Would you publish?* **сховані** (`SHOW_SHARE_AND_PUBLISH`). Панель **одного** поточного кроку + `Make {step} · N credits`. Якщо крок уже є — `Not this {step}? Try again · N credits` (idea/script — confirm каскаду). Після 3 спроб: `Keep this, or another try · 2×`. Кадри з `placeholder: true` видимі. **Файл варто завантажити зараз**; проміжні відео-артефакти можуть зникнути через 7 днів, `reel.mp4` і `still-*.jpg` тримаємо 90 днів.

**Brand Kit.** Дві групи: *How it looks & sounds* (кольори, шрифт, тон-чипси + optional note) і *About your business* (ім’я, **upload лого**, **до 3 опційних фото** — зал / людина / товар, vertical, сайт, Instagram) — друге опційне, **не** блокер Create. Vertical: salon / café / fitness / **other** + вільний текст; мікрокопі: лише каркас сцен, не обов’язково. Жива прев’ю-картка (CSS, 0 AI). Індикатор «Brand kit N% complete — …» (фото в % **не** входять — не нагадувати). Learned-картка зверху + **Reset learning**. Лого: `POST /brand/logo` — **max 2 MB, лише PNG/JPEG**, SVG заборонено; `DELETE /brand/logo` стирає лише лого, не фото. `GET /brand/logo` — файл, `nosniff`. Фото: `POST/DELETE/GET /brand/ref/{place|people|product}` — той самий ліміт. Якщо `use_brand=1` — лого і наявні фото **йдуть в промпт** Idea/Script/Pictures; для gpt-image ще як референс (`images.edit`), інакше лише текст. Під лого — вибір **«фото без лого» / «поставити на фото»** (`logo_on_photos`, дефолт ні): власник не мусить писати це в брифі. Запрошення / інфо / офер можуть показати знак на сторінці в будь-якому разі. Disclaimer: назва / лого / фото — його; людей лише за згодою.

**Billing.** 4 плани (поточний виділено, `yourPlan`), 3 пакети з £, таблиця кроків 150 / 13. **Choose / Buy сховані**, поки немає `STRIPE_SECRET_KEY`. Лог generation **не показуємо** (`SHOW_AI_COST_LOG=false`). Видалити акаунт — кнопка тут (`DELETE /auth/account`). Окремої сторінки Account немає. Ціни **FROZEN**.

**Library.** Список проєктів: промпт, тип, статус, credits, дата. Відкрити в студії, **скопіювати бриф**, **видалити** (`DELETE /projects/:id` — файли й версії; кредити не повертаються, confirm у UI). Якщо термін вийшов — статус `expired` і підказка, що Create знову платний. Перед витісненням через ліміт плану — попередження, не тихе зникнення.

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
   gpt-4o-mini  gpt-image-2.5-sunburst  OpenAI tts-1 (або macOS say у dev)
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
| AI | OpenAI `gpt-4o-mini` + `OPENAI_IMAGE_MODEL` (дефолт `gpt-image-2.5-sunburst`; fallback `gpt-image-1` / DALL·E 3) |
| TTS | OpenAI `tts-1` / `nova`; dev: macOS `say` |
| Рендер | ffmpeg через `ffmpeg-static`, 1080×1920 |
| Медіа | `backend/data/media/{projectId}/` |
| Платежі | Stripe Checkout, якщо є ключ. Без ключа — 403, UI без покупки |

### 5.2 Міграція на Xano

Ті самі таблиці й ендпоінти. Node зараз — робочий еквівалент Xano API.

### 5.3 Політика файлів (до S3)

Проміжні артефакти дешеві в генерації відносно готового ролика; **готовий mp4 або stills — те, за що користувач заплатив.** Не можна ставити їм однаковий короткий TTL.

| Артефакт | TTL | Чому |
| --- | --- | --- |
| `voice.mp3`, `scene-*.jpg`, `captions.srt` | **7 днів** після `updated_at` | можна зібрати mp4 знову з credits, місце на диску |
| `reel.mp4` | **90 днів** після Create, або одразу після успішного S3 | зберігання дешеве; регенерація = 55 cr + залежності |
| `still-*.jpg` | **90 днів** (як mp4) | Download Image Post = файл OpenAI |
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

**Метрика №1 бети (рендер):** у `ai_generations.meta_json` / колонки `started_at`, `finished_at`, `duration_ms` для кожного кроку; для render ще `queueWaitMs`, `encodeMs`. Якщо середній `queueWaitMs` > 30 с — винести рендер з API-процесу до публічного запуску. Окремо дивитись TTS vs OpenAI Images vs ffmpeg: захлин може бути в послідовних OpenAI, не в ffmpeg.

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
| free | £0 | 400 |
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
| logo_url | text | внутрішній `/brand/logo` після upload, або порожньо |
| logo_on_photos | int 0/1 | чи друкувати лого на фото Reel / photo-post; дефолт 0. Задається в Brand Kit, не в брифі |
| (файли, не колонки) | PNG/JPEG на диску | `ref-place` / `ref-people` / `ref-product` у `data/media/brand/{userId}`; у JSON — `ref_*_url` |
| primary_color | text | `#RRGGBB` |
| secondary_color | text | `#RRGGBB` |
| font | text | Fraunces / Outfit / Playfair Display / IBM Plex Sans |
| tone_of_voice | text | пресет (чипси); AI отримує розшифровку |
| tone_note | text | опційна нотатка власника |
| website | text | |
| instagram | text | |
| vertical | text nullable | `salon` / `cafe` / `fitness` / `other` — каркас сцен, не обов’язково |
| vertical_note | text | якщо `other` |
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
| image_intent | text | лише `image_post`: `photo` / `invite` / `info` / `offer`; інакше порожньо |
| invite_json | text | Лише `invite`: поля з Idea. На JPG **не** впливають. Порожньо для photo / info / offer |
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

Для `image_intent=invite` Idea також пише `invite` у відповіді → `invite_json`. На JPG це не впливає.

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

**visuals** — масив `{ sceneId, imageUrl, prompt, placeholder? }`. `placeholder: true` = OpenAI відхилив кадр (ключ при цьому вже є). Без ключа крок Visuals не стартує.

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

**Тригер.** Після кожного **третього** `ready`/`expired` проєкту цього Brand Kit — фонова джоба. Не рахувати живцем на кожен звичайний запит. Поки < 3 ready — не рахувати (шум). `POST /brand/learning/reset` стирає `learned_summary_json` і **одразу** викликає той самий перерахунок з наявної історії (`force`); якщо ready < 3 — картка лишається порожньою, UI це каже. `other` + note **не** парсити в v1; зберігати для ручного перегляду.

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

`feedbackReason` необов’язковий. Якщо є — перед регенерацією рядок у `step_feedback` і `rejection_reason` на попередній версії, **і той самий текст іде в промпт наступної генерації** (картинка / ідея / сценарій: «вони відхилили попереднє, не повторюй»). Окремий ендпоінт не потрібен.

### 6.12 Публічний preview-лінк (не шедулер, не соцмережа)

Власник хоче показати Reel партнеру / бариста / дружині **до** викладу. Це не публікація.

- `POST /projects/:id/share` (JWT) — токен + TTL 7 днів; повторний Share оновлює expiry.
- `preview_token` — **криптографічно випадковий, 32 байти** (`crypto.randomBytes(32).toString('hex')`, 64 hex). Не UUID v1 і не обрізаний UUID. Публічний, без auth — ентропія обов’язкова.
- Сторінка `/preview/:token` (без логіну). Медіа: `GET /share/:token/file` і `/share/:token/image/:sceneId`.
- `GET /projects/:id/preview?token=` — той самий JSON без auth.
- Не постійний Download URL і не S3. Після TTL — 404. Кнопка *Share a preview* у студії **схована** (`SHOW_SHARE_AND_PUBLISH`), ендпоінт лишається.

Порівняння версій Idea/Script/**Visuals**: `GET` проєкту віддає **усі** знімки кроку в `versions`; `POST /projects/:id/versions/{idea|script|visuals}/:versionId/restore` ставить обрану `accepted=1`, **0 credits**. Idea/script — каскад як regenerate. Visuals — за `{ sceneId }` відкочує один кадр з файлового знімка `still-{sceneId}-{versionId}.jpg` (mp4 скидається). Image / Post показує всі takes; `GET /projects/:id/image/:sceneId/versions/:versionId` віддає знімок.

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
| POST | `/projects` | так | `{ type, prompt, imageIntent? }` → 201 `{ project }`; невалідний `imageIntent` → **400** |
| GET | `/projects/:id` | так | проєкт + таблиця costs |
| DELETE | `/projects/:id` | так | стерти проєкт, версії й файли з бібліотеки; кредити не повертаються |
| PATCH | `/projects/:id` | так | `{ prompt }` — змінити бриф; credits 0; щоб застосувати — regenerate idea |
| PATCH | `/projects/:id/invite` | так | `{ invite }` — пише `invite_json`, 0 cr. JPG не чіпає |
| POST | `/projects/:id/steps/:step` | так | `{ regenerate?, sceneId?, idempotencyKey?, feedbackReason?, feedbackNote? }` + `Idempotency-Key`; 20 req/хв |
| POST | `/projects/:id/feedback` | так | `{ publishable: yes\|edits\|no, reasons[] }` після mp4 |
| POST | `/projects/:id/share` | так | preview-лінк, TTL 7д |
| GET | `/projects/:id/preview` | ні | `?token=` — JSON прев’ю |
| GET | `/share/:token` | ні | JSON прев’ю |
| GET | `/share/:token/file` | ні | mp4 прев’ю |
| GET | `/share/:token/image/:sceneId` | ні | JPG прев’ю |
| POST | `/projects/:id/versions/:step/:versionId/restore` | так | idea / script / **visuals** (`sceneId?`), 0 credits |
| DELETE | `/auth/account` | так | спочатку Stripe `subscriptions.cancel`, потім дані |
| GET | `/projects/:id/file` | так | mp4 після Create |
| GET | `/projects/:id/image/:sceneId` | так | JPG still після Pictures |
| GET | `/projects/:id/image/:sceneId/versions/:versionId` | так | JPG попереднього take |
| GET | `/projects/:id/audio` | так | mp3 після Voice |
| GET | `/brand` | так | `{ brandKit }` + completeness + learned_lines |
| PUT | `/brand` | так | зберегти kit |
| POST | `/brand/logo` | так | `{ image: data-url }` → файл у `data/media/brand/{userId}`; **≤2 MB, лише PNG/JPEG** (перевірка magic bytes); SVG/WebP → 400 |
| DELETE | `/brand/logo` | так | стерти файл і `logo_url` |
| GET | `/brand/logo` | так | файл лого як `<img>`; `Content-Type` png/jpeg, не `image/svg+xml` |
| GET / POST / DELETE | `/brand/ref/:slot` | так | `slot` = `place` \| `people` \| `product`. Той самий ліміт, що лого. DELETE слота не чіпає лого |
| POST | `/brand/learning/reset` | так | стерти і **одразу перерахувати** `learned_summary_json` з історії |
| GET | `/billing/plans` | ні | плани + packs + `checkoutEnabled` + `frozenPrices` |
| GET | `/billing/credits` | так | balance, transactions, generations, **economics** (собівартість на готовий Reel) |
| POST | `/billing/checkout` | так | `{ planId? , packId? }` → Stripe URL. Без `STRIPE_SECRET_KEY` → **403** (не нараховує credits) |

Коди: 400 валідація; 401 токен; 402 credits; 404 проєкт; 409 email **або крок уже running / той самий Idempotency-Key**; 429 rate limit; 500 студія.

### 7.1 Правила пайплайну

Reel / TikTok: idea → script → visuals / voice / captions (потребують script) → render.

Image / Post: idea → visuals. Один JPG з OpenAI (§3.6). `PATCH /invite` — 0 cr, без перемалювання.

| step | credits | Що вважається успіхом |
| --- | --- | --- |
| idea | 5 | `idea_json` |
| script | 10 | `script_json` (лише відео) |
| visuals | 40 max / **8** на пост | Reel: live × 8, поріг ≥3/5. Пост: 8 за живий JPG. Поріг поста — §7.3 |
| visuals *один кадр* | **8** | `{ regenerate: true, sceneId }` |
| voice | 30 | `voice_json` **і** `audio_url` (TTS); немає на `image_post` |
| captions | 10 | cues (scene-level); немає на `image_post` |
| render | 55 | **існує mp4**, `status=ready`; немає на `image_post` |
| **разом Reel** | **150** | |
| **разом Image Post** | **13** | idea 5 + 1×8; `status=ready` після Pictures |

Промпт: `trim`, 8–2000 символів. Одне речення — норма; абзац дозволений.

`image_intent` на `image_post`: `photo` / `invite` / `info` / `offer`. Порожньо → `photo`. Значення не з переліку → **400** `Choose photo, invitation, information or offer.` На Reel/TikTok поле ігнорується.

### 7.2 Регенерація (UX і ціна)

Власник малого бізнесу, якому не зайшов голос або кадр, **не** має єдиним виходом починати новий проєкт — це вбиває retention.

| Дія | Credits | Ефект |
| --- | --- | --- |
| `POST /steps/:step` повторно, крок уже done, **без** `regenerate` | 0 | повернути поточний проєкт, **AI не викликати** |
| `POST /steps/:step` з `{ "regenerate": true }` | ціна кроку; з 4-ї спроби **2×** | новий виклик AI/TTS/ffmpeg, перезапис артефакту |
| `POST /steps/visuals` з `{ "regenerate": true, "sceneId": N }` | **8**; з 4-ї Visuals-спроби **16** | лише цей кадр; mp4 скидається |
| `POST .../versions/{idea\|script\|visuals}/:id/restore` | **0** | повернути вже оплачену версію; visuals — по `sceneId`, файл зі знімка |
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

Поріг успіху: **≥ ceil(n × 3/5)** живих кадрів (для 5 сцен = **3**). Нижче порогу — крок `failed`; якщо провайдер уже викликаний, резерв **не** повертається.

| Результат | Крок | Credits | Що бачить користувач |
| --- | --- | --- | --- |
| Живих кадрів нижче порогу (ключ є) | `failed` | **зарезервовані 40 лишаються** (вендор уже виставлений) | *We couldn’t generate enough frames (k of n). Try a simpler description.* |
| Живих ≥ порогу, частина placeholder | `succeeded` | **live × 8** (не 40) | Бейдж на кожному placeholder **до Voice** |
| Усі n кадрів живі | `succeeded` | **n × 8** (5 сцен = 40) | Звичайний прев’ю |
| Немає `OPENAI_API_KEY` | не стартує | 0 | **400** *Pictures need an OpenAI key.* Градієнт-прев’ю **не** пишеться |

5xx від OpenAI Images: **один автоматичний retry** на кадр, потім як відмова (placeholder / поріг). 4xx policy — без retry, одразу placeholder.

Успішні API-виклики в пачці, яка впала по порогу, **вже оплачені credits** (резерв не повертається). `actual_cost_gbp` у логу `failed`.

Один кадр після succeeded: **8 credits** за `sceneId`.

**Image / Post (n = 1).** Поріг = **1** (все або нічого; `ceil(1 × 3/5) = 1`). Не екстраполювати «3 з 5» на один кадр.

| Результат | Крок | Credits | Що далі |
| --- | --- | --- | --- |
| Єдиний виклик OpenAI уже пішов, кадру немає | `failed` | резерв **8 лишається** (вендор виставлений) | Немає JPG. Повідомлення «picture», не «frames» |
| Є `still-1.jpg` | `succeeded` | **8** | Фінал: JPG з OpenAI |
| Немає ключа | не стартує | 0 | той самий **400**, що й для Reel Visuals |

---

## 8. AI-пайплайн (рішення системи, не користувача)

Користувач ніколи не бачить назву моделі в UI створення. Це гігієна. Рів — §1.3.

| Крок | З ключами | Без ключів |
| --- | --- | --- |
| Idea / Script / Captions / voice *direction* | `gpt-4o-mini`, JSON | studio preview JSON |
| Visuals (Reel і Image / Post) | OpenAI image (`OPENAI_IMAGE_MODEL`) | **400**, ключ обов’язковий. Немає preview-кадрів без ключа |
| Voice *аудіо* | **OpenAI `tts-1` / `nova`** | macOS `say` (dev); тиша — лише якщо немає `say`; **не бета** |
| Create | **ffmpeg** 1080×1920 + SRT | той самий рендер; без кадру — колір бренду |
| Captions | scene-level cues під тривалість аудіо | той самий алгоритм |

Якщо JSON моделі битий — fallback на preview-текст. Credits лише після успішного артефакту кроку.

Brand Kit (ніша, лого і опційні фото, якщо задані) завжди в контексті, коли `use_brand=1`.

Нішеві каркаси: 3 JSON-структури сцен «салон / кава / фітнес» у preview-скрипті вже є; з ключем OpenAI — ті самі вертикалі в system prompt. Користувач пише речення; система підставляє каркас, не меню шаблонів.

---

## 9. Credits і монетизація

### 9.0 Заморозка цифр

Усі £ у цьому документі й у UI (**Creator £9.99, пакети £4.99 / £12.99 / £29.99, 150 credits за Reel**) пораховані на пайплайні **без TTS і рендеру**.

**Статус: FROZEN до виміру собівартості повного MVP-пайплайну (текст + картинки + TTS + mp4) на закритій беті (§1.5), не на внутрішніх 2–3 роликах команди.**

Не використовувати ці числа як затверджений прайс для інвестора, реклами чи «факту в roadmap». Після 20–50 реальних роликів: перерахунок `CREDIT_COSTS`, планів і пакетів. Цільова маржа: ціна кроку в credits ≥ 3× `actual_cost_gbp`.

### 9.1 Інваріанти

- баланс не може піти в мінус;
- signup атомарний: user + free subscription + 400 credits + brand kit;
- Free **має** вистачати на **два** повні Reel на закритій беті (400 ≥ 300), щоб перевірити другий проєкт за 14 днів; після бети можна повернути «один Reel», якщо unit-економіка так скаже;
- після зміни собівартості Free/150 можна переглянути разом із прайсом.

### 9.2 Пакети докупівлі (заморожені)

| id | Credits | Ціна |
| --- | --- | --- |
| pack_200 | 200 | £4.99 |
| pack_600 | 600 | £12.99 |
| pack_1500 | 1 500 | £29.99 |

### 9.3 Stripe

- є `STRIPE_SECRET_KEY` → Checkout, `checkoutEnabled: true`;
- немає → `checkoutEnabled: false`, `POST /checkout` = **403**, UI без Choose/Buy. Credits не нараховуються;
- webhook — до публічних підписок, не блокер інвайт-бети.

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

Поле `economics` є в `GET /billing/credits`. На екрані Credits **не показуємо** (`SHOW_AI_COST_LOG=false`). 150 credits — внутрішня одиниця, не «ціна Reel для людини».

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

1. Новий користувач реєструється і бачить 400 credits.
2. Можна створити Reel з промптом і пройти всі 6 кроків → **на диску/за запитом є відтворюваний mp4 ~30 с 9:16** (не лише прев’ю в DOM).
3. Крок Voice не вважається done без аудіофайла (`audio_url`).
4. Після повного шляху баланс = 250 (при вартості 150 і старті 400), у Library статус ready **і** файл.
5. Повторний Idea **без** `regenerate` не списує 5 credits і **не викликає AI**; **з** `regenerate` — списує і каскадить; 4-та спроба Idea — **10 credits (2×)**, не 429 (§7.2).
6. Video / Ad / Social post не створюють проєкт. **Image / Post створює** (13 cr; `GET …/image/:sceneId` = `still-1.jpg` з OpenAI).
7. Brand Kit зберігається і впливає на Idea; якщо `use_brand=1` — також на промпт картинки (назва, кольори, шрифт, тон, ніша, **лого і опційні фото залу / людини / товару**). Лого і фото не обов’язкові.
8. Credits: плани, пакети, таблиця 150/13, поточний план виділено. Лог generation у API є, у UI **схований**. Checkout без Stripe не відкривається.
9. Idea / Script / Captions без ключа дають preview-JSON. **Visuals без `OPENAI_API_KEY` — 400.** Voice без ключа: `say` або тиша. **Бета і зовнішнє демо — ключ + TTS + ffmpeg**, не тихий wav.
10. `GET /health` = 200. `GET /projects/:id/file` віддає mp4, коли файл є.

**Утримання (інакше «успіх MVP» суб’єктивний; фазу постів не починати):**

11. Не менше **30% користувачів, які закінчили перший Reel (є mp4), створюють другий проєкт протягом 14 днів.**
12. Вибірка:
    - **n = 20** з першим файлом — **слабкий сигнал**. На цьому розмірі **не** приймати go/no-go лише по відсотку (6 людей; 1–2 випадковості = ±15–20 п.п.). Обов’язково **≥ 5 якісних розмов** (що не зайшло в голосі/кадрі/ціні). Рішення «продовжувати бету / різати фічу» — число **плюс** фідбек.
    - **Хард-гейт наступного формату** (пост/реклама): §11.11 виконано на вибірці **≥ 40** користувачів з готовим першим mp4 — не на реєстраціях без файлу, не на n=10 закритої бети.

13. Регенерація Voice або Visuals доступна в UI і тарифікується; єдиний шлях «новий проєкт» **не** є прийнятим UX.
14. Питання *Would you publish this Reel/post?* і кнопка *Share a preview* у UI **сховані** до потреби бети; ендпоінти лишаються. Download не залежить від відповіді. **Publishability** — окремий KPI від «файл зібрався».

---

## 12. Дорожня карта

Документ дисциплінує себе: **нові формати чекають retention-гейт n≥40**. Нижче — що вже в скоупі бети vs що за гейтом.

**Уже зараз (без нового формату; підсилює retention і publishability):**

1. Brand Kit learning (§6.9.1) — **є**.
2. Feedback на рівні кроку (§6.11) — **є**.
3. Публічний preview-лінк (§6.12) — **є** (показати партнеру, не викласти).
4. Порівняння двох останніх Idea/Script/**Visuals** і restore без credits — **є**.

**Етапи доступу (як було):** закрита бета 5–10 → чекпоінт собівартості → privacy/delete → публічний лендінг → CAC-тест → гейт §11.11.

**Після §11.11 на n≥40, за цінністю (не хронологією старого списку):**

1. Image Post уже один JPG з OpenAI на kind. Далі — лише якщо треба кілька файлів на одну програму івенту, не «зібрати постер шаром».
2. Word-level captions (ElevenLabs alignment) — раніше YouTube, бо ріже publishability.
3. **Реклама**, потім **Відео** — дві кнопки, **§2.3**. Рух у кадрі — **§12.1**, не нова картка.
4. S3, upload лого, YouTube / презентації.

**Не в скоупі зараз:** шедулер публікації. Окрема дешева перевірка пізніше — **нагадування створити** наступний Reel (email/push), не шедулер викладу; атакує гіпотезу 4 Reels/міс (§9.5).

### 12.1 Майбутнє: рух у кадрі й реклама (після бети)

Власник малого бізнесу має зараз **короткий ролик зі статичних картинок**. Далі той самий продукт має вміти віддати **той самий ~30-секундний Reel, але з рухом у кадрі**: людина / руки / товар / легкий наїзд — якщо власник захоче «маленьке відео з рухаючими героями».

Це **не** новий формат і **не** кнопка **Відео** на Create. Кнопка «Відео» — довший ролик на сайт / YouTube (**§2.3**). Рух — еволюція збірки в уже існуючому **Короткому відео**.

#### 12.1.1 Що є зараз і що буде

| Зараз (бета / MVP) | Після бети, якщо сторіборда мало |
| --- | --- |
| OpenAI-кадр на сцену → ffmpeg тримає still + `tts-1` + SRT → `reel.mp4` ~30 с 9:16 | Той самий кадр іде в **один** image-to-video → кліп 5–8 с на сцену → ffmpeg склеює кліпи + той самий голос і SRT |
| Власник пише одне речення на Create | Той самий Create, ті самі 6 кроків. Нової кнопки «Animate / Kling» **немає**. Картка **Відео** — окремий формат (§2.3), не вмикач руху |
| «Герой» = людина в кадрі салону / кав’ярні / залу (майстер, гість, руки, товар) | Той самий герой **рухається** в межах уже згенерованої сцени. Не кролик у піжамі, не 2–5 хв казки |

**Рухаючі герої в Auteur** = персонажі бізнесу в рекламному сенсі (майстер фарбує, бариста ставить чашку, клієнт усміхається). Не авторський мультсеріал і не «придумай свого героя».

#### 12.1.2 Коли підключати (і коли ні)

Не підключати жоден image-to-video **до** закритої бети (5–10) і чекпоінту собівартості на 20–50 реальних mp4.

| Коли | Що | Як |
| --- | --- | --- |
| Закрита бета | Нічого з цього параграфа | Кадри OpenAI + `tts-1` + ffmpeg. Виміряти, чи сторіборда взагалі публікують. |
| Після 20–50 mp4, якщо «просто картинки» ріжуть publishability | **Один** image-to-video | Слот `encodeReel`: `still-{sceneId}.jpg` **або** `clip-{sceneId}.mp4`. Голос і SRT свої. Не нова кнопка на Create. |
| Після гейту §11.11 (n≥40) | Кнопки **Реклама**, потім **Відео** | **§2.3**. Той самий стек, різні скелети й файл. |
| Ніколи як ядро | CapCut / Canva / Premiere на фініші | Текст, лого, музика — у нашому Create. Інакше продукт знову шар над редактором. |
| Ніколи як ядро v1 | Дитячий мультконвеєр | Midjourney / Leonardo / Canva + Kling/Runway/Dreamina + ElevenLabs-діалоги + CapCut. Інша ніша, інші кредити, ламає обіцянку «ми зробимо решту». |

Публічний i2v **заборонений**, поки не перераховані `CREDIT_COSTS.render` і/або Visuals: рух дорожчий за still. Інакше Creator £9.99 не витримує собівартість.

#### 12.1.3 Вендор: хто оживляє кадр

Користувач **ніколи** не вибирає вендора. Імена моделей (Kling, Runway, Veo, Seedance) **не** на Create і не в Studio. Зміна API — лише адаптер у бекенді. Якщо ціна впаде — змінити адаптер, не екран.

| Роль | Вендор | Навіщо так |
| --- | --- | --- |
| **Перший і єдиний на старті** | **Kling image-to-video** з уже згенерованого `still` | Auteur уже має фото сцени й Brand Kit на ньому. Треба оживити кадр (пара, рука, товар, наїзд), не малювати нове кіно з тексту. |
| Запасний адаптер | **Runway** | Якщо Kling API або оплата для UK незручні. Той самий контракт: still → 5–8 с кліп. |
| Не першим | **Veo** | Тягне свій звук. У Auteur голос уже свій (`tts-1`). Подвійне аудіо ламає Voice + captions. |
| Пізніше, лише реклама | **Seedance** (або аналог з кількома референсами) | Коли з’явиться Advertisement і треба товар + обличчя з 2–3 референсів. Не для першого i2v у Reel. |
| Не підключати | Роутер «обери Kling / Runway / Veo» | Це маркетплейс моделей. Суперечить §1. |

Кліп **5–8 секунд на одну сцену**, не 30 секунд одним шматком і не 2–5-хвилинний фільм. 4–6 сцен × 5–8 с ≈ той самий ~30 с Reel.

**Kling уміє text-to-video** (промпт → ролик без картинки; у 3.0 ще multi-shot і свій звук). Це **не** перший шлях Auteur.

| | Image-to-video (беремо) | Text-to-video (не першим) |
| --- | --- | --- |
| Вхід | наш `still` + короткий motion-промпт системи | лише текст |
| Brand Kit / обличчя / інтер’єр | тримаються з кадру, який власник уже бачив і може restore | модель малює заново; кадри сцен роз’їдуться |
| Крок Visuals | лишається: порівняти, regenerate однієї сцени | треба прибрати або зробити фейковим |
| Звук | Kling `audio: off`, голос свій `tts-1` | у Kling є native audio — **вимкнути**; інакше подвійне аудіо як у Veo |
| Коли розглянути | Коротке відео після бети | пізніше кнопка **Відео** (§2.3), і лише якщо без ключового still не обійтись. Власник усе одно не обирає режим |

Не показувати на Create «з картинки / з промпту». Один адаптер у бекенді.

#### 12.1.4 Як це лягає в пайплайн (контракт для коду, не робити зараз)

1. Visuals як зараз: OpenAI малює `still-{sceneId}.jpg`.
2. Render (або внутрішній підкрок після Visuals, **не** окремий крок на Create): для кожної live-сцени бекенд викликає Kling з кадром + коротким motion-промптом (з Idea/Script: «рука ставить чашку», «легкий наїзд»). Відповідь — `clip-{sceneId}.mp4` 5–8 с.
3. `encodeReel` підставляє кліп замість still; якщо i2v упав — fallback на still, проєкт не падає цілком (як часткові Visuals).
4. Voice і captions **не** змінюються: `voice.mp3` + SRT, підгін під тривалість голосу як зараз.
5. Власник бачить той самий Studio: Make → файл. Без чіпа «Kling», без «завантаж у CapCut».

Motion-промпт пише система, не користувач. Опційний короткий hint у брифі («щоб майстер рухав руками») — ок; окреме поле «опиши анімацію» — ні.

---

## 13. Локальний запуск

```bash
cd backend && cp .env.example .env && npm install && npm run dev
cd frontend && npm install && npm run dev
```

Відкрити [http://localhost:5173](http://localhost:5173).

Опційно: `OPENAI_API_KEY` (текст, картинки, **і TTS `tts-1`**), `OPENAI_IMAGE_MODEL` (id з playground Images), `STRIPE_SECRET_KEY`, `JWT_SECRET`, `APP_URL`. Окремий ключ TTS не потрібен. `.env` у git не комітити.

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
| Ready (прийняття) | Reel: є mp4. Image Post: є `still-1.jpg` з OpenAI |
| Expired | рядок у Library є, файлу на диску немає |
| Frozen price | £ у документі, до виміру собівартості на беті |
| FROZEN | не орієнтир для продакшен-прайсу |
| HYPOTHESIS | CAC/LTV/churn у §9.5 — до ads-тесту |
| Закрита бета | 5–10 інвайтів, не публічний запуск |
| Regenerate | платний повтор; 1 Make + 2 retry за ціною кроку, далі 2× якщо користувач вибирає ще; POST без прапора — безкоштовний і без AI |
| Publishability | чи людина виклала б цей Reel; не те саме, що «mp4 зібрався» |
| Idempotency-Key | повтор того самого кліку не списує credits вдруге |
| Image-to-video (i2v) | після бети: still сцени → короткий кліп 5–8 с. Перший вендор — Kling (§12.1). Не в MVP. |
| Рухаючі герої | майстер / гість / руки / товар у кадрі Reel, не мультперсонаж |
| Відео (кнопка) | майбутній формат `video`: 45–90 с на сайт / YouTube, не вмикач Kling (§2.3) |
| Реклама (кнопка) | майбутній формат `advertisement`: офер / товар / CTA, 15–30 с (§2.3) |

---

## 15. Що лишається відкритим (не стек)

TTS, ffmpeg, TTL, регенерація, часткові Visuals, self-service delete, ліміт ffmpeg, idempotency кроків, publishability, economics на billing — **закриті в коді / ТЗ**. Нижче чекпоінти:

1. Перерахунок `CREDIT_COSTS` / планів після **20–50 роликів закритої бети** за **cost per successful Reel** (§9.6), не лише сума succeeded.
2. Чи scene-level captions достатні, чи після бети брати ElevenLabs заради word-timestamps.
3. Чи гіпотеза CAC £25–40 жива після першого ads-тесту (§9.5) — якщо ні, не масштабувати рекламу.
4. Точна дата публічного лендінгу — після бети **і** §10.1 (privacy/content + delete), не навпаки.
5. Чи черга з 2 ffmpeg тримає бету; якщо середній `queueWaitMs` > 30 с — винести рендер з API-процесу до публічного запуску.
6. Три питання долі продукту: **чи публікують Reel**; **чи є другий за 14 днів (≥30%, n≥40)**; **чи додатна unit-економіка з failures+retries**. Нові формати — тільки якщо всі три не провалені.
7. Чи після 20–50 mp4 сторіборда достатньо, чи вмикати Kling (§12.1). Якщо вмикати — нова собівартість i2v **до** публічного руху; адаптер можна змінити на Runway без зміни Create.

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
