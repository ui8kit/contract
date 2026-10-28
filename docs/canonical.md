# Каноническая форма записи — профиль `codex-entry/v1` (и манифеста — `codex-manifest/v2`)

Статус: **черновик Codex v0.4 (draft v0.4)**. Реализация: `src/canonical.ts` (`canonicalize`, `digest`, `CanonicalError`, экспорт из `@ui8kit/contract`). Векторы: `fixtures/vectors/canonical.json`, тест: `test/canonical.test.ts`. До выпуска v0.4 профиль может меняться; любое изменение правил ниже меняет дайджесты и требует нового имени профиля после выпуска.

## Вход и выход

- Вход — **исходный JSON-текст** одной записи Entry v0.4 (`schemas/entry.schema.json`), а не уже разобранный объект: собственный строгий парсер (RFC 8259) ловит дубли ключей и целые вне безопасного диапазона до потери точности в `JSON.parse`.
- `canonicalize(text)` → каноническая строка; `digest(text)` → `codex-entry/v1:sha256:` + hex(SHA-256 от UTF-8 байт канонической строки), 64 строчных hex-символа.
- Ошибки — `CanonicalError` с полями `code` и `path` (`$.field` или `@offset` для ошибок разбора).

## Сериализация — RFC 8785 (JCS)

- Ключи объектов сортируются по последовательностям UTF-16 code units (на всех уровнях, включая `metadata.<k>.value`).
- Числа — как ECMAScript `Number.prototype.toString` (`12.50` → `12.5`, `1e21` → `1e+21`, `1e-7` → `1e-7`, `1E2` → `100`); `-0` → `0`.
- Строки: экранируются только `"`, `\` и управляющие символы < U+0020 (`\b \t \n \f \r`, остальные — `\u00xx` строчными). `/`, `<`, `>`, `&`, U+2028, U+2029 и любой не-ASCII (кириллица, эмодзи) пишутся как есть. Одиночные суррогаты — ошибка.
- Без пробелов и без завершающего перевода строки.

## Публичная проекция

- `metadata.<k>` с `private: true` удаляется; `private: false` опускается (остаётся `{"value": …}`). Если после этого `metadata` пуст — поле опускается.
- Признак `sensitive`: в схеме Entry v0.4 (`schemas/entry.schema.json`, `src/v04.ts`) **его нет**. `sensitive` есть только у описания поля в Manifest (`Field.sensitive`, `src/codex.ts`, наследие v0.3), и сама запись не знает, какие её поля чувствительные. Поэтому профиль `codex-entry/v1` по `sensitive` ничего не удаляет; удаление по Manifest — открытый вопрос следующего шага.
- Необязательные поля **верхнего уровня** (все, кроме `id, locale, kind, status, visibility, slug, title, version, created_at, updated_at`; список — `KEYS_V04.entry` минус `REQUIRED_V04.entry`) со значением `null`, `""`, `[]` или `{}` опускаются. `order: 0` и `pinned: false` — не пустые значения и сохраняются.
- Значения внутри `metadata.<k>.value` не трогаются: `""`, `null`, `[]`, `{}` сохраняются; `{}` остаётся объектом (ловушка PHP `json_decode`/`json_encode`, где пустой объект становится `[]`), объект с ключами `"0"`, `"1"` остаётся объектом.

## Нормализация полей

- Даты (`created_at`, `updated_at`, `published_at`, `deleted_at` — поля `format: date-time` схемы): RFC 3339 → `YYYY-MM-DDTHH:MM:SSZ` в UTC; смещение (`+03:00`) переводится в `Z`; доли из одних нулей (`.000`) отбрасываются; ненулевые доли → `canonical.fractional_seconds`; дата без времени и прочие форматы → `canonical.invalid_date`.
- `terms` сортируются по (`taxonomy`, `term_id`) в порядке кодовых точек Unicode. `origin` сохраняет порядок. Остальные массивы не сортируются.

## Ошибки

| code | когда |
|---|---|
| `canonical.invalid_json` | текст не JSON (RFC 8259), лишние данные после значения |
| `canonical.duplicate_key` | дубль ключа в любом объекте документа |
| `canonical.unsafe_integer` | целый литерал с \|n\| > 2^53−1 (также дробная запись, равная такому целому, напр. `9007199254740993.0`; запись с экспонентой, напр. `1e21`, — обычное число) |
| `canonical.invalid_number` | число не конечно (`1e400`) |
| `canonical.invalid_string` | одиночный суррогат в строке |
| `canonical.invalid_type` | запись не объект; `metadata`, `metadata.<k>`, `terms`, `origin` не той формы |
| `canonical.unknown_field` | неизвестное поле верхнего уровня (или в `metadata.<k>`, `terms[]`, `origin[]`, `discussion`) |
| `canonical.missing_field` | нет обязательного поля (или оно `null`) |
| `canonical.invalid_id` | `id` не по `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$` (только сам `id`, ссылки `*_id` не проверяются) |
| `canonical.invalid_date` | дата-время не RFC 3339, без времени или вне диапазона |
| `canonical.fractional_seconds` | ненулевые доли секунды |

Профиль не заменяет валидатор: типы и перечисления (`status`, `locale` и т.п.) проверяет `validateCollectionV04`.

## Дайджест манифеста — профиль `codex-manifest/v2` (решение, draft v0.4)

Дайджест манифеста — `codex-manifest/v2:sha256:` + hex(sha256(JCS(Canonical()))), то есть RFC 8785 от канонической формы манифеста (согласовано с Ops Engineer). Прежний `codex-manifest/v1` (байты Go `json.Marshal`) остаётся в Go только для совместимости; discovery отдаёт `v2`.

**Canonical() — это полный манифест**: все поля схемы `schemas/manifest.schema.json` (`name`, `version`, `resources[].record` со всеми полями `RecordType`, `fields` с вложенными `options`, `rules`, `items`, `fields`, `relations` с `policy`, `capabilities`, `taxonomies`). Сокращённая форма `{name, version, resources[{id, collection}]}` **не нормативна** и в дайджест не входит. Правила те же, что у `codex-entry/v1`:

- вход — JSON-текст (строгий парсер: дубли ключей, целые вне ±(2^53−1), одиночные суррогаты) или значение (оно сериализуется `JSON.stringify`; `NaN`/`Infinity` → `canonical.invalid_number`, точная проверка целых возможна только для текста);
- ключевые множества закрыты по схеме (`canonical.unknown_field`), обязательные поля по схеме (`canonical.missing_field`), не тот вид объекта/массива — `canonical.invalid_type`; типы и шаблоны строк проверяет валидатор, не профиль;
- пустые необязательные поля (`null`, `""`, `[]`, `{}`) опускаются **только на верхнем уровне**; у манифеста все поля верхнего уровня обязательны, так что на практике ничего не опускается; вложенные значения (`"policy": {}`, `"fields": []`, `""`) сохраняются как есть;
- порядок массивов сохраняется: ни один массив манифеста не сортируется (в том числе `resources`, `fields`, `options`, `rules`, `taxonomies`); перестановка элементов меняет дайджест;
- сериализация — RFC 8785, без пробелов.

Реализация: `canonicalizeManifest(manifest)` и `manifestDigest(manifest)` в `src/canonical.ts` (экспорт из `@ui8kit/contract`, `CANONICAL_MANIFEST_PROFILE`, `MANIFEST_SHAPE`). Векторы: `fixtures/vectors/manifest.json`, тест: `test/canonical-manifest.test.ts`. Фикстура `fixtures/codex/example.manifest.digest.json` по-прежнему v1 и не меняется.

## Префиксы дайджестов

Формат — `<profile>:sha256:<hex>`, где hex — 64 строчных символа SHA-256 от UTF-8 байт JCS (RFC 8785) проекции записи по её схеме с теми же правилами, что у `codex-entry/v1` (строгий парсер, закрытые ключи, safe integers, пустые необязательные поля опускаются только на верхнем уровне, порядок массивов сохраняется, кроме явно сортируемых).

| профиль | что хешируется | в пакете |
|---|---|---|
| `codex-entry/v1` | публичная проекция записи Entry v0.4 | `digest`, векторы `fixtures/vectors/canonical.json` |
| `codex-manifest/v2` | полный манифест | `manifestDigest`, векторы `fixtures/vectors/manifest.json` |
| `codex-term/v1` | запись Term v0.4; `count` не входит в канонику (вычисляемое поле) | `termDigest`, векторы `fixtures/vectors/term.json` |
| `codex-settings/v1` | запись `SettingsV04` | `settingsDigest`, векторы `fixtures/vectors/settings.json` |

## Термин и настройки — профили `codex-term/v1` и `codex-settings/v1` (draft v0.4)

Реализация: `canonicalizeTerm` / `termDigest`, `canonicalizeSettings` / `settingsDigest` в `src/canonical.ts` (общий код с `canonicalize`), экспорт из `@ui8kit/contract`; векторы `fixtures/vectors/term.json`, `fixtures/vectors/settings.json`, тест `test/canonical-term-settings.test.ts`. Вход — JSON-текст (точная проверка целых) или значение, как у `manifestDigest`.

Правила — ровно правила `codex-entry/v1` для плоской записи: ключи и обязательные поля — `KEYS_V04.term` / `REQUIRED_V04.term` и `KEYS_V04.settings` / `REQUIRED_V04.settings` (совпадают со `schemas/term.schema.json`, `schemas/settings.schema.json`, это проверяет тест); `id` по `CODEX_ID_PATTERN`; даты `created_at`, `updated_at` → `YYYY-MM-DDTHH:MM:SSZ`; пустые необязательные поля опускаются только на верхнем уровне; `metadata.<k>` с `private: true` удаляется, `value` не трогается; `origin` и прочие массивы сохраняют порядок; коды ошибок — те же `canonical.*`, новых нет.

Принятые толкования (минимальный вариант там, где docs и схема молчат):

- **`count` у term.** В `term.schema.json` и `KEYS_V04.term` поля `count` нет (адаптер WordPress отбрасывает его как вычисляемое). Профиль принимает `count` верхнего уровня с любым значением и удаляет его до проверки ключей (`TERM_COMPUTED_FIELDS = ["count"]`), а не отвергает как `canonical.unknown_field`. Строгий парсер работает раньше: `count` с целым вне ±(2^53−1) всё равно даёт `canonical.unsafe_integer`. Других вычисляемых полей нет.
- **`id` у settings.** Схема требует только непустую строку; профиль, как и у entry, требует `CODEX_ID_PATTERN` (обычный id — `site`).
- **Ссылки** (`parent_id` у term, `*_media_id`, `front_page_id`, `posts_page_id` у settings) — как `*_id` у entry: не проверяются, пустая строка опускается.
- **`comments_open: false`, `posts_per_page`** — не пустые значения, сохраняются. Типы, шаблоны `locale`, `language`, `currency`, `taxonomy_id` проверяет валидатор (`checkTermV04`, `checkSettingsV04`), не профиль.
- **Сортировок нет**: в docs нет сортируемых массивов для term и settings; `origin` сохраняет порядок, как у entry.
- **Контактный блок settings** (`contact`, `hours`, `hours_exceptions`, `map`). Вложенные множества ключей закрыты, как у `discussion` entry: `contact` — `KEYS_V04.contact`, `contact.links[]` — `KEYS_V04.contactLink`, `hours[]` — `KEYS_V04.hoursRule`, `hours_exceptions[]` — `KEYS_V04.hoursException`, `map` — `KEYS_V04.map`; лишний ключ → `canonical.unknown_field`, не объект / не массив → `canonical.invalid_type`. Пустые `contact: {}`, `hours: []`, `hours_exceptions: []`, `map: {}` — поля верхнего уровня и опускаются; пустые значения **внутри** (`contact.address: ""`, `contact.links: []`) сохраняются, поэтому валидатор их запрещает (`core.settings.type_invalid`): у одних данных одна каноническая форма. Массивы `contact.links`, `hours`, `hours[].days`, `hours_exceptions` **не сортируются** (перестановка меняет дайджест). `map.lat` / `map.lng` — обычные числа (ECMAScript-форма); целый литерал вне ±(2^53−1) где угодно в блоке → `canonical.unsafe_integer`. Профиль остаётся `codex-settings/v1`: правила не изменились, добавились только поля схемы.
