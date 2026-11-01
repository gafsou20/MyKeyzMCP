import { readFileSync } from 'node:fs';

/** Version du serveur (package.json), affichée par /health et annoncée aux clients MCP. */
export const VERSION: string = (() => {
  try {
    const p = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version?: string };
    return p.version ?? '0.0.0';
  }
  catch { return '0.0.0'; }
})();
