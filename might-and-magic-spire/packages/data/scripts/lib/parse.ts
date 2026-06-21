// Parsers that turn cached HTML into unvalidated record candidates.
//
// Targets heroes.thelazy.net's MediaWiki infobox/stat-table markup. Each parser
// returns a *candidate* object; the caller validates it with the Zod schema
// before writing. A candidate that fails `Source*.parse()` is dropped and
// reported — never written.
//
// These are intentionally defensive (lots of optional-chaining + Number()
// coercion) because wiki markup drifts. When the source hosts become reachable
// again, run `pnpm scrape` and reconcile the parsed output against the curated
// dataset; diffs are surfaced in REPORT.md.

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

function statFromTable($: cheerio.CheerioAPI, label: string): string | undefined {
  // thelazy infobox rows are <tr><th>Label</th><td>Value</td></tr>
  let value: string | undefined;
  $("table.infobox tr, table.wikitable tr").each((_, tr) => {
    const th = $(tr).find("th").first().text().trim().toLowerCase();
    if (th === label.toLowerCase()) {
      value = $(tr).find("td").first().text().trim();
    }
  });
  return value;
}

/**
 * Parse a thelazy creature page into a candidate. `faction`, `tier`, and the
 * upgrade relationship are passed in from the crawl index (the page itself does
 * not always state them unambiguously).
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
  const dmg = statFromTable($, "Damage") ?? "";
  const dmgMatch = dmg.match(/(\d+)\s*[-–]\s*(\d+)/) ?? dmg.match(/(\d+)/);
  const damageMin = dmgMatch ? Number(dmgMatch[1]) : NaN;
  const damageMax = dmgMatch ? Number(dmgMatch[2] ?? dmgMatch[1]) : NaN;

  const abilitiesRaw = statFromTable($, "Special abilities") ?? "";
  const abilities = abilitiesRaw
    .split(/[\n;,]/)
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    id: `${ctx.faction.toLowerCase()}_${slugify(ctx.name)}`,
    name: ctx.name,
    faction: ctx.faction,
    tier: ctx.tier,
    upgraded: ctx.upgraded,
    upgradeOf: ctx.upgradeOf,
    attack: Number(statFromTable($, "Attack")),
    defense: Number(statFromTable($, "Defense")),
    hp: Number(statFromTable($, "Health") ?? statFromTable($, "Hit points")),
    damageMin,
    damageMax,
    speed: Number(statFromTable($, "Speed")),
    growth: Number(statFromTable($, "Growth")),
    abilities,
    imageRef: `${ctx.faction.toLowerCase()}_${slugify(ctx.name)}`,
  };
}

/** Extract the main creature portrait URL from a thelazy page, if present. */
export function parseCreatureImageUrl(html: string): string | undefined {
  const $ = cheerio.load(html);
  const src = $("table.infobox img").first().attr("src");
  if (!src) return undefined;
  return src.startsWith("//") ? `https:${src}` : src;
}
