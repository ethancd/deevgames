/**
 * `TUNED_WEIGHTS` — the vector `lab/hard-ai/tune/texel.ts` writes (DESIGN
 * §4.15, §5.15; M18 owns the generator).
 *
 * GENERATED FILE. Until M18's Texel run replaces it, the tuned vector IS the
 * default one (MILESTONES.md M12: "`weights.generated.ts` (initially
 * `TUNED_WEIGHTS = DEFAULT_WEIGHTS`)"). `cloneWeights` rather than the object
 * itself, so a caller that mutates `TUNED_WEIGHTS` cannot reach through and
 * corrupt `DEFAULT_WEIGHTS`.
 */
import { DEFAULT_WEIGHTS, cloneWeights, type Weights } from './weights';

export const TUNED_WEIGHTS: Weights = (() => {
  const w = cloneWeights(DEFAULT_WEIGHTS);
  w.label = 'tuned-v0-identical-to-default';
  return w;
})();
