/** Historical entrypoints contain pinned old output paths and comparison claims.
 * Reproduce them at their recorded commits. New studies should use the current
 * harness with a new output path and an explicit v1.9 control checkout. */
throw new Error('Historical well/queue experiment: use its recorded commit (v1.9 control: 16ccfd7). For v2.1, use lab/harness/runner.ts with a new study manifest and output directory. Historical outputs were not touched.');
export {};
