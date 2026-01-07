---
name: strategy-mindset
description: Analyzes game mechanics, card stats, and rule systems for balance issues by thinking like a strategic player seeking optimal or exploitative solutions. Use when evaluating game design, reviewing game entities (cards, units, abilities), or identifying potential balance problems.
---

# Strategy Mindset: Game Balance Analysis

## Core Philosophy

Think like a slime mold seeking nutrients - explore all paths and gravitate toward the most efficient ones. A rational strategic player will:
- Identify the lowest cost for highest reward
- Find the most efficient paths to victory
- Exploit any imbalances in the game economy
- Minimize risk while maximizing payoff
- Combine effects that synergize disproportionately well

If there's a "correct" choice that dominates all others, that's a balance leak.

## Critical Analysis Dimensions

Before calculating ratios, ALWAYS consider these foundational constraints:

### A. Mechanical Constraints (Accessibility)

**The Vacuum Fallacy:** Naive analysis assumes you can freely choose any game element. In reality, most games have constraints:

**Questions to ask:**
- Can you freely acquire any card/resource, or is availability random/limited?
- What's the realistic budget? (Not "infinite resources" but actual expected spend)
- How many cards/units can a player realistically acquire per game?
- Does acquiring one thing prevent acquiring another? (Opportunity cost)

**FORGE Example - Card Availability:**
```
WRONG: "I'll just buy 3 Supply Caches and 3 Fortifications"
RIGHT: Cards become available based on grid expansion and opponent actions.
       You might never see a Supply Cache, or it might appear when you're
       out of symbols, or opponent might burn it before you can buy.
```

**FORGE Example - Budget Constraints:**
```
- Total symbols: 16 (4 of each)
- Realistic game budget: 12-24 symbols (accounting for counter-bids)
- At 2 symbols average per card: ~6-12 cards per player
- High-cost cards (3-4 symbols) significantly limit total acquisitions
```

**Synergy Value of Faction Cards:**
```
WRONG: "Faction Agent gives 2 VP, General card gives 3 VP, General wins"
RIGHT: Faction cards can trigger OTHER cards' conditionals:
       - Base cards: +1 per faction card owned
       - Seed cards: +2 if another card of faction
       - Adaptable Doctrine: +2 per faction with 2+ cards

A single Crimson Agent might actually provide:
- 2 VP base
- +1 VP to Crimson Base (if owned)
- +2 VP to Bloodthorn Seedling (if owned)
- +2 VP toward Adaptable Doctrine threshold
= 5-7 VP effective value vs 3 VP from General card
```

### B. Adversarial Response (Opponent Interaction)

**The Passive Opponent Fallacy:** Naive analysis assumes opponents let you execute your strategy unopposed. Real opponents will:
- Contest high-value acquisitions
- Deny key combo pieces
- Punish predictable strategies

**Questions to ask:**
- Can opponents interfere with your acquisition? How?
- What's the cost of that interference?
- Does interference change the effective value of cards?
- Are some cards easier to contest than others?

**FORGE Example - Counter-Bidding Changes Everything:**
```
Naive analysis of Supply Cache:
- Cost: 1 any symbol
- VP: 2
- Ratio: 2.0 VP/symbol (amazing!)

But with adversarial counter-bidding:
- You bid 1 symbol on Supply Cache (2 VP)
- Opponent counter-bids (2 symbols)
- Now you either:
  A) Let them have it: They get 2 VP for 2 symbols (1.0 ratio) - fair trade
  B) Final-bid (3 symbols): You get 2 VP for 3 symbols (0.67 ratio) - bad!

Effective ratio under contestation:
- If contested and you win: 0.67 VP/symbol
- If contested and you concede: 0 VP, opponent gets 1.0 ratio
- Only uncontested: 2.0 VP/symbol

High-efficiency cards are HIGH-PRIORITY TARGETS for opponents.
```

**When Faction Cards Are Safer:**
```
Faction cards with specific symbol costs are:
1. Less universally desirable (opponent may not want your faction)
2. Harder for opponent to counter-bid (may not have right symbols)
3. Worth MORE to you than to opponent (synergy value)

Crimson Agent (♂♀, 2 VP):
- Only valuable to Crimson-focused player
- Opponent may lack ♂ or ♀ to counter
- Triggers YOUR other Crimson conditionals

vs General Fortification (any any, 3 VP):
- Universally desirable (everyone wants 3 VP)
- Anyone can counter-bid with any symbols
- No synergy value to contest
```

**Adversarial Equilibrium:**
```
In a game with counter-bidding:
- "Efficient" cards get contested more often
- Contested cards have worse effective ratios
- "Synergy" cards get contested less (opponent-specific value)
- Uncontested cards achieve theoretical value

This creates NATURAL BALANCE that naive ratio analysis misses.
```

---

## Analysis Framework

When analyzing game elements, systematically examine:

### 1. Cost-Benefit Ratios
**Questions to ask:**
- What does this cost? (resources, time, opportunity cost)
- What does this return? (victory points, resources, tempo, card advantage)
- Is the exchange rate competitive with alternatives?
- Are there outliers that give far more value per cost?

**Red flags:**
- Card/ability costs 1-2 but gives 3-4+ VP
- "Free" effects that have no downside
- Costs that don't scale with power level
- Upgrades that are strictly better with minimal cost increase

**Example from FORGE:**
```
If Card A costs ♂ and gives 3 VP
And Card B costs ♂♀ and gives 2 VP
→ Card A is strictly superior in VP/cost ratio (3.0 vs 1.0)
→ Rational players will always prefer Card A
→ Card B needs compensation (better conditionals, symbols, synergies)
```

### 2. Dominant Strategies
**Questions to ask:**
- Is there one strategy/card/faction that works in all situations?
- Do certain combinations create runaway advantage?
- Can a player "lock in" victory too early?
- Are there strategies with no effective counter?

**Red flags:**
- Single faction/archetype wins >60% of games
- Early-game advantages compound without catch-up mechanics
- Defensive strategies that cannot be broken
- Infinite loops or unbounded scaling

### 3. Meaningful Choices (Schell Lens #32)
**Questions to ask:**
- Do players face interesting decisions, or obvious ones?
- Are there "trap" options that look good but are strictly worse?
- Do different situations reward different choices?
- Is there rock-paper-scissors dynamics or triangularity?

**Red flags:**
- One faction/strategy is "the correct choice"
- Decisions boil down to "pick the biggest number"
- Advanced players make the same choice 90%+ of the time
- No meaningful trade-offs between options

### 4. Triangularity (Schell Lens #33)
**The principle:** No single strategy should be the best against all opponents. Create a cycle where A beats B, B beats C, C beats A.

**Questions to ask:**
- What beats what?
- Are there strategies with no natural predator?
- Do players have to adapt based on opponent choices?
- Is there a meta-game of prediction and counter-prediction?

**Red flags:**
- Linear power hierarchy (Card A > B > C > D)
- No situational advantages
- Missing counter-play options

### 5. Skill vs. Chance (Schell Lens #34)
**Questions to ask:**
- How much randomness affects outcomes?
- Can skilled players overcome bad luck?
- Is there enough luck to keep games exciting?
- Does variance favor the weaker or stronger player?

**Red flags:**
- Pure determinism (solved games, no replay value)
- Pure randomness (no skill expression, feels unfair)
- Comeback mechanics that reward losing
- Variance so high skill doesn't matter

### 6. Fairness and Symmetry (Schell Lens #30)
**Symmetric games:** All players start equal (Chess, Go, FORGE)
- Easier to balance
- Fairness is obvious
- Variety comes from emergent strategy

**Asymmetric games:** Players have different abilities/factions (Starcraft, Root)
- Harder to balance
- More variety and replayability
- Requires extensive playtesting per matchup

**Questions to ask:**
- Do all players have equal opportunity to win?
- In asymmetric games, is each faction viable?
- Are there mirror-match problems?
- Do starting positions create inherent advantage?

**Red flags:**
- Win rate by faction differs by >10-15%
- Going first/second creates major advantage
- Asymmetric matchups are 70-30 or worse

### 7. Economy and Scaling
**Questions to ask:**
- How do resources/VP scale over time?
- Do early investments compound or provide linear returns?
- Is there inflation or deflation in the game economy?
- What's the optimal acquisition order?

**Red flags:**
- Linear scaling (first card and last card equally valuable)
- Exponential scaling without caps (runaway leader)
- Degenerate strategies (buy only the cheapest cards)
- Resource sinks with no payoff

### 8. Synergy Analysis
**Questions to ask:**
- Which combinations are stronger than the sum of parts?
- Are synergies intentional or accidental?
- How many cards/pieces are needed for a combo?
- Can synergies be disrupted or countered?

**Red flags:**
- Two-card combos that instantly win
- Synergies that scale without bounds
- Factions that synergize internally but not with others
- "Do nothing" strategies that can't be punished

### 9. Punishment and Reward Balance (Schell Lenses)
**Questions to ask:**
- Are failures punished too harshly or too lightly?
- Are victories rewarded proportionally?
- Do punishment mechanics create death spirals?
- Do reward mechanics create runaway winners?

**Red flags:**
- Losing early = guaranteed loss
- Winning early = guaranteed win
- No comeback mechanics
- Punishment so harsh it feels unfair

### 10. Challenge vs. Success (Schell Lens #31)
**Questions to ask:**
- What's the win rate for new players? For experts?
- Do players feel challenged or frustrated?
- Is the skill ceiling high enough?
- Are there difficulty settings or self-balancing mechanics?

**Red flags:**
- Win rates <20% or >80%
- No learning curve (too easy or impossible)
- Skill ceiling too low (game feels solved quickly)
- Difficulty spikes inconsistently

### 11. Complexity vs. Depth
**Questions to ask:**
- How many rules/exceptions exist?
- Does complexity create depth or just confusion?
- Can new players understand the basics quickly?
- Do experts discover new strategies over time?

**Red flags:**
- High complexity, low depth (lots of rules, shallow strategy)
- Too many special cases or exceptions
- Cognitive overload for decision-making
- "Read the whole rulebook" required for basic play

### 12. Time and Pacing
**Questions to ask:**
- How long does a game take?
- Does it feel too long or too short?
- Are there pacing problems (slow start, rushed ending)?
- Do all phases of the game matter?

**Red flags:**
- Endgame is predetermined but takes 20 minutes to resolve
- First 5 minutes don't matter
- Downtime between meaningful decisions
- Game length varies wildly (20 min to 3 hours)

## Strategic Exploit-Seeking Process

### Step 1: Identify the Victory Condition
- How do I win?
- What's the minimum viable path to victory?
- What's the fastest possible win?

### Step 2: Map the Resource Economy
- What resources exist? (cards, symbols, VP, tempo, board position)
- How are resources acquired?
- What are the exchange rates?
- Which resources are bottlenecks?
- **What's the realistic budget per game?** (Not theoretical max, but expected spend)

### Step 3: Assess Mechanical Constraints
- **Availability:** Can I freely choose any card, or is access limited/random?
- **Budget:** How many cards can I realistically acquire? (e.g., 12-24 symbols = 6-12 cards)
- **Opportunity cost:** What do I give up by taking this path?
- **Synergy chains:** Does this element trigger bonuses on OTHER elements I own?

### Step 4: Model Adversarial Response
- **Will opponents contest this?** (High-value targets get contested)
- **What's the effective cost under contestation?** (Not base cost, but bidding war cost)
- **What's opponent's counter-play?** (Can they deny, burn, or steal?)
- **Is this safer uncontested?** (Faction-specific vs universally desirable)

**FORGE Contestation Math:**
```
Card value V, base cost C:
- Uncontested: V/C ratio (theoretical)
- Contested, you win: V/(C+2) ratio (final-bid premium)
- Contested, you concede: Opponent gets V/(C+1) ratio

For Supply Cache (V=2, C=1):
- Uncontested: 2.0 ratio
- Contested win: 0.67 ratio (terrible!)
- Contested concede: Opponent gets 1.0 ratio

For Faction Agent (V=2+synergy, C=2):
- Base ratio: 1.0
- With synergy (+2 to Seedling, +1 to Base): effective 5/2 = 2.5 ratio
- Less likely contested (opponent may not want your faction)
```

### Step 5: Calculate Realistic Efficiency Ratios
For each game element, calculate:
- **Theoretical VP/cost** (vacuum analysis)
- **Contested VP/cost** (assuming opponent interference)
- **Synergy VP/cost** (including bonuses to other owned cards)
- **Expected VP/cost** (weighted by likelihood of contestation)

### Step 6: Find ACTUAL Outliers
- Which cards have best **realistic** ratios after contestation modeling?
- Which cards have **hidden synergy value** that makes them better than they look?
- Which cards LOOK good but get contested into mediocrity?
- What would a rational player choose **knowing opponent will respond**?

### Step 7: Test for Dominant Strategies
- If every player plays optimally **and opponents counter optimally**, what happens?
- Is there a strategy that beats all others **even when contested**?
- Does the game reach an equilibrium where multiple strategies are viable?
- Can the game be "solved" or does adversarial response create depth?

### Step 8: Look for Leaks and Exploits
- **Rules interactions:** Do any rules combine in unintended ways?
- **Edge cases:** What happens at minimum/maximum values?
- **Degenerate strategies:** Can I win by doing nothing? By ignoring mechanics?
- **Infinite loops:** Are there unbounded cycles?
- **Contest-proof combos:** Are there strategies opponents CAN'T interfere with?

## Balance Analysis Template

Use this when evaluating a game or set of game entities:

```markdown
## Game/System: [Name]

### Victory Condition
[How do players win? What's the minimum VP/resources needed?]

### Resource Economy
- **Available Resources:** [List all resource types]
- **Resource Sources:** [How are resources acquired?]
- **Resource Sinks:** [What are resources spent on?]
- **Bottlenecks:** [Which resources limit strategy?]
- **Realistic Budget:** [Expected resources spent per game, not theoretical max]

### Mechanical Constraints
- **Accessibility:** [Can players freely choose any card/resource?]
- **Randomness:** [What determines availability?]
- **Budget Limits:** [How many cards can a player realistically acquire?]
- **Synergy Networks:** [Do elements boost other elements' value?]

### Adversarial Response Analysis
- **Contestation Mechanics:** [Can opponents interfere with acquisitions?]
- **Interference Costs:** [What does it cost to contest?]
- **High-Value Targets:** [Which elements will opponents always contest?]
- **Safe Acquisitions:** [Which elements are unlikely to be contested?]

### Cost-Benefit Analysis (Three-Column)
| Entity | Theoretical Ratio | Contested Ratio | Synergy Value | Realistic Ratio |
|--------|-------------------|-----------------|---------------|-----------------|
| Card A | 2.0 (2VP/1cost)   | 0.67 (final bid)| +0 (no synergy)| 1.0-1.5 (contested) |
| Card B | 1.0 (2VP/2cost)   | 0.5 (final bid) | +3 (faction)  | 2.0-2.5 (synergy) |

**Notes:**
- Theoretical = vacuum analysis (no opponent, free choice)
- Contested = assuming opponent counter-bids
- Synergy = bonuses this card grants to OTHER owned cards
- Realistic = expected value accounting for game dynamics

**True Outliers:** [Cards that dominate EVEN after modeling contestation and constraints]

### Dominant Strategies
- **Strategy 1:** [Describe optimal path]
  - Theoretical win rate: [X%]
  - Under adversarial play: [How does opponent counter?]
  - Realistic win rate: [X% after modeling response]
  - Weakness: [What are the drawbacks?]

### Adversarial Equilibrium
- **Do high-efficiency cards get naturally balanced by contestation?**
- **Do synergy cards become better because they're less contested?**
- **What strategies survive when opponents play optimally?**

### Potential Exploits
1. **[Exploit name]:** [Describe the imbalance]
   - Why it works: [Explain the underlying cause]
   - Can opponent counter?: [Is there adversarial response?]
   - Impact: [How game-breaking is this?]
   - Fix: [Suggested balance changes]

### Meaningful Choice Assessment
- **Choice points:** [Where do players make decisions?]
- **Trap options:** [Cards that LOOK good but get contested into mediocrity]
- **Hidden value:** [Cards that look weak but have synergy value]
- **Dominant options:** [Cards that dominate even under contestation]

### Fairness and Symmetry
- **Type:** [Symmetric/Asymmetric]
- **Balance:** [Are all factions/positions equally viable?]
- **Win rates:** [Data if available]

### Overall Balance Assessment
**Rating:** [Excellent / Good / Needs Work / Broken]

**Strengths:**
- [What works well]
- [Natural balancing through adversarial response?]

**Weaknesses:**
- [What needs improvement]
- [Strategies that bypass contestation?]

**Recommendations:**
1. [Specific change to improve balance]
2. [Another change]
```

## Practical Application

When someone shares game rules, card stats, or asks about balance:

1. **Request data** - Ask for complete information:
   - All card/unit stats
   - Resource costs and generation
   - Victory conditions
   - Any special rules or mechanics

2. **Calculate ratios** - Build a spreadsheet view:
   - Sort by VP/cost ratio
   - Identify outliers (top 10%, bottom 10%)
   - Look for clustering or gaps

3. **Simulate optimal play** - Think through:
   - "If I'm trying to win as efficiently as possible, what do I do?"
   - "What would a computer program do if it could calculate all possibilities?"
   - "What's the degenerate strategy?"

4. **Identify leaks** - Point out:
   - Cards that are strictly superior/inferior
   - Combos that are too powerful
   - Strategies with no counter-play
   - Rules that don't make sense

5. **Suggest fixes** - Propose:
   - Cost adjustments
   - Benefit rebalancing
   - New mechanics to create counter-play
   - Rule clarifications

## Example: FORGE Card Analysis (With Full Constraints)

Let's compare a "high efficiency" General card vs a "synergy" Faction card:

### Naive Analysis (WRONG)

**Supply Cache (General)**
- Cost: 1 any symbol
- VP: 2
- Ratio: 2.0 VP/symbol
- Conclusion: "Best card in game, always buy"

**Crimson Agent (Crimson Covenant)**
- Cost: ♂♀ (2 specific symbols)
- VP: 2
- Ratio: 1.0 VP/symbol
- Conclusion: "Strictly worse than Supply Cache"

### Correct Analysis (WITH CONSTRAINTS)

**Supply Cache under realistic conditions:**

1. **Mechanical Constraints:**
   - Card availability is random (may not see Supply Cache)
   - Only 3 copies in 82-card deck
   - Budget: 12-24 symbols means ~6-12 cards total

2. **Adversarial Response:**
   - Supply Cache is universally desirable (everyone wants 2 VP for 1)
   - Opponent WILL counter-bid if they can
   - Counter-bid cost: 2 symbols for 2 VP = 1.0 ratio
   - Final-bid cost: 3 symbols for 2 VP = 0.67 ratio

3. **Realistic Ratio:**
   - Uncontested (rare): 2.0
   - Contested, you win: 0.67
   - Contested, you concede: 0 VP, opponent gets 1.0
   - **Expected: ~1.0-1.3 VP/symbol**

**Crimson Agent under realistic conditions:**

1. **Mechanical Constraints:**
   - Requires ♂♀ specifically (harder to contest for some opponents)
   - 2 copies available
   - Faction-specific (opponent may not want it)

2. **Adversarial Response:**
   - Only valuable if opponent is ALSO building Crimson
   - Often uncontested (opponent doesn't share your faction)
   - Even if contested, opponent gets less synergy value than you

3. **Synergy Value:**
   - Base: 2 VP
   - Triggers Bloodthorn Seedling: +2 VP (if you have it)
   - Triggers Crimson Base: +1 VP (if you have it)
   - Contributes to Adaptable Doctrine threshold
   - **Effective VP: 2-5 VP depending on tableau**

4. **Realistic Ratio:**
   - Base ratio: 1.0
   - With 1 synergy card: 2.0
   - With 2 synergy cards: 2.5
   - Less contested than General cards
   - **Expected: ~1.5-2.5 VP/symbol**

### Conclusion

**Naive analysis:** Supply Cache (2.0) >> Crimson Agent (1.0)
**Realistic analysis:** Crimson Agent (1.5-2.5) >= Supply Cache (1.0-1.3)

**The game is more balanced than vacuum analysis suggests because:**
1. High-efficiency cards get contested into mediocrity
2. Synergy cards provide hidden value
3. Faction-specific costs create natural protection from contestation
4. Budget limits prevent "just buy all the good stuff"

### When to Worry

Balance problems exist when cards dominate **even after accounting for:**
- Contestation (opponent can't or won't counter)
- Synergy (no synergy network competes)
- Mechanical constraints (always available, no opportunity cost)

Example of TRUE imbalance: A card that is both high-efficiency AND:
- Hard to contest (specific symbol cost opponent can't pay)
- High synergy (triggers multiple conditionals)
- Always available (common card type)

## Twelve Types of Balance (Schell)

1. **Fairness** - Equal opportunity to win
2. **Challenge vs. Success** - Appropriate difficulty
3. **Meaningful Choices** - No dominant strategies
4. **Skill vs. Chance** - Right mix of randomness
5. **Head vs. Hands** - Mental and physical balance
6. **Competition vs. Cooperation** - PvP and PvE balance
7. **Short vs. Long** - Immediate and long-term payoffs
8. **Rewards** - Proportional to achievement
9. **Punishment** - Fair consequences
10. **Freedom vs. Controlled Experience** - Sandbox vs. on-rails
11. **Simple vs. Complex** - Ease of learning vs. depth
12. **Detail vs. Imagination** - Specified vs. emergent

Always consider: **Does my game feel right? Why or why not?**

## When to Use This Skill

Invoke this mindset when:
- Reviewing card stats or unit abilities
- Evaluating game mechanics for balance
- Playtesting and something "feels wrong"
- Designing new content and want to avoid power creep
- Someone asks "Is this balanced?"
- You notice players always choosing the same strategy

## Sources and Further Reading

This skill synthesizes concepts from:
- Jesse Schell's "The Art of Game Design: A Book of Lenses" (Chapter 14: Game Mechanics Must Be in Balance)
- Twelve types of game balance framework
- The Lens of Balance (#47): "Does my game feel right?"
- Symmetric vs. Asymmetric game design
- Rational actor theory and game theory optimization
