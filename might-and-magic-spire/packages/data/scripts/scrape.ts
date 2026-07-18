// Scrape orchestrator: fetch -> cache -> parse -> validate, for the Necropolis
// creature roster on heroes.thelazy.net.
//
// This is the live pipeline. In the v0 build environment outbound egress is
// restricted by an allowlist and the source hosts return HTTP 403, so this
// script cannot actually populate data today — the curated dataset
// (scripts/lib/curated-*.ts + scripts/build.ts) is the source of truth. The
// moment the hosts are reachable, `pnpm scrape` will:
//   1. fetch each creature page, caching raw HTML under .cache/ (never re-hit),
//   2. parse it into a candidate with scripts/lib/parse.ts,
//   3. validate the candidate with SourceCreature.parse(), dropping failures,
//   4. write the validated rows to src/creatures.scraped.json for reconciliation
//      against the curated values (diffs surfaced in REPORT.md).
//
// It deliberately does NOT overwrite the curated src/creatures.json. Promotion
// of scraped data to canonical is a human review step.

import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SourceCreature, type Faction } from "@mms/schema";
import { fetchCached } from "./lib/http.ts";
import { parseCreaturePage } from "./lib/parse.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "src");
const BASE = "https://heroes.thelazy.net/index.php/";

// Crawl index: name -> tier/upgrade metadata. Mirrors the curated roster so the
// scraped output is directly reconcilable.
interface CrawlTarget {
  name: string;
  faction: Faction;
  tier: number;
  upgraded: boolean;
  upgradeOf: string | null;
}

const NECROPOLIS: CrawlTarget[] = [
  { name: "Skeleton", faction: "Necropolis", tier: 1, upgraded: false, upgradeOf: null },
  { name: "Skeleton Warrior", faction: "Necropolis", tier: 1, upgraded: true, upgradeOf: "necropolis_skeleton" },
  { name: "Walking Dead", faction: "Necropolis", tier: 2, upgraded: false, upgradeOf: null },
  { name: "Zombie", faction: "Necropolis", tier: 2, upgraded: true, upgradeOf: "necropolis_walking_dead" },
  { name: "Wight", faction: "Necropolis", tier: 3, upgraded: false, upgradeOf: null },
  { name: "Wraith", faction: "Necropolis", tier: 3, upgraded: true, upgradeOf: "necropolis_wight" },
  { name: "Vampire", faction: "Necropolis", tier: 4, upgraded: false, upgradeOf: null },
  { name: "Vampire Lord", faction: "Necropolis", tier: 4, upgraded: true, upgradeOf: "necropolis_vampire" },
  { name: "Lich", faction: "Necropolis", tier: 5, upgraded: false, upgradeOf: null },
  { name: "Power Lich", faction: "Necropolis", tier: 5, upgraded: true, upgradeOf: "necropolis_lich" },
  { name: "Black Knight", faction: "Necropolis", tier: 6, upgraded: false, upgradeOf: null },
  { name: "Dread Knight", faction: "Necropolis", tier: 6, upgraded: true, upgradeOf: "necropolis_black_knight" },
  { name: "Bone Dragon", faction: "Necropolis", tier: 7, upgraded: false, upgradeOf: null },
  { name: "Ghost Dragon", faction: "Necropolis", tier: 7, upgraded: true, upgradeOf: "necropolis_bone_dragon" },
];

async function main(): Promise<void> {
  const validated: SourceCreature[] = [];
  const dropped: { name: string; reason: string }[] = [];

  for (const t of NECROPOLIS) {
    const url = `${BASE}${encodeURIComponent(t.name.replace(/ /g, "_"))}`;
    let html: string;
    try {
      html = await fetchCached(url);
    } catch (e) {
      dropped.push({ name: t.name, reason: `fetch failed: ${(e as Error).message}` });
      continue;
    }
    const candidate = parseCreaturePage(html, { ...t, sourceUrl: url });
    const r = SourceCreature.safeParse(candidate);
    if (r.success) {
      validated.push(r.data);
    } else {
      dropped.push({
        name: t.name,
        reason: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      });
    }
  }

  if (validated.length) {
    await writeFile(
      join(SRC, "creatures.scraped.json"),
      JSON.stringify(validated, null, 2) + "\n",
      "utf8",
    );
  }

  // eslint-disable-next-line no-console
  console.log(`scrape: ${validated.length} validated, ${dropped.length} dropped`);
  for (const d of dropped) console.log(`  DROP ${d.name}: ${d.reason}`);
  if (!validated.length) {
    console.log(
      "\nNo records scraped. Source hosts are likely unreachable (egress\n" +
        "restriction / HTTP 403). The curated dataset in src/*.json remains the\n" +
        "source of truth — see REPORT.md.",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
