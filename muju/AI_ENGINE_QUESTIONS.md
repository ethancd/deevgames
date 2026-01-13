# AI Engine Design Questions

These questions need answers before proceeding with implementation. I've organized them by category and urgency.

---

## Critical Questions - ANSWERED

### Q1: Resource Stockpile Visibility - ANSWERED

**Answer: Resource stockpile is HIDDEN**

The opponent cannot see your current resource count. They must infer it from:
- Observed mining yields (visible)
- Observed spending (placements and promotions reveal cost)

---

### Q2: What Information Does Placement Reveal? - ANSWERED

**Answer: Placement reveals:**
- Unit type and position (obviously - it's on the board now)
- Cost spent (the unit's cost is known)
- Earliest possible queue turn (build time tells you when it could have been queued)

This is a rich reveal: if a T2 unit (2 build time) places on turn 5, you know it was queued on turn 3 or earlier.

---

### Q3: Can Players See Mining Results? - ANSWERED

**Answer: Yes - exact mining yield is visible**

When an opponent mines, you see exactly how many resources they gained. This simplifies belief tracking significantly:
- Income is deterministic (sum of observed yields)
- Only uncertainty is hidden queue spending

---

## Heuristic Tuning Questions

### Q4: How Should We Value Speed vs Defense?

The current evaluation weights unit value equally to cost. But strategically:

- High-speed units (Lightning) enable spawn denial and tactical flexibility
- High-defense units (Metal) are hard to kill and create stable anchors

**Question:** Should evaluation include **speed premium** and **defense premium** factors?

For example:
- Dhorubakali (Speed 5, Def 1, Cost 10) should be valued differently than Gokamoka (Speed 3, Def 3, Cost 10)?
- Should speed bonus scale with game phase (more valuable early for racing)?

**Suggested approach:** Add `speed_value = speed * position_factor` where `position_factor` considers how much that speed can exploit current board state.

**Your thoughts on speed vs defense importance?**

---

### Q5: How Aggressive Should Spawn Denial Be?

Spawn denial is a core strategic concept - infiltrating enemy spawn zones to prevent placement.

**Question:** How should the AI weigh spawn denial vs other objectives?

**Aggressive approach:**
- Prioritize getting ANY unit inside enemy spawn zone early
- Accept trades that result in spawn zone control
- Very annoying to play against (constant pressure)

**Balanced approach:**
- Only pursue spawn denial when tactically sound
- Don't sacrifice material for position alone
- More "fair" feeling

**Conservative approach:**
- Focus on economy/army first
- Only deny spawn when overwhelming
- May feel too passive

**My recommendation:** Balanced, with aggression scaling by difficulty level. Easy AI plays conservative, hard AI plays aggressive.

**What feel do you want?**

---

### Q6: Mining vs Fighting Priority

In the early game, players must choose: mine for resources or contest the center?

**Question:** What's the intended optimal play?

**Aggressive meta:** Rush center, contest mining squares, try to trade efficiently
**Economic meta:** Mine first, build army, fight later with advantage
**Flexible meta:** Adapt based on opponent's opening

**This affects:**
- How we tune the `miningPotential` vs `centerControl` vs `threatLevel` weights
- What "opening principles" the AI should follow
- Whether the AI should punish greedy mining or respect it

**What's your vision for early game tempo?**

---

### Q7: How Should Combined Attacks Be Valued?

Combined attacks (multiple units attacking same target) are powerful but require setup.

**Question:** How much should the AI value "setting up" combined attacks vs opportunistic single attacks?

**Scenario:** AI has 2 units that could each attack different enemies for chip damage, OR move one to enable a combined attack kill next turn.

**Options:**
- **Kill-focused:** Combined attack setup is worth 2x a chip attack
- **Damage-focused:** Spreading damage is fine, kills come naturally
- **Context-dependent:** Value setup based on whether the kill matters strategically

**My recommendation:** Context-dependent, with kill priority on high-value targets.

**Your preference?**

---

## Strategic / Game Feel Questions

### Q8: Should the AI "Play Fair" or "Play to Win"?

**Question:** Should the AI exploit information it technically has access to, or should it play as if it were a human with limited attention?

**Examples of "unfair" but legal AI behavior:**
- Tracking exact mining yields across all enemy units
- Perfectly calculating resource ranges from all observed events
- Never forgetting any observed information

**Options:**
- **Perfect play:** AI uses all legal information optimally
- **Bounded rationality:** AI has "attention limits" and may miss inferences
- **Difficulty-scaled:** Easy AI is "sloppy", hard AI is precise

**My recommendation:** Perfect play is fine - humans can theoretically track the same info. The hidden information rule prevents actual cheating.

**Your call?**

---

### Q9: What Should Resignation Look Like?

The current AI has a `shouldResign` check for hopeless positions.

**Question:** How early should the AI resign?

**Options:**
- **Never resign:** Play it out, let player practice closing
- **Resign when doomed:** 3x material disadvantage + losing position
- **Resign like a human:** Resign when a strong player would

**Also:** Should resignation be difficulty-dependent? (Easy AI never resigns, hard AI resigns early?)

**Your preference?**

---

### Q10: How Should the AI Handle the Build Queue?

The build queue is a key strategic decision. Questions:

**Queue depth:** Should the AI queue multiple units at once, or one at a time?
- Queueing multiple is efficient (resources working)
- But vulnerable to spawn denial (can't place if blocked)

**Unit diversity:** Should the AI mix elements, or specialize?
- Mixed army has elemental coverage
- Specialized army has tech synergy

**Tier progression:** How fast should the AI tech up?
- Rush: Stay on T1-T2, overwhelm with numbers
- Tech: Build T3-T4 prerequisites, scale into late game
- Adaptive: Match opponent's pace

**What's your intended balance here?**

---

## Performance / UX Questions

### Q11: Decision Time Targets

**Question:** How long should the AI take per turn at each difficulty?

| Difficulty | Max Time | Expected Feel |
|------------|----------|---------------|
| Easy | 0.5s | Instant, casual |
| Medium | 1-2s | Quick, responsive |
| Hard | 3-5s | Thoughtful, challenging |
| Expert | 5-10s | Tournament-level |

**Is this roughly right?**

---

### Q12: Should the AI Explain Its Thinking?

**Question:** Do you want the AI to expose its reasoning for debugging/learning?

**Options:**
- **Silent:** AI just makes moves
- **Log mode:** Console output with plan scores, beliefs
- **Narrated:** In-game text explaining AI's strategy ("I'm trying to deny your spawn zone")

**My recommendation:** Log mode for development, optional narration for player education.

**Your preference?**

---

## Summary: Priority Order for Answers

**ANSWERED - Ready for implementation:**
- [x] Q1 (Stockpile visibility) - **Hidden**
- [x] Q2 (Placement reveal) - **Unit, cost, earliest queue turn**
- [x] Q3 (Mining visibility) - **Exact yield visible**

**Should answer before tuning:**
4. Q5 (Spawn denial aggression)
5. Q6 (Mining vs fighting priority)
6. Q7 (Combined attack value)
7. Q10 (Build queue strategy)

**Can answer during polish:**
8. Q4 (Speed vs defense value)
9. Q8 (Perfect vs bounded rationality)
10. Q9 (Resignation behavior)
11. Q11 (Decision time targets)
12. Q12 (AI explanation)

---

## Next Steps

The critical questions are answered. Implementation can begin with Phase 1 (Public/Private state separation).

The remaining questions (Q4-Q12) can be answered iteratively as we build and tune the engine. They primarily affect:
- Evaluation weight tuning
- Difficulty scaling
- Game feel / polish
