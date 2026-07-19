// Stage C gates — SPEC.md §3 Stage C.
//
// Parser unit tests (roundtrip + malformed rejection), content seam tests
// over the shipped CSV, the drift check (parsed CSV deep-equals the canonical
// fixture values), and the CI gate: verifierIssues over all 12 missions is
// empty — proven by actually playing every mission out with tesserMinimaxBot
// on both seats (pebble-duel's integration.test.ts discipline).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fixtureDriftTest, verifierIssues } from '@deev/content';
import {
  parsePieceString,
  parsePieceList,
  parseCampaignCsv,
  campaignContent,
  missionVerifier,
  missionPieces,
  missionConfig,
  type Mission,
} from '../src/puzzles.ts';

const here = dirname(fileURLToPath(import.meta.url));
const csvText = readFileSync(join(here, '../data/campaign.csv'), 'utf8');

describe('piece-string parser', () => {
  it('parses a full spec with explicit measure', () => {
    expect(parsePieceString('m5:2x2x2@3,5', 'south', 'S1')).toEqual({
      id: 'S1',
      seat: 'south',
      x: 3,
      y: 5,
      w: 2,
      d: 2,
      h: 2,
      measure: 5,
    });
  });

  it('measure defaults to volume', () => {
    expect(parsePieceString('4x1x1@1,7', 'north', 'N1')).toEqual({
      id: 'N1',
      seat: 'north',
      x: 1,
      y: 7,
      w: 4,
      d: 1,
      h: 1,
      measure: 4,
    });
  });

  it('rejects malformed specs', () => {
    for (const bad of ['', '2x2@1,1', '2x2x2@1', '2x2x2', 'm:2x2x2@0,0', 'x2x2@0,0', '2x2x2@a,b']) {
      expect(() => parsePieceString(bad, 'south', 'S1'), bad).toThrow(/malformed/);
    }
  });

  it('rejects out-of-bounds boxes', () => {
    expect(() => parsePieceString('3x1x1@4,0', 'south', 'S1')).toThrow(/off board/);
    expect(() => parsePieceString('1x3x1@0,6', 'south', 'S1')).toThrow(/off board/);
    expect(() => parsePieceString('1x1x9@0,0', 'south', 'S1')).toThrow(/dims/);
    expect(() => parsePieceString('0x1x1@0,0', 'south', 'S1')).toThrow(/malformed|dims/);
  });

  it('rejects measure outside 1..volume', () => {
    expect(() => parsePieceString('m9:2x2x2@0,0', 'south', 'S1')).toThrow(/measure 9 outside/);
    expect(() => parsePieceString('m0:1x1x1@0,0', 'south', 'S1')).toThrow(/measure 0 outside/);
  });

  it('parsePieceList auto-assigns S1../N1.. ids in order', () => {
    const south = parsePieceList('4x1x1@1,7;m5:2x2x2@3,5', 'south');
    expect(south.map((p) => p.id)).toEqual(['S1', 'S2']);
    expect(south.map((p) => p.seat)).toEqual(['south', 'south']);
    const north = parsePieceList(' m2:2x2x1@2,1 ', 'north');
    expect(north.map((p) => p.id)).toEqual(['N1']);
  });
});

describe('campaign CSV parsing', () => {
  it('parses the shipped CSV cleanly: 12 missions, zero warnings', () => {
    const { missions, warnings } = parseCampaignCsv(csvText);
    expect(warnings).toEqual([]);
    expect(missions.map((m) => m.id)).toEqual([
      'm01',
      'm02',
      'm03',
      'm04',
      'm05',
      'm06',
      'm07',
      'm08',
      'm09',
      'm10',
      'm11',
      'm12',
    ]);
  });

  it('drift check: the shipped CSV deep-equals the canonical fixture values (spot mission + reparse determinism)', () => {
    const { missions } = parseCampaignCsv(csvText);
    // Canonical value for mission 1, written out in full — any CSV edit that
    // changes the opening mission must consciously update this fixture.
    const m01: Mission = {
      id: 'm01',
      name: 'First March',
      brief:
        'Slim pieces run faster: your lance is a line (speed 3) while the hollowed slab only manages 2. Close the distance and run it down.',
      plyCap: 10,
      south: [{ id: 'S1', seat: 'south', x: 1, y: 7, w: 4, d: 1, h: 1, measure: 4 }],
      north: [{ id: 'N1', seat: 'north', x: 2, y: 1, w: 2, d: 2, h: 1, measure: 2 }],
    };
    expect(missions[0]).toEqual(m01);
    // Parsing is pure and deterministic: a second parse deep-equals the first.
    expect(parseCampaignCsv(csvText).missions).toEqual(missions);
  });

  it('collects warnings and skips malformed missions instead of throwing', () => {
    const bad = [
      'mission,id,name,brief,fk__int__plyCap,south,north',
      'mission,ok,Fine,All good.,10,"4x1x1@1,7","m2:2x2x1@2,1"',
      'mission,badpiece,Broken,Bad south spec.,10,"5x1x1@2,0","m2:2x2x1@2,1"',
      'mission,badoverlap,Broken,Pieces overlap.,10,"4x1x1@1,7;2x2x1@1,7","m2:2x2x1@2,1"',
      'mission,badcap,Broken,plyCap too small.,1,"4x1x1@1,7","m2:2x2x1@2,1"',
    ].join('\n');
    const { missions, warnings } = parseCampaignCsv(bad);
    expect(missions.map((m) => m.id)).toEqual(['ok']);
    expect(warnings.some((w) => w.includes('badpiece') && w.includes('off board'))).toBe(true);
    expect(warnings.some((w) => w.includes('badoverlap') && w.includes('overlap'))).toBe(true);
    expect(warnings.some((w) => w.includes('schema'))).toBe(true);
  });

  it('warns on unexpected record types', () => {
    const text = ['puzzle,id,name', 'puzzle,p1,Wrong Game'].join('\n');
    const { missions, warnings } = parseCampaignCsv(text);
    expect(missions).toEqual([]);
    expect(warnings).toEqual([`unexpected record type 'puzzle'`]);
  });
});

describe('content seams', () => {
  const { missions } = parseCampaignCsv(csvText);

  it('shipped fixtures pass schema + all seams', () => {
    expect(fixtureDriftTest(campaignContent(missions))).toEqual([]);
  });

  it('seams catch duplicate ids and cross-side footprint overlap', () => {
    const dup = [missions[0], { ...missions[1], id: missions[0].id }];
    expect(fixtureDriftTest(campaignContent(dup)).some((i) => i.includes('unique-ids'))).toBe(true);

    const overlapping: Mission = {
      ...missions[0],
      south: [{ id: 'S1', seat: 'south', x: 2, y: 1, w: 2, d: 2, h: 1, measure: 4 }],
    };
    const issues = fixtureDriftTest(campaignContent([overlapping]));
    expect(issues.some((i) => i.includes('no-overlapping-footprints'))).toBe(true);
  });

  it('seams catch measure above volume', () => {
    const broken: Mission = {
      ...missions[0],
      south: [{ id: 'S1', seat: 'south', x: 1, y: 7, w: 4, d: 1, h: 1, measure: 5 }],
    };
    const issues = fixtureDriftTest(campaignContent([broken]));
    expect(issues.some((i) => i.includes('measure-within-volume'))).toBe(true);
  });

  it('missionPieces/missionConfig: south first, fresh copies, south to act', () => {
    const m = missions[0];
    const pieces = missionPieces(m);
    expect(pieces.map((p) => p.seat)).toEqual(['south', 'north']);
    expect(pieces[0]).not.toBe(m.south[0]); // defensive copy
    expect(missionConfig(m)).toEqual({ pieces, plyCap: m.plyCap, firstToAct: 'south' });
  });
});

describe('mission verifier (CI gate)', () => {
  it(
    'verifierIssues over all 12 shipped missions is empty — south wins by elimination within plyCap, seeds 1/2/3',
    () => {
      const { missions, warnings } = parseCampaignCsv(csvText);
      expect(warnings).toEqual([]);
      expect(missions).toHaveLength(12);
      expect(verifierIssues(missionVerifier, missions, { itemName: (m) => m.id })).toEqual([]);
    },
    240_000,
  );
});
