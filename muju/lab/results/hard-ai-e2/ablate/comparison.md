| arm                  | factor     | top1   | top3   | top1Share | ceilTop1 | regretP50 | regretP90 | replyTop1 | illegal | empty | pos    | wall s | configHash   |
| -------------------- | ---------- | ------ | ------ | --------- | -------- | --------- | --------- | --------- | ------- | ----- | ------ | ------ | ------------ |
| base                 | none       | 0.3881 | 0.6791 | 0.4643    | 0.8358   | 0         | 251       | 0.3636    | 0       | 0     | 134+55 | 92.6   | 4e7afdf76b32 |
| interior-action-wide | widths     | 0.3881 | 0.6791 | 0.4643    | 0.8358   | 0         | 251       | 0.4545    | 0       | 0     | 134+55 | 67.6   | 28bdd61eeb84 |
| interior-place-wide  | placePlans | 0.3881 | 0.6791 | 0.4643    | 0.8358   | 0         | 251       | 0.3636    | 0       | 0     | 134+55 | 67.2   | 37722e1f6a93 |

reference: SELECTIVE (generateReference K=2000 under a 120,000-node cap, widths [40,16,8,4], 200 place plans) — not exhaustive; shared blind spots are invisible (EPIC-PLAN §2)
root columns are base's by construction for: interior-action-wide, interior-place-wide — the arm moves no ROOT generator knob; read replyTop1 for an interior arm, and the equal-time ladder row for one that moves no generator at all
