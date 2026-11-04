# Capital OS — состояние проекта и реестр решений

**Срез на 3 ноября 2026 года.** Документ для синхронизации frontend, backend и продуктовых решений.

Источники: [Trello — Согласования](https://trello.com/b/HhKgsZmO), [Trello — Backend](https://trello.com/b/HGRjiKP8), описания и комментарии карточек, текущий frontend и журнал проверок. Просмотрены все 39 открытых карточек согласований и их комментарии. Статус backend ниже — по Trello, без повторного аудита backend-кода. Результаты тестов — из завершённой проверки 03.11; при подготовке этого документа тесты заново не запускались.

**Утверждено ≠ реализовано ≠ готово к production.** Устаревшее описание карточки не отменяет более позднее явное решение в комментарии. Этот документ фиксирует решения, а не утверждает новые.

## 1. Где проект находится сейчас

Capital OS — работающий локальный frontend с первым настоящим backend GET. Основная аналитика и Transactions пока используют синтетические данные. Это ещё не полностью подключённый финансовый dashboard.

| Область           | Что есть сейчас                                                                                                | Ограничение                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Dashboard         | Current Balance, Actual Monthly Net Cashflow, Balance History, Monthly Income & Expenses, Spending by Category | Все финансовые показатели, кроме лимита в API-режиме, — demo                      |
| Credit limit      | Настоящий GET FastAPI через Vite proxy; строка в Current Balance                                               | Только чтение; PUT отсутствует; нет вычисления own/credit funds                   |
| UI лимита         | Loading, значение, Not set, ошибка и Retry; null отличается от 0                                               | Публичная авторизация не подключена                                               |
| Transactions      | Фильтры дат, абсолютной суммы, направления, категории; детали операции и исходная валюта                       | Demo-список, локальная пагинация и localStorage overrides, не backend persistence |
| Графики           | Независимые состояния и Retry; сохранение предыдущих данных при обновлении                                     | Реальные аналитические DTO ещё не согласованы                                     |
| История           | 1M / 3M / 6M / 12M / All; Custom удалён                                                                        | 3M default и границы fixture-периодов временные; широкий кэш не реализован        |
| Refresh           | Обновление demo-ресурсов; в API-режиме видимый credit-limit перечитывается                                     | Это не запуск синхронизации Monobank                                              |
| Auth и onboarding | Выбрана общая архитектура                                                                                      | Login, пользовательские сессии и банковское подключение не реализованы            |
| Deployment        | Локальные Vite + FastAPI                                                                                       | Нет подтверждения готового защищённого production deployment                      |

Frontend: React 19, TypeScript, Vite 8, Recharts, Lucide, обычный CSS. Дополнительные библиотеки для первого GET не потребовались.

Основные границы кода:

- `App.tsx` — композиция экранов и ресурсов.
- `Charts.tsx` — независимые компоненты графиков, lazy-loading.
- `Transactions.tsx` — демонстрационные фильтры и детали операций.
- `creditLimit.ts` — типизированный GET и runtime-валидация.
- `useWidget.ts` — lifecycle одного запроса, отмена устаревшего результата, сохранение данных, enabled по потребности; это не cache framework.
- `mockResources.ts` / `data.ts` — синтетические сервисы, fixtures и demo-агрегация.
- `contracts.ts` — разделение утверждённого credit DTO и предварительных view models, которые нельзя принимать за REST-контракты.

### Режимы запуска

- `npm run dev` — demo mode.
- `npm run dev:api` — локальный API-режим лимита. Vite проксирует `/api` на `http://127.0.0.1:8001`; target можно переопределить через `CAPITAL_API_TARGET`.
- Для параллельного preview: `npm run dev:api -- --port 5174 --strictPort`.
- Browser использует относительный `/api/v1/credit-limit`. Изменений CORS на backend не потребовалось.
- Credit GET выполняется, когда лимит нужен Dashboard; Refresh в Transactions его не вызывает. API-ответ не заменяется значением из demo storage.

## 2. Что согласовано

### Продукт, деньги и интерфейс

- MVP: один пользователь и основной Monobank-счёт UAH; структура должна допускать последующее многопользовательское развитие. Это не разрешение публиковать текущую single-account интеграцию.
- English-only, dark theme, desktop-first. Spacious и Graphite / Forest; доходы зелёные, расходы красные с текстовыми обозначениями.
- Current Balance — главный KPI, Actual Monthly Net Cashflow — следующий. Planned Balance не входит в MVP.
- Деньги — целые минимальные единицы валюты; frontend проверяет safe integer. `amountMinor` — фактическое движение в валюте счёта; исходная сумма и numeric ISO currency code сохраняются отдельно; `balanceMinor` — остаток после операции.
- Аналитика основного счёта — UAH. Иностранные суммы — дополнительные сведения, без повторной конвертации для UAH totals.
- Все положительные движения — income, отрицательные — expenses, включая исходящие переводы и покупки crypto. Refund в MVP — положительное поступление. Комиссию нельзя прибавлять повторно; точная банковская семантика комиссии ещё открыта.
- Банковские поля операции не редактируются; ручная категория не должна менять MCC, сумму и баланс.
- Cashflow и spending — текущий календарный месяц; monthly trend — 12 месяцев включая текущий неполный.
- History — только пять presets; фильтр локален для истории. Backend владеет календарными границами Europe/Kyiv и DST. Неизвестное покрытие не равно нулю.

Источники: [MVP](https://trello.com/c/Ko7AX1YH), [периоды](https://trello.com/c/qZbdP8jw), [calendar ownership](https://trello.com/c/51z92xvP), утверждённые пользователем требования UI.

### API и backend

| Решение                                                  | Граница утверждения                                                                                            | Источник                                           |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Independent resource-oriented GET                        | Нет обязательного /dashboard; связанные показатели возвращаются вместе; остальные DTO отдельно                 | [Архитектура](https://trello.com/c/H8OM3PQo)       |
| Одна HTTP FastAPI Lambda + Mangum + API Gateway HTTP API | Фоновые workers отдельно; это не утверждение IaC, region или concurrency settings                              | [Runtime](https://trello.com/c/hCSa6j4T)           |
| Одна DynamoDB таблица в MVP                              | Конкретная будущая tenant-модель и все ключи не утверждены автоматически                                       | [Таблица](https://trello.com/c/7VHrsdM0)           |
| Специализированные repositories                          | Без универсального CRUD/base repository и лишнего DI framework                                                 | [Repositories](https://trello.com/c/6sgYxCUN)      |
| Query/GetItem + Python-агрегация                         | Полное чтение страниц; без сохранённых предагрегатов до измеренной необходимости                               | [Access patterns](https://trello.com/c/X1KIxXq3)   |
| Contract-first                                           | Review конкретного контракта → согласование → реализация и тесты → интеграция                                  | [Процесс](https://trello.com/c/VVAfPcw8)           |
| Problem Details                                          | application/problem+json: type, title, status, detail, requestId; точные статусы и Gateway exceptions отдельно | [Ошибки](https://trello.com/c/HUIm9v5R)            |
| Cognito + Google + JWT                                   | Authorization Code + PKCE, API Gateway JWT authorizer; не backend cookie-session. Детальный auth flow отложен  | [Auth architecture](https://trello.com/c/piaDk47Q) |

### Credit Limit GET — согласован и подключён локально

`GET /api/v1/credit-limit` → 200:

```ts
type CreditLimitResponse =
  | { amountMinor: number; effectiveFrom: string }
  | { amountMinor: null; effectiveFrom: null };
```

Оба поля обязательны; смешанные состояния недопустимы. Amount — неотрицательный safe integer в копейках UAH. Ноль — установленный лимит; null/null — Not set. effectiveFrom — UTC начало действия, а не время HTTP-ответа. Нет accountId, version и If-Match в GET.

Demand-driven fetching утверждён отдельно. PUT пока не утверждён, API-режим read-only. Готовый GET не зависит от согласования own/credit breakdown.

Источники: [DTO](https://trello.com/c/WB3Mjyc2), [fetching](https://trello.com/c/FyByhi1X), [backend Done](https://trello.com/c/Gc0voGta), [frontend Done](https://trello.com/c/W83TwF6R).

## 3. Консистентность, синхронизация и кэш: точные границы

**MVP использует eventual consistency.** Независимые GET могут кратковременно отражать разные состояния данных. Общего атомарного snapshot и фиктивной global revision нет. computedAt, lastSuccessfulSyncAt и coverage имеют разные смыслы; точный состав metadata каждого DTO ещё согласуется. [Решение](https://trello.com/c/cnCACIqB).

**Синхронизация успешна после записи/проверки полного необходимого набора банковских транзакций.** Частичная неудача не даёт success. Предагрегаты ждать не нужно — их нет в MVP. Это не обещание одной атомарной DynamoDB-транзакции на весь batch. Конкретные job statuses, retry и уведомления отдельно. Решение зафиксировано в комментарии от 02.11. [Sync completion](https://trello.com/c/G3La5Idb).

**После успешной мутации её ответ — подтверждённое состояние.** Начатый раньше GET не должен его перезаписать. Для credit limit сохраняется last-write-wins без version/If-Match; дополнительный GET не обязателен. Это правило не утверждает PUT DTO и не распространяет отсутствие конфликтов на редактирование категорий. [Read-after-write](https://trello.com/c/AUWgZUD7).

**Независимые loading/success/empty/error утверждены.** Ошибка одного ресурса не блокирует остальные; при обновлении сохраняем прошлые данные. Лок всего dashboard до успешного завершения всех запросов не принят: он не создаёт согласованный snapshot и ухудшает доступность. Последнее обсуждение в чате не изменило это решение. [Widget UX](https://trello.com/c/HVW7Kon4).

**Принцип широкого кэша истории утверждён, алгоритм — ещё нет.**

- Актуальный широкий диапазон должен обслуживать меньшие без лишнего HTTP.
- Свежесть важнее ширины; старый широкий ответ не возвращает устаревшее состояние.
- Требуются user/account scope, сохранение null/gaps, корректные metadata выбранного участка и очистка при завершении сессии.
- Пока не согласованы freshness comparison, resolved preset boundaries, coverage меньшего интервала и смена календарного дня.
- Общая матрица инвалидации других ресурсов также не утверждена целиком.

Источники: [принцип](https://trello.com/c/Vb2nnGtf), [конкретные правила — на согласовании](https://trello.com/c/3P9yMUG7), [общая матрица](https://trello.com/c/81q89jJ9). В frontend широкий range cache не реализован. Отмена запросов в useWidget — только защита lifecycle, не гарантия серверной свежести.

Общий versioned snapshot и вариант завершения sync после его публикации — отдельное исследование будущего PI, не обязательство реализовать. [Future PI](https://trello.com/c/qtNXKq9J).

## 4. Что ещё нужно согласовать

| Вопрос                   | Что именно открыто                                                                       | Что зависит                                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Категории и MCC          | Стабильные IDs/labels, mapping, fallback, Credit, manual override и сохранение при sync  | Transaction repository, categories, category editing, spending. [Карточка](https://trello.com/c/i8vnsUMM)            |
| Balance semantics        | Авторитетный bank balance, own funds, credit used, unknown states                        | Реальный balance DTO и breakdown. [Карточка](https://trello.com/c/xQzfYp5k)                                          |
| История и покрытие       | Дни без движения vs пробелы, carry-forward, текущий день, available history, лимит точек | Корректный History GET и slicing. [Карточка](https://trello.com/c/8GSonX3B)                                          |
| Presets                  | Default, смысл 1M, preset vs from/to, metadata границ                                    | Контракт истории; UI-набор уже утверждён                                                                             |
| Кэш                      | Алгоритм истории и полная матрица инвалидации                                            | Range reuse и обновления после sync/мутаций. [Карточка](https://trello.com/c/3P9yMUG7)                               |
| Transaction identity     | Устойчивый публичный ID, старый импорт, synthetic IDs, reconciliation                    | Идемпотентность и mutations без PK/SK в API. [Карточка](https://trello.com/c/94Wed9SP)                               |
| Комиссии                 | Что включено в фактическое списание по типам операций                                    | Правильное отображение и отсутствие двойного учёта. [Карточка](https://trello.com/c/SXFhNAFR)                        |
| Transactions pagination  | Cursor, tie-break, фильтры, bounded read budget, continuation                            | Реальный список. [Карточка](https://trello.com/c/f3mTFdRK)                                                           |
| Конкретные API DTO       | Balance, cashflow, monthly, spending, history, categories, transactions, sync, mutations | Каждый endpoint согласуется отдельно; названия части маршрутов предварительные                                       |
| PUT credit limit         | Request/response, validation/errors, семантика повторного значения                       | Реальное редактирование. [Родительская карточка](https://trello.com/c/VVAfPcw8)                                      |
| Sync cadence и stale     | Rate limits, lookback, retry, freshness threshold, manual refresh                        | Реальная синхронизация. [Карточка](https://trello.com/c/x8uNNYZb)                                                    |
| Active-session updates   | Обязательность в MVP и транспорт                                                         | Автообновление при новых операциях. [Карточка](https://trello.com/c/ffZ1xzv0)                                        |
| Общие расчётные правила  | Проверяемые общие invariants между endpoints; детали fee/category/coverage               | Согласованная аналитика без дублирования правил. [Карточка](https://trello.com/c/7hhtN4Jt)                           |
| Performance и deployment | Цели latency, измерения cold/warm, IaC/region, production baseline                       | Измеримая готовность и выпуск. [Performance](https://trello.com/c/5kT07cGj), [Deploy](https://trello.com/c/R0eiwXqs) |
| UI review                | Финальные токены, mobile layout, детали donut и визуальные состояния загрузки/ошибок     | Дизайнерский review; текущий UI — рабочая реализация, не финальный design sign-off                                   |

### Явно отложено

- Регистрация, расширяемый allowlist, profile/status, отзыв доступа и multi-user ownership — [auth/onboarding](https://trello.com/c/RTVl3nPn).
- Personal API vs Provider API и UX подключения — [Monobank onboarding](https://trello.com/c/dgutdr1U).
- Хранение банковских credentials, ownership, uniqueness/rotation — [секреты](https://trello.com/c/SKCv7boz).
- Детали token storage/refresh/logout и production 401/403 нельзя считать решёнными выбором Cognito.
- PI1: Budget Planning & Refunds; формула Planned Balance, допущения и reconciliation ещё обсуждаются.
- PI2: Crypto Portfolio; валюта оценки, freshness и отличие от bank cashflow требуют собственного review.
- PI3: рассрочки/планирование, historical limits, alerts и comparisons; без решения за пользователя о допустимости покупки.
- Backlog: несколько счетов, ручные операции, custom categories, OCR, USD analytics и другие расширения.

## 5. Статус задач разработки

На доске Backend: 15 MVP To Do, 0 In Progress, 5 Blocked, 6 Done (по расположению карточек на момент чтения).

Done включает Settings, DynamoDB Local connection/smoke, Ruff/pre-commit, current credit-limit settings, backend vertical slice GET и frontend интеграцию GET. Это не означает завершение backend целиком.

Blocked: общий REST/OpenAPI review; Transaction model/repository (в частности ждёт MCC/category decision); own/credit balance breakdown; auth implementation; решение по realtime.

To Do: реальная аналитика, transactions/categories, sync workers/webhook/reconciliation/status, инфраструктура, security/ops и интеграционные проверки.

## 6. Проверки и границы доказательств

Последняя проверка 03.11:

- Build, ESLint, Prettier — успешно.
- 22 unit-теста и 13 Chromium browser tests — успешно.
- Настоящий FastAPI через Vite: 200, server uvicorn, null/null → Not set; нет CORS/console/page errors; demo storage не подмешивается.
- Нулевой и положительный лимит проверены контролируемыми HTTP-ответами; реальные банковские записи ради тестов не менялись.
- Адаптивные проверки и axe scans: 375, 768, 1440, 1920 px; это не полная сертификация доступности.
- Production auth, AWS deployment, bank sync и реальная аналитика не проверены как работающая сквозная система.

Подробности: [verification.md](verification.md). Синтетическая история не является копией реальных банковских данных.

## 7. Расхождения в документации и Trello

1. Описания ряда карточек в «Утверждено» всё ещё начинаются с «не утверждено». Для Independent GET, Lambda topology, access patterns, fetching, widget UX, period ownership и sync completion решение есть в более позднем комментарии. Нужна редакционная актуализация описаний, не повторное согласование.
2. Родительская credit-limit карточка всё ещё описывает ожидание GET review. Фактически GET утверждён и обе задачи интеграции Done; открытым остаётся PUT и отдельные детали публичного API.
3. Карточка правил кэша спрашивает о моменте sync success, хотя принцип уже согласован. Её актуальный остаток — freshness/metadata/read semantics и frontend invalidation; глобальный snapshot не требуется для MVP.
4. README начинается с формулировки «not an approved REST integration», хотя ниже описан работающий локальный GET. Корректнее: dashboard преимущественно demo, один утверждённый GET подключён локально.
5. В старых записях встречаются 2 177 транзакций, 2 180 элементов и оценки ~2.2k. Это могут быть разные единицы/срезы. Точный production count требует reconciliation; данный документ не объявляет одно число проверенной истиной.
6. Заголовки отдельных auth-задач отражают ранний single-user подход. Текущий продуктовый вектор — один разрешённый пользователь в MVP при возможности расширения; hardcoded email/sub в frontend не является утверждённым решением.

Карточки и реализация при подготовке документа не менялись. Редакционные расхождения перечислены здесь, чтобы не скрывать их за формальным статусом колонки.

## 8. Предлагаемый следующий порядок работы

Это рекомендация frontend, не новое утверждение:

1. Согласовать каталог категорий/MCC: он явно блокирует Transaction model/repository.
2. Выбрать следующий endpoint и согласовать только его контракт; не ждать всех открытых вопросов проекта. Для реального balance предварительно подтвердить банковскую семантику.
3. Для History отдельно закрыть presets, coverage и правила кэша, затем подключать данные и range reuse.
4. Реальные mutations добавлять после DTO-review с уже утверждённым приоритетом ответа мутации над старым GET.
5. Перед публичным выпуском вернуться к отложенным auth/onboarding/ownership и deployment решениям.
6. Не внедрять общий dashboard lock, snapshots, новые cache frameworks или будущие PI как условие следующего локального GET.

## Приложение. Полный реестр Trello — Согласования

Положение карточек на момент чтения: 18 утверждено, 11 на согласование, 3 в обсуждении, 7 отложено. Название карточки может сохранять историческую формулировку; итоговый смысл раскрыт выше.

### На согласование

- [DECISIONREALTIME Automatic refresh in active session](https://trello.com/c/ffZ1xzv0)
- [DECISIONBANK Own funds vs credit funds semantics](https://trello.com/c/xQzfYp5k)
- [DECISIONDB Stable transaction identity and import reconciliation](https://trello.com/c/94Wed9SP)
- [DECISIONFEES Commission semantics](https://trello.com/c/SXFhNAFR)
- [DECISIONHISTORY History completeness and current-day gaps](https://trello.com/c/8GSonX3B)
- [DECISIONSYNC Monobank cadence + rate limits + stale](https://trello.com/c/x8uNNYZb)
- [DECISIONPAGINATION DynamoDB filter and cursor strategy](https://trello.com/c/f3mTFdRK)
- [DECISIONDEPLOY IaC and production baseline](https://trello.com/c/R0eiwXqs)
- [DECISIONPERF First useful balance, full dashboard latency and review trigger](https://trello.com/c/5kT07cGj)
- [DECISIONBE Shared financial calculation invariants across GETs](https://trello.com/c/7hhtN4Jt)
- [DECISIONFE/API Balance History: правила кэша и metadata для локальных периодов](https://trello.com/c/3P9yMUG7)

### В обсуждении

- [DISCUSS Confirm API contract revision and credit limit route overlap](https://trello.com/c/VVAfPcw8)
- [DECISIONCATEGORY Fixed catalogue and MCC fallback](https://trello.com/c/i8vnsUMM)
- [DECISIONFE Session cache and invalidation dependency matrix](https://trello.com/c/81q89jJ9)

### Утверждено

- [APPROVED MVP product scope](https://trello.com/c/Ko7AX1YH)
- [APPROVED MVP historical and UI periods](https://trello.com/c/qZbdP8jw)
- [DECISIONAPI Temporal consistency, asOf and data freshness](https://trello.com/c/cnCACIqB)
- [APPROVED PI 1/2/3 product boundaries](https://trello.com/c/rYLpUYgd)
- [DECISIONAUTH Cognito JWT vs HttpOnly cookie session](https://trello.com/c/piaDk47Q)
- [APPROVEDDB One DynamoDB table for MVP](https://trello.com/c/7VHrsdM0)
- [DECISIONAPI Independent analytics GET vs hybrid dashboard](https://trello.com/c/H8OM3PQo)
- [APPROVEDDB Specialized repositories (no generic CRUD adapter)](https://trello.com/c/6sgYxCUN)
- [DECISIONRUNTIME Lambda topology & concurrency for Independent GET](https://trello.com/c/hCSa6j4T)
- [APPROVEDAPI GET credit-limit 200 response DTO](https://trello.com/c/WB3Mjyc2)
- [DECISIONDB DynamoDB access patterns per analytics GET](https://trello.com/c/X1KIxXq3)
- [DECISIONSYNC When bank sync is considered complete for analytics](https://trello.com/c/G3La5Idb)
- [DECISIONMUTATION Read-after-write and stale-response precedence](https://trello.com/c/AUWgZUD7)
- [DECISIONFE Credit-limit fetching: first render vs on-demand](https://trello.com/c/FyByhi1X)
- [DECISIONAPI Period ownership and Europe/Kyiv date boundaries](https://trello.com/c/51z92xvP)
- [DECISIONFE Per-widget loading, error, empty states and retry UX](https://trello.com/c/HVW7Kon4)
- [DECISIONAPI Standard error responses for first GET & future routes](https://trello.com/c/HUIm9v5R)
- [APPROVEDFE Balance history range cache reuse and freshness precedence](https://trello.com/c/Vb2nnGtf)

### Отложено

- [LATER PI 1 planned salary & budget formula](https://trello.com/c/Dbz3Ohdy)
- [LATER PI 2 portfolio semantics](https://trello.com/c/RGeiFiSi)
- [LATER PI 3 simulation and historical limits](https://trello.com/c/Ai8hHjEB)
- [DECISIONAUTH Expandable Google email allowlist and user authorization](https://trello.com/c/RTVl3nPn)
- [DECISIONBANK Commercial Monobank provider vs Personal API onboarding](https://trello.com/c/dgutdr1U)
- [DECISIONSEC Monobank credential storage, ownership and uniqueness](https://trello.com/c/SKCv7boz)
- [LATERPIARCH Evaluate consistent cross-endpoint financial snapshots (Option B)](https://trello.com/c/qtNXKq9J)
