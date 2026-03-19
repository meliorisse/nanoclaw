import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';

import { ANTIGRAVITY_ENABLED, ANTIGRAVITY_OVERSEER_DIR } from './config.js';
import { logger } from './logger.js';

export interface AntigravityBridgeSidecar {
  stop(): Promise<void>;
}

function bridgeEntryPath(): string {
  return path.join(ANTIGRAVITY_OVERSEER_DIR, 'src', 'bridge', 'server.ts');
}

function pipeLogs(child: ChildProcess, label: string): void {
  child.stdout?.on('data', (chunk) => {
    const text = String(chunk).trim();
    if (text) {
      logger.debug({ bridge: label, output: text }, 'Antigravity bridge stdout');
    }
  });

  child.stderr?.on('data', (chunk) => {
    const text = String(chunk).trim();
    if (text) {
      logger.warn({ bridge: label, output: text }, 'Antigravity bridge stderr');
    }
  });
}

export function startAntigravityBridgeSidecar(): AntigravityBridgeSidecar {
  if (!ANTIGRAVITY_ENABLED) {
    return {
      async stop() {},
    };
  }

  const entry = bridgeEntryPath();
  if (!fs.existsSync(entry)) {
    logger.warn({ entry }, 'Antigravity bridge entry not found; bridge sidecar disabled');
    return {
      async stop() {},
    };
  }

  const child = spawn(
    process.execPath,
    ['--experimental-strip-types', entry],
    {
      cwd: ANTIGRAVITY_OVERSEER_DIR,
      env: {
        ...process.env,
        OVERSEER_EXTENSION_BRIDGE_ENABLED: 'true',
        OVERSEER_LEGACY_UI_ENABLED: 'false',
        NODE_NO_WARNINGS: process.env.NODE_NO_WARNINGS || '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  pipeLogs(child, 'vendor-overseer');

  child.on('exit', (code, signal) => {
    logger.info(
      { code, signal },
      'Antigravity bridge sidecar exited',
    );
  });

  logger.info({ entry }, 'Started Antigravity bridge sidecar');

  return {
    async stop() {
      if (child.killed || child.exitCode !== null) {
        return;
      }

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          child.kill('SIGKILL');
          resolve();
        }, 3_000);

        child.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });

        child.kill('SIGTERM');
      });
    },
  };
}
