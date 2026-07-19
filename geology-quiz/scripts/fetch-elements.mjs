// Fetch a sample photo for each of the 118 elements from Wikimedia Commons into
// public/assets/ (slug `el-<symbol>`), merging into the shared manifest.json and
// credits.json. Many gases and synthetic elements have no real sample photo —
// those simply stay imageless and the colored tile carries them.
//
//   node scripts/fetch-elements.mjs           (fetch missing)
//   node scripts/fetch-elements.mjs --force   (re-fetch all)

import { writeFile, readFile, mkdir, access, unlink } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { ELEMENTS } from '../src/data/elements.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ASSETS = join(__dirname, '..', 'public', 'assets')
const UA = 'RockStarsGeologyQuiz/1.0 (educational kids app; contact: local)'
const API = 'https://commons.wikimedia.org/w/api.php'
const FORCE = process.argv.includes('--force')

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
  if (mime.includes('svg')) return null
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
    `&iiprop=url|extmetadata|mime&iiurlwidth=480` +
    `&generator=search&gsrnamespace=6&gsrlimit=12&gsrsearch=${encodeURIComponent(term)}`
  const res = await fetchRetry(url)
  if (!res.ok) throw new Error('search HTTP ' + res.status)
  const data = await res.json()
  const pages = data?.query?.pages
  if (!pages) return null
  const list = Object.values(pages).sort((a, b) => (a.index || 0) - (b.index || 0))
  const candidates = list.map(toResult).filter(Boolean)
  if (!candidates.length) return null
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
  const manifest = (await exists(manifestPath)) ? JSON.parse(await readFile(manifestPath, 'utf8')) : {}
  const credits = (await exists(creditsPath)) ? JSON.parse(await readFile(creditsPath, 'utf8')) : {}

  let ok = 0
  let miss = 0
  for (const el of ELEMENTS) {
    const slug = 'el-' + el.symbol.toLowerCase()
    if (!FORCE && manifest[slug] && (await exists(join(ASSETS, manifest[slug])))) {
      ok++
      continue
    }
    try {
      const hit = await searchImage(`${el.name} element`, el.name.toLowerCase())
      if (!hit) {
        console.log(`  · ${slug.padEnd(7)} ${el.name.padEnd(14)} no result`)
        miss++
      } else {
        const file = await download(hit.thumburl, slug)
        manifest[slug] = file
        credits[file] = {
          item: slug,
          element: el.name,
          source: hit.descriptionurl,
          title: hit.title,
          license: hit.license,
          artist: hit.artist,
          via: 'Wikimedia Commons',
        }
        console.log(`  ✓ ${slug.padEnd(7)} ${el.name.padEnd(14)} ${hit.license.padEnd(14)} ${hit.title}`)
        ok++
      }
    } catch (e) {
      console.log(`  ✗ ${slug.padEnd(7)} ${el.name.padEnd(14)} ${e.message}`)
      miss++
    }
    await new Promise((r) => setTimeout(r, 700))
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2))
    await writeFile(creditsPath, JSON.stringify(credits, null, 2))
  }

  // Self-heal: drop any result that's a diagram / compound rather than a real
  // sample photo (e.g. Bohr-model PNGs for synthetics). Keeps re-runs idempotent.
  const BAD = /Bohr model|Diagram|hexacarbonyl|Backdrop for presentation|Chloride|Oxide|sulfate|nitrate/i
  let pruned = 0
  for (const [slug, file] of Object.entries(manifest)) {
    if (!slug.startsWith('el-')) continue
    const title = credits[file]?.title || ''
    if (BAD.test(title)) {
      delete manifest[slug]
      delete credits[file]
      try {
        await unlink(join(ASSETS, file))
      } catch {
        /* ignore */
      }
      pruned++
    }
  }

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  await writeFile(creditsPath, JSON.stringify(credits, null, 2))
  const elCount = Object.keys(manifest).filter((k) => k.startsWith('el-')).length
  console.log(`\nDone. ${ok} fetched, ${miss} without a photo, ${pruned} diagrams pruned.`)
  console.log(`Real element sample photos: ${elCount} / ${ELEMENTS.length}.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
