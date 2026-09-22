> Current names override (2026-09-22): the game retitled to **Muju Hono Irumbu** (ASCII `Hono`
> in the title, no macron, even though the piece card reads `Honō`) and ten pieces plus three
> element language labels got new display names. Stable IDs, stats, prices and every rule are
> unchanged; the rules revision string stays `muju-phasing-2`. **The published course keeps its
> v7/v8 videos, whose narration and on-screen cards still say the old names — this is a notice,
> not a re-voice.** See `docs/changes/2026-09-22-rename-irumbu-BRIEF.md` and `STATUS.md`.
>
> | ID | Old | New |
> |---|---|---|
> | fire_2 | Hono | Honō |
> | lightning_3 | Kimubunga | Kimbunga |
> | water_1 | Sjor | Sjór |
> | water_3 | Aegirinn | Ægirinn |
> | shadow_1 | Göl | Loş |
> | plant_2 | Sachita | Mallki |
> | plant_3 | Sachakuna | Sach'akuna |
> | metal_1 | Yan | Poṉ |
> | metal_2 | Mazask | Veḷḷi |
> | metal_3 | Tanka | Irumbu |
>
> Unchanged: Hi, Kagari, Radi, Umeme, Straumr, Gölge, Karanlık, Muju.
>
> Element language labels: Water "Old Norse"; Shadow "Turkish"; Plant "Quechua"; Metal "Tamil",
> region "South Asia".
>
> This BIBLE's "no non-ASCII in spoken text" rule (below) stands. A future re-voice narrator
> should use these ASCII respellings for the new non-ASCII names; **they are proposals only, not
> verified pronunciations** — nobody has recorded or ASR-checked them yet:
>
> | New name | ASCII respelling |
> |---|---|
> | Honō | Hono |
> | Sjór | Syor |
> | Ægirinn | Eye-girin |
> | Loş | Losh |
> | Sach'akuna | Sacha-kuna |
> | Poṉ | Pon |
> | Veḷḷi | Velli |
> | Irumbu | Irumbu |

> Current rules override (2026-09-18): Metal v2.9 is Yan/Mazask/Tanka, 1/3/0/3, 1/4/1/4, 2/5/2/5. Earlier production decisions below are historical; current episode.json is authoritative.

> Historical v2.2 production reference. Current rules and scope are in README.md and the v6 episode.json files. Old prices, six-action counts, 27-episode scope, and coordinate-caption conventions below are superseded.

# Muju Academy — Showrunner Bible
Creative pass · 9 September 2026 · rules v2.2 · binding for R01–R27

This is the one document a writer must obey. The analysis files under `analysis/` are evidence and detail; where this bible points at one of them, go there. Where they disagree with this bible, this bible wins. Where this bible is silent, `../04-Creative-Writing-Brief.md` and `../05-Rules-and-Puzzle-Lock.md` win.

---

## Owner-approved correction pass — 10 September 2026

This section and `CORRECTIONS-AND-VERIFICATION.md` supersede conflicting drafting prescriptions and episode assignments below. `final/R01.md` through `R27.md` are the corrected production scripts; the analysis and draft folders are historical.

- All nine decisions are resolved in `CHANGELOG.md`. Pair nicknames are optional aids with the literal element pairs always available. Use **drains**, consistently. Retain the new R16/R17/R27 questions, B4 example, fancy comic words except "building a range," and "Dramatic is not the same as busy."
- Preserve the published voices. Audition proposed delivery instructions and quiet thinking tones on short samples before bulk recording; these are production tasks still to do.
- The mat payoff explicitly says **you win at your next turn if the game is still going**. It is a visitor's message on the opponent's home. Plant's cue is **Pick where you end. Collect what's there.**
- Correctness and an answerable pause take precedence over word and line quotas. Keep regular episodes near 250–340 spoken words, but never hide a required rule condition to meet a quota. R27 is the approved longer, three-station finale. R01 naturally has no prior-episode recall.
- Pip may notice the useful fact first. Do not give the viewer's exact answer before an independent quiz pause: R18 keeps Pip's observation, not his total; R27 station two moves his answer after the hold. Clearly distinguish demonstrations, guided questions, and independent checks.
- A new trial must reset pieces, damage, attack eligibility, action budget, bank and reserves as needed. Label it NEW TRIAL or show a separate board; never animate a reset as a free move. Keep a spare opposing piece in nonterminal combat exercises. Printed movement means **squares per action**, Mining is a **maximum** at own turn end, and every roster shows those units.
- Evidence Cards supplement spoken teaching. Conditions that change the answer must be spoken. A child who cannot read the card should still understand the worked example. Keep the static question and required board facts during thinking time; do not show an answer or decorative movement.
- "Sam" in the analysis is an agent persona, not observed child feedback. Treat age/attention assumptions as hypotheses to check with an actual viewer, not a fixed vocabulary ban.
- This pass keeps R01/R02 free of explicit upkeep and draw instruction. Upkeep begins in R07; draws in R09. R10 puts a complete turn together.

## 0. The diagnosis in six lines

The 27 drafts are correct, humane and flat. The measurements (A1 §0) say why:

- Coach speaks 83% of the words. Click has 1.7 lines an episode, down from 5.9 in the published set. Pip is absent from six episodes.
- Pip is right eleven times and every one of those is *after* Coach has given the answer. Coach discovers nothing in 27 episodes.
- 25 of 27 episodes open with a prop gag then "Today, [objective]". 27 of 27 exit on Coach assigning homework. "Pause for longer, or watch with me" is verbatim 24 times.
- 62 spoken caveats. All true. 44 of them land after the answer, in the slot where the payoff should be.
- 14 of 21 Click couplets were written to fill a rhyme slot; two bend a rule (R09 "pay", R14 "sneak through space"); eleven rhyme on the same vowel.
- The numbers arrive in the wrong order: the chart before the hit, the stat triple before the job, the rule before the instance. And in R09/R24/R26 the number the puzzle turns on is never spoken before the hold.

Every fix below is a **substitution inside the same word budget**. Jokes replace flat lines. Guests and Click take words from Coach. Nothing is added on top.

---

## 1. The loop that survives every shape

Seven beats, in this order, in every episode. The costume changes; the skeleton does not.

1. **Invitation** — a cold open that is a *situation*, not a syllabus line. Someone wants something the rule is about to decide.
2. **Recall** — one earlier idea, asked and answered in two lines, no hold, within the first 20 seconds. Carried by one of three devices (§6).
3. **Show** — one worked instance. The board acts, then the rule is named. Numbers land one per sentence and stay on screen.
4. **Try** — one question, every number in it already spoken and on screen, then a permission line, then `[HOLD 8]`. Nothing inside the hold. Ever.
5. **Explain** — the answer as a *consequence on the board first*, then one line naming which fact decided it. Then the one spoken caveat, in character. The rest goes on the Evidence Card (§5).
6. **Transfer** — change one thing. A card, a second board, a dare.
7. **Exit** — one of six shapes (§6), never a bare homework line, and always with stopping stated as normal.

The Try beat supplies the information needed to attempt the question. Agent role-play suggested that nearby numbers could help; no real-child test was conducted in that analysis. Do not state simulated reactions as audience evidence. Give the viewer the question before the answer, and keep the required facts available through the hold.

---

## 2. Voice principles

**Talk to a fellow player.** Coach says "we" for the shared table and "you" for the choice. Never "children," never "everyone," never "buddy." Never "you should."

**One idea per sentence. One number per sentence.** Lines run 8–16 spoken words. An episode runs 22–30 lines, 250–340 spoken words. Splitting is free and it is the single biggest audio win (A4 §0).

**The joke is downstream of the rule.** The owner's preferred engine and the one that lands hardest for seven-year-olds (A1 §1): the punchline is the rule biting someone fairly. "We never had a seventh action." "A full wallet does not make a closed shop open." "I am standing professionally." If a comic line would survive a rules rewrite unchanged, it is decoration; cut it or attach it.

**Understatement is the register.** Exclamation marks are a volume knob for TTS. Coach: 0. Click: 0, forever. Pip: at most 1 per episode. Guests: at most 1. Escalate *downward*: the second and third beats of a bit get smaller. "A witness. Most inconvenient."

**Say the real rule beside the metaphor, in the same breath.** A metaphor makes a rule stick; it never replaces it. Coach or Click states the literal rule in plain words next to every image, every time.

**Warmth is specificity, not adjectives.** Never praise a response you cannot see ("you got it"). Never praise speed or stillness. Never "easy," "obviously," "even you." Name the difficulty honestly ("This one has two numbers to hold at once") instead of reassuring past it. Coach may be wrong plainly, with no apology theatre. Spend the tenderness on the characters (Clank's daisy), not on the viewer.

**Kid words.** Sam's list (C1 §end) is binding: no "hospitality," "invader" (say "the sneaky piece on our home"), "predict" (say "guess before it happens"), "reserve" without "the crystals still in that square," "upkeep" without "the toll a big piece pays," "loophole," "afford" (say "have enough crystals"), "evidence" without "proof," "route" (say "path"), "anchor" without a re-say, "judgment," "tempting," "footnotes," "eligible" (say "the one that was already here"), "retain," "consequence," "threshold," "qualifying," "release" (say "let go"). Institutional nouns (budget, department, application, charges, maintenance, inspection) are Pip's bureaucrat register and they pass over a seven-year-old; keep the register, swap the nouns for objects (a jar, a sticker, a receipt, a rubber stamp, a lost sock).

**No "No."** Six drafts answer the hold with a bare "No." In TTS it lands as a correction of the viewer. Write "The answer is no, and the reason is a good one," or show the consequence first and let the "no" be visible.

**Name the patterns.** ChessKid's real technology is a sayable name a kid can use at a board (A3 §1.1). Use these, by name, and reuse them in later episodes: **the Two Front Doors** (R01, R24), **the Closed Chain** (R03, R11, R16, R17), **the Blocked Rectangle** (R05, R20), **the Empty Payday** (R04, R15), **the Standing Bill** (R07, R19, R21), **the Missing Seventh** (R08, R18), **the Quiet Ten** (R09, R26).

**Optional pair nicknames alongside the six element names.** Adopt the pair-names (B2 §3): **the Sparks** (Fire + Lightning), **the Garden Wall** (Plant + Metal), **the Deep End** (Water + Shadow). The chant, split between Click and Pip: "Sparks burn the Garden Wall. The Garden Wall drains the Deep End. The Deep End puts out the Sparks." The on-screen chart always keeps the literal element names, and Coach states the literal pairs beside the chant every time it is used. Introduced in R03; re-quoted one line per spotlight. *(Owner approved as a trial on 10 September; chart use remains welcome.)*

---

## 3. The cast

Voice ids are in PIPELINE-NOTES.md; preserve the existing published cast. A4 §1 provides proposed delivery instructions, not authority to recast a character. The rules below are about what each character is *for*.

**COACH** (marin). Warm, precise, delighted that the rules exist. Wants to hand over the checking; fears being believed instead of counted. Names the fact that decided the answer, never the person. Coach never rhymes. Coach never reads a list of more than three items. Coach gets one genuine discovery mid-lesson in R12, R21 and R24 (assigned in §7), stated plainly: "I was about to call that a good turn. Count again with me, starting at A one." Coach greets and Coach teases: bring back one warm opening line and one forward tease per episode where the exit shape allows (§6).

**PIP** (coral). An inventor who wants to be entered in the record. Founds a business on every rule Pip has just misread; the logo is always finished first. Pip's errors are always the exact error the episode corrects, so they are never cruel. **Pip is right first, before the hold, in R03, R09, R17, R18, R23, R26** (assigned in §7), and in those lines the delivery cue is `[quietly certain]`. Pip's sadness is loud, not wry ("My pockets contain crumbs and disappointment" is Click's line, not Pip's). Pip may chant. Pip never narrates the learning objective.

**CLICK** (cedar). A small six-light action counter who tracks evidence, not obedience. Two-beat noun fragments. Flat corrections that land on the claim, never the claimant. Click counts and contradicts. **Click does not write jingles.** When Click carries the episode's memory cue it is a fact-shaped line spoken flat ("One enemy inside, and the whole rectangle goes dark"), never a rhyme reached for. Click keeps two files: the **Evidence Card** (§5) and **Pip's Amendments drawer** (§6). Click's private want, paid off in R27: to count something other than actions. Click has at least three lines in every episode, including the six spotlights. Click never scolds and never sounds like a countdown.

**Guests** (one per spotlight; voices in A4 §1.3). Each has a want and concedes exactly one thing their element cannot do, in their own idiom.
- **EMBER** (onyx) — proprietor of the Toast Department; wants to close the ticket; fears underdone toast (a nonlethal hit closes the chain and the target heals). Best threshold instinct on the cast.
- **ZIP** (verse) — courier who wants a statistic; treats arrival as completion and learns, receipt by receipt, that it is not. Owns R12 and R20 and the line "'I annoyed someone' is not the whole business plan."
- **BUBBLES** (ballad) — captain of a bucket with a paper sail; wants a crew, not a boat. The slowest voice in the show. Never winks at the joke.
- **MURMUR** (ash) — a fully visible detective whose method is correct for a public game: list what is true, list separately what is possible, never confuse them. The invisibility claim is a coat over a real craving for a hard case. Murmur must never be spooky. Murmur gets an actual case to close in R14 and R25 (Sam's request).
- **CLANK** (sage) — gentle fortress with a daisy; wants to be trusted with something fragile; fears arriving too late. "Strong is useful. Invincible is a different word."
- Pip doubles as the gardener in R15 (coral, no voice change).

Lines in the wrong mouth (A1 §2, full table) must be reassigned: "My pockets contain crumbs and disappointment" → Click. "Tier one: at most one…" → Coach, or cut. "We know their options better than their intentions" → Coach or Murmur. "The daisy has requested a window seat" is a lifted Click line; give Clank his own.

---

## 4. Line format (binding)

```
# R07 — Bigger Pieces Have Bills
Shape: Teller Window · Pattern: the Standing Bill · Cue: "Nothing, one, two. And tier one always stays."
Cast: COACH, PIP, CLICK

### INVITATION
[board: two envelopes on the table; board unchanged]
PIP [proud announcement]: Fan mail. Addressed to The Very Impressive Army.
CLICK [deadpan, flat]: It is a bill. Three crystals, due when your turn starts.

### RECALL
...
### SHOW
[card: Hi tier one, upkeep zero · Hono tier two, upkeep one · Tanka tier three, upkeep two]
COACH [stating the rule, level]: Tier one owes nothing.
COACH: Tier two owes one. Tier three owes two.
### TRY
COACH [question, open]: With two crystals, can we keep the Hi and the Tanka?
COACH: Take longer if you want. Or just watch what happens.
[HOLD 8]
### EXPLAIN
[sfx: bill thud] [board: two crystals slide onto the Tanka envelope; it opens]
COACH [reveal, land it]: Two crystals opened the Tanka envelope.
...
### TRANSFER
### EXIT
```

Rules:
- Beat headings are the seven beat names, in order, once each. `[HOLD 8]` appears exactly once per episode (R10 and R27 are the exceptions named in §7).
- A dialogue line is `SPEAKER [cue]: spoken text`. The cue is optional and comes from the closed list below. At most one cue per line. No cue on a line with more than one number.
- Spoken text contains **no digits, no operators, no abbreviations, no non-ASCII**. Numbers are words. Coordinates are "D four", "A one", "J ten" (the pipeline respells columns; you write them plainly). Unit names are canonical spelling (the pipeline handles pronunciation); write "the Hi", "a Hi", "each Hi", never bare "Hi" as a subject and never "Hi's". The game is "Muju Hono Tanka" or "the game"; the piece is "the Muju." Stats are "attack", "defense", "speed", "Mining". Never "Mine" as a noun.
- Silent directions are `[board: …]`, `[card: …]`, `[sfx: …]`, `[sting: …]`, `[music: …]` (vocabulary in A4 §5). Every number spoken in the question sentence must have an earlier `[board:]` or `[card:]` placing it on screen. No audio cue between the question line and the answer line.
- Em dashes, en dashes, ellipses and curly quotes do not go in spoken text. Use a colon or a full stop. Use `[quoting a phrase]` when a phrase is being quoted.
- Never split one sentence across two lines. Split at full stops only.
- Do not write hold values unless a beat needs one (a joke landing: `(hold 900)`). Defaults come from A4 §4.

**Cue vocabulary** (closed; expansions in A4 §2): `[warm, unhurried]` `[gently, slower]` `[counting, even beats]` `[stating the rule, level]` `[curious, thinking aloud]` `[delighted realization]` `[question, open]` `[reveal, land it]` `[deadpan, flat]` `[dry aside]` `[rhyme couplet, light lilt]` `[proud announcement]` `[mock-formal announcement]` `[conspiratorial whisper]` (Murmur only, once per episode, never on numbers) `[cheerfully wrong]` `[quietly certain]` `[dawning concern]` `[rapid, breathless]` (Zip only, once) `[trailing off, inviting]` `[quoting a phrase]` `[recap, brisk]`.

---

## 5. Two standing devices

**The Evidence Card.** After every answer, Click fills a two-column card on screen: *what this proves* / *what it does not*. It absorbs the 62 caveats. Rule: **usually one spoken strategic limitation per episode; speak every condition needed for a correct answer**, said by the character with a stake in it, in character (Zip's receipt, Ember's "One crystal is not a fire door," Bubbles' "Two buckets is not the whole navy," Clank's "I can reach the danger, or I can reach it in time. Today those are different squares"). Everything else is a `[card: EVIDENCE — proves: … / not checked: …]` direction with Click's `[dry aside]` reading at most one line of it. See A2 §4 for the worked rewrites of R08, R18, R20, R21, R23, R24, R25.

**The hold ritual.** The named switch, the question with its numbers already spoken, a permission line, `[HOLD 8]`, then the board acts. The permission line keeps its meaning and rotates its words; no wording more than four times across the course. Five cues to rotate (A2 §5): **(A) Coach hands over** — the default. **(B) Click posts the facts, then Coach asks** — Click reads two or three facts flat, then the question. **(C) The guest asks about their own department** — all six spotlights. **(D) Pip commits first** — Pip says a specific guess before the hold; the answer confirms or corrects *Pip*, never the viewer; Pip is right about half the time. **(E) The two-card fork** — two or three labelled cards; "put a finger on one, or just look at both." Never the same cue two episodes running. Assignments in §7.

---

## 6. Course-level structure

**Shapes.** Twelve dramatic forms, mapped in B3 §2; each episode's shape is assigned in §7. The six spotlights share the "visit to a working department" wrapper (B3 §2 header): a department sign with the literal rule under it; Coach's three questions ("What are the three numbers? What job do they buy? What does that job cost next turn?"); the guest concedes one thing; income revisited on a real square; the department's work card handed over at the exit.

**Cold opens.** Use the B3 §3 cold open for each episode as the starting point (you may improve it; you may not replace it with a prop gag). No "Today," in the first eighty spoken words. The goal is stated as an answer to a character, never as an announcement.

**Recall carriers** (rotate; never the same twice running):
- **(A) One card out of the drawer.** Click opens **PIP'S AMENDMENTS (PENDING)**, reads a previously filed idea and the rule on the back. "Filed. Overruled by the Empty Payday."
- **(B) The same square, a different day.** C three, mostly. "Last time we looked at C three it was empty and legal. Today somebody is standing on it."
- **(C) A memo from a guest.** One line in the guest's idiom restating their department's rule.
Assignments in §7. R01 has no recall. R27 uses all three.

**The season arc: Pip's Amendments.** Pip wants one of Pip's own ideas to become part of the game. Every rejected idea goes in the drawer with the rule that rejected it on the back: the eighth arm (R02), the spoon's shield (R03), the star-shaped delivery zone (R05), three hats at once (R06), the IOU (R07), the trumpet reset (R09), the seventh action (R18). Pip's businesses (Standing Business R04, Rectangle Delivery R05, Watering Can & Refill R15, the three jars R21) are amendments too. **Pip wins twice:** in R02 the spare arms holding the reference cards is stamped ACCEPTED (TABLE CUSTOM), and it is why the cards are visibly on the table for the rest of the course; in R27 Pip's last amendment ("After a game, ask what you expected, what happened, what you would try instead") is also accepted as a table custom. Two accepted, both habits, neither a power. Full payoff in B3 §5.3. The drawer appears for one or two lines in the episodes that use recall carrier (A); it is not in every episode.

**Running gags** (one or two lines each where they land; every beat legible cold; none grants a power). Run these and only these:
- **The welcome mats** — R01, R05, R20, R24, R27 (B1 G1).
- **The seventh action** — seeded R02, wins R08, R17, R18, monument R27 (B1 G6).
- **Pip Inc.** — R04, R05, R15, R21, R27 (B1 G3), folded into the drawer.
- **Zip's zero-capture receipts** — R12, R20, R22, R27; the accounting department is Click (B1 G7).
- **Murmur's case of the public game** — R14, R25, closed in R27 (B1 G5). Murmur may appear in R20 for one line only if it costs nothing.
- **The helmet's complaint file** — R08, R13, R16, R19, R27 (B1 G2), one line per appearance.
- **Clank's daisy** — R16, R18, R24, R27 (B1 G9), one line per appearance.
- **The Toast Department's stamps** — R11, R16, R17, R19, R27 (B1 G10).
Guests may cross into other episodes for one line only when the gag table above says so and the word budget allows. Do not add guests elsewhere.

**Exit shapes** (A2 §6; assigned in §7): **Mission card**, **Dare**, **Question for a grown-up**, **Mini-game**, **Cliffhanger** (name the next episode's problem, ideally as a question), **Collector beat** (the episode adds a visible card to a deck; secondary on all six spotlights). Every exit keeps a version of "That's enough for today if you want." The final spoken line is never a homework assignment.

**Spotlight roster frame.** After the hold, each spotlight introduces its three pieces in a fixed first-person-ish frame read by the guest, one number per short sentence, name said first and last: "This is the Hi. Hits for two. Shield of one. Walks two. Takes one. That is the Hi." Three pieces, three frames, then the price ladder on a `[card:]`, not spoken. This replaces the stat-triple recitation that currently opens every spotlight (A2 §3).

---

## 7. Per-episode assignments

Format: shape · recall carrier · hold cue · exit shape · memory cue (from B2 §2 ship list; it is the one cue) · who is right / who discovers · gag beats · reveal · rethink notes. Cold opens: B3 §3. Exits in words: B3 §4. Reveal staging where marked: B2 §4. Structural rethink detail where marked: A2 §7.

**R01 — The Board Has Two Front Doors.** Guided Tour · no recall · hold cue E (two cards: A one / J ten; the second question "does arriving win?" gets Pip's answer, not a second hold) · exit Cliffhanger ("Next time: how far can one piece walk?") · cue: PIP guesses "Arrive. Survive. High five?" and CLICK adds the missing words: "Arrive. Survive. **Next turn**: high five." · pattern name introduced: the Two Front Doors · gag: mats (PIP: "The mat did not mention the reply") · reveal: Sam wants to SEE Black remove the visitor: show it, then "Home waits a turn. The last piece does not." Coach says "Hello" never "Hi."

**R02 — Six Actions, Zero Octopus Exceptions.** Dispatch Board · recall B (R01's doors, one line) · hold cue D (Pip commits: "I say three left") · exit Mission card · cue: the ticket. CLICK: "One action is one ticket. Two squares or one square: still one ticket." PIP: "No change?" CLICK: "No change." · Click gets "My pockets contain crumbs and disappointment" as the answer to Pip's pocket · gag seeds: eighth arm filed; spare arms ACCEPTED (TABLE CUSTOM) for holding cards · heavy-load fix (A2): Click corrects "eight" to "six" immediately; only one demo trip before the puzzle.

**R03 — The Bonk Lab.** Bench Test · recall B (R02's hallway: "A friend in the hallway is still a wall") · hold cue A · exit Dare ("Change only the defender to defense three") · cue: the elements chant, Click and Pip, with Coach's literal pairs beside it · **Pip right first:** "That Hi looked ready to go again. I think the rule says no. It did not finish." · reveal per B2 §4 (second bonk, Sjor tips into the tray) · rethink (A2 §7 #5): hit first, name second. One Hi hits Sjor, the marker shows one not two, Pip asks why, Coach shows only the Deep-End-beats-Sparks row; the full chart is a card and the chant. No "tier" in R03. Restore CLICK: "The spoon is not an attack bonus." Pattern name: the Closed Chain.

**R04 — The Crystal Payday.** Guided Tour · recall A (drawer: "Proposal: click to mine." "Overruled. There is no Mining button.") · hold cue D (Pip commits "Three" and is wrong, gently) · exit Cliffhanger ("Next time the shop opens") · cue: CLICK "Bucket or puddle. You carry the smaller one." with Coach's literal min() sentence beside it · gag: the Standing Business folds; "chief financial bucket" stays but not the word "promoting" · reveal per B2 §4 · pattern: the Empty Payday. Sam needs "reserve" defined as "the crystals still sitting in that square" and a `[sfx: crystal clink]`.

**R05 — The Shop Delivers Rectangles.** Complaint Window (Click at the window, Pip filing) · recall B (C three: "empty and legal") · hold cue E · exit Mission card · cue: CLICK "One enemy inside, and the whole rectangle goes dark." COACH: "A different friend might still have a clear one." · gag: star map filed; mat lettered DELIVERY ENTRANCE · B1 joke 10: "One complaint and the whole district closes?" "That was not a customer." · reveal per B2 §4 (crate slides back; C three stays lit) · shade the rectangle *before* defining it. The shutter image ("once your first action happens, the shutter comes down") is introduced here for R20 to reuse. Pattern: the Blocked Rectangle.

**R06 — The Promotion Staircase.** Equipment Day · recall A (drawer: "three hats at once") · hold cue D (Pip commits, and Pip is right: "The one that was already here") · exit Cliffhanger ("Next time the bill arrives") · cue: CLICK "Pay the gap. One step up." · replace "A hat needs time to settle" (misleading) with the arrival rule as a shop policy: "Hats are fitted to residents, not to arrivals" (A1 §6 #6) · **cut Cleave from R06 entirely** (A2 §7 #6); spend the words on a second promotion instance (Sjor to Straumr, four minus two) · B2 §5: say once that Hi→Hono→Kagari is small fire → flame → watch-fire and Inyan→Mazask→Tanka is stone → wall → great; the names teach the staircase · reveal per B2 §4.

**R07 — Bigger Pieces Have Bills.** Teller Window · recall B (C three's Hi, bought last time: "it owes nothing") · hold cue B · exit Mini-game (zero/one/two counters beside each card) · cue: CLICK "Nothing, one, two." PIP: "And tier one always stays." · gag: the IOU. Pip's "Can I promise tomorrow's crystals?" becomes the episode's spine (A1 §6 #7); restore CLICK: "Your receipt cannot mine." · cut the "optional review setting" line to a card · reveal per B2 §4 (envelopes) · Sam: define upkeep as "the toll a big piece pays." Pattern: the Standing Bill.

**R08 — Keep Your Pieces Safe.** Unhurried Quiz (Click confiscates the buzzer in the first three lines) · recall C (memo from Bubbles? no: guests not yet met. Use A: drawer "helmet as defense") · hold cue B · exit Question for a grown-up ("Which retreat would you pick, and why?") · cue: CLICK "Count their trip. Then count their hit." (full stop, not comma) · gag: helmet file opens; restore CLICK "The helmet has filed a complaint." · one worked enemy count before the question, not two (A2) · caveat rewrite per A2 §4 (Evidence Card: "Safe from: Sjor. Checked. Everyone else: not checked.") · pattern: the Missing Seventh (first time the absence wins).

**R09 — The Ten Quiet Turns.** Forecast (Click issues the bulletin) · recall C is impossible (no guest); use B (the clock strip itself, at nine, SAID ALOUD) · hold cue E (two cards: ending A / ending B) · exit Mini-game (clock at nine, two endings) · cue: CLICK "A kill or a crystal sends the clock back to zero." with Coach's literal line beside it · **Pip right first:** "Dramatic is not the same as busy. I think walking all the way across still counts as quiet." · gag: trumpet filed; the sleeping clock in slippers stays; restore CLICK "Running in circles is exercise. It is not a clock reset." · the four negatives become a four-icon card, one spoken line · reveal per B2 §4 · **the nine must be spoken before the hold.** Pattern: the Quiet Ten. Keep the warm line: "This clock counts game turns, not your thinking time."

**R10 — One Turn at the Practice Table.** Teller Window · recall A · **two chapters** (A2 §7 #4): Chapter one PAY + PLACE ends with Pip committing and Click answering (no hold); Chapter two ACT + MINE has the `[HOLD 8]` · hold cue B · exit Mission card · cue: CLICK "Pay. Place. Act. Mine." four beats matching the strip · the clipboard's one box becomes four boxes on screen · reveal: crystal cascade, bank two becomes six.

**R11 — Fire: The Toast Department.** Bench Test (kitchen) · department wrapper · recall B (C three's Hi is the one Ember uses) · hold cue C (Ember asks) · exit Dare + Collector card · cue: EMBER "Never declare breakfast early." with Coach's literal "four damage is not six defense" beside it · Click has at least three lines: the requisition clerk who declines Ember's toast-shield ("Defense: unchanged. That is the entire product." A1 §6 #2) · roster frame after the hold · reveal per B2 §4 (the DONE stamp stops mid-air) · restore CLICK "A taller chef hat does not stop an attack." Pattern: the Closed Chain.

**R12 — Lightning: Express Delivery.** Dispatch Board · wrapper · recall C (memo from Ember) · hold cue C (Zip asks; **ask Radi only**, Kimubunga's one action is the punchline after) · exit Cliffhanger + Collector · cue: CLICK "Fast feet. Small bite. Empty bucket." · **Coach discovers:** the saving versus the spare (B1 §4: "Then it was not a saving yet. It was a spare.") · gag: first receipt; restore the racing-stripes bucket and "The stripes do not reach underground." · B1 joke 8: "I am standing on ten crystals decoratively."

**R13 — Water: Captain Bucket.** Job Interview (the bucket applies to be a warship) · wrapper · recall B (C three) · hold cue C (Bubbles asks) · exit Dare + Collector · cue: CLICK "Big shield. Slow boat." BUBBLES: "The captain is aware of the boat situation." · show only defense before the puzzle; Mining and speed after · caveat: BUBBLES "Two buckets is not the whole navy." · gag: helmet gets a bucket-safety certificate, one line · Bubbles' want is a crew: "Two attackers were not enough. That is a crewing problem."

**R14 — Shadow: The Visible Detective.** Open Case File · wrapper · recall C (memo from Zip: "Speed buys travel. It has never once bought damage.") · hold cue C (Murmur asks) · exit Collector card ("case closed") · cue: CLICK "Shadow walks the hallways. Same as everyone." · **give Murmur a case** (Sam): the case is the route; the file has three columns, fact / possible / guess; the leaf is entered as scenery · keep "You cannot see me" / "…enormous detective sandwich" / "A witness. Most inconvenient." · A2 wants a blocker added so the puzzle is not a memory test of the sentence just spoken: **do not change the verified board**; instead do not speak the answer arithmetic in the show beat (show Göl's trip, do not total it), so the hold is real · restore the published line "The culprit was an uncounted movement action. It was hiding in plain sight. Just like me."

**R15 — Plant: The Payday Garden.** Guided Tour (garden) · wrapper · recall A (drawer: Watering Can & Refill Co. is filed *in this episode*, as the reveal) · hold cue C (Pip-as-gardener asks) · exit Question for a grown-up + Collector · cue: PIP "Choose the square you'll still be standing on." · Click counts crystals *leaving* a square: "This one goes the wrong way." · move the whole economy block after the hold · reveal: the puddle image; "It is empty now. It does not refill." · Sachakuna: "the plural: many growing things" said once.

**R16 — Metal: The Moving Fortress.** Work Order (Clank books the fortress in) · wrapper · recall C (memo from Ember; and CLANK: "I have met that Hono. It left a mark. It did not open the door.") · hold cue C (Clank asks) · exit Cliffhanger + Collector · cue: CLANK "Strong is useful. Invincible is a different word." · only defense six before the hold; the ladder is a card · restore CLANK "I am excellent at standing somewhere with purpose. Without purpose, it is mostly loitering." and give Clank his own window-seat line, not Click's · gag: Ember's PARTIALLY BROWNED stamp, helmet gets six layers of politeness, both one line · Tanka is never "Tonka."

**R17 — Three Little Bonks.** Bench Test · recall B (R03's bench; keep the existing recall line verbatim, it is the model) · hold cue D (Pip commits: "Two Hi and the spare actions") · exit Mission card · cue: CLICK "A finish opens the next door. A survivor shuts it." then, separately, flat: "One, two, three, by tier." · **Pip right first:** "So the order can decide who gets another job," before the Cleave demo, and Coach adopts it · keep PIP "A full wallet does not make a closed shop open." as Pip's beat · the three attackers are three lines, one each, `[counting, even beats]`; the tally is Click's · gag: Bubbles for one line ("Three. That is a crew."), Ember for one line (the plaque, B1 joke 6) if budget allows.

**R18 — The Missing Seventh Action.** Work Order · recall B (R02's pocket: CLICK "Pip. Same pocket.") · hold cue D (Pip commits) · exit Mini-game (two boards) · cue: PIP "We did not find another action. We stopped needing it." spoken *before* Coach's summary · keep the cold open verbatim ("I dropped our seventh action somewhere." / "We never had a seventh action." / "Then I have found the problem.") · **two boards side by side, BOARD ONE / BOARD TWO**, never a rewind; the B four relocation is a different starting position and is never animated as a free move · caveat per A2 §4 ("B four was a turn. Somebody paid for it.") · Clank one line (the daisy was moved last turn).

**R19 — New Hat, Different Math.** Equipment Day · recall A (drawer: the helmet applies to be promoted; "The helmet is not an element.") · hold cue D (**ask the money only**; the upkeep consequence is Click's line after) · exit Dare · cue: CLICK "A hat with no job is just a hat." with the sentence frame "I would promote because now this piece can…" · cut "threshold" everywhere; cut the travel-threshold claim · gag: Ember requisitions a bigger stamp, one line; the label goes SLIGHTLY BETTER → HAS A JOB.

**R20 — The Raid That Kills Nothing.** Complaint Window (Black files the complaint) · recall C (memo from Zip; and ZIP to PIP: "Your rectangle business is closed today." "On what grounds?" "Occupancy.") · hold cue B · exit Collector card + the receipt · cue: CLICK "Their money is fine. Their doorway is not." · the shutter image from R05 is the reveal (B2 §4) · caveat as the receipt: CLICK "Receipt: three actions spent. Zero captures. One shopping trip cancelled." ZIP: "A fine day's work." COACH: "Was it? Depends what the rest of White did with the quiet." · Sam: "raid" promised action; bridge it by naming the thing the delay bought · J nine is never "basically home" · **Pip's cross-examination** (B1 bench): "Did anything actually get better while their door was shut?"

**R21 — The Army Budget.** Teller Window · recall A (drawer: "Probably Enough" jar; R07's envelope returns: "The fan mail is back. It has learned my address.") · hold cue B (Click reads the jars, then **one question: how much is left in the last jar?**) · exit Mission card · cue: PIP "Now jar. Payday jar. Next-bill jar." · **the jars are literal and physical**; crystals visibly move one step at a time before the hold (A2 §7 #8) · **Coach discovers:** "I forecast the money and not the squares. Both are empty now." · caveat: the fourth jar, IF IT GOES WRONG. "The jars know today. They do not know Black." · Click counts the same crystals in two jars and must say which moment each belongs to.

**R22 — The Army Job Fair.** Job Interview · recall C (memo from Bubbles) · hold cue E (two cards: Göl / Sjor) · exit Dare · cue: CLICK "Name the job before you pay." · keep the chair verbatim, all three beats; the chair gets the exit · cut the Cleave clause (R17 is not a prerequisite) · gag: Zip submits Göl's trip as a personal best and is told the department wanted the earner; Bubbles argues for the earner; one line each · Murmur may file a character reference for the chair, one line, if budget allows.

**R23 — Opening Day at the Plan Factory.** Two Plans, One Count · recall A · hold cue A · exit Question for a grown-up · cue: CLICK "If the board changes, the plan changes." · **Pip right first and Pip wins the disagreement:** "A forward anchor with no safe reply could become a very brief anchor." COACH: "That is the third question, and Pip asked it before I did." · the verified puzzle (bank zero, no buying on expected income) **stays as the hold** but is framed as the recall of the Standing Bill; the three questions are then *worked* on the real opening board, one each, as the transfer; a second-board fork may be offered as PROPOSED in the footer only · six hedges become one and a PLAN → WHAT CHANGED → NEW PLAN card · cut the unspeakable sentence; "Write down what happened. One game does not crown a champion opening."

**R24 — Win the Next Position.** Two Plans, One Count · recall B (the mat at A one has been used: "It was polite about it. That somehow makes it worse.") · hold cue E (two cards: the far capture / the front door) · exit Mini-game (move the invader two squares off) · cue: CLICK "Check your own front door first." · **Coach discovers:** "I was about to call that a good turn. Count again with me, starting at A one." · **"quiet is zero" must be spoken before the hold** · the answer is that the removal must be *included*: with six actions there is room for both, and the omission is what loses; never an either/or · reveal per B2 §4 (play the tempting branch, then rewind) · cut the five-noun list; keep the trophy renames; "footnotes" becomes a visible tiny note under the trophy or a kid word · Clank one line ("Protection is a list. The list has an order.").

**R25 — The Opponent Is Not a Mind Reader.** Open Case File · recall C (MURMUR: "My previous case involved a leaf. This one involves a jar. I solve crimes against lunch.") · hold cue E (three cards; **Murmur asks**) · exit Question for a grown-up · cue: CLICK "See what's true. List what they can do." · the case file on screen: BANK filled, LEGAL SQUARES filled, PIECES THAT CAN CLIMB filled, MOTIVE empty (A1 §6 #10) · caveat: MURMUR "Means: four crystals. Opportunity: a legal square. Motive: unknown. We do not have a confession." · Click: "Result: unavailable. I count evidence." · "The transparent jar has been cleared" stays but the word "charges" becomes a kid word or a visible stamp · the hidden Tanka is a suspect Murmur has to release; the denial "no queue, no direct higher-tier purchase" stays explicit.

**R26 — Finish, or Save the Draw.** Forecast (Click's final bulletin, then a correction) · recall B (the clock strip at nine, SAID ALOUD, and the sleeping clock in slippers returns) · hold cue B · exit Mini-game (three endgame cards) · cue: PIP "The high five never landed." with CLICK's literal "The clock finishes before the next turn starts." · **Pip right first:** "Wait. The Muju is standing on one crystal. Doesn't that change the ending?" (in the correction half) · reveal per B2 §4 (Pip's hand left in the air) · B1 joke 9 ("Then my visitor lives there now. Rent-free. Forever. Nobody wins.") · the draw *is* the result, not an interruption · cut the "winning defender's upkeep money" sentence · keep "'Looks winning' is different from 'wins now'" with `[quoting a phrase]`.

**R27 — The Hat Is Optional.** Unhurried Quiz · recall: all three carriers, briefly · **three stations, three `[HOLD 8]`s**, chapter cards between, on the three verified positions (R24's, R06's, a Hi killing a non-last Muju at quiet nine), none announced by rule name · hold cues E, D, B in that order · exit: the mission (one supported game, one replayed decision) plus the arc payoff · cue: CLICK "Doors. Bill. Shop. Plans. Count. Reply. Payday." seven beats on the routine strip; then Coach's "Good arithmetic. Useful questions. Honest uncertainty." slow, as the thesis, not a chant · **payoff** (B3 §5.3): the drawer is emptied; Click reads the backs of three cards and Pip says the rules along with him; the one accepted card (cards on the table) is read; Pip files the last amendment and it is accepted; Click's count of questions; the helmet's file closed on a technicality; Zip's receipt accepted; Murmur closes the case; Bubbles gets a station and a crew of two; Clank hands the daisy to the viewer; the mat re-lettered STILL HERE AT YOUR NEXT TURN? IF THE GAME IS STILL GOING, YOU WIN. The hat stays on the chair. **Budget discipline:** this is the one episode allowed to reach 340 words; if the payoffs will not fit, keep the drawer, the mat, the cards, and the last amendment, and give the other gags one word each on a `[card:]`. Cut the optimal-play paragraph entirely.

---

## 8. Preserve and restore

**Preserve verbatim** (A1 §5, the 25 best): the R18 cold open; "A full wallet does not make a closed shop open."; "I am standing professionally."; the R14 leaf exchange and "A witness. Most inconvenient."; "The paperwork is a drawing of an octopus eating paperwork."; the R22 chair exchange; both Murmur jar lines; "This daisy is protected by six layers of politeness."; "Strong is useful. Invincible is a different word."; the three Zip lines; both Ember lines; "My loophole has become a regular hole."; the "Probably Enough" jar; the brief-anchor line (moved before the hold); the snack-depletion line; "This is a lab, not a memory ambush."; "Fact: four crystals. Fact: a legal square…"; "Good arithmetic. Useful questions. Honest uncertainty."; "We did not find another action. We stopped needing it."

**Restore from the published 14** (A1 §5): "The helmet has filed a complaint." (R08) · "Running in circles is exercise. It is not a clock reset." (R09) · "The hat is not a tiebreaker." (R09 or R27) · "Extremely responsible is doing a lot of work in that sentence." (R07) · "Your receipt cannot mine." (R07) · Clank's loitering line (R16) · "The daisy would like to speak to the toast department." (R16) · "The spoon is not an attack bonus." (R03) · "A taller chef hat does not stop an attack." (R11) · "No secret fourth-floor elevator." (R06) · "Six for the team. Not six each." (R02) · "Last piece gone? The game is done." (R01, R26).

**Cut** (A1 §5, the 25 flattest, and every WEAK RHYME / MISLEADING row in the A1 §3 ledger). In particular: every cue that rhymes on *-ay*; "change gear"; "the world you've made"; "threshold"; "Captain Ship"; "Sneak through space"; "A kill or pay"; the optimal-play paragraph; "Record what happened without declaring the winner…"; "A hat needs time to settle."

---

## 9. The writer's self-check before returning a script

1. Every number in the question sentence was spoken earlier, one per sentence, and placed on screen by a `[board:]`/`[card:]`.
2. `[HOLD 8]` once (R10, R27 excepted); nothing between the question line and the answer line; the answer is a board event first.
3. No "Today," in the first eighty words. No bare "No." No "Try…" as the last line. Stopping stated as normal.
4. Coach has zero exclamation marks and no list over three items. Click has at least three lines and no rhyme reached for. Pip is present.
5. The assigned memory cue is the only cue, heard at most twice, never inside the hold, with the literal rule beside it.
6. Speak all conditions needed for the answer. Extra strategic scope belongs on a concise Evidence Card.
7. Every joke names the rule it depends on. No institutional nouns without an object. No Sam-list words without a re-say.
8. The verified puzzle state, coordinates, numbers and answer are unchanged. The C2 checklist passes. J nine is not J ten. Income is at *own* turn end. Tier one always stays. A survivor closes the chain. Place does not reopen.
9. 250–340 spoken words. 22–30 lines. No digits, dashes, ellipses or non-ASCII in spoken text. No sentence-initial bare "Hi".
10. Footer present: "## Writer notes" (≤5) and "## Proposed changes" (or "None"), with any PROPOSED alternate puzzle clearly marked and the verified puzzle still used for the hold.


## v2.2 authority
Use this packet’s final scripts and PRICE-CHANGE.md. Previous verification reports describe historical packets. Purchase/promotion prices doubled. Upkeep, mining, reserves, starting resources and actions are unchanged.
