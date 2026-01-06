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

### Step 3: Calculate Efficiency Ratios
For each game element, calculate:
- **VP per resource spent**
- **VP per turn invested**
- **Resource generation per turn**
- **Opportunity cost** (what else could I do instead?)

### Step 4: Find Outliers
- Which cards/strategies have the best ratios?
- Are there "broken" cards that are clearly superior?
- What would a rational min-maxer always choose?

### Step 5: Test for Dominant Strategies
- If every player plays optimally, what happens?
- Is there a single best opening?
- Is there a strategy that beats all others?
- Can the game be "solved"?

### Step 6: Look for Leaks and Exploits
- **Rules interactions:** Do any rules combine in unintended ways?
- **Edge cases:** What happens at minimum/maximum values?
- **Degenerate strategies:** Can I win by doing nothing? By ignoring mechanics?
- **Infinite loops:** Are there unbounded cycles?

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

### Cost-Benefit Analysis
| Entity | Cost | Benefit | Ratio | Notes |
|--------|------|---------|-------|-------|
| Card A | ♂   | 3 VP    | 3.0   | Best VP/cost |
| Card B | ♂♀  | 2 VP    | 1.0   | Worse ratio, needs synergy |

**Outliers:** [List any cards/entities with exceptional ratios]

### Dominant Strategies
- **Strategy 1:** [Describe optimal path]
  - Win rate: [X%]
  - Counter-play: [What beats this?]
  - Weakness: [What are the drawbacks?]

### Potential Exploits
1. **[Exploit name]:** [Describe the imbalance]
   - Why it works: [Explain the underlying cause]
   - Impact: [How game-breaking is this?]
   - Fix: [Suggested balance changes]

### Meaningful Choice Assessment
- **Choice points:** [Where do players make decisions?]
- **Trap options:** [Are there options that look good but aren't?]
- **Dominant options:** [Are there always-correct choices?]

### Fairness and Symmetry
- **Type:** [Symmetric/Asymmetric]
- **Balance:** [Are all factions/positions equally viable?]
- **Win rates:** [Data if available]

### Overall Balance Assessment
**Rating:** [Excellent / Good / Needs Work / Broken]

**Strengths:**
- [What works well]

**Weaknesses:**
- [What needs improvement]

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

## Example: FORGE Card Analysis

Let's analyze a hypothetical imbalance:

**Card: "Quick Victory"**
- Cost: ♂ (1 symbol)
- Base VP: 2
- Conditional VP: +2 if you have another Crimson Covenant card

**Analysis:**
- Cost: Very cheap (1 symbol)
- Base VP: 2 (already 2.0 ratio, matches average)
- Conditional: Extremely easy to trigger (+2 more = 4 VP total)
- **Final ratio: 4.0 VP per symbol**

**Compare to:**
- Average VP/cost in game: ~2.0
- This card gives 2x the value

**Strategic exploit:**
- Players will ALWAYS take Crimson Covenant cards early
- Getting even one CC card makes all future CC cards worth 4 VP for 1 symbol
- Optimal strategy: Rush CC cards, ignore other factions

**Recommendation:**
- Increase cost to ♂♂ (ratio becomes 2.0, balanced)
- OR reduce conditional to +1 (ratio becomes 3.0, still good but not broken)
- OR change conditional to require 3+ CC cards (harder to trigger)

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
