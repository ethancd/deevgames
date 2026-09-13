import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AnalysisService } from '../server/analysis';
import { matchPositions } from '../tests/fixtures/analysis';
import { getUnitDefinition } from '../src/game/units';

const directory = process.argv[2] ?? 'docs/analysis-benchmark';
mkdirSync(directory, { recursive: true });
const { positions, recordingStart } = matchPositions();
interface Measurement {
  revision: number; layer: string; units: number; elapsedMs: number; bytes: number; estimatedTokens: number;
  search: unknown; output: unknown;
}
const measurements: Measurement[] = [];
for (const revision of [13, 19, 23, 29, 31, 32, 33]) {
  const room = positions.get(revision)!, player = room.state.turn.currentPlayer;
  const target = room.state.board.units.filter(u => u.owner === player)
    .sort((a, b) => getUnitDefinition(b.definitionId).cost - getUnitDefinition(a.definitionId).cost ||
      Math.min(...room.state.board.units.filter(u => u.owner !== player).map(u => Math.abs(u.position.x - a.position.x) + Math.abs(u.position.y - a.position.y))) -
      Math.min(...room.state.board.units.filter(u => u.owner !== player).map(u => Math.abs(u.position.x - b.position.x) + Math.abs(u.position.y - b.position.y))))[0];
  for (const layer of ['headline', 'briefing', 'focused', 'deep'] as const) {
    const service = new AnalysisService(), started = performance.now();
    const result = layer === 'headline' ? service.headline(room, player) : layer === 'briefing' ? service.briefing(room, player)
      : service.analyze(room, { roomId: room.id, expectedRevision: room.revision, player, topics: ['threats'],
        targets: { unitIds: [target.id] }, deep: layer === 'deep', detail: layer === 'deep' ? 'full' : 'standard', searchBudget: { maxNodes: 2000, maxMs: 150 } });
    const elapsedMs = Math.round((performance.now() - started) * 100) / 100, json = JSON.stringify(result);
    const bytes = Buffer.byteLength(json);
    measurements.push({ revision, layer, units: room.state.board.units.length, elapsedMs, bytes, estimatedTokens: Math.ceil(bytes / 4), search: result.search, output: result.output });
    if (revision === 19) writeFileSync(join(directory, `${layer}.json`), JSON.stringify(result, null, 2) + '\n');
  }
}
const report = { fixture: 'Codex–Claude, 2026-09-12', recordingStart, runtime: process.version,
  note: 'Cold service calls, same process; tokenizer-independent token estimate = UTF-8 bytes / 4. Wall time includes serialization-independent engine work. Timing cutoffs can vary by host.', measurements };
writeFileSync(join(directory, 'measurements.json'), JSON.stringify(report, null, 2) + '\n');
const range = (rows: Measurement[], key: 'units' | 'elapsedMs' | 'bytes' | 'estimatedTokens', digits = 0) =>
  [Math.min(...rows.map(r => r[key])), Math.max(...rows.map(r => r[key]))].map(n => n.toFixed(digits)).join('–');
const summary = ['# Analysis benchmark', '',
  `Cold service calls on the archived Codex–Claude match, revisions 13, 19, 23, 29, 31, 32 and 33. Runtime: ${process.version}. Positions contain ${range(measurements, 'units')} units.`, '',
  '| Layer | Latency (ms) | UTF-8 bytes | Estimated tokens |', '| --- | ---: | ---: | ---: |'];
for (const layer of ['headline', 'briefing', 'focused', 'deep']) {
  const rows = measurements.filter(r => r.layer === layer);
  summary.push(`| ${layer} | ${range(rows, 'elapsedMs', 2)} | ${range(rows, 'bytes')} | ${range(rows, 'estimatedTokens')} |`);
}
summary.push('', 'Tokens are estimated as bytes / 4, before MCP framing, not counted with a tokenizer. Network and LLM reasoning latency are excluded. Search cutoffs are cooperative; individual engine transitions and response construction can finish just after the deadline. Focused examples use standard detail; deep examples use full detail.', '',
  '- [Headline example](headline.json)', '- [Turn briefing example](briefing.json)', '- [Focused threat example](focused.json)',
  '- [Deep threat and reply example](deep.json)', '- [All measurements and cutoff metadata](measurements.json)', '',
  'Reproduce with `npm run analysis:bench`. Examples refer to archived revision 19, not the current live room revision. Detailed recording begins at revision 5 with complete=false; the fixture preserves that limitation.', '');
writeFileSync(join(directory, 'README.md'), summary.join('\n'));
console.log(JSON.stringify(measurements.map(r => [r.revision, r.layer, r.elapsedMs, r.bytes, r.estimatedTokens])));
