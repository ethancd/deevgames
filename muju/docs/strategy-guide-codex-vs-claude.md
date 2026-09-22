Muju rewards good exchanges, but our game showed how easily a player can win exchanges while losing the position that supports them. Claude finished with 57 crystals and eight projected income to my four crystals and two projected income. I resigned on turn 17 because sustaining my army and generating threats had become increasingly difficult.

> Historical analysis: predates v2.9 (2026-09-18). Metal is now Yan/Mazask/Tanka with ATK/DEF/SPD/MINE 1/3/0/3, 1/4/1/4, 2/5/2/5. Yan cannot relocate until promoted; old Metal movement and matchup advice is not current evidence.
>
> Also predates v3.0 (2026-09-19, rules revision `muju-phasing-2`): the quiet-turn draw clock is now **twenty** plies, not ten, and the warning turns amber at 17. What resets it is unchanged. Clock-pressure advice below was written for the ten-ply clock and is recorded as it stood; it is not current advice.
>
> Also predates the 2026-09-21 retirement of Standard (`SPEC.md` v3.1). Every line
> below assumes the Standard turn — a Place phase before actions, purchases that
> appear and act the same turn, upkeep paid at turn start. Under the current rules a
> purchase is a public summon that arrives a full turn later, mining and upkeep settle
> at `END_ACTION_PHASE`, and promotions happen after that. Tempo advice in particular
> does not carry over. Recorded as it stood; it is not current advice.
>
> Also predates the 2026-09-22 rename (`JUDGMENT_LOG.md` J-023): Hono→Honō,
> Kimubunga→Kimbunga, Sjor→Sjór, Aegirinn→Ægirinn, Göl→Loş, Sachita→Mallki,
> Sachakuna→Sach'akuna, Yan→Poṉ, Mazask→Veḷḷi, Tanka→Irumbu (metal_1/2/3). Display
> names only; every stat and rule below is unaffected by this note.

That was a judgment about the position, not a demonstrated forced win. One game also cannot establish an optimal strategy. But it offered useful lessons about expansion, upkeep, movement, and the limits of tactical success.

**Treat actions as your scarcest resource.**

Every player gets four shared actions per turn, regardless of army size. Buying ten more units does not give you ten more opportunities to move or attack.

This creates two budgets. Crystals determine what you can field; actions determine how much of it you can use. A large army can provide income, block routes, and maintain deployment territory without moving. Once its deposits run dry, however, putting that army back to work competes directly with combat.

Before committing a turn, decide what your four actions must accomplish. Perhaps you need two actions for a capture, one to withdraw, and one to relocate a miner. If your intended sequence needs five, having enough crystals does not rescue it.

Count movement along actual open paths. A nearby square can require a detour around friendly units. Several promising sequences in our game failed in preview because a blocker made the route more expensive than it appeared.

**Build an economy that can renew itself.**

Tier-one Muju are powerful economic units: they cost five crystals, mine three per turn, and require no upkeep. On a rich deposit, they can return their purchase price quickly.

The deposit matters as much as the unit. A Muju on three remaining crystals provides one full harvest. A Muju on an empty square provides none. Buying a miner that immediately exhausts its square may create a relocation obligation before it has even repaid its cost.

Claude repeatedly used expansion to access fresh deposits. The shadow scout at D9 was especially instructive: it enabled purchases on the rich southwest squares. Although I eventually captured the scout, the miners it helped establish continued contributing. The scout’s value included the territory it opened, not just its combat performance.

When evaluating a purchase, ask:

- How many crystals can this unit realistically collect here?
- Where can it move after this deposit empties?
- How many actions will that relocation consume?
- Can an opponent force me to spend those actions defending instead?

A good mining position has a useful second destination.

**Read projected income as a snapshot.**

Projected income describes the current board. It does not guarantee the same income next turn.

We repeatedly produced large harvests that nearly emptied the underlying deposits. My 23-crystal harvest looked encouraging, but it concealed a rapidly approaching shortage. Later, Claude’s projected income reached zero despite its enormous collection of miners.

The distinction is between a large harvest and a sustainable economy. Inspect remaining reserves, especially before making purchases or promotions that assume future income.

A practical habit is to identify next turn’s mining moves before ending this turn. If several units will become idle simultaneously, you probably cannot relocate all of them while fighting effectively.

**Buy promotions for a specific job.**

Promotions should change something concrete: a capture becomes possible, a unit survives an important hit, or increased speed makes a useful sequence fit within four actions.

My original Sjor became Straumr and then Aegirinn. Those upgrades had immediate uses. Extra defense helped it withstand single attacks, and extra speed let it raid the top edge. That unit ultimately captured four enemies.

But promotions also create recurring costs. Tier-two units cost one crystal per turn in upkeep; tier-three units cost two. A strong unit sitting on an exhausted square still sends a bill.

My bigger mistake was building a collection of expensive pieces without maintaining enough productive activity around them. Some spent too many turns repositioning or waiting while the reserve declined.

Before promoting, complete this sentence: “This upgrade lets me do ___ on this turn or the next.” Then check whether your expected income can support it. An upgrade that merely looks impressive is a poor reason to accept permanent upkeep.

**Evaluate exchanges beyond purchase prices.**

Trading a three-crystal Hi for a five-crystal Muju can be attractive. I used that repeatedly. But the printed costs are only the beginning.

An exchange also changes income, territory, action availability, and the opponent’s opportunities. Capturing an idle miner on an empty square may have less economic impact than capturing a cheaper unit that controls a vital route.

Our discussion of Sachita attacking Sjor illustrated this well. Promoting the Muju on H2 would have allowed it to reach H5 and kill my Sjor on H6. Initially, that looked like an obvious missed capture. But a newly purchased Hi could potentially recapture Sachita. Trading a promoted miner for a basic water unit was much less appealing once the reply was included.

For every attractive capture, consider three positions: the board before the attack, the board immediately afterward, and the board after the opponent’s strongest plausible response.

**Include fresh purchases in threat calculations.**

A square is not safe simply because the enemy units already on the board cannot attack it.

New tier-one purchases can act during the same turn. Deployment territory therefore creates threats beyond the reach of the visible army. Several of our raids began with a fresh purchase rather than an existing attacker.

This is particularly important near enemy-controlled territory. A newly bought shadow unit can punish an exposed fire unit. A fresh Hi can kill a basic plant unit with elemental advantage. Two affordable attackers may combine damage against an expensive defender.

When checking safety, ask both “What can reach me?” and “What can be purchased here?”

Conversely, an advancing unit may be valuable because it enables purchases elsewhere. Losing that unit can still be acceptable if the territory it opened has already produced useful reinforcements or income.

**Use elemental advantage together with exact stats.**

Elemental advantage is important, but it does not make a matchup automatically safe.

Fire and lightning beat plant and metal; plant and metal beat water and shadow; water and shadow beat fire and lightning. Advantage adds one attack, while disadvantage subtracts one, down to zero.

Those adjustments interact with promotion levels. Sachita has enough attack with advantage to kill a basic Sjor, but cannot remove Straumr in one hit. Kagari can kill Tanka with its elemental bonus despite Tanka’s substantial defense.

Check actual damage against remaining defense. Also count whether the opponent can combine attacks within four actions. Surviving one hit means little if a second affordable attacker can arrive.

The reverse matters too: a threatening-looking combination may require five actions and therefore fail completely.

**Exploit killing chains when the geometry supports them.**

A higher-tier attacker does not simply receive several unrestricted attacks. A killing blow unlocks another attack, up to the unit’s tier.

The clearest example came when my Hono reached C9. It killed the Muju on B9, then used the unlocked attack to kill the Muju on C8 without moving again. Two captures from one square made the promotion useful.

Look for positions adjacent to multiple vulnerable enemies. If each additional capture requires another approach move, the four-action budget quickly erases the benefit of having more attacks available.

Likewise, avoid clustering vulnerable units where an enemy can chain captures. A collection of miners can become a productive economic formation or an efficient target.

**Keep your own army from obstructing itself.**

Our dense armies created traffic problems. Friendly units blocked attack routes, trapped pieces behind miners, and made apparently simple redeployments expensive.

An idle Muju still has value as a blocker and a source of deployment territory. But it can also obstruct your own strongest unit.

Preserve useful movement lanes. Before buying into an empty square, check whether that square is an exit, an attack approach, or the only practical route through your formation. A purchase that earns a few crystals immediately may cost an entire action later when you need to clear it.

One deliberately chosen miner relocation can serve two purposes: collecting fresh crystals and opening a route for an attacker.

**Turn pressure into lasting gains.**

Captures do not award crystals directly. To convert a successful raid into a stronger position, occupy useful ground, disrupt productive mining, improve deployment access, or create a credible home threat.

My raids often removed units without securing enough of those benefits. Claude could absorb losses, relocate miners, and retain a treasury large enough to fund its eventual promotions.

A productive turn ideally connects combat and development: clear an attacker, step onto the freed deposit, and end with a formation that makes the next turn easier. Sometimes the best move is simply to spend an action mining rather than extending a raid.

Finally, keep the actual victory conditions in view. Home occupation can decide a game before an army is eliminated, while ten consecutive completed turns without an enemy attack kill produce a draw. Economic activity alone does not reset that clock.

The strongest lesson from this match is to judge your position by what it can sustain and accomplish next. Count available actions, renewable income, upkeep, credible threats, and access to useful squares. Army size and capture totals are valuable information, but neither tells the whole story.
