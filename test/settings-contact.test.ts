// Settings contact block (contact, hours, hours_exceptions, map): schema ↔ validator agreement, validator rules,
// codex-settings/v1 canonical form (nested shapes, array order, safe integers) and the WordPress adapter options.
import { describe, expect, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { ALL_V04 } from "../scripts/schemas-v04.ts";
import { validateCollectionV04, checkSettingsV04, E164_PATTERN } from "../src/validate-v04.ts";
import { canonicalizeSettings, settingsDigest, CanonicalError } from "../src/canonical.ts";
import { LOCALE_NEUTRAL_SETTINGS_V04, WEEKDAYS_V04, type SettingsV04 } from "../src/v04.ts";
import { fromWpSettings, toWpSettings, WP_CONTACT_OPTIONS, type WpSettings } from "../src/adapters/wordpress.ts";
import { WARNING_CODES_V04 } from "../src/codes-v04.ts";
import * as core from "../src/index.ts";
import fs from "node:fs";
import path from "node:path";

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);
ajv.addKeyword("x-codex-version");
ajv.addKeyword("x-ui-hint");
const schemaOk = ajv.compile(ALL_V04.settings);
const at = "2026-10-28T09:00:00Z";
const base: SettingsV04 = { id: "site", locale: "en", title: "Studio", language: "en-US", timezone: "America/New_York", version: 1, created_at: at, updated_at: at };
const codes = (o: unknown) => { const out: string[] = []; checkSettingsV04(o, "s", (c) => out.push(c)); return out; };
const files = (list: unknown[]) => list.map((data, i) => ({ file: `s[${i}]`, data }));
const full: SettingsV04 = {
  ...base,
  contact: {
    phone: "+12025550143", email: "hello@example.com", address: "1 Example Street, Springfield",
    links: [{ network: "telegram", handle: "example_studio" }, { network: "whatsapp", handle: "+12025550143" }],
  },
  hours: [{ days: ["mon", "tue", "wed", "thu", "fri"], open: "09:00", close: "18:00" }, { days: ["sat"], open: "10:00", close: "14:00" }],
  hours_exceptions: [{ date: "2026-12-25", closed: true }, { date: "2026-12-24", open: "09:00", close: "13:00" }],
  map: { provider: "osm", lat: 38.8977, lng: -77.0365 },
};

describe("full contact block", () => {
  test("passes ajv and the validator; exported from the package index", () => {
    expect(schemaOk(full)).toBe(true);
    expect(codes(full)).toEqual([]);
    expect(core.WEEKDAYS_V04).toEqual(WEEKDAYS_V04);
    expect(core.E164_PATTERN).toBe(E164_PATTERN);
    expect(core.LOCALE_NEUTRAL_SETTINGS_V04).toEqual(LOCALE_NEUTRAL_SETTINGS_V04);
  });
  test("every key is optional: each part alone is valid", () => {
    for (const k of ["contact", "hours", "hours_exceptions", "map"] as const) {
      const o = { ...base, [k]: full[k] };
      expect(schemaOk(o)).toBe(true);
      expect(codes(o)).toEqual([]);
    }
  });
});

// [label, settings patch, validator codes]; ajv must agree on valid/invalid unless `ajvBlind` (rules JSON Schema cannot say)
type Row = [string, Record<string, unknown>, string[], boolean?];
const c = (contact: Record<string, unknown>) => ({ contact });
const h = (hours: unknown) => ({ hours });
const x = (hours_exceptions: unknown) => ({ hours_exceptions });
const rows: Row[] = [
  ["E.164 valid: +12025550143", c({ phone: "+12025550143" }), []],
  ["E.164 valid: shortest +12 (2 digits)", c({ phone: "+12" }), []],
  ["E.164 valid: 15 digits", c({ phone: "+441632960961123" }), []],
  ["E.164 invalid: spaces", c({ phone: "+1 202 555 0143" }), ["core.settings.phone_invalid"]],
  ["E.164 invalid: no plus", c({ phone: "12025550143" }), ["core.settings.phone_invalid"]],
  ["E.164 invalid: leading zero country", c({ phone: "+0123456" }), ["core.settings.phone_invalid"]],
  ["E.164 invalid: 16 digits", c({ phone: "+1234567890123456" }), ["core.settings.phone_invalid"]],
  ["E.164 invalid: dashes", c({ phone: "+1-202-555-0143" }), ["core.settings.phone_invalid"]],
  ["E.164 invalid: number type", c({ phone: 12025550143 }), ["core.settings.phone_invalid"]],
  ["email valid", c({ email: "team+site@example.com" }), []],
  ["email invalid: no domain dot", c({ email: "team@example" }), ["core.settings.email_invalid"]],
  ["email invalid: spaces", c({ email: "team @example.com" }), ["core.settings.email_invalid"]],
  ["address blank", c({ address: "  " }), ["core.settings.type_invalid"]],
  ["contact unknown key", c({ fax: "+12025550144" }), ["decode.unknown_field"]],
  ["contact not an object", { contact: "x" }, ["core.settings.type_invalid"]],
  ["links empty array", c({ links: [] }), ["core.settings.type_invalid"]],
  ["link without handle", c({ links: [{ network: "telegram" }] }), ["core.settings.link_invalid"]],
  ["link network uppercase", c({ links: [{ network: "Telegram", handle: "a" }] }), ["core.settings.link_invalid"]],
  ["link handle with space", c({ links: [{ network: "telegram", handle: "a b" }] }), ["core.settings.link_invalid"]],
  ["link unknown key", c({ links: [{ network: "telegram", handle: "a", url: "https://t.me/a" }] }), ["decode.unknown_field"]],
  ["hours: overnight 20:00-02:00", h([{ days: ["fri", "sat"], open: "20:00", close: "02:00" }]), []],
  ["hours: all day 00:00-24:00", h([{ days: ["sun"], open: "00:00", close: "24:00" }]), []],
  ["hours: lunch break = two rules on one day", h([{ days: ["mon"], open: "09:00", close: "13:00" }, { days: ["mon"], open: "14:00", close: "18:00" }]), []],
  ["hours: days in source order (sun first) are valid", h([{ days: ["sun", "mon"], open: "09:00", close: "18:00" }]), []],
  ["hours: empty array (top level, dropped by the canonical form)", h([]), []],
  ["hours: no days", h([{ days: [], open: "09:00", close: "18:00" }]), ["core.settings.hours_invalid"]],
  ["hours: unknown day", h([{ days: ["monday"], open: "09:00", close: "18:00" }]), ["core.settings.hours_invalid"]],
  ["hours: day twice", h([{ days: ["mon", "mon"], open: "09:00", close: "18:00" }]), ["core.settings.hours_invalid"]],
  ["hours: open 24:00", h([{ days: ["mon"], open: "24:00", close: "18:00" }]), ["core.settings.hours_invalid"]],
  ["hours: close 24:30", h([{ days: ["mon"], open: "09:00", close: "24:30" }]), ["core.settings.hours_invalid"]],
  ["hours: 9:00 without leading zero", h([{ days: ["mon"], open: "9:00", close: "18:00" }]), ["core.settings.hours_invalid"]],
  ["hours: close equal to open", h([{ days: ["mon"], open: "09:00", close: "09:00" }]), ["core.settings.hours_invalid"], true],
  ["hours: missing close", h([{ days: ["mon"], open: "09:00" }]), ["core.settings.hours_invalid"]],
  ["hours: not an array", h({ mon: "09:00-18:00" }), ["core.settings.type_invalid"]],
  ["exception: closed", x([{ date: "2026-01-01", closed: true }]), []],
  ["exception: short day", x([{ date: "2026-12-31", open: "10:00", close: "15:00" }]), []],
  ["exception: leap day 2028-02-29", x([{ date: "2028-02-29", closed: true }]), []],
  ["exception: closed false", x([{ date: "2026-01-01", closed: false }]), ["core.settings.hours_exception_invalid"]],
  ["exception: closed and times", x([{ date: "2026-01-01", closed: true, open: "10:00", close: "12:00" }]), ["core.settings.hours_exception_invalid"]],
  ["exception: neither closed nor times", x([{ date: "2026-01-01" }]), ["core.settings.hours_exception_invalid"]],
  ["exception: open without close", x([{ date: "2026-01-01", open: "10:00" }]), ["core.settings.hours_exception_invalid"]],
  ["exception: 2026-02-30 does not exist", x([{ date: "2026-02-30", closed: true }]), ["core.settings.hours_exception_invalid"], true],
  ["exception: date with time", x([{ date: "2026-01-01T00:00:00Z", closed: true }]), ["core.settings.hours_exception_invalid"]],
  ["exception: one date twice", x([{ date: "2026-01-01", closed: true }, { date: "2026-01-01", open: "10:00", close: "12:00" }]), ["core.settings.hours_exception_duplicated"], true],
  ["map: provider only (search by address)", { map: { provider: "google" } }, []],
  ["map: coordinates only", { map: { lat: -33.8568, lng: 151.2153 } }, []],
  ["map: lat 91", { map: { lat: 91, lng: 0 } }, ["core.settings.map_invalid"]],
  ["map: lat without lng", { map: { provider: "osm", lat: 10 } }, ["core.settings.map_invalid"]],
  ["map: coordinates as strings", { map: { lat: "55.75", lng: "37.61" } }, ["core.settings.map_invalid", "core.settings.map_invalid"]],
  ["map: provider with spaces", { map: { provider: "Open Street Map" } }, ["core.settings.map_invalid"]],
  ["map: unknown key", { map: { provider: "osm", zoom: 12 } }, ["decode.unknown_field"]],
];

describe("validator rules and schema agreement", () => {
  for (const [label, patch, want, ajvBlind] of rows) {
    test(label, () => {
      const o = { ...base, ...patch };
      expect(codes(o)).toEqual(want);
      if (!ajvBlind) expect(schemaOk(o)).toBe(want.length === 0);
      else expect(schemaOk(o)).toBe(true); // structurally fine; only the validator knows the rule
    });
  }
});

describe("localized address", () => {
  const en = full;
  const ru: SettingsV04 = { ...full, locale: "ru", language: "ru-RU", title: "Студия", contact: { ...full.contact, address: "Москва, ул. Примерная, д. 1" } };
  test("each locale carries its own address: no issue, different digests", () => {
    expect(validateCollectionV04({ settings: files([en, ru]) })).toEqual([]);
    expect(settingsDigest(en)).not.toBe(settingsDigest(ru));
    expect(JSON.parse(canonicalizeSettings(ru)).contact.address).toBe("Москва, ул. Примерная, д. 1");
  });
  test("phone, links, hours or map differing between locales: warning core.settings.locale_neutral_mismatch", () => {
    expect(WARNING_CODES_V04).toContain("core.settings.locale_neutral_mismatch");
    const ru2 = { ...ru, contact: { ...ru.contact, phone: "+12025550199" }, map: { provider: "yandex", lat: 38.8977, lng: -77.0365 } };
    const issues = validateCollectionV04({ settings: files([en, ru2]) });
    expect(issues.map((i) => [i.code, i.path, i.severity])).toEqual([
      ["core.settings.locale_neutral_mismatch", "s[1].contact.phone", "warning"],
      ["core.settings.locale_neutral_mismatch", "s[1].map", "warning"],
    ]);
  });
  test("same values with another key order inside objects are equal (no warning); another link order is not", () => {
    const ru3 = { ...ru, map: { lng: -77.0365, lat: 38.8977, provider: "osm" }, contact: { ...ru.contact, links: full.contact!.links!.map((l) => ({ handle: l.handle, network: l.network })) } };
    expect(validateCollectionV04({ settings: files([en, ru3]) })).toEqual([]);
    const ru4 = { ...ru, contact: { ...ru.contact, links: [...full.contact!.links!].reverse() } };
    expect(validateCollectionV04({ settings: files([en, ru4]) }).map((i) => i.path)).toEqual(["s[1].contact.links"]);
  });
  test("different settings ids are not compared", () => {
    const other = { ...full, id: "shop", locale: "ru", contact: { phone: "+12025550100" } };
    expect(validateCollectionV04({ settings: files([en, other]) })).toEqual([]);
  });
});

describe("codex-settings/v1 over the contact block", () => {
  const canon = (o: unknown) => JSON.parse(canonicalizeSettings(o as object));
  test("links, hours, days and exceptions keep the source order (never sorted)", () => {
    const o = { ...full, contact: { links: [{ network: "x", handle: "z" }, { network: "telegram", handle: "a" }] }, hours: [{ days: ["sat", "mon"], open: "10:00", close: "12:00" }], hours_exceptions: [{ date: "2026-12-31", closed: true }, { date: "2026-01-01", closed: true }] };
    const out = canon(o);
    expect(out.contact.links.map((l: { network: string }) => l.network)).toEqual(["x", "telegram"]);
    expect(out.hours[0].days).toEqual(["sat", "mon"]);
    expect(out.hours_exceptions.map((e: { date: string }) => e.date)).toEqual(["2026-12-31", "2026-01-01"]);
    const swapped = { ...o, contact: { links: [...o.contact.links].reverse() } };
    expect(settingsDigest(swapped)).not.toBe(settingsDigest(o));
  });
  test("keys inside nested objects are sorted (RFC 8785); numbers in ECMAScript form", () => {
    const text = canonicalizeSettings({ ...base, map: { provider: "osm", lng: 37.617300, lat: 55.7558 } });
    expect(text).toContain(`"map":{"lat":55.7558,"lng":37.6173,"provider":"osm"}`);
  });
  test("empty optional fields are dropped only at the top level; nested empty values stay (and the validator rejects them)", () => {
    expect(canonicalizeSettings({ ...base, contact: {}, hours: [], hours_exceptions: [], map: {} })).toBe(canonicalizeSettings(base));
    const nested = { ...base, contact: { address: "", links: [] } };
    expect(canon(nested).contact).toEqual({ address: "", links: [] });
    expect(codes(nested)).toEqual(["core.settings.type_invalid", "core.settings.type_invalid"]);
  });
  test("closed nested key sets and shapes: canonical.unknown_field / canonical.invalid_type", () => {
    const code = (o: unknown) => { try { canonicalizeSettings(o as object); return "ok"; } catch (e) { return (e as CanonicalError).code; } };
    expect(code({ ...base, contact: { phone: "+12", fax: "+13" } })).toBe("canonical.unknown_field");
    expect(code({ ...base, contact: { links: [{ network: "telegram", handle: "a", url: "u" }] } })).toBe("canonical.unknown_field");
    expect(code({ ...base, hours: [{ days: ["mon"], open: "09:00", close: "18:00", note: "x" }] })).toBe("canonical.unknown_field");
    expect(code({ ...base, hours_exceptions: [{ date: "2026-01-01", closed: true, reason: "x" }] })).toBe("canonical.unknown_field");
    expect(code({ ...base, map: { provider: "osm", zoom: 3 } })).toBe("canonical.unknown_field");
    expect(code({ ...base, contact: "x" })).toBe("canonical.invalid_type");
    expect(code({ ...base, hours: { days: ["mon"] } })).toBe("canonical.invalid_type");
    expect(code({ ...base, contact: { links: ["telegram"] } })).toBe("canonical.invalid_type");
  });
  test("an integer above 2^53-1 anywhere in the block is an error (text input)", () => {
    const t = JSON.stringify({ ...base, map: { lat: 1, lng: 2 } }).replace('"lng":2', '"lng":9007199254740992');
    expect(() => canonicalizeSettings(t)).toThrow(/canonical.unsafe_integer/);
  });
});

describe("WordPress adapter: wpfasty-types options", () => {
  const root = path.resolve(import.meta.dir, "..");
  const wps: WpSettings = JSON.parse(fs.readFileSync(path.join(root, "fixtures/wordpress/settings.json"), "utf8"));
  const w: WpSettings = {
    ...wps, timezone: "America/New_York",
    wpfasty_contact_phone: "+12025550143", wpfasty_contact_email: "hello@example.com", wpfasty_contact_address: "1 Example Street, Springfield",
    wpfasty_contact_links: [{ network: "telegram", handle: "example_studio" }, { network: "whatsapp", handle: "+12025550143" }],
    wpfasty_hours: full.hours, wpfasty_hours_exceptions: full.hours_exceptions, wpfasty_map: full.map,
  };
  test("options → contact, hours, hours_exceptions, map; valid; round trip equal", () => {
    const { settings, sidecar } = fromWpSettings(w, { at });
    expect(settings.contact).toEqual(full.contact);
    expect([settings.hours, settings.hours_exceptions, settings.map]).toEqual([full.hours, full.hours_exceptions, full.map]);
    expect(schemaOk(settings)).toBe(true);
    expect(validateCollectionV04({ settings: files([settings]) })).toEqual([]);
    expect(toWpSettings(settings, sidecar)).toEqual(w);
    expect(Object.keys(WP_CONTACT_OPTIONS)).toHaveLength(7);
  });
  test("unset options (\"\", [], {}) stay in the sidecar, not in the record; round trip equal", () => {
    const u: WpSettings = { ...wps, wpfasty_contact_phone: "", wpfasty_contact_email: "", wpfasty_contact_address: "", wpfasty_contact_links: [], wpfasty_hours: [], wpfasty_hours_exceptions: [], wpfasty_map: {} };
    const { settings, sidecar } = fromWpSettings(u, { at });
    for (const k of ["contact", "hours", "hours_exceptions", "map"]) expect(k in settings).toBe(false);
    expect(toWpSettings(settings, sidecar)).toEqual(u);
  });
  test("only the address set", () => {
    const { settings } = fromWpSettings({ ...wps, wpfasty_contact_address: "Somewhere 1" }, { at });
    expect(settings.contact).toEqual({ address: "Somewhere 1" });
  });
});
