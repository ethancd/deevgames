# Lution: A Design Strategy Guide

*The card game is the scoreboard. The design round is the game.*

Every inner game exists to assign two seats at the design table: the
**loser's seat** (you choose KEEP or STEAL after the reveal, and if you
steal, you pick FIRST) and the **winner's seat** (you counter-raid second,
but only if the loser opens the door). You know which seat you hold *before*
you design. That asymmetry is the whole strategy of Lution.

## The resolution, precisely

Both players design blind and reveal simultaneously. Then the **loser**
chooses:

- **KEEP** — each player adds their own design to their own deck. Nothing
  else moves. Nobody touches anybody. Both designs survive, guaranteed.
- **STEAL** — a two-pick raid, strict order:
  1. **The loser picks first**, from the winner's new design *or* any card
     already in the winner's deck.
  2. **The winner counter-raids**, from the loser's new design *or* any card
     in the loser's deck — except whatever the loser just took in step 1.

  In either step, taking the design offered always moves it, cleanly. Taking
  an *existing* card moves it too — unless the picker originally created that
  card's type, in which case it is **executed**: removed from the game,
  registry marked destroyed, the picker gains nothing. And in either step,
  picking an existing card *instead of* the design on offer spurns that
  design — it is destroyed too, on the spot, never having entered a deck.

One general principle underlies all of it: **any designed card that isn't
kept or stolen is explicitly destroyed.** Nothing designed this round is
ever left in limbo. It enters a deck, or it's gone.

Four consequences worth tattooing somewhere:

1. **All theft is consensual, but no longer one-sided.** Cards only ever
   leave a deck as part of a STEAL that the *loser* chose to trigger — but
   once triggered, both seats raid. KEEP is still the only decision that
   guarantees nothing moves.
2. **The loser's own design is never safe under STEAL.** Choosing steal
   forfeits your creation completely: the winner's counter-raid either takes
   it or executes it. There is no scenario under STEAL where the loser keeps
   their own new design.
3. **The winner's design is a bribe with a hostage clause.** Offering it is
   how STEAL starts, but the loser can spurn it for something better in your
   deck — and spurning it kills it, guaranteed, whether or not the loser gets
   what they went for instead.
4. **Up to four cards can leave the game in a single STEAL round**: the
   winner's design (if spurned), the loser's design (if spurned), and one
   creator-execution on each side's pick. KEEP preserves design space by
   definition — nothing is ever destroyed under KEEP. STEAL is the only
   decision that burns it, and it can burn a lot at once.

## Spurn mechanics: the offered design as gift, bribe, and hostage

Every steal pick is a choice between two very different kinds of value: the
design on the table (safe, guaranteed, brand new) and the offering deck
behind it (known quantity, but taking anything else there kills the design).
That framing changes depending which seat you're evaluating it from:

- **As the design's author**, it is a **gift** if the other side takes it
  (it moves into a deck, doing exactly what a keeper does anywhere), and a
  **hostage execution** if they don't (spurned, destroyed, gone — you got
  nothing for the round you spent designing it). You never get to choose
  which; the picker does, unconditionally.
- **As the picker**, the offered design is a **bribe**: guaranteed,
  risk-free value, sitting right next to a deck that might hold something
  even better. Taking the bribe is the safe play. Reaching past it is a bet
  that the deck card's raw value (or its denial value, if you created it)
  beats a sure thing — *and* it costs the design's author their whole round,
  which is sometimes the actual point.
- **The loser's adopt-or-execute choice**, one level down: when the pick
  target is a card the picker themselves originally created — sitting, stolen
  or otherwise, in the *other* side's deck — taking it doesn't give you a
  card, it deletes one. You **adopt** (leave it be, pick something else) or
  you **execute** (deny it, permanently, for zero material gain). This is
  the same choice for both the loser's step-1 pick and the winner's step-2
  counter-raid — it's symmetric, and it's the only place in the game where
  "taking" a card and "destroying" a card cost the same click.

## The extinction engine

KEEP is inert: it always adds exactly two cards to the game (one per player)
and destroys none. STEAL is the only lever that removes cards, and it scales:
zero destructions is the *best* case (both picks take their offered design
and nothing else), and four is the worst (both sides spurn the design *and*
execute a creator-owned target). Every round you or your opponent chooses
steal is a round where the total population of live cards can shrink —
sometimes sharply.

This matters for how a match feels over its length. Early rounds, when
either deck is thin and every card offered is unproven, STEAL costs little
to try — there's not much to spurn or lose. Late rounds, when decks have
accumulated real engines, STEAL against a healthy deck is a genuine gamble:
your own design is definitely forfeit, and the counter-raid might reach an
old card you'd forgotten was exposed (see "the fortress fell," below). Track
the shrinking population the way you'd track cards left in a deck during any
trick-taking game — it tells you how much room is left to design into, and
how much of what's already on the table is now permanently gone.

## The loser's seat: pick first, but you will pay

As the loser, you hold the *decision* (keep or steal) and, if you steal, the
*first pick*. That is genuine power — first pick means you see the winner's
whole deck before they see anything of yours — but it is not free power.
Steal, and your own new design is gone no matter what: taken by the winner's
counter-raid, or executed if they already own its type. There's no branch of
STEAL where you keep both your pick *and* your design.

So the real question, every time, is: **does what I can grab in step 1 beat
what I am guaranteed to lose in step 2?** You lose your own design outright.
If the winner's counter-raid prefers an existing card of yours over your
design (because it's worth more to them), you lose that too — on top of the
design, not instead of it. Price steal accordingly: the winner's design (or
their best existing card) has to clear your design's value *plus* a
reasonable estimate of what else in your deck might tempt them.

- **The Keeper.** Design a bomb, KEEP it, repeat. Your deck compounds. You
  never gain enemy tech, but you never bleed either. Still the default, and
  still strong — probably the strongest single habit in the game, if a
  little inert.
- **The Raider.** When you *intend* to steal — because the winner's reveal
  is too good to pass up, or your own deck has nothing left worth
  protecting — design **chaff on purpose**. A deliberately mediocre design
  costs nothing to forfeit; your exposure narrows to whatever the counter-raid
  actually takes from your existing deck, which you can also manage by
  keeping your deck free of anything you'd hate to lose.
- **The Executioner.** If a card the winner's deck currently holds is one
  *you* originally created — planted there by a steal against you in an
  earlier round — step 1 lets you reach in and execute it. You gain nothing
  material, but you deny them a working card and you don't have to spurn
  anything to do it (the design candidate is still right there, untouched,
  for anyone who wants it more). Denial is a legitimate step-1 pick, not
  just a consolation prize.

## The winner's seat: design the bribe, brace for the counter-raid

Your design, on a STEAL round, is the very first thing the loser gets to
look at. Design it too well and you've handed them the easiest possible
pick — no need to gamble on your deck at all, they just take the design and
you counter-raid *their* deck for a consolation prize. Design it too poorly
and you tempt them PAST it, into your deck, where the destruction that
follows is real and permanent.

Your tools:

- **Asymmetric value.** Cards worth more in your own deck than in theirs make
  the design an unappetizing bribe *and* a bad target even if taken — but the
  asymmetry has to come from something visible *inside* the game: a card
  that references another card's NAME you already hold ("worth 1 extra point
  while you control another keeper named 'The Bureau of Sunk Costs'"), a
  board state your deck reliably produces (a keeper-count or point-threshold
  condition your engine hits and theirs doesn't), or an effect-type synergy
  (a card that rewards you for having several protection effects in play
  when that's the shape of your deck). Any of those make a card an 8 in your
  deck and a 3 in theirs, safe from a rational loser either way — without
  the design ever needing to know or care *who built which deck*.
- **The lure.** A design that reads better than it plays: bait the loser
  into taking it (a guaranteed move for them) instead of reaching into your
  deck, protecting whatever you'd actually hate to lose.
- **The decoy.** The inverse: design something you'd be fine losing, so a
  loser tempted by your ACTUAL good cards has to weigh "take the free design"
  against "spurn it, destroy it, and go get the good stuff instead" — a much
  harder call than taking a straightforwardly great design would be.
- **Counter-raid discipline.** Remember you get the LAST word every steal
  round, not the first. If the loser's step-1 pick already took something
  valuable from your deck, your step-2 pick is compensation, not bonus — go
  get their design or their best remaining card, and don't leave value on
  the table just because you're "already even."
- **Territory burning.** Your design claims its effect in the registry the
  moment it's minted, whether or not it ever survives into a deck. Spending
  a round on an effect you fear seeing designed against you later — purely
  to make it permanently unavailable — is a legitimate move even when you
  expect (or intend, via a deliberately spurnable design) for it to be
  destroyed.

A hard boundary on all of the above: **no deixis outside the inner game.**
A card's effect can't refer to anything that would distinguish between
players, rounds, or matches beyond the current inner game — no "cards you
created," no "the player who designed this," no counting rounds or matches,
no real-world dates or names. This kills a whole family of asymmetric-value
shortcuts that would otherwise be the easiest way to design something worth
more in your own deck than in theirs — you can't just say "worth 1 point per
card you created" and call it a day. Everything above (references to card
NAMES you hold, board states, effect-type synergies) works precisely because
it stays inside the closed world of the current game; anything that reaches
outside it to identify a creator, a round, or a match doesn't clear
mechanical validation at all.

## How powerful should your card be?

Calibrate against the ladder, then adjust for your seat:

1. **Vanilla-plus** (a 1-point keeper with a small ability): floor. Never
   design below it; the starters already occupy this space.
2. **Conditional engine** (2–3 points of value gated on board state):
   the workhorse. Right power for most rounds, either seat.
3. **Utility/tempo** (draw, discard, disruption on play): value that
   scales with deck consistency; ideal for growing decks.
4. **Protection** (bounce-instead-of-destroy, interruption): quietly the
   strongest category — it defends your *other* investments, which now
   matter more than ever since a raided deck can lose more than one card
   from unrelated old rounds.
5. **Bombs** (game-swinging effects): correct only from the loser's seat,
   where KEEP protects them, or when trailing badly and variance is your
   friend. Remember that KEEP is the *only* guarantee you get to keep it —
   a bomb you KEEP is safe until the day you next choose to steal for
   unrelated reasons (see "how the fortress fell").
6. **Artifacts of Ultimate Power** ("when played, win this inner game"):
   see "how the fortress fell," below.

Seat adjustments: **as loser, design one rung higher** than you otherwise
would — your downside is capped by KEEP, and STEAL's step-1 pick rewards a
strong winner's-deck read more than a strong design of your own anyway.
**As winner, design one rung lower in raw power and one rung higher in
deck-specificity** — the confiscation tax applies only to *transferable*
value, and a design so good it gets taken outright at least denies the loser
any excuse to dig into your deck instead.

Match-state adjustments: when trailing on inner wins, buy variance (bombs,
swingy effects). When leading, buy insurance (protection, synergy — things
that keep working when your deck is raided). As decks grow past ~15 cards,
consistency beats power: a modest card you see every game outperforms a
bomb you draw once in three — and a bigger deck is a bigger target surface
the day you ever choose to steal.

And always price in **collision**: the identical-design rule voids both
cards if you and your opponent express the same effect — and as of the v3
reshape, both voided designs are destroyed on the spot, not merely
discarded. The "obvious best design" for a board state is exactly what two
good designers both see, and colliding on it now costs you the effect
*forever*, with nothing to show for it. Idiosyncrasy is not just style — it's
collision insurance, and the insurance premium just went up.

## The land-grab

Every effect ever registered — kept, stolen, executed, or spurned — is
claimed forever. Simple, clean effects ("draw 1 card on play") are premium
real estate, and they go to whoever registers them first. Early rounds are
a land-grab; late rounds are increasingly baroque because the simple
continent is settled. If a plain effect matters to your long game, claim
it early, even in a round where a fancier card tempts you — and remember
that a KEEP-protected effect is claimed for good, while anything caught up
in a STEAL round has real odds of never seeing a deck at all.

## How the fortress fell

KEEP has not changed: choosing it is still the only perfectly safe outcome
in the game, and a design you KEEP enters your deck exactly as designed,
forever, full stop. If the old "warning label" below was about whether KEEP
itself could be beaten, the answer is still no — it can't. What v3 actually
resolves is the *illusion that KEEP made your whole deck untouchable*, which
it never did and now very visibly doesn't.

Here is the trap the old fortress language hid: KEEP only ever protects the
round in which you use it. It says nothing about every *other* card already
sitting in your deck. The day you next find yourself the loser and, for
completely unrelated reasons — a great winner's design, a deck with nothing
left to protect, plain greed — choose to STEAL, the winner's counter-raid
can reach into your deck and find *anything*, including a busted card you
KEPT and forgot about five rounds ago. Under v3 the winner's step-2 pick is
explicitly "the loser's design, or any card in the loser's deck" — no
carve-out for age, no carve-out for how safely it once felt tucked away.

So: design **"When you play this card, you win this inner game."** It's
still numeral-legal, still non-persistent, still implementable, still
designable exactly once. KEEP it, and it is genuinely yours forever — *as
long as you never again choose to steal*. That is the actual cost the v3
reshape imposes, and it is a real one: refusing to steal, ever, for the rest
of the match, means opting permanently out of the extinction engine and the
land-grab both. You stop taking cards from your opponent's deck, you stop
executing their old threats, and everyone at the table knows exactly why —
your one card is worth more to you than every future steal combined. That's
not nothing; conceding an entire axis of the game to protect a single card
is a real, felt cost, even if the card itself never technically changes
hands. The fortress didn't fall because the card became stealable. It fell
because "safe forever" turned out to mean "safe for as long as you're
willing to never play the rest of the game" — and now your opponent knows
the price you're paying, every single round you decline to pay it back.

*Design like a legislator: every law you write will someday be enforced
against you.*
