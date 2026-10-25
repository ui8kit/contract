# Codex v0.4 — черновик общего ядра данных

Статус: черновик Codex v0.4, ред. 5 (сверено с реализацией `@ui8kit/contract` 0.2.0: деньги, настройки, коды проверок). Все решения разделов 1–6 **согласованы**, открытых вопросов нет. Ядро будет выпущено как Codex v0.4 в `fastygo/codex`; `@ui8kit/contract` следует за ним. Реализовано в `@ui8kit/contract` 0.2.0: `src/v04.ts`, `src/validate-v04.ts`, схемы `https://schema.buildy.tw/<name>.schema.json` (без версии в адресе до v0.5), адаптер WordPress — `src/adapters/wordpress.ts`. База: Codex v0.3.0 (`github.com/fastygo/codex`: Entry, Manifest, Taxonomy, Revision) и `@ui8kit/contract` 0.1.0 (схемы на schema.buildy.tw/v0.3). При расхождении с фикстурами `fastygo/app-gocms` (`schema/codex/v1`) главным считается формат Codex v0.3.0.

Каноническая форма и дайджест записи (профиль `codex-entry/v1`, draft v0.4) — в [docs/canonical.md](canonical.md).

## 1. Зачем

Один формат данных для всех наших систем: wpfasty (WordPress), phpfasty (Slim, Flight CMS), fastygo (GoCMS, GoCRM), appfasty (SvelteCMS, React, Vue) и фикстуры codegen-x.

Принципы:
- В контракте нет полей конкретной платформы (никаких `wp_*`, числовых id WordPress, паролей записей и т.п.). Такое остаётся внутри платформы и в её адаптере.
- Адаптеры (WordPress, Slim, GoCMS…) живут **вне** контракта и приводят данные к ядру.
- **«Думай как Codex WP»**: новая сущность (отзыв, testimonial, лид, сделка) — это новый `kind` со своими свободными типизированными полями (описаны в Manifest), а не новый статус. Статусы — только общий жизненный цикл записи.
- **Языки не меняют контракт**: в записи все тексты — обычные строки на одном языке (поле `locale`). Переводы лежат отдельно, в словарях (см. раздел 4).
- Источник истины — то, что согласуем сейчас для wpfasty + codegen-x. Остальные системы подтягиваются позже (UI8Kit 2.0).

## 2. Поля ядра (запись Entry)

Жирным — новые поля или изменения относительно Codex v0.3.0.

| Поле | Тип | Обязательно | Смысл |
|---|---|---|---|
| id | string | да | Наш собственный id записи (строка, не число платформы). Общий для всех языковых версий одной записи |
| kind | string | да | Вид записи: `post`, `page`, `review`, `lead`, `deal`, … |
| status | `draft` \| **`pending`** \| `scheduled` \| `published` \| `archived` \| `trashed` | да | Жизненный цикл. `pending` — «ждёт проверки редактором» (как в WordPress) |
| visibility | `public` \| `private` | да | Кто видит |
| **locale** | string (BCP 47, напр. `ru`, `en-US`) | да | Язык этой версии записи. **Ключ записи = (id, locale)** |
| slug | **string** | да | Адрес записи (на языке `locale`) |
| title | **string** | да | Заголовок |
| content | **string** | нет | Основной текст (исходный, не «отрисованный») |
| excerpt | **string** | нет | Краткое описание |
| author_id | string | нет | id пользователя (kind `user`) |
| parent_id | string | нет | Родитель (страницы, вложенные записи) |
| featured_media_id | string | нет | id медиа (kind `media`) |
| template | string | нет | Имя шаблона вывода |
| terms | [{taxonomy, term_id}] | нет | Привязка к рубрикам/меткам |
| metadata | { ключ: {value, private?} } | нет | Доп. поля вида. **Значения типизированные** (число — числом, да/нет — boolean). Адаптер сам переводит строки WP в нужный тип |
| **order** | integer | нет | Порядок вручную (меньше — выше). По умолчанию 0 |
| **pinned** | boolean | нет | Закреплено вверху списка. По умолчанию false |
| **format** | string | нет | Вид подачи: `standard`, `gallery`, `video`, `quote`, `link`, `audio`, `image`, `aside`, `status`, `chat`. Свободная строка |
| **discussion** | {comments: boolean, pings: boolean} | нет | Открыты ли комментарии и упоминания (пинги) |
| **origin** | [{system: string, id: string}] | нет | Откуда пришла запись: `[{"system":"wordpress","id":"42"}]`. Массив — запись может пройти через несколько систем при переездах. Заменяет числовые id платформ |
| version | integer | да | Номер версии (правки, ревизии) |
| created_at | дата RFC 3339 | да | Создано |
| updated_at | дата RFC 3339 | да | Изменено |
| published_at | дата RFC 3339 | нет | Опубликовано / запланировано на |
| deleted_at | дата RFC 3339 | нет | Удалено в корзину |

Почему так:
- `order`, `pinned`, `format`, `discussion` нужны не только WordPress: порядок страниц и меню есть в любой CMS (GoCMS: «Pages SHOULD support custom ordering»), закрепление — в блоге и CRM, комментарии — везде, где есть обсуждение.
- `origin` — без него при переезде теряется связь со старым id, а числовые id WordPress в ядро тащить нельзя.
- `pending` — привычное имя из WordPress; одно общее «ждёт одобрения» для всех платформ.
- Пароль записи (`access`) убран: это внутреннее дело WordPress и его адаптера, в ядро не попадает.

> **Отличие от Codex v0.3.0.** В Codex `slug`, `title`, `content`, `excerpt` — объекты «язык → строка», и есть поле `locales`. В этом черновике они **плоские строки** + поле `locale`, а `locales` убрано; переводы вынесены в словари. Это ломающее изменение схемы Entry (и Term, где `name`/`slug`/`description` тоже по языкам), поэтому — v0.4. **Ключ записи меняется с `id` на пару `(id, locale)`**; ссылки (`parent_id`, `author_id`, `terms` и т.п.) указывают на `id`, а язык берётся из контекста (своя `locale` или исходная). Ревизии (Revision) тоже привязываются к паре `(id, locale)`.

## 3. Виды (kind) — минимальные формы

Все виды ниже используют общие `id`, `version`, `created_at`, `updated_at`, `locale?`, `origin?`, `metadata?`. Перечислены только свои поля. Формы — предложение: в Codex v0.3.0 их **нет** (кроме entry, taxonomy, revision).

- **entry** (`post`, `page` и любые свои виды: `review`, `testimonial`, `lead`, `deal`…) — таблица выше. Свои поля вида — в `metadata`, их описание — в Manifest (RecordType/Field).
- **media**: `kind:"media"`, `title`, `file` (url или путь), `mime`, `size?` (байты), `width?`, `height?`, `alt?`, `caption?` (строки), `attached_to?` — id записи-владельца `<kind>-<n>` (ссылка, не иерархия). `parent_id` у media не используется: это иерархия внутри одного kind.
  Из WordPress (`fromWpMedia`, draft v0.4): поля вида лежат в `metadata.<k>.value` (`file`, `mime`, `size`, `width`, `height`, `alt`, `caption`); WP `post` → `metadata.attached_to.value` = `<kind>-<n>` (тот же генератор id, что у `fromWpPost`); kind владельца REST не сообщает, его даёт опция `resolveKind(postId)` (приоритет) или `parentKind`; `post` = 0, нет kind — поля нет. Отдельного типа ref для metadata в контракте нет (relation — только поле Manifest), поэтому это строка.
- **user**: `kind:"user"`, `login` (или `slug`), `display_name`, `email?` (приватно), `roles` [string], `avatar_media_id?`. Пароли и токены — никогда.
  Из WordPress (`fromWpUser`, draft v0.4): `display_name` = `title` (WP `name`), `login`/`roles` — `metadata` с `private:true`, `email` и имена — только по опции `personal` и `private:true`; `avatar_media_id` в WP нет.
- **Правило id** (draft v0.4, согласовано): `id` — ASCII `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`; для целочисленных PK MUST `<kind>-<n>`; id неизменяем и сохраняется при импорте, исходный id — в `origin[] {system, id}`. Код: `CODEX_ID_PATTERN` / `isCodexId` (`src/id.ts`), его же использует `canonicalize`; `entry.schema.json` ужесточается только в v0.5.
- **comment**: `kind:"comment"`, `entry_id`, `parent_id?`, `author_id?` или `author_name?`, `content`, `status`: `approved` | `hold` | `spam` | `trash` (как в ядре WordPress; `hold` = ждёт модерации). Статусы комментария — свой набор, не путать со статусами Entry.
- **menu** (по образцу `fastygo/app-gocms` `menu.schema.json`): `{id, location, locale, items:[{id, label, url, parent_id?, order?, target?}]}`. `label` — строка; переводы — в словаре. `target?: {kind, id}` — необязательная ссылка на запись (url остаётся основным).
- **settings** — отдельный тип записи (не entry), одна запись на сайт и язык, обычно `id:"site"`: `{id, locale, title, language, description?, timezone?, logo_media_id?, icon_media_id?, front_page_id?, posts_page_id?, posts_per_page?, comments_open?, currency?, origin?, metadata?}` + `version`, `created_at`, `updated_at`. `language` — BCP 47 (`en-US`), `timezone` — IANA (`Europe/Moscow`), `currency` — ISO 4217, валюта по умолчанию для денег. Схема `https://schema.buildy.tw/settings.schema.json`; ключ `(id, locale)` уникален. Из WordPress: `/wp/v2/settings` (`language` `en_US` ↔ `en-US`, `wpfasty_currency` ↔ `currency`; поля без пары в ядре — в sidecar адаптера).
- **taxonomy / term** и **revision** — как в Codex v0.3.0, кроме языковых полей: строки + `locale`. Перевод термина — отдельная запись `(id, locale)` со своим `slug` (согласовано).

## 4. Переводы (согласовано)

Две вещи, как в WPML/Polylang и gettext/i18n-каталогах:

**4.1. Перевод записи — отдельная запись.** Тот же `id`, другой `locale`; свои `title`, `slug`, `content`, `excerpt`, `status`, `version`, даты. Например `{id:"hello-world", locale:"ru", …}` и `{id:"hello-world", locale:"en", …}`. Нет версии на нужном языке — платформа решает, показать ли исходную (правило отката — забота платформы).

**4.2. Словари — только подписи меню и строки интерфейса.** Термины таксономий переводятся как записи (п. 4.1): тот же `id`, другой `locale`, свой `slug`. Один файл на язык, напр. `i18n/en.json`:

```json
{
  "locale": "en",
  "source_locale": "ru",
  "messages": {
    "menu:primary:about:label": "About",
    "ui:read_more": "Read more"
  }
}
```

- Ключ: `<вид>:<id>:<поле>` (пункт меню — `menu:<id меню>:<id пункта>:label`; строки интерфейса — `ui:<ключ>`).
- Нет перевода — показываем исходную строку.
- Длинный текст (`content`) в словари не кладём.
- Экспорт в `.po` возможен один к одному (`msgctxt` = ключ, `msgid` = исходник, `msgstr` = перевод) — **не проверено** на наших инструментах.

**4.3. Проверки валидатора контракта.** Пара `(id, locale)` уникальна. `slug` уникален в тройке `(kind, locale, parent_id)`, как у иерархических страниц WordPress; у плоских видов `parent_id` пустой, то есть фактически `(kind, locale)`. Для терминов — в `(taxonomy_id, locale, parent_id)`. Проверяет валидатор `@ui8kit/contract` / Codex v0.4.

**4.4. Деньги.** Поле с правилом `fastygo.codex/money` хранит **целое число в минимальных единицах** (центы, копейки: `1250` = 12.50) — без дробей и строк, только безопасные целые (|n| ≤ 2^53 − 1, чтобы JS, Go и PHP читали точно). Ноль и отрицательные суммы (возвраты, скидки) допустимы. Валюта — ISO 4217 (`USD`, `EUR`), **одна на запись**: своё поле записи (`currency` или имя из аргумента правила `currency_field`), иначе `currency` из записи settings, иначе значение по умолчанию у валидатора. Деньги во вложенных полях (строки заказа: `collection` из `object`) используют ту же валюту. Нет валюты — ошибка `manifest.currency_missing`, неверный код — `manifest.currency_invalid` (одна ошибка на запись). Форматирование (символ, разделители, `Intl.NumberFormat` / `number_format_i18n`) — забота представления, не ядра.

**4.5. Проверки и коды.** Валидатор возвращает `{code, path, message, severity?}`; у ошибок `severity` нет, предупреждения — `severity:"warning"` и запись не делают невалидной. Код — стабильная часть API (сообщения могут меняться). Грамматика: `<слой>.<область>.<проблема>` или `<слой>.<поле>_<проблема>` для общих полей; слои `decode` (не объект, лишнее поле), `core` (правила ядра), `manifest` (metadata против манифеста, только если он передан). Окончания: `_required`, `_invalid`, `_duplicated`, `_missing`, `_unknown`, `_cycle`, `_self`, `_order`, `_shadowed`, `_incomplete`. Помимо уникальности (4.3) проверяются ссылки (родитель, термины, запись комментария), циклы родителей (`core.entry.parent_cycle` — в пределах языка, `core.term.parent_cycle`, `core.menu.parent_cycle`), родитель того же `kind`. Предупреждения: `manifest.kind_unknown` (вид не описан — metadata не проверяется), `manifest.metadata_unknown`, `core.metadata_key_shadowed` (ключ metadata совпадает с полем ядра, например `status` — используйте `<kind>_status`). Полный список — `ISSUE_CODES_V04` и таблица в README.

## 5. Соответствие WordPress REST v2 (post/page) → ядро

| WP поле | Поле ядра | Примечание |
|---|---|---|
| id | origin[{system:"wordpress", id:"<id>"}] | Наш `id` — свой. Числовой id только в origin |
| date / date_gmt | published_at (опубликованные и запланированные), created_at | Берём `_gmt`, пишем в UTC. У черновика `date_gmt` = null → поля нет, null хранит sidecar. У запланированного `date_gmt` позже `modified`, поэтому created_at = modified |
| modified / modified_gmt | updated_at | Берём `_gmt` |
| slug | slug | |
| status: publish / future / draft / pending / private / trash | published / scheduled / draft / pending / published + visibility:private / trashed | |
| type (post/page/свой тип) | kind | |
| password | — | **не переносим**: остаётся в sidecar адаптера |
| title.raw | title | title.rendered — **игнор** |
| content.raw | content | content.rendered, content.protected — **игнор** |
| excerpt.raw | excerpt | excerpt.rendered — **игнор** |
| — (язык сайта / плагина переводов) | locale | Источник зависит от сайта (не проверено) |
| author | author_id | Через origin пользователя |
| featured_media | featured_media_id | 0 → поле отсутствует |
| comment_status (open/closed) | discussion.comments | |
| ping_status (open/closed) | discussion.pings | |
| sticky (только post) | pinned | |
| format (только post) | format | |
| menu_order (только page) | order | |
| parent (page) | parent_id | 0 → поле отсутствует |
| template | template | Пустая строка → отсутствует |
| meta | metadata | Типы из `register_post_meta` (деньги — целые центы); ключи с `_` — private; null (не задано) → ключа нет |
| categories, tags (и свои таксономии) | terms[] | |
| link, guid | — | **игнор** (вычисляются) |
| _links, _embedded | — | **игнор** |
| *.rendered | — | **игнор** |
| поля плагинов (class_list, yoast_head и т.п.) | — | **игнор** или в metadata через адаптер (не проверено) |

Комментарии WP (`/wp/v2/comments`): `status` approved / hold / spam / trash → те же значения в kind `comment` (имена статусов по памяти — **не проверено** на живом ответе).

Поля записей, терминов и настроек сверены с живыми ответами `context=edit` трёх сайтов wpfasty (8081–8083, фикстуры в `fixtures/wordpress/`); круговой перевод WP → ядро → WP даёт 0 различий. Комментарии WP на живом ответе не сверялись — **не проверено**.

## 6. Как сюда ложатся CRM и codegen-x

- **CRM (GoCRM)**: лид и сделка — `kind:"lead"` и `kind:"deal"`. `title` — имя/название, `status` — общий жизненный цикл, этап воронки (`new`, `won`, `lost`…) — поле в `metadata` или таксономия `pipeline_stage`, но не статус. Связи (сделка → лид, ответственный → user) — `parent_id`/`author_id` или relation в Manifest.
- **codegen-x фикстуры**: обычные JSON-записи ядра (плюс при нужде словари `i18n/*.json`), проходящие валидатор `@ui8kit/contract`. `origin` можно ставить `[{system:"fixture", id:"hello-world"}]`. Никаких особых полей для фикстур.

## 7. Открытые вопросы

Нет — все вопросы закрыты (ред. 5).
