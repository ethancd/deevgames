// Fetches one Creative-Commons / public-domain image per item from Wikimedia
// Commons, downloads a ~500px thumbnail into public/assets/, and records the
// source + license in public/assets/credits.json. Re-running skips files that
// already exist. Items that can't be found are left for the app's placeholder.
//
//   node scripts/fetch-images.mjs            (fetch everything missing)
//   node scripts/fetch-images.mjs --force    (re-fetch even if present)

import { writeFile, readFile, mkdir, access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ASSETS = join(__dirname, '..', 'public', 'assets')
const UA = 'RockStarsGeologyQuiz/1.0 (educational kids app; contact: local)'
const API = 'https://commons.wikimedia.org/w/api.php'
const FORCE = process.argv.includes('--force')

// slug -> search term (and optional exact "File:..." title to pin a known-good
// image). Search biased toward clean specimen / sample photos.
const ITEMS = [
  // --- Minerals (Mohs + formulas) ---
  ['talc', 'Talc mineral'],
  ['gypsum', 'Gypsum crystal mineral'],
  ['calcite', 'Calcite mineral'],
  ['fluorite', 'Fluorite mineral'],
  ['apatite', 'Apatite mineral'],
  ['orthoclase', 'Orthoclase feldspar mineral'],
  ['quartz', 'Quartz crystal mineral'],
  ['topaz', 'Topaz mineral'],
  ['corundum', 'Corundum mineral'],
  ['diamond', 'Rough diamond crystal'],
  ['halite', 'Halite mineral salt'],
  ['pyrite', 'Pyrite mineral cube'],
  ['galena', 'Galena mineral'],
  ['hematite', 'Hematite mineral'],
  ['magnetite', 'Magnetite mineral'],
  ['graphite', 'Graphite mineral'],
  ['sphalerite', 'Sphalerite mineral'],
  ['cinnabar', 'Cinnabar mineral'],
  ['chalcopyrite', 'Chalcopyrite mineral'],
  ['malachite', 'Malachite mineral'],
  ['olivine', 'Olivine peridot mineral'],
  ['gold', 'Gold nugget natural'],
  ['silver', 'Native silver mineral'],
  ['copper', 'Native copper mineral'],
  ['sulfur', 'Sulphur mineral specimen', 'sul'],
  // --- Rocks ---
  ['granite', 'Granite rock sample'],
  ['basalt', 'Basalt rock sample'],
  ['obsidian', 'Obsidian volcanic glass'],
  ['pumice', 'Pumice stone rock'],
  ['sandstone', 'Sandstone rock sample'],
  ['limestone', 'Limestone rock sample'],
  ['shale', 'Shale rock sample'],
  ['conglomerate', 'Conglomerate rock geology'],
  ['marble', 'Marble rock sample'],
  ['slate', 'Slate rock sample'],
  ['gneiss', 'Gneiss rock sample'],
  ['quartzite', 'Quartzite rock sample'],
  ['schist', 'Schist rock sample'],
  // --- Ores ---
  ['bauxite', 'Bauxite ore'],
  ['cassiterite', 'Cassiterite mineral ore'],
  // --- Refined metals (answer side of the Ores & Metals deck) ---
  // optional 3rd element = title keyword to prefer (handles spelling variants)
  ['metal-iron', 'Iron electrolytic', 'iron'],
  ['metal-aluminum', 'Aluminium metal sample', 'alumin'],
  ['metal-lead', 'Lead ingot', 'lead'],
  ['metal-zinc', 'Zinc fragment', 'zinc'],
  ['metal-mercury', 'Mercury liquid', 'mercury'],
  ['metal-copper', 'Copper ingot', 'copper'],
  ['metal-tin', 'Tin ingot', 'tin'],
  ['metal-gold', 'Gold bullion bar', 'gold'],
  // --- Geologic eons & eras (representative scenes / fossils) ---
  ['time-hadean', 'Hadean Earth artist impression'],
  ['time-archean', 'Stromatolite', 'stromatolite'],
  ['time-proterozoic', 'Banded iron formation', 'banded'],
  ['time-phanerozoic', 'Ammonite fossil', 'ammonite'],
  ['time-paleozoic', 'Crinoid fossil', 'crinoid'],
  ['time-mesozoic', 'Stegosaurus skeleton', 'stegosaurus'],
  ['time-cenozoic', 'Smilodon skeleton', 'smilodon'],
  // --- Geologic periods (mostly fossils) ---
  ['time-cambrian', 'Trilobite fossil'],
  ['time-ordovician', 'Ordovician trilobite fossil'],
  ['time-silurian', 'Eurypterid sea scorpion fossil'],
  ['time-devonian', 'Dunkleosteus fossil'],
  ['time-carboniferous', 'Carboniferous fern fossil'],
  ['time-permian', 'Dimetrodon skeleton'],
  ['time-triassic', 'Plateosaurus dinosaur fossil'],
  ['time-jurassic', 'Allosaurus skeleton fossil'],
  ['time-cretaceous', 'Tyrannosaurus skeleton fossil'],
  ['time-paleogene', 'Eocene fossil mammal'],
  ['time-neogene', 'Miocene fossil mammal'],
  ['time-quaternary', 'Woolly mammoth model'],
]

function stripHtml(s) {
  return (s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

async function exists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

// fetch with exponential backoff on rate-limit (429) and transient errors.
async function fetchRetry(url, tries = 6) {
  let wait = 1000
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } })
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, wait))
        wait = Math.min(wait * 2, 16000)
        continue
      }
      return res
    } catch (e) {
      if (i === tries - 1) throw e
      await new Promise((r) => setTimeout(r, wait))
      wait = Math.min(wait * 2, 16000)
    }
  }
  throw new Error('rate-limited (429) after retries')
}

function toResult(p) {
  const ii = p.imageinfo?.[0]
  if (!ii) return null
  const mime = ii.mime || ''
  if (!mime.startsWith('image/')) return null
  if (mime.includes('svg')) return null // diagrams, not photos
  if (!ii.thumburl) return null
  const meta = ii.extmetadata || {}
  return {
    title: p.title,
    thumburl: ii.thumburl,
    descriptionurl: ii.descriptionurl,
    license: stripHtml(meta.LicenseShortName?.value) || 'see source',
    artist: stripHtml(meta.Artist?.value) || 'Unknown',
  }
}

async function searchImage(term, keyword) {
  const url =
    `${API}?action=query&format=json&prop=imageinfo` +
    `&iiprop=url|extmetadata|mime&iiurlwidth=500` +
    `&generator=search&gsrnamespace=6&gsrlimit=12&gsrsearch=${encodeURIComponent(term)}`
  const res = await fetchRetry(url)
  if (!res.ok) throw new Error('search HTTP ' + res.status)
  const data = await res.json()
  const pages = data?.query?.pages
  if (!pages) return null
  const list = Object.values(pages).sort((a, b) => (a.index || 0) - (b.index || 0))
  const candidates = list.map(toResult).filter(Boolean)
  if (!candidates.length) return null
  // Prefer a result whose filename actually mentions the thing we searched for,
  // so "Calcite" doesn't quietly return an agate photo.
  const kw = (keyword || '').toLowerCase()
  const matched = kw && candidates.find((c) => c.title.toLowerCase().includes(kw))
  return matched || candidates[0]
}

async function download(urlStr, destBase) {
  const res = await fetchRetry(urlStr)
  if (!res.ok) throw new Error('download HTTP ' + res.status)
  const ext = (urlStr.split('.').pop() || 'jpg').split('?')[0].toLowerCase()
  const safeExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? ext : 'jpg'
  const file = `${destBase}.${safeExt}`
  const buf = Buffer.from(await res.arrayBuffer())
  await writeFile(join(ASSETS, file), buf)
  return file
}

async function main() {
  await mkdir(ASSETS, { recursive: true })
  const manifestPath = join(ASSETS, 'manifest.json')
  const creditsPath = join(ASSETS, 'credits.json')
  const manifest = (await exists(manifestPath))
    ? JSON.parse(await readFile(manifestPath, 'utf8'))
    : {}
  const credits = (await exists(creditsPath))
    ? JSON.parse(await readFile(creditsPath, 'utf8'))
    : {}

  let ok = 0
  let miss = 0
  for (const [slug, term, kw] of ITEMS) {
    if (!FORCE && manifest[slug]) {
      // verify the file is actually on disk
      if (await exists(join(ASSETS, manifest[slug]))) {
        ok++
        continue
      }
    }
    try {
      const keyword =
        kw !== undefined ? kw : slug.startsWith('time-') ? null : slug
      const hit = await searchImage(term, keyword)
      if (!hit) {
        console.log(`  ✗ ${slug.padEnd(18)} no result for "${term}"`)
        miss++
        continue
      }
      const file = await download(hit.thumburl, slug)
      manifest[slug] = file
      credits[file] = {
        item: slug,
        source: hit.descriptionurl,
        title: hit.title,
        license: hit.license,
        artist: hit.artist,
        via: 'Wikimedia Commons',
      }
      console.log(`  ✓ ${slug.padEnd(18)} ${hit.license.padEnd(16)} ${hit.title}`)
      ok++
    } catch (e) {
      console.log(`  ✗ ${slug.padEnd(18)} ${e.message}`)
      miss++
    }
    await new Promise((r) => setTimeout(r, 800)) // be polite
    // persist incrementally so a crash doesn't lose progress
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2))
    await writeFile(creditsPath, JSON.stringify(credits, null, 2))
  }

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  await writeFile(creditsPath, JSON.stringify(credits, null, 2))
  console.log(`\nDone. ${ok} images ready, ${miss} missing (placeholders will show).`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
