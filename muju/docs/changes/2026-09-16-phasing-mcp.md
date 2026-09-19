Historical release note ported from the local outputs/ folder on 2026-09-18; not edited.

# Phasing MCP update

Source worktree: `/private/tmp/muju-phasing-variant` (based on `5fc96518`).

Updates variant-specific rules, phase and handoff context, summons, economy forecasts, tactical turn models, home-proof timing, staging guidance, and skills. Built-in AI remains Standard-only. Tactical searches cover the modeled action phase and do not search later preparation choices or multiple turns.

Validation: build and server type checks passed; 830 Vitest tests and 51 online browser tests passed. Updated stdio MCP bridge was verified read-only against the live waiting room. Public deployment has not been changed.

`phasing-mcp.patch` includes the source changes and new regression tests. Apply only to a checkout containing the Phasing implementation; the current main workspace has older uncommitted work and was not overwritten.
