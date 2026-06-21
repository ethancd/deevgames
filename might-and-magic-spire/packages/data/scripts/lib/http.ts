// Polite, cache-first HTTP fetcher for the scrape pipeline.
//
// Contract: nothing in this module ever hits the network if a cached copy of
// the URL already exists on disk under `.cache/`. Re-runs of the scraper
// re-parse from cache and never re-hit the source site. The first run throttles
// requests and identifies itself with a descriptive User-Agent.
//
// NOTE: in the build environment used for v0, outbound egress is restricted by
// an allowlist and heroes.thelazy.net / fandom return HTTP 403. The pipeline is
// written to work the moment those hosts are reachable; until then the curated
// dataset (src/curated/*) is the source of truth. See REPORT.md.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const CACHE_DIR = join(__dirname, "..", "..", ".cache");

const USER_AGENT =
  "MMS-Researcher/0.1 (Might & Magic: Spire content DB; contact ethan@survivalandflourishing.com)";

// Minimum delay between live network requests (politeness throttle).
const THROTTLE_MS = 1500;
let lastFetchAt = 0;

function cachePathFor(url: string): string {
  const hash = createHash("sha1").update(url).digest("hex").slice(0, 16);
  return join(CACHE_DIR, `${hash}.html`);
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch a URL, caching the raw response body to disk. Subsequent calls for the
 * same URL read from cache and never touch the network.
 */
export async function fetchCached(url: string): Promise<string> {
  await mkdir(CACHE_DIR, { recursive: true });
  const cachePath = cachePathFor(url);

  if (await exists(cachePath)) {
    return readFile(cachePath, "utf8");
  }

  // Throttle live requests.
  const since = Date.now() - lastFetchAt;
  if (since < THROTTLE_MS) await sleep(THROTTLE_MS - since);
  lastFetchAt = Date.now();

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
  });
  if (!res.ok) {
    throw new Error(`fetch ${url} -> HTTP ${res.status}`);
  }
  const body = await res.text();
  await writeFile(cachePath, body, "utf8");
  return body;
}

/** True if a cached copy of the URL exists (without fetching). */
export async function isCached(url: string): Promise<boolean> {
  return exists(cachePathFor(url));
}
