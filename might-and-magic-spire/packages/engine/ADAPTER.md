# The Source → Card Adapter — balance decisions, laid out

This is **design, not engineering**. Every number below is a balance lever Ethan
can veto. The adapter is the seam where HoMM3 stat-blocks become Spire card
numbers. The code is in `src/adapter.ts`; this document is its rationale.

> **Pinned contract:** `adapt(fixtureCreature)` (the Skeleton) MUST deep-equal
> `fixtureCard` — `cost 1`, `type "strike"`, `rarity "common"`,
> `effects [{kind:"damage", amount:5, target:"enemy"}]`, `text "Deal 5 damage."`.
> `src/adapter.test.ts` asserts this. Every formula below is chosen to hit that
> fixture exactly while staying sane at the stat extremes.

---

## 1. Creature → Card

A creature card is always a **`strike`** — a body you throw at the enemy that
deals damage.

### 1a. Magnitude (damage) ← `attack`

```
damage = creature.attack
```

We use the **attack stat directly** as the card's damage number. It's the
cleanest read of "how hard does this hit," and it's what the fixture pins
(Skeleton `attack 5` → "Deal 5 damage."). The `damageMin/damageMax` melee range
is intentionally **dropped** — a deckbuilder wants one deterministic number on
the card face, not a dice roll, so combat stays readable and the enemy intent
telegraph stays honest.

| Creature      | tier | attack | → card damage |
|---------------|-----:|-------:|--------------:|
| Skeleton      | 1    | 5      | **5**         |
| Zombie        | 2    | 5      | 5             |
| Wight         | 3    | 7      | 7             |
| Vampire       | 4    | 10     | 10            |
| Lich          | 5    | 13     | 13            |
| Bone Dragon   | 7    | 17     | 17            |

### 1b. Cost ← `tier`

HoMM tiers run 1–7. Spire energy is **3/turn**, costs **0–3** (STS-like). We
compress 7 tiers onto a 1–3 curve:

```
tier 1–2 → cost 1
tier 3–4 → cost 2
tier 5–7 → cost 3   (capped; apex creatures lean on magnitude, not extra cost)
```

| tier | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|------|---|---|---|---|---|---|---|
| cost | 1 | 1 | 2 | 2 | 3 | 3 | 3 |

Skeleton is tier 1 → **cost 1**. ✓

**Why cap at 3, not let cost scale with damage?** Because energy is the turn's
budget. A 3-cost card *is* your whole turn. We deliberately accept that apex
creatures (Bone Dragon: 17 damage for 3 energy ≈ 5.7 dmg/energy) out-rate the
Skeleton (5 dmg for 1 energy = 5 dmg/energy) only slightly. The premium you pay
for the apex card is **deck slot scarcity** (it's rare — see 1c) and **draw
luck**, not energy. This keeps the curve flat enough that there's no single
dominant "always take the big number" card; cheap strikes stay competitive
because you can play three a turn.

### 1c. Rarity ← `growth` (with `tier` guardrails)

In HoMM, **weekly growth is inverse availability** — Skeletons flood in at
~12/week, Archangels trickle at 1/week. So growth is a ready-made rarity signal:
common things are common.

```
growth >= 10  → common
growth 6–9    → uncommon
growth <= 5   → rare
```

Then **tier guardrails** clamp absurdities the growth signal alone would allow:

- tier ≥ 6 and rolled `common` → bump to `uncommon` (apex creatures are never common)
- tier ≤ 1 and rolled `rare` → soften to `uncommon` (a tier-1 body is never rare)

| Creature      | growth | tier | base rarity | after guardrails |
|---------------|-------:|-----:|-------------|------------------|
| Skeleton      | 12     | 1    | common      | **common** ✓     |
| Zombie        | 8      | 2    | uncommon    | uncommon         |
| Wight         | 5      | 3    | rare        | rare             |
| Vampire       | 4      | 4    | rare        | rare             |
| Lich          | 3      | 5    | rare        | rare             |
| Bone Dragon   | 1      | 7    | rare        | rare             |

> Note: `starter` rarity is **not** produced by the creature adapter. It's
> reserved for the hero's signature relic and the basic Defend (see §3, §4).

### 1d. Identity fields

- `id`: `card_<tail>` where `<tail>` is the source id after the first `_`
  (`necropolis_skeleton` → `card_skeleton`). ✓
- `sourceId`, `name`, `faction`, `imageRef`, `upgradeOf`: copied straight from
  the source (provenance is preserved; the upgrade arrow rides along).
- `text`: rendered as `Deal <damage> damage.` ✓

---

## 2. Artifact → Relic

### 2a. Rarity ← `ArtifactClass`

HoMM artifact classes map cleanly onto the Spire rarity ladder. HoMM has no
"starter" artifact tier, so `starter` is reserved for the hero signature.

| ArtifactClass | → Relic rarity |
|---------------|----------------|
| Treasure      | common         |
| Minor         | uncommon       |
| Major         | rare           |
| Relic         | rare           |

Centaur's Axe is `Minor` → **uncommon**. ✓ (Major and Relic share the `rare`
display rarity; Relic-class artifacts get richer mechanical effects, not a
higher rarity word — the ladder only has four rungs.)

### 2b. Effect ← parsing the `bonuses` string

HoMM artifact bonuses are terse human-readable strings (`"+2 Attack"`). The
adapter parses the leading `±N <stat>` and maps the stat word to a combat hook:

| Bonus text       | Relic effect                          | Combat meaning                    |
|------------------|---------------------------------------|-----------------------------------|
| `+N Attack`      | `startStrength: N`                    | +N damage to all your attacks     |
| `+N Defense`     | `startBlock: N*2`                     | gain `2N` block each combat start |
| `+N Power`       | `startEnergy: 1` (if N≥1)             | +1 energy/turn                    |
| `+N Knowledge`   | `drawBonus: 1` (if N≥1)               | +1 card drawn/turn                |
| anything else    | `none`                                | flavor only                       |

Centaur's Axe `"+2 Attack"` → `startStrength: 2`. The Attack→Strength and
Defense→Block lines are the load-bearing ones; Power/Knowledge are best-effort
(HoMM's caster stats don't have a crisp deckbuilder analogue, so they convert to
the nearest economy lever at a flat rate rather than scaling with `N`).

---

## 3. Hero specialty → signature relic

A hero's `specialty` becomes their **signature starting relic** — the run's
identity piece, owned from turn one, rarity `starter`, never offered again.
These are deliberately stronger than common artifacts because they define a
build.

| Specialty (keyword) | Signature effect       |
|---------------------|------------------------|
| `Skeletons`         | `startStrength: 2`     |
| `Offense`           | `startStrength: 2`     |
| `Armorer`           | `startBlock: 4`        |
| `Wisdom` / `Intelligence` | `startEnergy: 1` |
| `Logistics` / `Scouting`  | `drawBonus: 1`   |
| (anything else)     | `startStrength: 1`     |

Galthran's `Skeletons` → `+2 Strength` each combat: every Skeleton strike in his
starter deck hits for 7 instead of 5. The relic is named `"<Hero>'s <Specialty>"`
(`"Galthran's Skeletons"`).

---

## 4. The basic Defend (a design necessity, not an adapter output)

A deckbuilder with no defense is **mathematically unwinnable** — the headless
integration test proved it: the player reaches the boss at near-full HP but the
boss out-races a pure-strike deck. So the starter deck includes a neutral
**Defend** skill (the hero's shield arm, not adapted from any creature):

```
Defend — cost 1, skill, "Gain 6 block."
```

Starter deck = **6 Skeleton strikes + 4 Defends** (10 cards), mirroring Slay the
Spire's opening deck. This is the single most important balance call in the
engine: it's what makes the game a game.

---

## 5. Encounter & boss tuning (combat-side balance levers)

These live in `src/run.ts`, not the adapter, but they're balance decisions so
they belong on this page:

- **Normal combat:** 1–3 creatures of tier ≤ 3.
- **Elite:** one tier 4–5 creature + one tier ≤ 2 add; drops a relic.
- **Act-1 boss (Bone Dragon):** HP capped at **80** (not the raw HoMM 150) with
  a telegraphed `attack 10 → attack 10 → wind-up (+3) → attack 16` rhythm. The
  raw stat-block is a HoMM army of dragons; as a single deckbuilder boss it must
  be the **hardest winnable** fight against a starter deck, not an impossible
  one. A player who blocks the wind-up hit survives. The integration test
  `can win the run by beating the act boss` is the guardrail that keeps this
  honest — if a future change makes the boss unwinnable by the reference policy,
  that test goes red.

---

## Degenerate-case review (strategy-mindset pass)

Pressure-tested for dominant/exploit cards:

- **No cheap-nuke exploit.** Because cost is capped at 3 and damage = attack, the
  best dmg/energy ratio across the bestiary is ~5.7 (Bone Dragon) vs ~5.0
  (Skeleton) — a <15% spread. There's no "1-cost, 30-damage" outlier, so cheap
  strikes never become strictly dominated and the apex card's edge is paid for
  in rarity/draw-luck, not raw efficiency.
- **No free-value relic.** Every relic effect is a flat per-combat bonus with no
  scaling loop; nothing compounds turn-over-turn, so there's no runaway.
- **Strength is additive, not multiplicative.** `+Strength` adds a flat amount
  per attack, so stacking it is linear, not explosive — three `+2 Attack`
  artifacts give +6 damage/strike, strong but bounded.
- **Open risk (flagged for Ethan):** with enough `+Strength`, a deck of 1-cost
  Skeletons (3 plays/turn) scales better than a few expensive bombs, because
  Strength multiplies *number of hits*. If `+Strength` artifacts become common,
  the dominant deck is "many cheap strikes + Strength." Watch the drop rate of
  Attack artifacts, or cap total Strength, if this proves oppressive in play.
