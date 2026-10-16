// Issue codes of the v0.4 validator. Stable public API: a code is never reused for another meaning;
// renames happen only in a minor 0.x release and are listed in CHANGELOG.md.
//
// Grammar: <layer>.<scope>.<problem> or <layer>.<field>_<problem> for fields shared by every record type.
//   layer   decode   = not a JSON object / unknown field (strict shape)
//           core     = rules of the neutral core (docs/core-draft.md)
//           manifest = metadata checked against a manifest (only when one is passed)
//   problem *_required (absent or blank), *_invalid (wrong type, enum or format), *_duplicated (uniqueness),
//           *_missing (a reference to a record that is not in the collection), *_unknown (warning: not declared)
// Severity: errors make a record invalid; WARNING_CODES_V04 are reported with `severity: "warning"`.

export const ISSUE_CODES_V04 = {
  "decode.invalid": "the value is not an object of the expected record type",
  "decode.unknown_field": "a field the record type does not have (records are closed)",

  "core.id_required": "id is absent or blank",
  "core.locale_invalid": "locale is not a BCP 47 tag",
  "core.version_required": "version is not an integer >= 1",
  "core.timestamps_required": "created_at / updated_at are not RFC 3339",
  "core.timestamps_order": "updated_at precedes created_at",
  "core.origin_invalid": "origin is not an array of {system, id}",
  "core.metadata_invalid": "metadata is not an object of {value, private?}",
  "core.metadata_key_required": "a metadata key is blank",
  "core.metadata_key_shadowed": "warning: a metadata key equals a core entry field (status, excerpt, ...)",

  "core.entry.type_invalid": "an optional entry field has the wrong type",
  "core.entry.kind_invalid": "kind is not an identifier (^[a-z][a-z0-9_-]{0,62}$)",
  "core.entry.status_invalid": "status is not one of ENTRY_STATUSES_V04",
  "core.entry.visibility_invalid": "visibility is not public | private",
  "core.entry.slug_required": "slug is blank",
  "core.entry.title_required": "title is not a string",
  "core.entry.time_invalid": "published_at / deleted_at is not RFC 3339",
  "core.entry.published_at_required": "status scheduled without published_at",
  "core.entry.deleted_at_required": "status trashed without deleted_at",
  "core.entry.terms_invalid": "terms is not an array of {taxonomy, term_id}",
  "core.entry.key_duplicated": "(id, locale) is not unique among entries",
  "core.entry.slug_duplicated": "slug is not unique within (kind, locale, parent_id)",
  "core.entry.parent_missing": "parent_id names no entry of the collection",
  "core.entry.parent_self": "parent_id equals the entry's own id",
  "core.entry.parent_kind_invalid": "the parent entry has another kind",
  "core.entry.parent_cycle": "the parent chain loops back to the entry (per locale)",

  "core.term_ref.incomplete": "a term reference lacks taxonomy or term_id",
  "core.term_ref.duplicated": "the same term is referenced twice by one entry",
  "core.term_ref.missing": "a term reference names no term of the collection",

  "core.term.type_invalid": "an optional term field has the wrong type",
  "core.term.taxonomy_invalid": "taxonomy_id is not an identifier",
  "core.term.name_required": "name is blank",
  "core.term.slug_required": "slug is blank",
  "core.term.key_duplicated": "(id, locale) is not unique among terms",
  "core.term.slug_duplicated": "slug is not unique within (taxonomy_id, locale, parent_id)",
  "core.term.parent_missing": "parent_id names no term of the taxonomy",
  "core.term.parent_self": "parent_id equals the term's own id",
  "core.term.parent_cycle": "the parent chain loops back to the term (per taxonomy and locale)",

  "core.comment.entry_required": "entry_id is blank",
  "core.comment.content_required": "content is not a string",
  "core.comment.status_invalid": "status is not one of COMMENT_STATUSES_V04",
  "core.comment.key_duplicated": "(id, locale) is not unique among comments",
  "core.comment.entry_missing": "entry_id names no entry of the collection",

  "core.menu.location_required": "location is blank",
  "core.menu.items_required": "items is not an array",
  "core.menu.item_incomplete": "a menu item lacks id, label or url",
  "core.menu.item_duplicated": "two items of one menu share an id",
  "core.menu.parent_missing": "an item's parent_id names no item of the menu",
  "core.menu.parent_cycle": "a menu item is its own ancestor",
  "core.menu.target_invalid": "target is not {kind, id}",
  "core.menu.key_duplicated": "(id, locale) is not unique among menus",

  "core.dictionary.messages_required": "messages is not an object",
  "core.dictionary.value_invalid": "a message is not a string",

  "core.settings.type_invalid": "an optional settings field has the wrong type",
  "core.settings.title_required": "title is blank",
  "core.settings.language_invalid": "language is not a BCP 47 tag",
  "core.settings.timezone_invalid": "timezone is not an IANA zone name",
  "core.settings.currency_invalid": "currency is not ISO 4217 (three capital letters)",
  "core.settings.key_duplicated": "(id, locale) is not unique among settings",

  "manifest.invalid": "the manifest is not {name, version, resources[]}",
  "manifest.kind_unknown": "warning: no resource of the manifest describes the entry's kind",
  "manifest.metadata_unknown": "warning: a metadata key the resource does not declare",
  "manifest.field_required": "a required manifest field is absent from metadata",
  "manifest.field_invalid": "a metadata value does not match its manifest field type or rule (integer and money: safe integers)",
  "manifest.currency_missing": "a money field without a currency (entry, settings or options)",
  "manifest.currency_invalid": "the currency of a money field is not ISO 4217",
} as const;

export type IssueCodeV04 = keyof typeof ISSUE_CODES_V04;
export const WARNING_CODES_V04: readonly IssueCodeV04[] = ["core.metadata_key_shadowed", "manifest.kind_unknown", "manifest.metadata_unknown"];
