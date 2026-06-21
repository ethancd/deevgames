// Parsers that turn cached HTML into unvalidated record candidates.
//
// Targets heroes.thelazy.net's real creature markup. A creature page (e.g.
// /index.php/Skeleton) is actually a combined base+upgrade page ("Skeleton and
// Skeleton Warrior") that renders each creature as a "card": a stack of
// absolutely-positioned <div> pairs (a left-positioned label div next to a
// right-positioned value div) laid over a portrait. There is NO infobox or
// wikitable — the v0 parser assumed one and parsed nothing against real HTML.
//
// This parser segments the page into cards at each "Attack Skill" label, pairs
// label/value divs by document order, and reads the trailing special-ability
// note out of the card's text. The caller passes in the target creature name so
// the correct card (base vs. upgrade) is selected. Each candidate is validated
// with `SourceCreature.parse()` before being written; failures are dropped and
// reported (see scrape.ts), never written.

import * as cheerio from "cheerio";
import type { Faction } from "@mms/schema";

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Candidate creature: same field names as SourceCreature, untyped/unvalidated. */
export interface CreatureCandidate {
  id: string;
  name: string;
  faction: Faction;
  tier: number;
  upgraded: boolean;
  upgradeOf: string | null;
  attack: number;
  defense: number;
  hp: number;
  damageMin: number;
  damageMax: number;
  speed: number;
  growth: number;
  abilities: string[];
  imageRef: string;
}

/** One creature card: its label→value stat map plus the trailing ability note. */
interface StatCard {
  stats: Record<string, string>;
  note: string; // raw special-ability sentence(s), e.g. "Undead. Flies. Regenerating."
}

/**
 * Segment a creature page into stat cards in document order. thelazy renders a
 * combined base+upgrade page, so a page typically yields two cards (base first,
 * upgrade second). Each card is delimited by an "Attack Skill" label div; its
 * stats are the left(label)/right(value) positioned-div pairs that follow.
 */
function extractCards($: cheerio.CheerioAPI): StatCard[] {
  const cards: StatCard[] = [];
  let cur: StatCard | null = null;
  let pendingLabel: string | null = null;

  $("div.mw-parser-output div").each((_, d) => {
    const style = $(d).attr("style") ?? "";
    if (!/position:\s*absolute/.test(style)) return;
    const txt = $(d).text().trim();
    if (!txt) return;

    if (txt === "Attack Skill") {
      // New card. Pull its trailing ability note from the nearest ancestor that
      // holds the whole card (it ends with "...Cost <n><note>").
      let anc = $(d);
      for (let k = 0; k < 6; k++) {
        anc = anc.parent();
        if (anc.text().includes("Fight Value")) break;
      }
      const flat = anc.text().replace(/\s+/g, " ").trim();
      const m =
        flat.match(/Cost\s+\d+\s*(.*)$/) ?? flat.match(/Fight Value\s+\d+\s*(.*)$/);
      // Strip a stray leading digit (a Growth value of "1" can bleed in).
      const note = (m ? m[1] : "").replace(/^\d+\s*/, "").trim();
      cur = { stats: {}, note };
      cards.push(cur);
      pendingLabel = "Attack Skill";
      return;
    }
    if (!cur) return;

    if (/left:\s*-?\d/.test(style)) {
      pendingLabel = txt;
    } else if (/right:\s*-?\d/.test(style) && pendingLabel) {
      cur.stats[pendingLabel] = txt;
      pendingLabel = null;
    }
  });

  return cards;
}

/**
 * Turn thelazy's terse ability note ("Undead. Flies. Regenerating. Drains enemy
 * mana.") into the canonical ability vocabulary used by the schema/adapter. The
 * undead "No morale penalty" trait is implied by Undead on every Necropolis
 * creature and is added explicitly (it is how the game models undead morale).
 */
function normalizeAbilities(note: string): string[] {
  const out: string[] = [];
  const push = (a: string) => {
    if (!out.includes(a)) out.push(a);
  };
  const sentences = note
    .split(".")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const s of sentences) {
    const l = s.toLowerCase();
    if (l === "undead") {
      push("Undead");
      push("No morale penalty");
    } else if (l.startsWith("shoot")) push("Ranged");
    else if (l.includes("death cloud")) push("Death cloud attack");
    else if (l.startsWith("fly") || l.includes("flies")) push("Flying");
    else if (l.startsWith("regenerat")) push("Regeneration");
    else if (l.includes("drains enemy mana")) push("Drains enemy mana");
    else if (l.includes("life drain") || l === "drains life") push("Life drain");
    else if (l.includes("no enemy retaliation") || l.includes("no retaliation"))
      push("No enemy retaliation");
    else if (l.includes("disease")) push("Disease");
    else if (l.includes("aging")) push("Aging");
    else if (l === "dragon") push("Dragon");
    else if (l.includes("morale")) push("Reduces enemy morale");
    else if (l.includes("curse")) push("Curse");
    else if (l.includes("death blow")) push("Death blow");
    else push(s.replace(/\s+/g, " ")); // keep anything we don't recognize, verbatim
  }
  return out;
}

function parseRange(raw: string | undefined): [number, number] {
  const s = raw ?? "";
  const range = s.match(/(\d+)\s*[-–—]\s*(\d+)/);
  if (range) return [Number(range[1]), Number(range[2])];
  const single = s.match(/(\d+)/);
  return single ? [Number(single[1]), Number(single[1])] : [NaN, NaN];
}

/** Growth cell looks like "12 (+6)" or "4" — the base weekly growth is the first number. */
function parseGrowth(raw: string | undefined): number {
  const m = (raw ?? "").match(/(\d+)/);
  return m ? Number(m[1]) : NaN;
}

/**
 * Parse the card for `ctx.name` out of a (possibly combined) creature page into
 * a candidate. faction/tier/upgrade wiring comes from the crawl index; the
 * stats and abilities come from the page. The correct card is chosen by the
 * upgrade flag: base creatures take the first card, upgrades the second.
 */
export function parseCreaturePage(
  html: string,
  ctx: {
    name: string;
    faction: Faction;
    tier: number;
    upgraded: boolean;
    upgradeOf: string | null;
    sourceUrl: string;
  },
): CreatureCandidate {
  const $ = cheerio.load(html);
  const cards = extractCards($);
  // Combined page: card 0 = base, card 1 = upgrade. Fall back to card 0.
  const card = (ctx.upgraded ? cards[1] : cards[0]) ?? cards[0] ?? { stats: {}, note: "" };
  const s = card.stats;

  const [damageMin, damageMax] = parseRange(s["Damage"]);

  return {
    id: `${ctx.faction.toLowerCase()}_${slugify(ctx.name)}`,
    name: ctx.name,
    faction: ctx.faction,
    tier: ctx.tier,
    upgraded: ctx.upgraded,
    upgradeOf: ctx.upgradeOf,
    attack: Number(s["Attack Skill"]),
    defense: Number(s["Defense Skill"]),
    hp: Number(s["Health"]),
    damageMin,
    damageMax,
    speed: Number(s["Speed"]),
    growth: parseGrowth(s["Growth"]),
    abilities: normalizeAbilities(card.note),
    imageRef: `${ctx.faction.toLowerCase()}_${slugify(ctx.name)}`,
  };
}

/**
 * Extract the portrait image URL for `name` from a creature page. Portraits are
 * `<img src=".../Creature_<Name>.png">`; we resolve the first match for the
 * exact creature, falling back to the first creature portrait on the page.
 */
export function parseCreatureImageUrl(
  html: string,
  name?: string,
): string | undefined {
  const $ = cheerio.load(html);
  const want = name ? `Creature_${name.replace(/ /g, "_")}.png` : null;
  let exact: string | undefined;
  let first: string | undefined;
  $("img").each((_, img) => {
    const src = $(img).attr("src") ?? "";
    if (!/Creature_[A-Za-z_]+\.(png|gif|jpg)/.test(src)) return;
    if (!first) first = src;
    if (want && src.includes(want) && !exact) exact = src;
  });
  const src = exact ?? first;
  if (!src) return undefined;
  if (src.startsWith("//")) return `https:${src}`;
  if (src.startsWith("/")) return `https://heroes.thelazy.net${src}`;
  return src;
}

function abs(src: string): string {
  if (src.startsWith("//")) return `https:${src}`;
  if (src.startsWith("/")) return `https://heroes.thelazy.net${src}`;
  return src;
}

/** WikiMedia underscores spaces and percent-encodes punctuation in file names. */
function wikiFile(name: string): string {
  return name.replace(/ /g, "_");
}

export type RecordKind = "creature" | "hero" | "spell" | "artifact";

/**
 * Find the best artwork URL for a record on its thelazy page. Image naming is
 * conventional and type-specific:
 *   creature: Creature_<Name>.png
 *   hero:     Hero_<Name>.png   (prefer the plain SoD portrait over HotA/small/Olden variants)
 *   spell:    <Name>.png
 *   artifact: Artifact_<Name>.gif|png
 * Returns an absolute URL, or undefined if no confident match is found (the
 * caller then keeps a placeholder).
 */
export function parseRecordImageUrl(
  html: string,
  kind: RecordKind,
  name: string,
): string | undefined {
  const $ = cheerio.load(html);
  // WikiMedia file names use underscores for spaces and percent-encode
  // punctuation in the URL (apostrophe -> %27). Match against several spellings.
  const file = wikiFile(name); // "Centaur's_Axe"
  // NB: encodeURIComponent does NOT encode "'" — MediaWiki URLs use %27, so do
  // it by hand. (’ curly apostrophe also normalises to %27 here.)
  const enc = file.replace(/['’]/g, "%27"); // "Centaur%27s_Axe"
  const noApos = file.replace(/['’]/g, ""); // "Centaurs_Axe" (defensive)
  const candidates = [file, enc, noApos];

  const srcs: string[] = [];
  $("img").each((_, img) => {
    const s = $(img).attr("src");
    if (s) srcs.push(s);
  });

  const matchesName = (s: string): boolean =>
    candidates.some((c) => s.includes(c));

  let pool: string[];
  switch (kind) {
    case "creature":
      pool = srcs.filter((s) => /Creature_/.test(s) && matchesName(s));
      break;
    case "spell":
      // Spell art is "<Name>.png" with no prefix; constrain to name match and
      // avoid nav/box chrome.
      pool = srcs.filter(
        (s) => matchesName(s) && !/Heroes-box|Artifact-box|Cursor_|SpellBook/.test(s),
      );
      break;
    case "artifact":
      // Artifact art is "Artifact_<Name>.gif" or "<Name>_am-artif.gif"; never
      // the box chrome or map icon.
      pool = srcs.filter(
        (s) =>
          matchesName(s) &&
          /(Artifact[_-]|-artif)/.test(s) &&
          !/Artifact-box|map_icon|cover|menu/.test(s),
      );
      break;
    case "hero":
      pool = srcs.filter((s) => /Hero_/.test(s) && matchesName(s));
      // Prefer the plain SoD portrait: drop HotA/Olden/small/thumb variants if a
      // cleaner one exists.
      {
        const plain = pool.filter(
          (s) => !/\(HotA\)|Olden|_small|\/thumb\//.test(s),
        );
        if (plain.length) pool = plain;
      }
      break;
  }

  // Drop MediaWiki thumbnails (we want the full-size original) unless that's all
  // we have.
  const fullsize = pool.filter((s) => !/\/thumb\//.test(s));
  const chosen = (fullsize.length ? fullsize : pool)[0];
  return chosen ? abs(chosen) : undefined;
}
