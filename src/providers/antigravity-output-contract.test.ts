import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
  buildLaunchContractInstruction,
  buildMessageContractInstruction,
  getThreadOutputContract,
  parseArtifactPayload,
} from './antigravity-output-contract.js';

describe('antigravity output contract', () => {
  it('parses a canonical artifact payload into preview messages', () => {
    const contract = getThreadOutputContract({
      externalRef: 'nanoclaw:debugging-agent-threads',
      metadataJson: null,
    });

    fs.mkdirSync(path.dirname(contract.jsonPath), { recursive: true });
    fs.writeFileSync(
      contract.jsonPath,
      JSON.stringify(
        {
          version: 1,
          updatedAt: '2026-03-19T03:30:00.000Z',
          status: 'complete',
          summary: 'Read test completed.',
          messages: [
            {
              role: 'user',
              text: 'if you can read this, reply "test49" and stop',
              createdAt: null,
            },
            {
              role: 'assistant',
              text: 'test49',
              createdAt: null,
            },
          ],
        },
        null,
        2,
      ),
      'utf8',
    );
    fs.writeFileSync(contract.markdownPath, 'test49\n', 'utf8');

    const artifact = parseArtifactPayload({
      externalRef: 'nanoclaw:debugging-agent-threads',
      metadataJson: null,
    });

    expect(artifact?.summary).toBe('Read test completed.');
    expect(artifact?.previewMessages.map((message) => message.text)).toEqual([
      'if you can read this, reply "test49" and stop',
      'test49',
    ]);
    expect(artifact?.evidence.map((item) => path.basename(item.path))).toEqual([
      'result.json',
      'result.md',
    ]);
  });

  it('builds launch instructions that reference canonical file paths', () => {
    const contract = getThreadOutputContract({
      externalRef: 'nanoclaw:launch-test',
      metadataJson: null,
    });

    const instruction = buildLaunchContractInstruction(contract);

    expect(instruction).toContain(contract.jsonPath);
    expect(instruction).toContain(contract.markdownPath);
    expect(instruction).toContain('"messages"');
    expect(instruction).toContain('must overwrite');
  });

  it('builds message instructions that keep the disk contract mandatory', () => {
    const contract = getThreadOutputContract({
      externalRef: 'nanoclaw:existing-thread',
      metadataJson: null,
    });

    const instruction = buildMessageContractInstruction(contract);

    expect(instruction).toContain(contract.jsonPath);
    expect(instruction).toContain(contract.markdownPath);
    expect(instruction).toContain('"messages"');
    expect(instruction).toContain('required');
  });
});
