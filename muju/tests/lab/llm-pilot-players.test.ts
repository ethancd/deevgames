// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  claudeToolsFor, codexSandboxFor, ensureOutsideRepo, extractCitedRevisions, playerKindForModel,
} from '../../tools/llm-pilot/players';
import { stripApiKeys } from '../../tools/llm-pilot/auth';

describe('playerKindForModel', () => {
  it('maps the pilot table\'s short model ids to the right CLI', () => {
    expect(playerKindForModel('sonnet')).toBe('claude');
    expect(playerKindForModel('luna')).toBe('codex');
    expect(playerKindForModel('sol')).toBe('codex');
    expect(playerKindForModel('astra')).toBe('codex');
    expect(playerKindForModel('opus')).toBe('claude');
    expect(playerKindForModel('fable')).toBe('claude');
  });
  it('refuses an unknown model rather than guessing a CLI for it', () => {
    // @ts-expect-error intentionally wrong input
    expect(() => playerKindForModel('gpt-6-luna')).toThrow(/Unknown model id/);
  });
});

describe('tool-tier -> CLI capability mapping', () => {
  it('every tier — including tool-builder — gets Read/Write only, never a native shell (review fix: '
    + 'a bare Bash/workspace-write exec tool has no read restriction, so same-user file access made '
    + 'tool-builder non-isolated; helper execution instead goes through the gateway\'s sandboxed '
    + 'muju_run_helper/muju_write_file MCP tools)', () => {
    for (const tier of ['bare', 'harnessed', 'centaur', 'tool-builder'] as const) {
      expect(claudeToolsFor(tier)).toEqual(['Read', 'Write']);
      expect(codexSandboxFor(tier)).toBe('read-only');
    }
  });
});

describe('ensureOutsideRepo', () => {
  it('rejects a workspace under /Users/ashkie/src', async () => {
    await expect(ensureOutsideRepo('/Users/ashkie/src/deevgames/muju')).rejects.toThrow(/resolves under/);
    await expect(ensureOutsideRepo('/Users/ashkie/src')).rejects.toThrow(/resolves under/);
  });
  it('accepts a workspace under the OS temp root', async () => {
    await expect(ensureOutsideRepo('/private/tmp/muju-llm-pilot/P01-W-player-abcd1234')).resolves.toBeUndefined();
  });
});

describe('extractCitedRevisions', () => {
  it('finds every "revision N" reference, deduped and sorted', () => {
    expect(extractCitedRevisions('At revision 42 I moved; by revision 108 I lost the exchange. See revision 42 again.'))
      .toEqual([42, 108]);
  });
  it('returns an empty list when nothing is cited', () => {
    expect(extractCitedRevisions('I played well and won.')).toEqual([]);
  });
  it('does not choke on adjacent punctuation ("revision #42", "revision: 42")', () => {
    expect(extractCitedRevisions('revision #42 and revision: 108')).toEqual([42, 108]);
  });
});

describe('stripApiKeys', () => {
  it('removes every *_API_KEY variable and reports which ones', () => {
    const { env, stripped } = stripApiKeys({
      ANTHROPIC_API_KEY: 'x', OPENAI_API_KEY: 'y', ANTHROPIC_PERSONAL_API_KEY: 'z',
      PATH: '/usr/bin', HOME: '/Users/ashkie',
    });
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_PERSONAL_API_KEY).toBeUndefined();
    expect(env.PATH).toBe('/usr/bin');
    expect(env.HOME).toBe('/Users/ashkie');
    expect(new Set(stripped)).toEqual(new Set(['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_PERSONAL_API_KEY']));
  });
  it('is a no-op copy when no API keys are present', () => {
    const base = { PATH: '/usr/bin' };
    const { env, stripped } = stripApiKeys(base);
    expect(env).toEqual(base);
    expect(env).not.toBe(base);
    expect(stripped).toEqual([]);
  });
  it('also strips the operator Claude Code session identity/messaging vars and ANTHROPIC_*/OPENAI_* beyond *_API_KEY (review fix)', () => {
    const { env, stripped } = stripApiKeys({
      PATH: '/usr/bin',
      CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 's1', CLAUDE_CODE_CHILD_SESSION: 'c1',
      CLAUDE_CODE_MESSAGING_SOCKET: '/tmp/sock', CLAUDE_CODE_MESSAGING_TOKEN: 'tok',
      ANTHROPIC_AUTH_TOKEN: 'a', ANTHROPIC_BASE_URL: 'https://example.invalid', OPENAI_BASE_URL: 'https://example.invalid',
    });
    for (const key of ['CLAUDECODE', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_CHILD_SESSION',
      'CLAUDE_CODE_MESSAGING_SOCKET', 'CLAUDE_CODE_MESSAGING_TOKEN', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'OPENAI_BASE_URL']) {
      expect(env[key]).toBeUndefined();
      expect(stripped).toContain(key);
    }
    expect(env.PATH).toBe('/usr/bin');
  });
  it('assertCleanEnv throws on any survivor; passes on a cleaned env', async () => {
    const { assertCleanEnv } = await import('../../tools/llm-pilot/auth');
    expect(() => assertCleanEnv({ PATH: '/usr/bin' })).not.toThrow();
    expect(() => assertCleanEnv({ CLAUDECODE: '1' })).toThrow(/Forbidden env var/);
  });
});

describe('CLI argument builders (verified live against claude 2.1.280 / codex 0.155)', () => {
  it('claude: subscription-safe, gateway tools pre-approved, never --bare', async () => {
    const { claudeArgs } = await import('../../tools/llm-pilot/players');
    const args = claudeArgs({ prompt: 'p', model: 'claude-sonnet-5', effort: 'low', cwd: '/tmp/w', mcpConfigPath: '/tmp/w/m.json', tier: 'bare', sessionId: 'abc' });
    expect(args).not.toContain('--bare');
    expect(args).not.toContain('--safe-mode'); // it drops --mcp-config servers too
    expect(args[args.indexOf('--allowedTools') + 1]).toBe('mcp__muju,Read,Write');
    expect(args).toEqual(expect.arrayContaining(['--strict-mcp-config', '--restricted', '--session-id', 'abc']));
    const resumed = claudeArgs({ prompt: 'p', model: 'claude-sonnet-5', effort: 'low', cwd: '/tmp/w', mcpConfigPath: '/tmp/w/m.json', tier: 'bare', resumeSessionId: 'abc', sessionId: 'abc' });
    expect(resumed).toContain('--resume');
    expect(resumed).not.toContain('--session-id');
  });
  it('codex: ChatGPT login forced, operator config ignored, read-only sandbox for every tier (review fix: '
    + 'workspace-write left reads unrestricted, so tool-builder no longer uses it)', async () => {
    const { codexArgs } = await import('../../tools/llm-pilot/players');
    const fresh = codexArgs({ prompt: 'p', model: 'gpt-6-luna', effort: 'high', cwd: '/tmp/w', gameDir: '/tmp/g', tier: 'centaur' });
    expect(fresh).toEqual(expect.arrayContaining(['--ignore-user-config', 'forced_login_method="chatgpt"', 'model_reasoning_effort="high"', 'sandbox_mode="read-only"', '--sandbox', 'read-only']));
    const resumed = codexArgs({ prompt: 'p', model: 'gpt-6-luna', effort: 'high', cwd: '/tmp/w', gameDir: '/tmp/g', tier: 'tool-builder', resumeSessionId: 'tid' });
    expect(resumed.slice(0, 2)).toEqual(['exec', 'resume']);
    expect(resumed.slice(-2)).toEqual(['tid', 'p']);
    expect(resumed).toContain('sandbox_mode="read-only"');
  });
  it('codex: disables shell_tool/unified_exec/multi_agent for EVERY tier including tool-builder (review fix: '
    + 'a native shell under workspace-write could still read anything readable by the operator\'s own account; '
    + 'tool-builder\'s own code now runs only through the gateway\'s sandboxed muju_run_helper/muju_write_file)', async () => {
    const { codexArgs } = await import('../../tools/llm-pilot/players');
    for (const tier of ['bare', 'harnessed', 'centaur', 'tool-builder'] as const) {
      const args = codexArgs({ prompt: 'p', model: 'gpt-6-luna', effort: 'low', cwd: '/tmp/w', gameDir: '/tmp/g', tier });
      expect(args).toEqual(expect.arrayContaining(['--disable', 'shell_tool', '--disable', 'unified_exec', '--disable', 'multi_agent']));
    }
  });
  it('codex: the gateway command never includes --game-dir (the absolute secrets/ path must not reach '
    + 'a player-readable surface); the dir reaches the gateway only as its process env, via codex argv', async () => {
    const { codexArgs } = await import('../../tools/llm-pilot/players');
    const args = codexArgs({ prompt: 'p', model: 'gpt-6-luna', effort: 'low', cwd: '/tmp/w', gameDir: '/tmp/g/secret-path', tier: 'tool-builder' });
    const gatewayArgs = args[args.findIndex(arg => arg.startsWith('mcp_servers.muju.args='))];
    expect(gatewayArgs).not.toContain('/tmp/g/secret-path');
    expect(args.join(' ')).not.toContain('--game-dir');
    expect(args.filter(arg => arg.includes('/tmp/g/secret-path'))).toEqual([expect.stringMatching(/^mcp_servers\.muju\.env=/)]);
  });
});

describe('gatewayCommand', () => {
  it('includes --game-dir by default (policy-check.ts, tests: not a player-readable surface)', async () => {
    const { gatewayCommand } = await import('../../tools/llm-pilot/players');
    const { args } = gatewayCommand('/tmp/g');
    expect(args).toEqual(expect.arrayContaining(['--game-dir', '/tmp/g']));
  });
  it('omits --game-dir when includeGameDirArg is false (real pilot games)', async () => {
    const { gatewayCommand } = await import('../../tools/llm-pilot/players');
    const { args } = gatewayCommand('/tmp/g', undefined, { includeGameDirArg: false });
    expect(args).not.toContain('--game-dir');
    expect(args.join(' ')).not.toContain('/tmp/g');
  });
});

describe('extractCitedRevisions ranges and lists', () => {
  it('reads "revisions 12, 14 and 19" and "rev 7"', async () => {
    const { extractCitedRevisions } = await import('../../tools/llm-pilot/players');
    expect(extractCitedRevisions('see revisions 12, 14 and 19; also rev 7')).toEqual([7, 12, 14, 19]);
  });
});

describe('parseTranscript', () => {
  it('claude: session id, apiKeySource, served model and final text', async () => {
    const { parseTranscript } = await import('../../tools/llm-pilot/players');
    const raw = [
      JSON.stringify({ type: 'system', subtype: 'init', session_id: 's1', apiKeySource: 'none' }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use' }] } }),
      JSON.stringify({ type: 'result', result: '# Reflection', usage: { input_tokens: 3, output_tokens: 4 }, modelUsage: { 'claude-sonnet-5': {} } }),
    ].join('\n');
    expect(parseTranscript('claude', raw)).toMatchObject({ sessionId: 's1', apiKeySource: 'none', reportedModels: ['claude-sonnet-5'], finalText: '# Reflection', toolCalls: 1 });
  });
  it('codex: thread id, last agent message, token totals', async () => {
    const { parseTranscript } = await import('../../tools/llm-pilot/players');
    const raw = [
      JSON.stringify({ type: 'thread.started', thread_id: 't1' }),
      JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'done' } }),
      JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 10, reasoning_output_tokens: 5 } }),
    ].join('\n');
    expect(parseTranscript('codex', raw)).toMatchObject({ sessionId: 't1', finalText: 'done', totals: { inputTokens: 10, reasoningOutputTokens: 5 } });
  });
});

describe('codexArgs gateway env', () => {
  it('passes the game and workspace dirs to the MCP gateway, which Codex does not inherit', async () => {
    const { codexArgs } = await import('../../tools/llm-pilot/players');
    const args = codexArgs({ prompt: 'p', model: 'gpt-6-luna', effort: 'low', cwd: '/tmp/ws', gameDir: '/g/P05-W', tier: 'centaur' });
    expect(args).toContain('mcp_servers.muju.env={MUJU_PILOT_GAME_DIR="/g/P05-W",MUJU_PILOT_WORKSPACE_DIR="/tmp/ws"}');
  });
});

describe('player prompt (wave 2 harness fixes)', () => {
  it('renders every var, states the per-turn cap from the room clock, and puts the brief after both clocks', async () => {
    const { mkdtempSync, readFileSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { clockVars, renderTemplate } = await import('../../tools/llm-pilot/players');
    const gameDir = mkdtempSync(join(tmpdir(), 'pilot-prompt-'));
    writeFileSync(join(gameDir, 'manifest.json'), JSON.stringify({ timeControl: { delaySeconds: 60, bankSeconds: 1800 } }));
    expect(clockVars(gameDir)).toEqual({ delaySeconds: '60', bankSeconds: '1800', bankTenthSeconds: '180', turnCapSeconds: '240' });
    const vars = { gameId: 'X01-W', roomId: 'abcdef', placeholderToken: 'PLACEHOLDER', seat: 'white', seatColor: 'White', handicap: '5',
      tier: 'centaur', model: 'gpt-6-luna', effort: 'low', brief: 'BRIEF-TEXT: press only with superior numbers.',
      ...clockVars(gameDir), engineIdentity: 'hard', snapshotVersion: '1' };
    for (const file of ['player.md', 'reflection.md']) {
      const text = renderTemplate(readFileSync(new URL(`../../tools/llm-pilot/prompts/${file}`, import.meta.url), 'utf8'), vars);
      expect(text).not.toMatch(/\{\{\w+\}\}/);
    }
    const prompt = renderTemplate(readFileSync(new URL('../../tools/llm-pilot/prompts/player.md', import.meta.url), 'utf8'), vars);
    expect(prompt).toContain('60 + 180 = 240 s');
    const at = (needle: string) => { const index = prompt.indexOf(needle); expect(index).toBeGreaterThanOrEqual(0); return index; };
    expect(at('**Order of priority.**')).toBeLessThan(at('**1. The wall clock'));
    expect(at('**1. The wall clock')).toBeLessThan(at('**2. The kill clock'));
    expect(at('**2. The kill clock')).toBeLessThan(at('BRIEF-TEXT'));
  });
});
