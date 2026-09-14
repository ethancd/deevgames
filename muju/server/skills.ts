import { readFile } from 'node:fs/promises';

/** Source files in development/stdio; Vite's copied assets in the production image. */
export async function readTimeAwarenessSkill(proposal = false): Promise<string> {
  const path = `skills/muju-time-awareness/${proposal ? 'references/staged-play.md' : 'SKILL.md'}`;
  try { return await readFile(new URL(`../public/${path}`, import.meta.url), 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return readFile(new URL(`../dist/${path}`, import.meta.url), 'utf8');
  }
}
