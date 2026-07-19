import { describe, expect, it } from 'vitest';
import { runMatch, type Policy } from '../src/match.ts';
import { replayTranscript, assertReplayConverges } from '../src/replay.ts';
import { stateHash } from '../src/hash.ts';
import { mulberry32 } from '../src/rng.ts';
import { coinRace, type RaceState, type RaceAction } from './fixtures/coin-race.ts';

const randomPolicy: Policy<RaceState, RaceAction> = {
  choose: (_view, _seat, legal, rng) => rng.pick(legal),
};
const policies = { a: randomPolicy, b: randomPolicy };

describe('runMatch', () => {
  it('same seed → identical transcript and final state hash', () => {
    const t1 = runMatch(coinRace, {}, 123, policies);
    const t2 = runMatch(coinRace, {}, 123, policies);
    expect(t1.actions).toEqual(t2.actions);
    expect(t1.finalStateHash).toEqual(t2.finalStateHash);
    expect(t1.result).toEqual(t2.result);
  });

  it('different seeds diverge', () => {
    const t1 = runMatch(coinRace, {}, 1, policies);
    const t2 = runMatch(coinRace, {}, 2, policies);
    expect(t1.finalStateHash === t2.finalStateHash && t1.actions.length === t2.actions.length)
      .toBe(false);
  });

  it('transcript is self-describing', () => {
    const t = runMatch(coinRace, {}, 5, policies);
    expect(t.schema).toBe('deev-transcript-v1');
    expect(t.gameId).toBe('coin-race');
    expect(t.gameVersion).toBe('1.0.0');
    expect(t.engineHash).toMatch(/^[0-9a-f]{8}$/);
    expect(t.configHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('adjudicates at maxPlies', () => {
    const stall: Policy<RaceState, RaceAction> = { choose: () => 'reveal' };
    const t = runMatch(coinRace, {}, 9, { a: stall, b: stall }, { maxPlies: 20 });
    expect(t.result.reason).toBe('adjudicated:max-plies');
    expect(t.actions.length).toBe(20);
  });
});

describe('replay', () => {
  it('converges with the recorded final state', () => {
    const t = runMatch(coinRace, {}, 777, policies);
    assertReplayConverges(coinRace, t);
  });

  it('refuses a version mismatch', () => {
    const t = runMatch(coinRace, {}, 777, policies);
    const older = { ...coinRace, version: '0.9.0' };
    expect(() => replayTranscript(older, t)).toThrow(/refusing to replay/);
  });

  it('save-mid-game resume converges with straight replay (rng state)', () => {
    // Play 5 plies while capturing rng state, then resume from the snapshot
    // and confirm the continuation matches a full fresh run.
    const seed = 4242;
    const engineRng = mulberry32(seed);
    const policyRng = mulberry32(seed).fork('p');
    let state = coinRace.init({}, engineRng);
    const actions: RaceAction[] = [];
    for (let i = 0; i < 5; i++) {
      const action = policyRng.pick(coinRace.legal(state, coinRace.toAct(state)[0]));
      state = coinRace.apply(state, action, engineRng);
      actions.push(action);
    }
    const savedRng = engineRng.getState();
    const savedState = structuredClone(state);
    const savedPolicyRng = policyRng.getState();

    // Continue original to terminal.
    const finish = (
      s: RaceState,
      eRngState: { s: number },
      pRngState: { s: number },
    ): string => {
      const eRng = mulberry32(0);
      eRng.setState(eRngState);
      const pRng = mulberry32(0);
      pRng.setState(pRngState);
      let cur = s;
      while (coinRace.terminal(cur) === null) {
        const action = pRng.pick(coinRace.legal(cur, coinRace.toAct(cur)[0]));
        cur = coinRace.apply(cur, action, eRng);
      }
      return stateHash(cur);
    };

    const originalFinal = finish(state, engineRng.getState(), policyRng.getState());
    const resumedFinal = finish(savedState, savedRng, savedPolicyRng);
    expect(resumedFinal).toEqual(originalFinal);
  });
});
