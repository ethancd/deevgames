| arm                 | factor     | top1   | top3   | top1Share | ceilTop1 | regretP50 | regretP90 | replyTop1 | illegal | empty | pos    | wall s | configHash   |
| ------------------- | ---------- | ------ | ------ | --------- | -------- | --------- | --------- | --------- | ------- | ----- | ------ | ------ | ------------ |
| base                | none       | 0.4016 | 0.6850 | 0.4636    | 0.8661   | 0         | 90        | 0.3636    | 0       | 0     | 127+55 | 52.0   | 4e7afdf76b32 |
| k48                 | K          | 0.4724 | 0.7402 | 0.5000    | 0.9449   | 0         | 0         | 0.3636    | 0       | 0     | 127+55 | 52.7   | 5865c1a5ab14 |
| k96                 | K          | 0.5197 | 0.7953 | 0.5197    | 1.0000   | 0         | 0         | 0.3636    | 0       | 0     | 127+55 | 54.3   | 533b227d1530 |
| action-width-wide   | widths     | 0.4331 | 0.7165 | 0.4955    | 0.8740   | 0         | 82        | 0.4364    | 0       | 0     | 127+55 | 51.5   | d31a7afd045e |
| action-width-narrow | widths     | 0.3701 | 0.6850 | 0.4273    | 0.8661   | 0         | 0         | 0.3455    | 0       | 0     | 127+55 | 49.9   | c7954c26c37d |
| place-wide          | placePlans | 0.4094 | 0.6929 | 0.4727    | 0.8661   | 0         | 0         | 0.3636    | 0       | 0     | 127+55 | 53.0   | 4d230053e461 |
| place-narrow        | placePlans | 0.4016 | 0.6772 | 0.4636    | 0.8661   | 0         | 228       | 0.3636    | 0       | 0     | 127+55 | 52.8   | 832a792241e7 |
| reply-wide          | kInterior  | 0.4016 | 0.6850 | 0.4636    | 0.8661   | 0         | 90        | 0.3636    | 0       | 0     | 127+55 | 53.2   | a81deb89c956 |

reference: SELECTIVE (generateReference K=2000 under a 120,000-node cap, widths [40,16,8,4], 200 place plans) — not exhaustive; shared blind spots are invisible (EPIC-PLAN §2)
root columns are base's by construction for: reply-wide — the arm moves only genInterior, which no ROOT item uses; read replyTop1
