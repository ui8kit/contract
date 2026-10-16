// @ui8kit/contract: Codex v0.4 core (src/v04.ts, validate-v04.ts) + legacy v0.3 types, validation, snapshot loader, readers and the adapter pattern.
export * from "./codex.js";
export * from "./access.js";
export * from "./library.js";
export * from "./adapter.js";
export { validateSnapshot, validateTaxonomy, validateRevision, type Issue, type RawEntry, type ValidateOptions } from "./validate.js";
// Codex v0.4 core (current contract). Platform adapters are separate entry points, e.g. "@ui8kit/contract/adapters/wordpress".
export * from "./v04.js";
export { validateCollectionV04, checkEntryV04, checkTermV04, checkCommentV04, checkMenuV04, checkDictionaryV04, checkSettingsV04, KEYS_V04, type IssueV04, type ValidateV04Options, type RecordFile, type CollectionV04 } from "./validate-v04.js";
