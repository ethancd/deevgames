# @mms/app — Infra (Agent 2) + Frontend (Agent 4)

Branches: `agent/infra` and `agent/frontend`.

## Infra owns the shell and the pipeline

Vite + React + TypeScript PWA. Service worker + web manifest (offline is nearly
free — all content is local data). A build-time content step ingests `@mms/data`
+ the image manifest into the bundle. Deploy to Cloudflare Pages or Vercel.
"Add to home screen" must work on iOS Safari — that's the whole distribution story.

Build against the `@mms/schema` fixtures so the shell boots green before real
data lands. The shell renders a "hello, run" placeholder that proves the data
path works end to end. CI must run the engine's test suite on PR to the
integration branch.

Done when `pnpm build` produces a PWA that installs to a phone home screen, boots
offline, and renders fixture data; CI is green; one push deploys.

## Frontend owns the screens

Render off the engine's public API — **you render; the engine decides.** Screens:
act-map view, combat screen (hand, energy, enemy intents), card rendering off the
image manifest, relic bar, rest / shop / event nodes.

Two image streams — don't conflate them. *Content* art (creature portraits) comes
from the researcher's manifest; you consume it. *Chrome* (card frames, faction
backgrounds, icons, buttons) is yours to generate via image-gen — Necropolis
first. Consult the `frontend-design` skill before committing a visual direction.

Mobile-first — this lives in a thumb's reach on a phone. Done when a run is fully
playable by touch: start Necropolis, fight, pick cards and relics, reach the act
boss without a keyboard.
