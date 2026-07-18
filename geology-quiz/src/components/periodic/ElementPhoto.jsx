import { useEffect, useState } from 'react'

// Shows a sample photo for an element if one was fetched (slug `el-<symbol>`).
// Renders nothing when there's no photo — many gases/synthetics have none, and
// the colored tile carries those.
let manifestCache = null
let manifestPromise = null

function loadManifest() {
  if (manifestCache) return Promise.resolve(manifestCache)
  if (!manifestPromise) {
    manifestPromise = fetch('/assets/manifest.json')
      .then((r) => (r.ok ? r.json() : {}))
      .then((m) => (manifestCache = m))
      .catch(() => (manifestCache = {}))
  }
  return manifestPromise
}

export default function ElementPhoto({ el, size = 150 }) {
  const [file, setFile] = useState(undefined) // undefined=loading, null=none, string=file
  const [errored, setErrored] = useState(false)

  useEffect(() => {
    let alive = true
    setErrored(false)
    loadManifest().then((m) => {
      if (alive) setFile(m['el-' + el.symbol.toLowerCase()] || null)
    })
    return () => {
      alive = false
    }
  }, [el])

  if (!file || errored) return null
  return (
    <div className="el-photo" style={{ width: size, height: size }}>
      <img src={'/assets/' + file} alt={el.name} onError={() => setErrored(true)} draggable={false} />
    </div>
  )
}
