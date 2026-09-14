# Analysis benchmark

Cold service calls on the archived Codex–Claude match, revisions 13, 19, 23, 29, 31, 32 and 33. Runtime: v24.11.1. Positions contain 21–35 units.

| Layer | Latency (ms) | UTF-8 bytes | Estimated tokens |
| --- | ---: | ---: | ---: |
| headline | 0.76–2.36 | 1246–1271 | 312–318 |
| briefing | 45.26–66.99 | 4247–5489 | 1062–1373 |
| focused | 2.69–46.95 | 4857–11521 | 1215–2881 |
| deep | 4.51–150.68 | 10350–18981 | 2588–4746 |

Tokens are estimated as bytes / 4, before MCP framing, not counted with a tokenizer. Network and LLM reasoning latency are excluded. Search cutoffs are cooperative; individual engine transitions and response construction can finish just after the deadline. Focused examples use standard detail; deep examples use full detail.

- [Headline example](headline.json)
- [Turn briefing example](briefing.json)
- [Focused threat example](focused.json)
- [Deep threat and reply example](deep.json)
- [All measurements and cutoff metadata](measurements.json)

Reproduce with `npm run analysis:bench`. Examples refer to archived revision 19, not the current live room revision. Detailed recording begins at revision 5 with complete=false; the fixture preserves that limitation.
