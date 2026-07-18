// Top-level app orchestrator: boots the match, resumes mid-inner-game state
// (or starts fresh), drives the human-vs-Claude turn loop, and walks the
// design round -> keep/steal -> (non-blocking) implement-job -> next-inner-
// game pipeline.
//
// Screens: playing / designing / keep-steal / paused / match-over /
// card-reveal. Screen choice is driven by MatchState.phase plus a couple of
// UI-only sub-states (design's blind-design/reveal/keep-steal steps live
// "inside" the 'design' MatchPhase, per the plan: MatchState only tracks the
// coarse phase, this module tracks the finer step within it). There is
// deliberately NO blocking job-status screen: once a round resolves, its new
// cards enter decks LOCKED (drawable/holdable, not playable -- see
// shared/cardLock.ts) and the match moves straight to 'playing' while the
// implement job runs in the background (startBackgroundJobPoll /
// pollJobInBackground). The header's "forging…" chip, a dismissible banner
// on failure/clarification, and a "law is written" toast on success are the
// only surfaces for job status while the game stays live underneath.

import type {
  CardDef,
  CardId,
  InnerGameState,
  JobRecord,
  MatchState,
  PlayerId,
  RoundPick,
  RoundRecord,
} from '../../shared/types';
import { normalizeText } from '../../shared/validation';
import { isCardLocked } from '../../shared/cardLock';

import { WIN_POINTS, createInnerGame, runTurn, type InnerGameRuntime } from '../engine/engine';
import { MATCH_WINS } from '../engine/match';
import { createEngineApi } from '../engine/api';
import { loadEffects, loadEffectFresh } from '../engine/effectsLoader';
import { compileComposition } from '../engine/compileComposition';
import { createRng } from '../engine/rng';
import type { CardEffect, ChoiceOption, PlayerController } from '../engine/types';

import {
  chooseKeepOrSteal,
  chooseLoserSteal,
  chooseWinnerPick,
  createAIController,
  type StealCandidate,
  type StealPickResult,
} from '../ai/player';

import { renderPlayerZone, turnHeaderHtml } from './board';
import { renderHand } from './hand';
import { renderLog } from './log';
import {
  playerLabel,
  renderDesignFailure,
  renderDesignForm,
  renderLoserDecision,
  renderLoserStealPick,
  renderReveal,
  renderRoundNarration,
  renderVoidNotice,
  renderWinnerCounterRaidPick,
  type StealPickOption,
} from './designRound';
import { renderCardReveal, openCardRevealOverlay, openPausedOverlay, closePausedOverlay, showUnlockToast } from './jobStatus';
import { openCodex } from './codex';
import { openForgeProgress, updateForgeProgress } from './forgeProgress';
import { isCompactStartersEnabled, toggleCompactStarters } from './viewPrefs';
import { clearDesignDraft } from './designDraft';

import * as api from '../net/apiClient';
import { ApiError, humanizeApiError, isNetworkShapedError } from '../net/apiClient';

const BOOT_RETRY_DELAY_MS = 3000;

const AI_MOVE_DELAY_MS = 700;
const JOB_POLL_MS = 1000;
const PERSIST_DEBOUNCE_MS = 300;
const MAX_TURNS_GUARD = 500;

type Screen = 'playing' | 'designing' | 'keep-steal' | 'paused' | 'match-over' | 'card-reveal' | 'game-end';

const SCREEN_TITLE: Record<Screen, string> = {
  playing: 'Playing',
  designing: 'Design round',
  'keep-steal': 'Keep or steal',
  paused: 'Paused',
  'match-over': 'Match over',
  'card-reveal': 'Your cards are ready',
  'game-end': 'Game over',
};

type LoserDecision = 'keep' | 'steal';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

class AppController {
  private container: HTMLElement;
  private match!: MatchState;
  private registry: CardDef[] = [];
  private registryMap: Map<CardId, CardDef> = new Map();
  private effects: Map<CardId, CardEffect> = new Map();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  // Non-blocking implement-job feature (see the module doc's screen list —
  // there is deliberately no more blocking 'job-status' screen). `isLocked`
  // is derived live from the registry (never snapshotted) and handed to
  // every InnerGameRuntime/AI controller this controller builds, so it and
  // the engine/AI always agree on lock status without any extra plumbing.
  private isLocked = (cardId: CardId): boolean => isCardLocked(this.registryMap.get(cardId));
  // Job ids currently being polled in the background, independent of
  // MatchState.activeJobId (which only tracks the MOST RECENT job, for
  // resume purposes) -- lets startBackgroundJobPoll be idempotent and lets
  // the header chip stay accurate even in the rare case two rounds'
  // implement jobs overlap.
  private inFlightJobIds = new Set<string>();
  private jobBanner: JobRecord | null = null;
  // Cached inputs to the last renderPlayingScreen call, so a background job
  // event (unlock) can re-render the CURRENT playing screen (updated
  // hand/board lock styling) without disturbing a pending human choice
  // promise -- refreshCurrentScreen replays the exact same interactive
  // callbacks the live promise already captured.
  private lastPlayingRender: {
    state: InnerGameState;
    scores: Record<PlayerId, number>;
    interactive: { onPlay: (instanceId: string) => void; onPass: () => void } | null;
  } | null = null;
  // Tracks whichever screen renderScreenShell most recently built, so the
  // sticky-header "Compact"/"Expand" toggle (present on every screen) only
  // triggers an immediate re-render when the playing screen is actually the
  // one showing -- refreshCurrentScreen() itself has no way to tell, since it
  // only checks whether a playing-screen render was ever cached.
  private currentScreen: Screen | null = null;

  // M5 choice-point persistence: the runtime/pre-turn-baseline pair currently
  // "in flight" for the active player's turn, or null between turns. See
  // recordTurnDecision/flushChoiceRecorded/runInnerGameLoop below --
  // activeTurnBaseline is a SEPARATE clone from runtime.state (which keeps
  // mutating live for the rest of the turn) so this.match.currentInnerGame
  // can be pointed at a frozen pre-turn snapshot + a growing resolvedChoices
  // ledger while the turn is still in flight, without persisting a
  // mid-turn (post-draw) state that would double-draw/double-increment
  // turnNumber on resume.
  private activeRuntime: InnerGameRuntime | null = null;
  private activeTurnBaseline: InnerGameState | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async start(): Promise<void> {
    await this.attemptBoot(true);
  }

  // A network-shaped boot failure (dev server not up yet, briefly unreachable
  // right after a restart, ...) gets exactly one automatic retry after a
  // short delay before falling through to the fatal screen -- most of these
  // resolve themselves within a few seconds and shouldn't need a manual
  // reload. `allowNetworkRetry` is false on the retry attempt itself so a
  // still-failing connection surfaces the fatal screen instead of looping.
  private async attemptBoot(allowNetworkRetry: boolean): Promise<void> {
    try {
      const [match, registry] = await Promise.all([api.getState(), api.getRegistry()]);
      this.setRegistry(registry);
      // loadEffects (not loadAllEffects): compiles any registry row's
      // `composition` (M2) into a live CardEffect too, precedence given to a
      // bespoke src/effects/*.ts module when both exist for the same id.
      this.effects = loadEffects(this.registry);
      if (match === null) {
        // Fresh install: data/match-state.json is null until the first persist.
        await this.startNewMatch();
        return;
      }
      this.match = match;
      await this.routeByPhase();
    } catch (err) {
      if (allowNetworkRetry && isNetworkShapedError(err)) {
        await delay(BOOT_RETRY_DELAY_MS);
        await this.attemptBoot(false);
        return;
      }
      this.renderFatalError(err);
    }
  }

  // === boot routing ===

  private async routeByPhase(): Promise<void> {
    switch (this.match.phase) {
      case 'playing':
        await this.enterPlaying();
        return;
      case 'design':
        await this.enterDesign();
        return;
      case 'paused':
        await this.enterPaused();
        return;
      case 'match-over':
        this.renderMatchOver();
        return;
    }
  }

  private setRegistry(registry: CardDef[]): void {
    this.registry = registry;
    this.registryMap = new Map(registry.map((c) => [c.id, c]));
  }

  private async refreshRegistry(): Promise<void> {
    this.setRegistry(await api.getRegistry());
  }

  // Patches one card into both this.registry (array) and this.registryMap,
  // whether it's brand new or an update to one already tracked. Small enough
  // to inline everywhere, but centralized so the "find index, replace-or-
  // push, set the map" dance only lives in one place.
  private trackCard(card: CardDef): void {
    const idx = this.registry.findIndex((c) => c.id === card.id);
    if (idx >= 0) this.registry[idx] = card;
    else this.registry.push(card);
    this.registryMap.set(card.id, card);
    // M2/M3 hot-compose path: a composed card is playable the instant its
    // registry row carries both `composition` and `implemented: true` --
    // compile it straight into this.effects synchronously, no forge overlay
    // or job poll needed. Guarded by `!this.effects.has` so a bespoke
    // src/effects/*.ts module already loaded at boot (which always takes
    // precedence -- see effectsLoader.loadEffects) is never clobbered.
    if (card.composition && card.implemented && !this.effects.has(card.id)) {
      this.effects.set(card.id, compileComposition(card.id, card.composition));
    }
  }

  // === persistence ===

  private schedulePersist(): void {
    // Snapshot at call time, not at debounce-fire time: call sites are all at
    // safe turn/phase boundaries, but this.match keeps mutating while the
    // timer runs (an AI turn or the human's draw can land in that window).
    // Persisting mid-turn state makes a reload re-run the draw phase.
    const snapshot = structuredClone(this.match);
    if (this.persistTimer !== null) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      api.putState({ state: snapshot }).catch((err: unknown) => {
        console.error('Failed to persist match state', err);
      });
    }, PERSIST_DEBOUNCE_MS);
  }

  private async persistNow(): Promise<void> {
    if (this.persistTimer !== null) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    try {
      await api.putState({ state: this.match });
    } catch (err) {
      console.error('Failed to persist match state', err);
    }
  }

  // === screen shell ===

  private renderScreenShell(screen: Screen): void {
    this.currentScreen = screen;
    const compactOn = isCompactStartersEnabled();
    this.container.innerHTML = `
      <div class="app-shell app-shell--${screen}">
        <header class="app-header">
          <div class="app-header__row">
            <h1 class="app-header__title">Lution</h1>
            <span class="app-header__phase">${SCREEN_TITLE[screen]}</span>
            <button type="button" class="app-header__job-chip" data-role="job-chip" hidden>&#9874;&#65039; forging&hellip;</button>
            <span class="app-header__controls">
              <button
                type="button"
                class="app-header__compact-toggle"
                data-role="compact-toggle"
                title="Collapse plain starter cards so designed cards stand out"
                aria-pressed="${compactOn}"
              >${compactOn ? 'Expand' : 'Compact'}</button>
              <button
                type="button"
                class="app-header__codex"
                data-role="codex-button"
                title="Browse every card ever designed"
              >Codex</button>
              <button
                type="button"
                class="app-header__new-match"
                data-role="new-match-button"
                title="Abandon this match and start a new one"
              >New match</button>
            </span>
          </div>
          <div class="app-header__status" data-role="header-status"></div>
        </header>
        <div class="app-banner" data-role="app-banner" hidden></div>
        <main class="app-content" data-role="content"></main>
        <div class="hand-dock" data-role="hand-dock"></div>
      </div>
    `;
    this.container
      .querySelector<HTMLButtonElement>('[data-role="new-match-button"]')
      ?.addEventListener('click', () => {
        this.requestNewMatch();
      });
    this.container
      .querySelector<HTMLButtonElement>('[data-role="codex-button"]')
      ?.addEventListener('click', () => {
        this.openCodex();
      });
    this.container
      .querySelector<HTMLButtonElement>('[data-role="job-chip"]')
      ?.addEventListener('click', () => {
        this.watchForge();
      });
    this.container
      .querySelector<HTMLButtonElement>('[data-role="compact-toggle"]')
      ?.addEventListener('click', () => {
        toggleCompactStarters();
        // A pure view preference — never touches MatchState/the server. Only
        // the playing screen actually renders keepers/hand, so only refresh
        // immediately when it's the one currently showing; every other
        // screen just picks up the new flag whenever it next re-renders
        // renderScreenShell (which reads it fresh above).
        if (this.currentScreen === 'playing') this.refreshCurrentScreen();
      });
    // A background job may already be active/blocked from before this
    // screen transition (renderScreenShell wipes and rebuilds the header on
    // every call) -- re-apply both indicators immediately so they never
    // flicker away across a turn re-render or a screen swap.
    this.applyJobChipState();
    this.applyJobBannerState();
  }

  // === background implement-job indicators (chip + banner) ===

  private applyJobChipState(): void {
    const chip = this.container.querySelector<HTMLElement>('[data-role="job-chip"]');
    if (!chip) return;
    chip.hidden = this.inFlightJobIds.size === 0;
  }

  private applyJobBannerState(): void {
    const banner = this.container.querySelector<HTMLElement>('[data-role="app-banner"]');
    if (!banner) return;
    const job = this.jobBanner;
    if (!job) {
      banner.hidden = true;
      banner.innerHTML = '';
      return;
    }
    const label = job.status === 'needs-clarification' ? 'Claude needs clarification' : 'Forging failed';
    banner.hidden = false;
    banner.innerHTML = `
      <button type="button" class="app-banner__button" data-role="app-banner-button">
        ${escapeHtml(label)} &mdash; tap to inspect
      </button>
    `;
    banner.querySelector<HTMLButtonElement>('[data-role="app-banner-button"]')?.addEventListener('click', () => {
      this.openJobIssueOverlay(job);
    });
  }

  private setJobBanner(job: JobRecord | null): void {
    this.jobBanner = job;
    this.applyJobBannerState();
  }

  // Tapping the banner opens the SAME renderPaused markup a full "paused"
  // screen would have shown, just as a dismissible overlay layered on top
  // of the still-playable game underneath (see jobStatus.ts's module doc).
  private openJobIssueOverlay(job: JobRecord): void {
    openPausedOverlay(job, 'data/cards.json', {
      onRetry: () => {
        void this.retryBackgroundJob(job.id);
      },
      onManualVerifyAndResume: () => {
        void this.retryBackgroundJob(job.id);
      },
    });
  }

  // Header chip / locked-card "Watch it being forged" entry point: opens the
  // live forge-progress overlay for the currently active job. A no-op if
  // there is no active job (chip is hidden in that case anyway, and hand.ts
  // only shows this action's "watch" variant when activeJobId is set).
  private watchForge(): void {
    if (!this.match.activeJobId) return;
    openForgeProgress({
      jobId: this.match.activeJobId,
      registry: this.registry,
      effects: this.effects,
      onOpenPaused: (job) => this.openJobIssueOverlay(job),
    });
  }

  private async retryBackgroundJob(oldJobId: string): Promise<void> {
    try {
      const { jobId: newJobId } = await api.retryJob(oldJobId);
      closePausedOverlay();
      this.setJobBanner(null);
      this.match.activeJobId = newJobId;
      await this.persistNow();
      this.startBackgroundJobPoll(newJobId);
    } catch (err) {
      this.renderFatalError(err);
    }
  }

  // === background implement-job polling ===

  // Idempotent: safe to call from every "we might have (or just gained) an
  // active job" seam (enterPlaying's boot/resume check, startImplementJobs,
  // a fresh retry) without worrying about starting a duplicate poll loop for
  // the same job id.
  private startBackgroundJobPoll(jobId: string): void {
    if (this.inFlightJobIds.has(jobId)) return;
    this.inFlightJobIds.add(jobId);
    this.applyJobChipState();
    void this.pollJobInBackground(jobId);
  }

  private async pollJobInBackground(jobId: string): Promise<void> {
    for (;;) {
      let job: JobRecord;
      try {
        job = await api.getJob(jobId);
      } catch (err) {
        console.error(`Background poll for implement job ${jobId} failed; retrying.`, err);
        await delay(JOB_POLL_MS);
        continue;
      }
      updateForgeProgress(job);
      if (job.status === 'queued' || job.status === 'running' || job.status === 'testing') {
        await delay(JOB_POLL_MS);
        continue;
      }
      this.inFlightJobIds.delete(jobId);
      this.applyJobChipState();
      if (job.status === 'done') {
        await this.handleBackgroundJobDone(job);
      } else {
        // failed | interrupted | needs-clarification -- the game stays
        // playable; only a dismissible banner surfaces the problem.
        this.setJobBanner(job);
      }
      return;
    }
  }

  // Unlock: refresh the registry, hot-load each newly-implemented card's
  // effect module into the SAME Map this.effects that every live
  // InnerGameRuntime/AI controller already holds a reference to (see
  // makeAIController/startNewInnerGame/resumeRuntime -- all pass
  // `this.effects` itself, never a copy), then re-render whatever's on
  // screen and surface the non-blocking "law is written" toast.
  private async handleBackgroundJobDone(job: JobRecord): Promise<void> {
    await this.refreshRegistry();
    const names: string[] = [];
    for (const cardId of job.cardIds) {
      // Only hot-load cards that verifiably have a module: a spurned/
      // destroyed design (or a partially-failed job's card) has no file on
      // disk, and a dynamic import of a missing module gets Vite's
      // index.html fallback -- "'text/html' is not a valid JavaScript MIME
      // type" -- taking down the whole flow. One bad card must not sink the
      // unlock for the rest.
      const def = this.registryMap.get(cardId);
      if (!def || def.destroyed || !def.implemented) continue;
      // M2/M3: a composed card has no src/effects/<id>.ts module at all --
      // it's already compiled into this.effects synchronously (trackCard's
      // hot-compose path, or boot's effectsLoader.loadEffects) the moment
      // its registry row carries composition + implemented: true, well
      // before any job (this one included) could ever touch it. A
      // dynamic-import hot-load attempt for one would just 404.
      if (this.effects.has(cardId)) {
        names.push(def.name);
        continue;
      }
      try {
        const effect = await loadEffectFresh(cardId);
        this.effects.set(cardId, effect);
        names.push(def.name);
      } catch (err) {
        console.error(`hot-load failed for "${cardId}" (skipping):`, err);
      }
    }
    // Guard against a stale clear if a NEWER job has since overwritten
    // activeJobId (the two-jobs-overlapping edge case) -- only retire the id
    // that actually just finished.
    if (this.match.activeJobId === job.id) this.match.activeJobId = null;
    if (this.jobBanner?.id === job.id) this.setJobBanner(null);
    await this.persistNow();
    this.refreshCurrentScreen();
    showUnlockToast(names, () => {
      const cards = job.cardIds.map((id) => this.registryMap.get(id)).filter((c): c is CardDef => c !== undefined);
      openCardRevealOverlay(cards, this.effects);
    });
  }

  // Re-renders the playing screen in place (if it's the current screen) so
  // hand/board lock styling picks up a just-completed unlock, WITHOUT
  // disturbing any pending human choice promise -- the cached `interactive`
  // callbacks are the exact same closures that promise is already waiting
  // on, so replaying them into a fresh render is safe (old DOM buttons are
  // simply discarded; new ones invoke the identical resolve).
  private refreshCurrentScreen(): void {
    if (!this.lastPlayingRender) return;
    const { state, scores, interactive } = this.lastPlayingRender;
    this.renderPlayingScreen(state, scores, interactive);
  }

  // Sticky-header "Codex" control -- available on every screen, same as
  // "New match". Appends a full-screen overlay to document.body (see
  // src/ui/codex.ts's module doc for why it must NOT render into
  // this.container) so it can sit on top of whatever screen is live
  // underneath, including one with pending-input promises still open.
  private openCodex(): void {
    openCodex({ registry: this.registry, match: this.match, effects: this.effects });
  }

  // Sticky-header "New match" control -- available on every screen,
  // regardless of phase. A confirm step guards against fat-fingering away an
  // in-progress match; the copy differs depending on whether there's
  // actually anything to abandon.
  private requestNewMatch(): void {
    const confirmed = window.confirm(
      this.match.phase === 'match-over'
        ? 'Start a new match?'
        : 'Abandon the current match and start a new one? This cannot be undone.'
    );
    if (!confirmed) return;
    void this.startNewMatch();
  }

  private contentEl(): HTMLElement {
    const el = this.container.querySelector<HTMLElement>('[data-role="content"]');
    if (!el) throw new Error('app.ts: content region missing — renderScreenShell was not called first');
    return el;
  }

  private renderFatalError(err: unknown): void {
    console.error(err);
    const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
    const networkShaped = isNetworkShapedError(err);
    const heading = networkShaped ? 'Lost connection to the dev server' : 'Lution hit a snag';
    const body = networkShaped
      ? `<p>Lution couldn't reach the dev server. It may have restarted or your connection
        dropped — check that it's still running, then reload.</p>`
      : `<p>Something in the boot/turn pipeline threw. This is expected while parts of the
        engine/server are still under construction; once they're implemented this screen
        should stop appearing.</p>`;
    this.container.innerHTML = `
      <div class="fatal-error${networkShaped ? ' fatal-error--network' : ''}">
        <h1>${heading}</h1>
        ${body}
        <pre>${escapeHtml(message)}</pre>
        <button type="button" class="fatal-error__reload" data-role="fatal-reload">Reload</button>
      </div>
    `;
    this.container
      .querySelector<HTMLButtonElement>('[data-role="fatal-reload"]')
      ?.addEventListener('click', () => {
        location.reload();
      });
  }

  // === playing screen ===

  private async enterPlaying(): Promise<void> {
    // Boot/resume + every post-round handoff into 'playing' funnels through
    // here -- a single guarded check covers a fresh-boot resume (persisted
    // activeJobId from a prior session) and the normal non-blocking handoff
    // (startImplementJobs sets activeJobId then calls straight into this
    // method) alike. startBackgroundJobPoll is a no-op if already polling.
    if (this.match.activeJobId) {
      this.startBackgroundJobPoll(this.match.activeJobId);
    }
    // M5 determinism fix: the AI's RNG stream (buildControllers) and a fresh
    // inner game's own seed (startNewInnerGame) must derive from the SAME
    // seed value on every entry into this method -- reseeding either one
    // from Date.now() (the old bug) makes a reload change what the AI rolls
    // for its own tie-break choices, which breaks requestChoice's replay
    // cursor (recorded answers are keyed on identity, not on WHY the live
    // responder chose them, but the replay only stays unobservable if
    // resuming reproduces the exact same live decisions up to that point).
    const resuming = this.match.currentInnerGame !== null && this.match.currentInnerGame.result === null;
    const seed = resuming
      ? this.match.currentInnerGame!.seed
      : (this.match.matchSeed + this.match.round * 7919 + Date.now()) >>> 0;
    const controllers = this.buildControllers(seed);
    const runtime = resuming
      ? this.resumeRuntime(this.match.currentInnerGame!, controllers)
      : this.startNewInnerGame(controllers, seed);
    await this.runInnerGameLoop(runtime, controllers);
  }

  private buildControllers(gameSeed: number): Record<PlayerId, PlayerController> {
    // Reseed deterministically from the inner game's own persisted seed
    // (XORed with a constant so it doesn't just replay the SAME stream the
    // engine's own rngState started from) instead of Date.now() -- the
    // latent bug this milestone's item 1 fixes. Reproducible across reload:
    // the same gameSeed always produces the same AI tie-break rolls.
    const aiRng = createRng((gameSeed ^ 0x9e3779b9) >>> 0);
    return {
      human: this.makeHumanController(),
      claude: this.makeAIController(aiRng),
    };
  }

  private makeHumanController(): PlayerController {
    return {
      chooseCardToPlay: (view) =>
        new Promise((resolve) => {
          this.scoresFor(view.state)
            .then((scores) => {
              this.renderPlayingScreen(view.state, scores, {
                onPlay: (instanceId) => {
                  const inst = view.state.players.human.hand.find((h) => h.instanceId === instanceId) ?? null;
                  // M5: persist the decision the instant it's made, BEFORE
                  // resolvePlay runs (see recordTurnDecision's doc comment).
                  this.recordTurnDecision(inst ? inst.instanceId : null);
                  resolve(inst);
                },
                onPass: () => {
                  this.recordTurnDecision(null);
                  resolve(null);
                },
              });
            })
            // A scoring/render failure must NOT quietly become a pass — that
            // silently costs the human their turn. Surface it and leave the
            // choice pending; the fatal screen owns the page from here.
            .catch((err: unknown) => {
              this.renderFatalError(err);
            });
        }),
      choiceResponder: (spec, _view) =>
        new Promise<ChoiceOption>((resolve) => {
          this.renderChoiceModal(spec.prompt, spec.options, resolve);
        }),
    };
  }

  private makeAIController(rng: ReturnType<typeof createRng>): PlayerController {
    const base = createAIController(this.effects, rng, WIN_POINTS, this.isLocked);
    return {
      chooseCardToPlay: async (view) => {
        const decision = await base.chooseCardToPlay(view);
        await delay(AI_MOVE_DELAY_MS);
        // M5: persist the AI's decision the instant it's made, BEFORE
        // resolvePlay runs -- same moment as the human path above.
        this.recordTurnDecision(decision ? decision.instanceId : null);
        return decision;
      },
      choiceResponder: async (spec, view) => {
        const decision = await base.choiceResponder(spec, view);
        await delay(AI_MOVE_DELAY_MS);
        return decision;
      },
    };
  }

  // Defense-in-depth for effect-authored choices (the 2026-07-03 Subzero
  // Serpent bug): an option without an explicit human-readable `label` gets
  // resolved to a card NAME here — via its `cardId` field if present, else
  // by hunting the instance id across both players' zones — before we ever
  // show the player a raw "inst-12". Effects SHOULD label their own options
  // (api.getCardName); this is the safety net, not the convention.
  private choiceOptionLabel(opt: ChoiceOption): string {
    if (typeof opt.label === 'string' && opt.label.trim().length > 0) return opt.label;
    const nameOf = (cardId: string | undefined): string | null => {
      if (!cardId) return null;
      return this.registryMap.get(cardId)?.name ?? null;
    };
    const byCardId = nameOf(typeof opt.cardId === 'string' ? opt.cardId : undefined);
    if (byCardId) return byCardId;
    const game = this.match.currentInnerGame;
    if (game) {
      for (const player of ['human', 'claude'] as const) {
        const zones = game.players[player];
        for (const zone of [zones.inPlay, zones.hand, zones.discard, zones.drawPile]) {
          const inst = zone.find((x) => x.instanceId === opt.id);
          const byInstance = inst ? nameOf(inst.cardId) : null;
          if (byInstance) return byInstance;
        }
      }
    }
    return String(opt.id);
  }

  private renderChoiceModal(
    prompt: string,
    options: ChoiceOption[],
    onChoose: (option: ChoiceOption) => void
  ): void {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h3>${escapeHtml(prompt)}</h3>
        <div class="modal__options">
          ${options
            .map((opt, i) => {
              const label = this.choiceOptionLabel(opt);
              return `<button type="button" class="modal__option" data-index="${i}">${escapeHtml(label)}</button>`;
            })
            .join('')}
        </div>
      </div>
    `;
    this.container.appendChild(overlay);
    overlay.querySelectorAll<HTMLButtonElement>('.modal__option').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.index);
        overlay.remove();
        onChoose(options[idx]);
      });
    });
  }

  private resumeRuntime(
    state: InnerGameState,
    controllers: Record<PlayerId, PlayerController>
  ): InnerGameRuntime {
    const api_ = createEngineApi({
      state,
      registry: this.registryMap,
      effects: this.effects,
      choiceResponders: { human: controllers.human.choiceResponder, claude: controllers.claude.choiceResponder },
      onChoiceRecorded: () => this.flushChoiceRecorded(),
    });
    return {
      state,
      api: api_,
      registry: this.registryMap,
      effects: this.effects,
      winPoints: WIN_POINTS,
      isLocked: this.isLocked,
    };
  }

  // `seed` is now supplied by the caller (enterPlaying) rather than
  // recomputed here — this keeps it consistent with buildControllers'
  // aiRng seed for the SAME entry into enterPlaying (see enterPlaying's own
  // comment on the M5 determinism fix).
  private startNewInnerGame(controllers: Record<PlayerId, PlayerController>, seed: number): InnerGameRuntime {
    const runtime = createInnerGame({
      registry: this.registryMap,
      effects: this.effects,
      decks: this.match.decks,
      seed,
      firstPlayer: this.match.nextFirstPlayer,
      choiceResponders: { human: controllers.human.choiceResponder, claude: controllers.claude.choiceResponder },
      winPoints: WIN_POINTS,
      isLocked: this.isLocked,
      onChoiceRecorded: () => this.flushChoiceRecorded(),
    });
    this.match.currentInnerGame = runtime.state;
    this.schedulePersist();
    return runtime;
  }

  // === M5 choice-point persistence ===

  // Called by both controller factories the instant the active player's play
  // is decided (human tap or AI decision), BEFORE resolvePlay runs. Seeds a
  // brand-new pendingTurn on BOTH the live runtime.state and the frozen
  // pre-turn baseline (SAME resolvedChoices array reference on both, so every
  // subsequent requestChoice append -- via flushChoiceRecorded -- is visible
  // through the baseline with no manual re-copying), then persists the
  // baseline (not the live, still-mutating runtime.state) immediately.
  private recordTurnDecision(instanceId: string | null): void {
    const runtime = this.activeRuntime;
    const baseline = this.activeTurnBaseline;
    if (!runtime || !baseline) return; // defensive; always set while a turn runs (see runInnerGameLoop)
    const resolvedChoices: Array<{ cardId: CardId; optionId: string }> = [];
    runtime.state.pendingTurn = { instanceId, resolvedChoices };
    baseline.pendingTurn = { instanceId, resolvedChoices };
    this.match.currentInnerGame = baseline;
    void this.persistNow();
  }

  // Wired as onChoiceRecorded into createEngineApi/createInnerGame: fires the
  // instant a NEW (non-replayed) requestChoice answer is appended to
  // state.pendingTurn.resolvedChoices. Since recordTurnDecision above already
  // rebound the baseline's resolvedChoices to the SAME array the live state
  // pushes onto, there's nothing to copy here -- just point currentInnerGame
  // at the (already up to date) baseline and persist, non-debounced, mirroring
  // the pendingHumanDraft pattern.
  private flushChoiceRecorded(): void {
    if (!this.activeTurnBaseline) return;
    this.match.currentInnerGame = this.activeTurnBaseline;
    void this.persistNow();
  }

  private async scoresFor(state: InnerGameState): Promise<Record<PlayerId, number>> {
    // Scoring is never cached — recompute fresh every time via a throwaway
    // EngineAPI bound to the current state (cheap: no choiceResponders will
    // fire from a pure score fold).
    const scoringApi = createEngineApi({
      state,
      registry: this.registryMap,
      effects: this.effects,
      choiceResponders: {
        human: () => Promise.reject(new Error('scoresFor: unexpected choice during scoring')),
        claude: () => Promise.reject(new Error('scoresFor: unexpected choice during scoring')),
      },
    });
    return { human: await scoringApi.score('human'), claude: await scoringApi.score('claude') };
  }

  private renderPlayingScreen(
    state: InnerGameState,
    scores: Record<PlayerId, number>,
    interactive: { onPlay: (instanceId: string) => void; onPass: () => void } | null
  ): void {
    // Cached so a background job event (unlock) can call refreshCurrentScreen
    // and replay this EXACT render (same interactive callbacks) without
    // needing to know anything about whatever's currently pending.
    this.lastPlayingRender = { state, scores, interactive };
    this.renderScreenShell('playing');
    const content = this.contentEl();
    // Mobile layout, top to bottom: opponent's zone, the collapsible event
    // log, then the human's own zone. The hand strip lives outside this
    // scrollable region entirely, docked near the bottom (thumb reach) —
    // see the `hand-dock` element renderScreenShell always includes.
    content.innerHTML = `
      <section class="zone zone--opponent" data-role="opponent-zone"></section>
      <details class="log-panel" data-role="log-panel" open>
        <summary class="log-panel__toggle">Event log</summary>
        <div class="log-panel__body" data-role="log"></div>
      </details>
      <section class="zone zone--self" data-role="self-zone"></section>
    `;

    const headerStatus = this.container.querySelector<HTMLElement>('[data-role="header-status"]')!;
    headerStatus.innerHTML = turnHeaderHtml(state, 'human', {
      innerWins: this.match.innerWins,
      winPoints: WIN_POINTS,
      matchWins: MATCH_WINS,
    });

    // Read the view preference fresh at render time (see viewPrefs.ts) --
    // never cached on `this`, so a toggle mid-turn is picked up by the very
    // next render without any extra plumbing.
    const compact = isCompactStartersEnabled();

    renderPlayerZone(
      content.querySelector('[data-role="opponent-zone"]')!,
      'claude',
      'human',
      state,
      this.registryMap,
      this.effects,
      { score: scores.claude, winPoints: WIN_POINTS, compact }
    );
    renderPlayerZone(
      content.querySelector('[data-role="self-zone"]')!,
      'human',
      'human',
      state,
      this.registryMap,
      this.effects,
      { score: scores.human, winPoints: WIN_POINTS, compact }
    );
    renderLog(content.querySelector('[data-role="log"]')!, state.log);

    const handDock = this.container.querySelector<HTMLElement>('[data-role="hand-dock"]')!;
    renderHand(handDock, state.players.human.hand, this.registryMap, this.effects, {
      interactive: interactive !== null,
      onPlay: interactive?.onPlay ?? (() => {}),
      onPass: interactive?.onPass ?? (() => {}),
      compactStarters: compact,
      activeJobId: this.match.activeJobId ?? null,
      onWatchForge: () => this.watchForge(),
      onInspectStalled: () => {
        if (this.jobBanner) this.openJobIssueOverlay(this.jobBanner);
      },
    });
  }

  private async runInnerGameLoop(
    runtime: InnerGameRuntime,
    controllers: Record<PlayerId, PlayerController>
  ): Promise<void> {
    const initialScores = await this.scoresFor(runtime.state);
    this.renderPlayingScreen(runtime.state, initialScores, null);

    let guard = 0;
    while (!runtime.state.result) {
      guard += 1;
      if (guard > MAX_TURNS_GUARD) {
        throw new Error(
          `Inner game exceeded ${MAX_TURNS_GUARD} turns without resolving — stopping to avoid a hang.`
        );
      }

      // M5 choice-point persistence: snapshot the state as it stands at the
      // START of this turn (pre-onTurnStart, pre-draw, pre-turnNumber-
      // increment) -- see shared/types.ts's pendingTurn doc comment and this
      // class's activeRuntime/activeTurnBaseline field comment. If the
      // PREVIOUS attempt at this exact turn was interrupted mid-choice (a
      // reload), runtime.state already carries the persisted pendingTurn from
      // disk; force that same instanceId back into runTurn via the existing
      // playInstanceId option so the whole turn replays deterministically
      // (same rngState in -> same draws out, same turnNumber increment) and
      // lands back at the first unanswered choice via requestChoice's replay
      // cursor. Persisting the LIVE (post-draw) state instead of this
      // pre-turn baseline would double-draw and double-increment turnNumber
      // on resume -- the mistake this design is built around avoiding.
      const resumingPendingTurn = runtime.state.pendingTurn ?? null;
      const baseline = structuredClone(runtime.state);
      if (resumingPendingTurn) {
        // Share the array reference (not the clone's own copy) so replayed
        // AND newly-recorded choices both land in the object that ends up
        // persisted -- same convention as recordTurnDecision.
        baseline.pendingTurn = {
          instanceId: resumingPendingTurn.instanceId,
          resolvedChoices: resumingPendingTurn.resolvedChoices,
        };
      }
      this.activeRuntime = runtime;
      this.activeTurnBaseline = baseline;

      await runTurn(
        runtime,
        controllers,
        resumingPendingTurn ? { playInstanceId: resumingPendingTurn.instanceId } : undefined
      );

      this.activeTurnBaseline = null;
      runtime.state.pendingTurn = undefined;
      this.match.currentInnerGame = runtime.state;
      this.schedulePersist();
      const scores = await this.scoresFor(runtime.state);
      this.renderPlayingScreen(runtime.state, scores, null);
    }

    await this.handleInnerGameEnd(runtime);
    this.activeRuntime = null;
  }

  private async handleInnerGameEnd(runtime: InnerGameRuntime): Promise<void> {
    const result = runtime.state.result;
    if (!result) throw new Error('handleInnerGameEnd called before the inner game resolved');

    if (result.outcome === 'draw') {
      // Rule 8: draw replay uses the SAME first player, no design round.
      // match.currentInnerGame already holds the drawn (result != null)
      // state, so enterPlaying()'s resume check will correctly fall through
      // to starting a fresh inner game instead of "resuming" the finished one.
      this.schedulePersist();
      await this.renderGameEndBeat({ kind: 'draw' });
      await this.enterPlaying();
      return;
    }

    const winner = result.winner;
    const loser: PlayerId = winner === 'human' ? 'claude' : 'human';
    this.match.innerWins[winner] += 1;
    this.match.lastGameLoser = loser;

    if (this.match.innerWins[winner] >= MATCH_WINS) {
      this.match.phase = 'match-over';
      this.match.winner = winner;
      await this.persistNow();
      this.renderMatchOver();
      return;
    }

    this.match.phase = 'design';
    this.match.round += 1;
    this.match.nextFirstPlayer = loser;
    await this.persistNow();

    // The game-end beat below is NOT itself persisted -- match.phase is
    // already 'design' on disk by the time it renders (the persistNow()
    // above already happened). A reload during the beat therefore lands
    // directly in the design round instead of re-showing the beat; that's
    // fine, it's a one-time client-side pause, not a resumable sub-phase.
    let scores: Record<PlayerId, number> | null = null;
    try {
      scores = await this.scoresFor(runtime.state);
    } catch (err) {
      // Non-fatal: the beat still renders, just without the score line.
      console.error('Game-end beat: failed to compute final scores', err);
    }
    await this.renderGameEndBeat({ kind: 'decisive', winner, scores });

    await this.enterDesign();
  }

  // Full-screen interstitial shown right after an inner game ends and BEFORE
  // the next phase (design round, or an immediate draw-replay) begins -- a
  // SCREEN via renderScreenShell, not an overlay, since nothing is pending
  // underneath at this moment (see this method's two call sites). Resolves
  // once the human taps through.
  private async renderGameEndBeat(
    outcome:
      | { kind: 'draw' }
      | { kind: 'decisive'; winner: PlayerId; scores: Record<PlayerId, number> | null }
  ): Promise<void> {
    this.renderScreenShell('game-end');
    const el = this.contentEl();

    if (outcome.kind === 'draw') {
      el.innerHTML = `
        <section class="game-end game-end--draw">
          <h2 class="game-end__heading">Draw</h2>
          <p class="game-end__body">The game replays immediately &mdash; no new cards.</p>
          <button type="button" class="game-end__continue" data-role="continue">Continue</button>
        </section>
      `;
    } else {
      const { winner, scores } = outcome;
      // Total completed games so far, i.e. this game's number.
      const gameNumber = this.match.innerWins.human + this.match.innerWins.claude;
      const isHumanWinner = winner === 'human';
      const heading = isHumanWinner ? `You win game ${gameNumber}!` : `Claude wins game ${gameNumber}.`;
      const scoreLine = scores
        ? `<p class="game-end__score">Final score &mdash; You: ${scores.human} &middot; Claude: ${scores.claude}</p>`
        : '';
      el.innerHTML = `
        <section class="game-end game-end--${isHumanWinner ? 'victory' : 'defeat'}">
          <h2 class="game-end__heading">${heading}</h2>
          ${scoreLine}
          <p class="game-end__tally">
            Wins &nbsp; You ${this.match.innerWins.human}/${MATCH_WINS} &middot;
            Claude ${this.match.innerWins.claude}/${MATCH_WINS}
          </p>
          <button type="button" class="game-end__continue" data-role="continue">On to the design round</button>
        </section>
      `;
    }

    await new Promise<void>((resolve) => {
      el.querySelector<HTMLButtonElement>('[data-role="continue"]')?.addEventListener('click', () => resolve());
    });
  }

  // === design round ===

  private roundWinner(): PlayerId {
    // Preferred source: lastGameLoser, persisted at inner-game end. It
    // survives currentInnerGame being replaced by a prematurely-started (or
    // non-blockingly-started) next game, which destroyed the result-based
    // derivation once already (2026-07-03).
    if (this.match.lastGameLoser) {
      return this.match.lastGameLoser === 'human' ? 'claude' : 'human';
    }
    const result = this.match.currentInnerGame?.result;
    if (!result || result.outcome !== 'win') {
      throw new Error('enterDesign: no decisive finished inner game on record for this round');
    }
    return result.winner;
  }

  // Round 1 of every match is now an OPENING design round that precedes
  // inner game 1 entirely (see POST /api/new-match) -- there is no finished
  // inner game yet to derive a winner/loser from, so match.openingLoser
  // (decided server-side at match creation) stands in for it.
  private isOpeningRound(): boolean {
    return (
      this.match.round === 1 &&
      this.match.roundHistory.length === 0 &&
      this.match.openingLoser !== undefined
    );
  }

  // Parallel to roundWinner()'s normal-round derivation: the opening round
  // assigns the loser's keep/steal choice to match.openingLoser and the
  // pick-maker role to the other player, exactly like a real winner/loser
  // pair from a finished inner game.
  private currentRoundWinnerLoser(): { winner: PlayerId; loser: PlayerId } {
    if (this.isOpeningRound()) {
      const loser = this.match.openingLoser as PlayerId;
      const winner: PlayerId = loser === 'human' ? 'claude' : 'human';
      return { winner, loser };
    }
    const winner = this.roundWinner();
    const loser: PlayerId = winner === 'human' ? 'claude' : 'human';
    return { winner, loser };
  }

  // Explains WHY the opening round's loser role landed where it did, per
  // match.openingLoserReason (set server-side by POST /api/new-match).
  // Worded naturally for whichever side actually holds the choice.
  private openingRoundExplainer(): string {
    const loser = this.match.openingLoser;
    if (!loser) return '';
    const who = loser === 'human' ? 'You' : 'Claude';
    const holds = loser === 'human' ? 'hold' : 'holds';
    let reasonText: string;
    switch (this.match.openingLoserReason) {
      case 'last-match-loser':
        reasonText = loser === 'human' ? 'you lost the previous match' : 'Claude lost the previous match';
        break;
      case 'recent-game-loser':
        reasonText =
          loser === 'human' ? 'you lost a game most recently' : 'Claude lost a game most recently';
        break;
      case 'coin-flip':
      default:
        reasonText = 'it was decided by coin flip';
        break;
    }
    return `${who} ${holds} the loser's choice this round — ${reasonText}.`;
  }

  // Feature 2 (design-screen context): the running match tally, "Wins  You
  // h/m · Claude c/m". Plain text, not HTML -- designRound.ts's status-strip
  // renderer escapes it before inserting it into the DOM.
  private matchTallyLine(): string {
    return `Wins  You ${this.match.innerWins.human}/${MATCH_WINS} · Claude ${this.match.innerWins.claude}/${MATCH_WINS}`;
  }

  // The design form's "result" line: round 1's opening round keeps its
  // existing explainer text (no inner game has been played yet this match);
  // every later round instead states plainly who won/lost the game that
  // just ended. `loser` here is currentRoundWinnerLoser()'s own derivation
  // -- the SAME winner/loser the rest of the design flow already computes,
  // never re-derived independently.
  private designResultLine(): string {
    if (this.isOpeningRound()) return this.openingRoundExplainer();
    const { loser } = this.currentRoundWinnerLoser();
    return loser === 'human'
      ? "You LOST the last game — you'll choose keep or steal."
      : 'You WON the last game — Claude picks keep/steal.';
  }

  private findRoundDesign(round: number, creatorId: PlayerId): CardDef | undefined {
    return this.registry.find((c) => c.createdInRound === round && c.creatorId === creatorId);
  }

  private async enterDesign(): Promise<void> {
    const round = this.match.round;

    // roundHistory is the GROUND TRUTH for whether this round's keep/steal
    // decision has already been made -- check it FIRST, before anything else.
    // If a record exists, the decision is done and must never be re-derived
    // or re-run (the client half of the idempotency fix; the server's 409
    // guard is the other half).
    const existingRecord = this.match.roundHistory.find((r) => r.round === round);
    if (existingRecord) {
      if (this.match.activeJobId) {
        // Under the current (non-blocking) code, activeJobId is only ever
        // set in the SAME synchronous step that also sets phase 'playing'
        // (see startImplementJobs), so reaching here with phase still
        // 'design' means this is a save stuck in the OLD blocking
        // 'implementing' designPhase shape. Migrate it: start the game now
        // -- enterPlaying's own activeJobId check resumes background
        // polling for the exact same job id, no separate call needed here.
        this.match.phase = 'playing';
        this.match.designPhase = undefined;
        await this.persistNow();
        await this.enterPlaying();
        return;
      }
      // Round resolved but no job in flight recorded (e.g. resolve-round
      // succeeded then a reload happened before implement-cards ran). Re-derive
      // this round's card ids from the record and get to the job phase.
      const cardIds = Object.values(existingRecord.designs).filter(
        (id): id is CardId => id !== null
      );
      if (cardIds.length > 0) {
        const cards = cardIds
          .map((id) => this.registryMap.get(id))
          .filter((c): c is CardDef => !!c);
        if (cards.length > 0 && cards.every((c) => c.implemented)) {
          // Job already finished (e.g. while no browser was attached) --
          // hot-load the effects, show the reveal, and resume playing.
          await this.completeImplementSuccess(cardIds);
          return;
        }
      }
      await this.startImplementJobs(existingRecord);
      return;
    }

    // No record yet for this round -- normal or mid-flight design round.
    //
    // pendingDesigns (set right before the reveal, see runDesignFlow) is the
    // GROUND TRUTH for "which two card ids were minted during THIS attempt
    // at this round" -- prefer it over a bare registry scan. A registry scan
    // by round+creatorId alone is ambiguous whenever a prior (since-voided
    // or state-repaired) attempt at the same round number left its own
    // designs sitting in the registry: findRoundDesign would happily match
    // those stale rows and skip straight to the decision screen using
    // designs the player never actually made this attempt, even though
    // designPhase says we're still at 'designing'. Only fall back to the
    // registry scan for genuinely old saves that predate pendingDesigns
    // entirely (designPhase itself is also undefined on those).
    if (this.match.pendingDesigns) {
      const humanCard = this.match.pendingDesigns.human
        ? this.registryMap.get(this.match.pendingDesigns.human)
        : undefined;
      const claudeCard = this.match.pendingDesigns.claude
        ? this.registryMap.get(this.match.pendingDesigns.claude)
        : undefined;
      if (humanCard && claudeCard) {
        await this.resolveRoundWithDesigns(humanCard, claudeCard);
        return;
      }
    }

    if (this.match.designPhase === undefined) {
      const existingHuman = this.findRoundDesign(round, 'human');
      const existingClaude = this.findRoundDesign(round, 'claude');
      if (existingHuman && existingClaude) {
        // Old save from before pendingDesigns/designPhase existed -- best
        // effort, same heuristic this code path always used.
        await this.resolveRoundWithDesigns(existingHuman, existingClaude);
        return;
      }
    }

    // BUG FIX (2026-07-03): the human already locked in their own design
    // during an earlier attempt at THIS round -- either "Retry design call"
    // was just chosen (see runDesignFlow's catch block), or the page was
    // reloaded/booted while still waiting on Claude's call (designPhase is
    // still 'designing', never reached 'revealed'). Either way, re-showing a
    // blank design form here would cost the human their already-locked card
    // text. Skip the form entirely and go straight back to (re)waiting on
    // Claude -- safe and cheap even if it re-requests, since Bug 1's
    // per-round reuse / in-flight coalescing fix makes a repeat
    // /api/design-card call for this round idempotent.
    if (this.match.pendingHumanDraft) {
      await this.runDesignFlow(round, undefined, undefined, this.match.pendingHumanDraft);
      return;
    }

    await this.runDesignFlow(round);
  }

  // `opponentDesign` is set only on a rule-3 redesign: the human's just-
  // voided design, fed to Claude's next /api/design-card call so it knows
  // what to avoid repeating (server/claude.ts's buildDesignPrompt already
  // has a prompt branch for this — it just needs real data from here).
  // `presetClaudeDesign` is set only when the human ghostwrote Claude's card
  // after a design-call failure (see promptDesignFailure below); when set,
  // the live Claude call is skipped entirely for this attempt.
  // `presetHumanDraft` is set only when the human ALREADY locked their own
  // design in during an earlier attempt at this exact round (see
  // match.pendingHumanDraft's doc comment in shared/types.ts) -- when set,
  // the interactive form/humanSubmitted wait are skipped entirely: the
  // "locked in, waiting" display is shown immediately and we go straight to
  // (re)waiting on Claude. This is the fix for "Retry design call" wiping the
  // human's already-locked design (2026-07-03).
  private async runDesignFlow(
    round: number,
    opponentDesign: { name: string; effectText: string } | null = null,
    presetClaudeDesign: { name: string; effectText: string } | null = null,
    presetHumanDraft: { name: string; effectText: string } | null = null
  ): Promise<void> {
    // Entering the blind-design step: a reload here should re-show the form
    // -- UNLESS the human's own design is already locked in from an earlier
    // attempt at this same round (presetHumanDraft), in which case it must
    // survive this reset untouched; every other fresh attempt (a genuinely
    // new round, or a rule-3 redesign after a void) starts with a clean slate.
    this.match.designPhase = 'designing';
    this.match.pendingDesigns = undefined;
    this.match.pendingDecision = undefined;
    this.match.pendingLoserPick = undefined;
    this.match.activeJobId = null;
    this.match.pendingHumanDraft = presetHumanDraft ?? undefined;
    this.schedulePersist();

    this.renderScreenShell('designing');
    const contentEl = this.contentEl();

    let resolveHuman!: (draft: { name: string; effectText: string }) => void;
    const humanSubmitted = new Promise<{ name: string; effectText: string }>((resolve) => {
      resolveHuman = resolve;
    });

    const handle = renderDesignForm(
      contentEl,
      round,
      {
        onValidate: (name, effectText) => api.validateCard({ name, effectText }),
        onSubmit: (name, effectText) => {
          handle.setSubmittedLocked(name, effectText);
          // Persist the lock-in IMMEDIATELY, independent of whether Claude's
          // call has settled yet -- see match.pendingHumanDraft's doc
          // comment. Fire-and-forget: persistNow already logs+swallows its
          // own errors, and onSubmit (a DOM event handler) isn't async.
          this.match.pendingHumanDraft = { name, effectText };
          void this.persistNow();
          resolveHuman({ name, effectText });
        },
      },
      { resultLine: this.designResultLine(), tallyLine: this.matchTallyLine() }
    );

    if (presetHumanDraft) {
      // The human already locked this in during an earlier attempt at this
      // exact round (a Claude-call retry, or a resumed boot/reload -- see
      // enterDesign's pendingHumanDraft branch). Show the SAME locked
      // display a real submit would have shown, immediately, instead of a
      // blank interactive form, and treat their submission as already done.
      handle.setSubmittedLocked(presetHumanDraft.name, presetHumanDraft.effectText);
      resolveHuman(presetHumanDraft);
    }

    // claudeCardDef is populated only when /api/design-card already minted
    // the card server-side (the normal, non-ghostwritten path — see
    // server/router.ts#handleDesignCard) so we don't mint it a second time
    // below.
    let claudeDesign: { name: string; effectText: string };
    let claudeCardDef: CardDef | null = null;

    if (presetClaudeDesign) {
      claudeDesign = presetClaudeDesign;
      handle.setClaudeStatus('ready');
    } else {
      try {
        const claudeResult = await api.designCard({ round, opponentDesign });
        claudeDesign = claudeResult.card;
        claudeCardDef = claudeResult.card;
        this.trackCard(claudeResult.card);
        handle.setClaudeStatus('ready');
      } catch (err) {
        // humanizeApiError digs the real cause (e.g. "credit balance is too
        // low") out of the nested API-error JSON instead of showing soup.
        const outcome = await this.promptDesignFailure(humanizeApiError(err));
        // Read fresh from match state (not the presetHumanDraft param): the
        // human may have locked in their design WHILE this very Claude call
        // was in flight, in which case onSubmit above already persisted it
        // even though this attempt started with presetHumanDraft === null.
        const lockedHumanDraft = this.match.pendingHumanDraft ?? null;
        if (outcome.kind === 'retry') {
          await this.runDesignFlow(round, opponentDesign, undefined, lockedHumanDraft);
        } else {
          await this.runDesignFlow(round, opponentDesign, outcome.design, lockedHumanDraft);
        }
        return;
      }
    }

    const humanDraft = await humanSubmitted;

    // Check for the identical-simultaneous-designs collision BEFORE minting
    // the human's design. This must run first: if Claude's design is already
    // registered (the normal live-call path) and the human's draft expresses
    // the same effect, the ordinary POST /api/registry/cards mint would
    // itself reject the human's card as a duplicate of Claude's -- an
    // uncaught 409, not a graceful void. The dedicated /api/void-round-designs
    // endpoint below mints BOTH sides (skipping that duplicate gate on
    // purpose) and destroys them atomically instead.
    if (await this.checkIdenticalDesigns(humanDraft, claudeDesign)) {
      const voided = await api.voidRoundDesigns({
        round,
        human: { kind: 'raw', name: humanDraft.name, effectText: humanDraft.effectText },
        claude: claudeCardDef
          ? { kind: 'existing', cardId: claudeCardDef.id }
          : { kind: 'raw', name: claudeDesign.name, effectText: claudeDesign.effectText },
      });
      this.trackCard(voided.human);
      this.trackCard(voided.claude);
      renderVoidNotice(this.contentEl(), () => {
        void this.runDesignFlow(round, { name: humanDraft.name, effectText: humanDraft.effectText });
      });
      return;
    }

    const humanMint = await api.createRegistryCard({
      name: humanDraft.name,
      effectText: humanDraft.effectText,
      creatorId: 'human',
      round,
    });
    this.trackCard(humanMint.card);
    // M3: give the human's freshly-minted card one shot at instant
    // implementation via live Claude's composition-only compile call, BEFORE
    // the round's implement job is ever kicked off (that happens much later,
    // in startImplementJobs, once the round resolves) -- success patches
    // trackCard's registry row with composition + implemented: true (hot-
    // composing it into this.effects for free, see trackCard), so the later
    // POST /api/implement-cards call's existing "already implemented"
    // short-circuit makes the fallback job a no-op. Best-effort: any failure
    // (inexpressible card, network error) just leaves the card
    // implemented: false and the ordinary job runs exactly as it does today.
    await this.compileHumanCard(humanMint.card.id);

    if (!claudeCardDef) {
      const claudeMint = await api.createRegistryCard({
        name: claudeDesign.name,
        effectText: claudeDesign.effectText,
        creatorId: 'claude',
        round,
      });
      claudeCardDef = claudeMint.card;
      this.trackCard(claudeCardDef);
    }

    // Both designs are now minted and confirmed non-identical. Persist the
    // 'revealed' step IMMEDIATELY, before showing/awaiting the reveal-then-
    // decision UI: a reload right here must resume at the decision flow (via
    // enterDesign's findRoundDesign branch) instead of re-minting or
    // re-showing the design form.
    this.match.designPhase = 'revealed';
    this.match.pendingDesigns = { human: humanMint.card.id, claude: claudeCardDef.id };
    // The human's design is now actually minted -- pendingDesigns.human is
    // the ground truth from here on, so the pre-mint draft stash is spent.
    this.match.pendingHumanDraft = undefined;
    await this.persistNow();

    await new Promise<void>((resolve) => {
      renderReveal(this.contentEl(), humanMint.card, claudeCardDef!, () => resolve());
    });

    await this.resolveRoundWithDesigns(humanMint.card, claudeCardDef);
  }

  // POST /api/compile-card, best-effort (never throws): on success, patches
  // this.registry/this.registryMap AND hot-composes into this.effects via
  // trackCard's own composition check. On failure (inexpressible, or a
  // network/HTTP error of any kind), does nothing -- the card is simply left
  // as the server minted it (implemented: false), and the ordinary fallback
  // job picks it up later exactly as it does today.
  private async compileHumanCard(cardId: CardId): Promise<void> {
    try {
      const response = await api.compileCard({ cardId });
      if (response.ok) {
        this.trackCard(response.card);
      }
    } catch (err) {
      console.warn(`compile-card failed for "${cardId}" (falling back to the implement job):`, err);
    }
  }

  // Rule 3 (identical-simultaneous-designs): mechanical normalizeText match
  // first; only when that DOESN'T already prove a match do we spend a
  // network call on a single Claude semantic-judgment pass. Best-effort: if
  // the judgment call itself fails (no API key, network error), we fall
  // back to the mechanical result rather than blocking the round — the
  // mechanical check remains the hard gate either way.
  private async checkIdenticalDesigns(
    humanDraft: { name: string; effectText: string },
    claudeDesign: { name: string; effectText: string }
  ): Promise<boolean> {
    if (normalizeText(humanDraft.effectText) === normalizeText(claudeDesign.effectText)) {
      return true;
    }
    try {
      const judgment = await api.judgeDuplicate({
        candidate: humanDraft,
        compareAgainst: [{ name: claudeDesign.name, effectText: claudeDesign.effectText }],
        context: 'identical-simultaneous-designs',
      });
      return judgment.isDuplicate;
    } catch (err) {
      console.error('Semantic identical-design judgment failed; using the mechanical result only.', err);
      return false;
    }
  }

  // Design call failure -> retry or human ghostwrites Claude's card (plan's
  // failure-handling section). Moves the match to 'paused' while the human
  // decides, then back to 'design' once they've chosen. Unrelated to the
  // non-blocking implement-job banner below -- this happens BEFORE any card
  // is even minted, so there's nothing yet for the game to stay playable
  // underneath.
  private async promptDesignFailure(
    errorMessage: string
  ): Promise<{ kind: 'retry' } | { kind: 'ghostwrite'; design: { name: string; effectText: string } }> {
    this.match.phase = 'paused';
    await this.persistNow();
    this.renderScreenShell('paused');
    const outcome = await new Promise<
      { kind: 'retry' } | { kind: 'ghostwrite'; design: { name: string; effectText: string } }
    >((resolve) => {
      renderDesignFailure(this.contentEl(), errorMessage, {
        onRetry: () => resolve({ kind: 'retry' }),
        onGhostwrite: (name, effectText) => resolve({ kind: 'ghostwrite', design: { name, effectText } }),
        onValidateGhostwrite: (name, effectText) => api.validateCard({ name, effectText }),
      });
    });
    this.match.phase = 'design';
    await this.persistNow();
    return outcome;
  }

  // STEAL RESHAPED v3 orchestration: (i) the LOSER decides keep vs steal;
  // (ii) if steal, the LOSER picks first from the winner's design/deck;
  // (iii) the WINNER counter-raids the loser's design/deck (minus whatever
  // was just taken in step ii). Each step's outcome is persisted the instant
  // it's decided (match.pendingDecision / pendingLoserPick + designPhase) so
  // a reload mid-pick resumes at the right screen instead of re-running an
  // already-locked-in decision -- the 409 idempotency guard in
  // finalizeRoundResolution is the final backstop, not the only one.
  private async resolveRoundWithDesigns(humanCard: CardDef, claudeCard: CardDef): Promise<void> {
    const { winner, loser } = this.currentRoundWinnerLoser();

    let decision = this.match.pendingDecision ?? null;
    if (!decision) {
      decision = await this.runLoserDecision(loser, winner, humanCard, claudeCard);
      this.match.pendingDecision = decision;
      if (decision === 'steal') this.match.designPhase = 'loser-picking';
      await this.persistNow();
    }

    if (decision === 'keep') {
      await this.finalizeRoundResolution(humanCard, claudeCard, winner, 'keep', null, null);
      return;
    }

    let loserPick = this.match.pendingLoserPick ?? null;
    if (!loserPick) {
      loserPick = await this.runLoserStealPick(loser, winner, humanCard, claudeCard);
      this.match.pendingLoserPick = loserPick;
      this.match.designPhase = 'winner-picking';
      await this.persistNow();
    }

    const winnerPick = await this.runWinnerCounterRaidPick(winner, loser, humanCard, claudeCard, loserPick);

    await this.finalizeRoundResolution(humanCard, claudeCard, winner, 'steal', loserPick, winnerPick);
  }

  // Step (i): the LOSER of the inner game chooses keep vs steal. Human loser
  // gets the two-button UI; Claude loser decides via chooseKeepOrSteal
  // (pessimistic, because the loser never has final say over the winner's
  // step-2 counter-raid).
  private async runLoserDecision(
    loser: PlayerId,
    winner: PlayerId,
    humanCard: CardDef,
    claudeCard: CardDef
  ): Promise<LoserDecision> {
    const loserDesign = loser === 'human' ? humanCard : claudeCard;
    const winnerDesign = winner === 'human' ? humanCard : claudeCard;
    const opening = this.isOpeningRound();
    const openingNote = opening ? this.openingRoundExplainer() : undefined;

    if (loser === 'human') {
      this.renderScreenShell('keep-steal');
      return await new Promise<LoserDecision>((resolve) => {
        renderLoserDecision(
          this.contentEl(),
          loserDesign,
          winnerDesign,
          {
            onKeep: () => resolve('keep'),
            onSteal: () => resolve('steal'),
          },
          this.matchTallyLine(),
          openingNote
        );
      });
    }

    // Claude is the loser.
    this.renderScreenShell('keep-steal');
    renderRoundNarration(this.contentEl(), [
      ...(openingNote ? [openingNote] : []),
      opening
        ? 'Claude is deciding whether to keep its own design or steal yours…'
        : 'Claude lost the round and is deciding whether to keep its own design or steal yours…',
    ]);
    await delay(AI_MOVE_DELAY_MS);

    // winnerDeckCandidates: what Claude (the loser) could grab in step 1 --
    // createdByPicker means "created by Claude" (executing denies, taking
    // profits). ownDeckCandidates: what the winner's step-2 counter-raid
    // could reach if Claude steals -- createdByPicker there means "created
    // by the WINNER" (the counter-raid's picker).
    const winnerDeckCandidates = this.buildStealCandidates(this.match.decks[winner], loser);
    const ownDeckCandidates = this.buildStealCandidates(this.match.decks[loser], winner);

    const decision = chooseKeepOrSteal({
      ownDesignValue: this.effects.get(loserDesign.id)?.baseValue ?? 1,
      winnerDesignValue: this.effects.get(winnerDesign.id)?.baseValue ?? 1,
      winnerDeckCandidates,
      ownDeckCandidates,
      pessimistic: true,
    });

    renderRoundNarration(this.contentEl(), [
      decision === 'keep'
        ? `Claude keeps its own design: "${loserDesign.name}".`
        : `Claude steals — it will pick first from your design or deck, then you'll counter-raid Claude's deck right back.`,
    ]);
    await delay(AI_MOVE_DELAY_MS);
    return decision;
  }

  // Shared candidate-building for both AI decision points below: every card
  // currently in `deckCardIds`, valued by baseValue, flagged for whether
  // `picker` originally created it (picking it as an 'existing' target
  // executes rather than takes it).
  private buildStealCandidates(deckCardIds: readonly CardId[], picker: PlayerId): StealCandidate[] {
    const out: StealCandidate[] = [];
    for (const cardId of deckCardIds) {
      const card = this.registryMap.get(cardId);
      if (!card) continue;
      out.push({
        cardId,
        value: this.effects.get(cardId)?.baseValue ?? 1,
        source: 'existing',
        createdByPicker: card.creatorId === picker,
      });
    }
    return out;
  }

  // One combined candidate list -- the offered design plus every card in
  // `sourceDeck` (minus `exclude`, used only by step 2's just-taken
  // exclusion) -- shared by both the UI pick-list renderers (StealPickOption)
  // and the AI evaluators (StealCandidate), so the two never drift apart.
  private buildPickCandidates(
    offeredDesign: CardDef,
    sourceDeck: readonly CardId[],
    picker: PlayerId,
    exclude: CardId | null
  ): Array<{ card: CardDef; source: 'design' | 'existing'; value: number; createdByPicker: boolean }> {
    const out: Array<{ card: CardDef; source: 'design' | 'existing'; value: number; createdByPicker: boolean }> = [
      {
        card: offeredDesign,
        source: 'design',
        value: this.effects.get(offeredDesign.id)?.baseValue ?? 1,
        createdByPicker: false,
      },
    ];
    for (const cardId of sourceDeck) {
      if (cardId === exclude) continue;
      const card = this.registryMap.get(cardId);
      if (!card) continue;
      out.push({
        card,
        source: 'existing',
        value: this.effects.get(cardId)?.baseValue ?? 1,
        createdByPicker: card.creatorId === picker,
      });
    }
    return out;
  }

  private resolvePick(
    candidates: Array<{ card: CardDef; source: 'design' | 'existing'; createdByPicker: boolean }>,
    cardId: CardId
  ): RoundPick {
    const picked = candidates.find((c) => c.card.id === cardId);
    if (!picked) {
      throw new Error(`resolvePick: picked card "${cardId}" was not among the offered candidates.`);
    }
    const outcome: 'taken' | 'destroyed' =
      picked.source === 'existing' && picked.createdByPicker ? 'destroyed' : 'taken';
    return { cardId, source: picked.source, outcome };
  }

  // Narrates an AI-driven pick (either step), spelling out the destruction
  // consequences per the general principle that any spurned design is
  // destroyed -- e.g. "Claude spurns your design — it is destroyed — and
  // takes Feral Abacus."
  private narrateStealPickResult(offeredDesign: CardDef, result: StealPickResult): void {
    const takenName = this.registryMap.get(result.cardId)?.name ?? result.cardId;
    let line: string;
    if (result.source === 'design') {
      line = `Claude takes your design "${takenName}".`;
    } else if (result.outcome === 'destroyed') {
      line =
        `Claude spurns your design "${offeredDesign.name}" — it is destroyed — and executes ` +
        `"${takenName}" instead of taking it (Claude created it).`;
    } else {
      line =
        `Claude spurns your design "${offeredDesign.name}" — it is destroyed — and takes ` +
        `"${takenName}" from your deck.`;
    }
    renderRoundNarration(this.contentEl(), [line]);
  }

  // Step (ii): the LOSER's forced first pick, from the winner's brand-new
  // design or any card already in the winner's deck.
  private async runLoserStealPick(
    loser: PlayerId,
    winner: PlayerId,
    humanCard: CardDef,
    claudeCard: CardDef
  ): Promise<RoundPick> {
    const winnerDesign = winner === 'human' ? humanCard : claudeCard;
    const candidates = this.buildPickCandidates(winnerDesign, this.match.decks[winner], loser, null);

    if (loser === 'human') {
      this.renderScreenShell('keep-steal');
      const options: StealPickOption[] = candidates.map((c) => ({
        card: c.card,
        source: c.source,
        willDestroy: c.source === 'existing' && c.createdByPicker,
        value: c.value,
      }));
      const cardId = await new Promise<CardId>((resolve) => {
        renderLoserStealPick(this.contentEl(), playerLabel(winner), options, {
          onPick: (id) => resolve(id),
        });
      });
      return this.resolvePick(candidates, cardId);
    }

    // Claude is the loser.
    this.renderScreenShell('keep-steal');
    renderRoundNarration(this.contentEl(), ['Claude stole — choosing what to take from your design or deck…']);
    await delay(AI_MOVE_DELAY_MS);

    const result = chooseLoserSteal({
      candidates: candidates.map((c) => ({
        cardId: c.card.id,
        value: c.value,
        source: c.source,
        createdByPicker: c.createdByPicker,
      })),
    });
    this.narrateStealPickResult(winnerDesign, result);
    await delay(AI_MOVE_DELAY_MS);
    return { cardId: result.cardId, source: result.source, outcome: result.outcome };
  }

  // Step (iii): the WINNER's mandatory counter-raid pick, from the loser's
  // brand-new design or any card in the loser's deck EXCLUDING the card the
  // loser just took in step (ii). There is no "keep" option here.
  private async runWinnerCounterRaidPick(
    winner: PlayerId,
    loser: PlayerId,
    humanCard: CardDef,
    claudeCard: CardDef,
    loserPick: RoundPick
  ): Promise<RoundPick> {
    const loserDesign = loser === 'human' ? humanCard : claudeCard;
    // Only a 'taken' loserPick actually landed a card in the loser's deck
    // (a 'destroyed' outcome left nothing new there to exclude).
    const excluded = loserPick.outcome === 'taken' ? loserPick.cardId : null;
    const candidates = this.buildPickCandidates(loserDesign, this.match.decks[loser], winner, excluded);

    if (winner === 'human') {
      this.renderScreenShell('keep-steal');
      const options: StealPickOption[] = candidates.map((c) => ({
        card: c.card,
        source: c.source,
        willDestroy: c.source === 'existing' && c.createdByPicker,
        value: c.value,
      }));
      const cardId = await new Promise<CardId>((resolve) => {
        renderWinnerCounterRaidPick(this.contentEl(), playerLabel(loser), options, {
          onPick: (id) => resolve(id),
        });
      });
      return this.resolvePick(candidates, cardId);
    }

    // Claude is the winner.
    this.renderScreenShell('keep-steal');
    renderRoundNarration(this.contentEl(), ['Claude won — counter-raiding your design or deck…']);
    await delay(AI_MOVE_DELAY_MS);

    const result = chooseWinnerPick({
      candidates: candidates.map((c) => ({
        cardId: c.card.id,
        value: c.value,
        source: c.source,
        createdByPicker: c.createdByPicker,
      })),
    });
    this.narrateStealPickResult(loserDesign, result);
    await delay(AI_MOVE_DELAY_MS);
    return { cardId: result.cardId, source: result.source, outcome: result.outcome };
  }

  private async finalizeRoundResolution(
    humanCard: CardDef,
    claudeCard: CardDef,
    winner: PlayerId,
    decision: LoserDecision,
    loserPick: RoundPick | null,
    winnerPick: RoundPick | null
  ): Promise<void> {
    const designs: Record<PlayerId, CardId | null> = { human: humanCard.id, claude: claudeCard.id };

    let record: RoundRecord;
    try {
      const resp = await api.resolveRound({
        round: this.match.round,
        designs,
        winner,
        decision,
        loserPick,
        winnerPick,
      });
      this.match = resp.match;
      record = resp.record;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // This round was already resolved server-side (e.g. a reload/retry
        // after the decision had already been applied). Do NOT treat it as
        // fatal or re-run the decision -- re-fetch fresh state and let
        // enterDesign's roundHistory-first routing move forward.
        this.match = await api.getState();
        await this.enterDesign();
        return;
      }
      // Any other error surfaces via the existing fatal-error path.
      this.renderFatalError(err);
      return;
    }

    // Lifecycle reset: this round's fine-grained design sub-state must not
    // survive into the next round's design flow. pendingDesigns in
    // particular is read by enterDesign's "no roundHistory record for the
    // CURRENT round yet" branch WITHOUT checking which round it was minted
    // for -- if left set here, the next inner game's own end-of-game
    // enterDesign() call would find these (now-stale) ids still resolve via
    // registryMap.get(...) (the cards still exist, just from the round that
    // JUST finished) and re-run resolveRoundWithDesigns for the new round
    // number, racing the just-finished inner game's real winner/loser
    // against last round's already-resolved designs. Clearing all four
    // pending* fields the moment a round's resolution is confirmed closes
    // that window; runDesignFlow also resets them at the start of every
    // fresh attempt, but that's the NEXT round's safety net, not this one's.
    this.match.designPhase = 'resolved';
    this.match.pendingDesigns = undefined;
    this.match.pendingHumanDraft = undefined;
    this.match.pendingDecision = undefined;
    this.match.pendingLoserPick = undefined;
    // Feature 4 (design draft autosave): this round's design draft has now
    // either been kept, stolen, or destroyed -- it's fully spent, so the
    // saved localStorage draft (if any) must not leak into a future round's
    // form. (The normal per-submit clear in designRound.ts already handles
    // the common case; this is the lifecycle-boundary backstop.)
    clearDesignDraft();
    await this.refreshRegistry();
    await this.persistNow();

    await this.startImplementJobs(record);
  }

  // === implement jobs (non-blocking) / paused ===

  // Non-blocking implement jobs: kicks the job and moves straight to
  // 'playing' -- newly-adopted cards enter decks LOCKED (registry
  // implemented: false) rather than the match waiting on the job.
  // enterPlaying (called at the end here) is the single place that starts
  // background polling, via its own activeJobId check, so this method
  // doesn't need to call startBackgroundJobPoll itself.
  private async startImplementJobs(record: RoundRecord): Promise<void> {
    const cardIds = Object.values(record.designs).filter((id): id is CardId => id !== null);
    await api.nextCards({ round: record.round });
    const response = await api.implementCards({ round: record.round, cardIds });
    if (response.alreadyImplemented) {
      // No-duplicate-job guard: every requested card was already implemented
      // server-side, so no job was spawned at all -- proceed exactly as if a
      // job had just completed successfully.
      await this.completeImplementSuccess(cardIds);
      return;
    }
    this.match.activeJobId = response.jobId;
    this.match.designPhase = undefined;
    this.match.phase = 'playing';
    await this.persistNow();
    await this.enterPlaying();
  }

  // Shared "a set of cards just became implemented" path: hot-loads their
  // effect modules (cache-busted dynamic import, since the module may have
  // been written to disk after this page's initial boot-time
  // loadAllEffects() glob), shows the "see what your card became" code
  // reveal, then resumes play. Used whenever an implement job's cards become
  // available WITHOUT ever having entered the live/non-blocking game as
  // locked cards: the no-duplicate-job guard short-circuit
  // (startImplementJobs), and the boot-time resume paths that discover the
  // round's cards were already implemented (enterDesign, enterPaused). The
  // live-polling path (a job that finishes WHILE the cards are already
  // sitting in decks as locked) goes through handleBackgroundJobDone
  // instead, which shows the same reveal as a non-blocking overlay.
  private async completeImplementSuccess(cardIds: CardId[]): Promise<void> {
    await this.refreshRegistry();
    const loaded: CardId[] = [];
    for (const cardId of cardIds) {
      // Same guard as handleBackgroundJobDone: destroyed/unimplemented ids
      // have no module on disk; importing one gets Vite's index.html
      // fallback (invalid-MIME error) and would crash this resume path.
      const def = this.registryMap.get(cardId);
      if (!def || def.destroyed || !def.implemented) continue;
      // M2/M3: a composed card (this whole method's most common trigger
      // now, via startImplementJobs' alreadyImplemented short-circuit) has
      // no src/effects/<id>.ts module to hot-load at all -- it's already in
      // this.effects (trackCard's hot-compose path, or boot's
      // effectsLoader.loadEffects). Treat "already present" as "already
      // loaded" rather than attempting (and failing) a dynamic import.
      if (this.effects.has(cardId)) {
        loaded.push(cardId);
        continue;
      }
      try {
        const effect = await loadEffectFresh(cardId);
        this.effects.set(cardId, effect);
        loaded.push(cardId);
      } catch (err) {
        console.error(`hot-load failed for "${cardId}" (skipping):`, err);
      }
    }
    await this.showCardReveal(loaded);
    this.match.phase = 'playing';
    this.match.activeJobId = null;
    await this.persistNow();
    await this.enterPlaying();
  }

  // Feature: "show the code" job-done moment. Purely informational and
  // stateless -- nothing here is persisted, so a reload instead of tapping
  // Continue simply skips it: the caller's own persist (right after this
  // resolves) is the same one it would have done anyway, and on a fresh
  // boot the existing designPhase/enterDesign machinery re-derives "these
  // cards are implemented, resume playing" from scratch without ever
  // re-entering this method for the same job.
  private async showCardReveal(cardIds: CardId[]): Promise<void> {
    const cards = cardIds.map((id) => this.registryMap.get(id)).filter((c): c is CardDef => c !== undefined);
    if (cards.length === 0) return;
    this.renderScreenShell('card-reveal');
    await new Promise<void>((resolve) => {
      renderCardReveal(this.contentEl(), cards, this.effects, () => resolve());
    });
  }

  // Boot-time recovery when phase === 'paused' on load: the original job id
  // isn't part of MatchState (no list-jobs contract to recover it from), so
  // we re-derive this round's not-yet-implemented card ids from the
  // registry and kick off a fresh implement job for them.
  private async enterPaused(): Promise<void> {
    const round = this.match.round;
    const cardIds = this.registry
      .filter((c) => c.createdInRound === round && !c.implemented && c.creatorId !== 'starter')
      .map((c) => c.id);

    if (cardIds.length === 0) {
      // Nothing left to implement. The usual reason: the implement job
      // finished while no browser was attached (jobs run in the dev server,
      // not the page). If this round's cards are all implemented, the round
      // is actually complete — hot-load them and resume playing.
      const roundCards = this.registry.filter(
        (c) => c.createdInRound === round && c.creatorId !== 'starter' && !c.destroyed
      );
      if (roundCards.length > 0 && roundCards.every((c) => c.implemented)) {
        await this.completeImplementSuccess(roundCards.map((c) => c.id));
        return;
      }

      this.renderScreenShell('paused');
      this.contentEl().innerHTML = `
        <section class="paused">
          <h2>Match paused</h2>
          <p>No pending implement job could be recovered for round ${round}. Check the server logs.</p>
          <button type="button" class="paused__resume" data-role="resume-playing">Resume playing anyway</button>
        </section>
      `;
      this.contentEl()
        .querySelector<HTMLButtonElement>('[data-role="resume-playing"]')
        ?.addEventListener('click', () => {
          this.match.phase = 'playing';
          void this.persistNow().then(() => this.enterPlaying());
        });
      return;
    }

    try {
      const response = await api.implementCards({ round, cardIds });
      if (response.alreadyImplemented) {
        // Defensive: cardIds here are already filtered to `!c.implemented`,
        // so this shouldn't normally trigger -- but handle it the same way
        // regardless of how we got here.
        await this.completeImplementSuccess(cardIds);
        return;
      }
      // Migrate into the non-blocking shape: start the game now instead of
      // swapping to a blocking job-status screen -- enterPlaying's own
      // activeJobId check resumes background polling for this fresh job.
      this.match.activeJobId = response.jobId;
      this.match.phase = 'playing';
      await this.persistNow();
      await this.enterPlaying();
    } catch (err) {
      this.renderFatalError(err);
    }
  }

  // === match-over ===

  private renderMatchOver(): void {
    this.renderScreenShell('match-over');
    const el = this.contentEl();
    const winner = this.match.winner;
    el.innerHTML = `
      <section class="match-over">
        <h2>${winner === 'human' ? 'You win the match!' : 'Claude wins the match.'}</h2>
        <p>Final inner-game tally — You: ${this.match.innerWins.human} · Claude: ${this.match.innerWins.claude}</p>
        <button type="button" class="match-over__new" data-role="new-match">Start new match</button>
      </section>
    `;
    el.querySelector<HTMLButtonElement>('[data-role="new-match"]')?.addEventListener('click', () => {
      void this.startNewMatch();
    });
  }

  // POST /api/new-match owns the ENTIRE reset now: deriving/persisting
  // meta.json, the best-effort starter-name rename, and building the fresh
  // MatchState (whose round 1 is the opening design round -- see
  // isOpeningRound/currentRoundWinnerLoser below). This is the single call
  // site for starting a match: fresh install (start()), the sticky header's
  // "New match" control (requestNewMatch), and the match-over screen's
  // "Start new match" button all funnel through here.
  private async startNewMatch(): Promise<void> {
    try {
      this.match = await api.newMatch();
      // Starter card names may have just been rewritten server-side.
      await this.refreshRegistry();
      await this.routeByPhase();
    } catch (err) {
      this.renderFatalError(err);
    }
  }
}

export function mountApp(container: HTMLElement): void {
  const app = new AppController(container);
  void app.start();
}
