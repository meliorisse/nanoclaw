import { describe, it, expect } from 'vitest';

import { ASSISTANT_NAME, TRIGGER_PATTERN } from './config.js';
import {
  escapeXml,
  formatHistoryWithinBudget,
  formatMessages,
  formatMessagesWithinBudget,
  formatOutbound,
  stripInternalTags,
} from './router.js';
import { NewMessage } from './types.js';

function makeMsg(overrides: Partial<NewMessage> = {}): NewMessage {
  return {
    id: '1',
    chat_jid: 'group@g.us',
    sender: '123@s.whatsapp.net',
    sender_name: 'Alice',
    content: 'hello',
    timestamp: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// --- escapeXml ---

describe('escapeXml', () => {
  it('escapes ampersands', () => {
    expect(escapeXml('a & b')).toBe('a &amp; b');
  });

  it('escapes less-than', () => {
    expect(escapeXml('a < b')).toBe('a &lt; b');
  });

  it('escapes greater-than', () => {
    expect(escapeXml('a > b')).toBe('a &gt; b');
  });

  it('escapes double quotes', () => {
    expect(escapeXml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('handles multiple special characters together', () => {
    expect(escapeXml('a & b < c > d "e"')).toBe(
      'a &amp; b &lt; c &gt; d &quot;e&quot;',
    );
  });

  it('passes through strings with no special chars', () => {
    expect(escapeXml('hello world')).toBe('hello world');
  });

  it('handles empty string', () => {
    expect(escapeXml('')).toBe('');
  });
});

// --- formatMessages ---

describe('formatMessages', () => {
  const TZ = 'UTC';

  it('formats a single message as XML with context header', () => {
    const result = formatMessages([makeMsg()], TZ);
    expect(result).toContain('<context timezone="UTC" />');
    expect(result).toContain('<message sender="Alice"');
    expect(result).toContain('>hello</message>');
    expect(result).toContain('Jan 1, 2024');
  });

  it('formats multiple messages', () => {
    const msgs = [
      makeMsg({
        id: '1',
        sender_name: 'Alice',
        content: 'hi',
        timestamp: '2024-01-01T00:00:00.000Z',
      }),
      makeMsg({
        id: '2',
        sender_name: 'Bob',
        content: 'hey',
        timestamp: '2024-01-01T01:00:00.000Z',
      }),
    ];
    const result = formatMessages(msgs, TZ);
    expect(result).toContain('sender="Alice"');
    expect(result).toContain('sender="Bob"');
    expect(result).toContain('>hi</message>');
    expect(result).toContain('>hey</message>');
  });

  it('escapes special characters in sender names', () => {
    const result = formatMessages([makeMsg({ sender_name: 'A & B <Co>' })], TZ);
    expect(result).toContain('sender="A &amp; B &lt;Co&gt;"');
  });

  it('escapes special characters in content', () => {
    const result = formatMessages(
      [makeMsg({ content: '<script>alert("xss")</script>' })],
      TZ,
    );
    expect(result).toContain(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
  });

  it('handles empty array', () => {
    const result = formatMessages([], TZ);
    expect(result).toContain('<context timezone="UTC" />');
    expect(result).toContain('<messages>\n\n</messages>');
  });

  it('converts timestamps to local time for given timezone', () => {
    // 2024-01-01T18:30:00Z in America/New_York (EST) = 1:30 PM
    const result = formatMessages(
      [makeMsg({ timestamp: '2024-01-01T18:30:00.000Z' })],
      'America/New_York',
    );
    expect(result).toContain('1:30');
    expect(result).toContain('PM');
    expect(result).toContain('<context timezone="America/New_York" />');
  });

  it('drops oldest messages to stay within the given byte budget', () => {
    const messages = [
      makeMsg({ id: '1', content: 'old message '.repeat(120) }),
      makeMsg({ id: '2', content: 'new message that must remain visible' }),
    ];
    const full = formatMessages(messages, TZ);
    const budget = Buffer.byteLength(full, 'utf8') - 1200;

    const result = formatMessagesWithinBudget(messages, TZ, budget);

    expect(Buffer.byteLength(result.formatted, 'utf8')).toBeLessThanOrEqual(
      budget,
    );
    expect(result.formatted).not.toContain('old message');
    expect(result.formatted).toContain('new message that must remain visible');
    expect(result.omittedCount).toBe(1);
    expect(result.truncated).toBe(false);
  });

  it('truncates the newest message when a single message still exceeds the budget', () => {
    const message = makeMsg({ content: 'A'.repeat(4000) });
    const bare = formatMessages([{ ...message, content: '' }], TZ);
    const budget = Buffer.byteLength(bare, 'utf8') + 120;

    const result = formatMessagesWithinBudget([message], TZ, budget);

    expect(Buffer.byteLength(result.formatted, 'utf8')).toBeLessThanOrEqual(
      budget,
    );
    expect(result.formatted).toContain('[truncated]');
    expect(result.omittedCount).toBe(0);
    expect(result.truncated).toBe(true);
  });
});

describe('formatHistoryWithinBudget', () => {
  const TZ = 'UTC';
  const filler = ' routine background chatter'.repeat(30);

  it('keeps recent history plus a summary of omitted middle context', () => {
    const messages = [
      makeMsg({ id: '1', sender_name: 'Alice', content: 'Initial problem statement' }),
      makeMsg({ id: '2', sender_name: 'Bob', content: `Routine ack one${filler}` }),
      makeMsg({ id: '3', sender_name: 'Bob', content: `Routine ack two${filler}` }),
      makeMsg({ id: '4', sender_name: 'Alice', content: `Routine ack three${filler}` }),
      makeMsg({ id: '5', sender_name: 'Alice', content: 'Latest detail that must remain' }),
      makeMsg({ id: '6', sender_name: 'Bob', content: 'Latest answer that must remain' }),
    ];
    const full = formatMessages(messages, TZ);
    const budget = Buffer.byteLength(full, 'utf8') - 1200;

    const result = formatHistoryWithinBudget(messages, TZ, budget);

    expect(Buffer.byteLength(result.formatted, 'utf8')).toBeLessThanOrEqual(
      budget,
    );
    expect(result.formatted).toContain('Latest detail that must remain');
    expect(result.formatted).toContain('Latest answer that must remain');
    expect(result.formatted).toContain('Earlier context');
    expect(result.omittedCount).toBeGreaterThan(0);
    expect(result.truncated).toBe(true);
  });

  it('retains an important middle error report instead of dropping only from the front', () => {
    const messages = [
      makeMsg({ id: '1', sender_name: 'Alice', content: 'Opening context' }),
      makeMsg({ id: '2', sender_name: 'Bob', content: `light chatter one${filler}` }),
      makeMsg({
        id: '3',
        sender_name: 'Alice',
        content:
          'Critical error report: launch failed with stack trace in /tmp/example.log',
      }),
      makeMsg({ id: '4', sender_name: 'Bob', content: `light chatter two${filler}` }),
      makeMsg({ id: '5', sender_name: 'Bob', content: `light chatter three${filler}` }),
      makeMsg({ id: '6', sender_name: 'Bob', content: `light chatter four${filler}` }),
      makeMsg({ id: '7', sender_name: 'Bob', content: `light chatter five${filler}` }),
      makeMsg({ id: '8', sender_name: 'Alice', content: 'Newest request' }),
      makeMsg({ id: '9', sender_name: 'Bob', content: 'Newest acknowledgement' }),
    ];
    const full = formatMessages(messages, TZ);
    const budget = Buffer.byteLength(full, 'utf8') - 2200;

    const naive = formatMessagesWithinBudget(messages, TZ, budget);
    const compacted = formatHistoryWithinBudget(messages, TZ, budget);

    expect(naive.formatted).not.toContain('Critical error report');
    expect(compacted.formatted).toContain('Critical error report');
    expect(compacted.formatted).toContain('<history_compaction');
  });
});

// --- TRIGGER_PATTERN ---

describe('TRIGGER_PATTERN', () => {
  const name = ASSISTANT_NAME;
  const lower = name.toLowerCase();
  const upper = name.toUpperCase();

  it('matches @name at start of message', () => {
    expect(TRIGGER_PATTERN.test(`@${name} hello`)).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(TRIGGER_PATTERN.test(`@${lower} hello`)).toBe(true);
    expect(TRIGGER_PATTERN.test(`@${upper} hello`)).toBe(true);
  });

  it('does not match when not at start of message', () => {
    expect(TRIGGER_PATTERN.test(`hello @${name}`)).toBe(false);
  });

  it('does not match partial name like @NameExtra (word boundary)', () => {
    expect(TRIGGER_PATTERN.test(`@${name}extra hello`)).toBe(false);
  });

  it('matches with word boundary before apostrophe', () => {
    expect(TRIGGER_PATTERN.test(`@${name}'s thing`)).toBe(true);
  });

  it('matches @name alone (end of string is a word boundary)', () => {
    expect(TRIGGER_PATTERN.test(`@${name}`)).toBe(true);
  });

  it('matches with leading whitespace after trim', () => {
    // The actual usage trims before testing: TRIGGER_PATTERN.test(m.content.trim())
    expect(TRIGGER_PATTERN.test(`@${name} hey`.trim())).toBe(true);
  });
});

// --- Outbound formatting (internal tag stripping + prefix) ---

describe('stripInternalTags', () => {
  it('strips single-line internal tags', () => {
    expect(stripInternalTags('hello <internal>secret</internal> world')).toBe(
      'hello  world',
    );
  });

  it('strips multi-line internal tags', () => {
    expect(
      stripInternalTags('hello <internal>\nsecret\nstuff\n</internal> world'),
    ).toBe('hello  world');
  });

  it('strips multiple internal tag blocks', () => {
    expect(
      stripInternalTags('<internal>a</internal>hello<internal>b</internal>'),
    ).toBe('hello');
  });

  it('returns empty string when text is only internal tags', () => {
    expect(stripInternalTags('<internal>only this</internal>')).toBe('');
  });
});

describe('formatOutbound', () => {
  it('returns text with internal tags stripped', () => {
    expect(formatOutbound('hello world')).toBe('hello world');
  });

  it('returns empty string when all text is internal', () => {
    expect(formatOutbound('<internal>hidden</internal>')).toBe('');
  });

  it('strips internal tags from remaining text', () => {
    expect(
      formatOutbound('<internal>thinking</internal>The answer is 42'),
    ).toBe('The answer is 42');
  });
});

// --- Trigger gating with requiresTrigger flag ---

describe('trigger gating (requiresTrigger interaction)', () => {
  // Replicates the exact logic from processGroupMessages and startMessageLoop:
  //   if (!isMainGroup && group.requiresTrigger !== false) { check trigger }
  function shouldRequireTrigger(
    isMainGroup: boolean,
    requiresTrigger: boolean | undefined,
  ): boolean {
    return !isMainGroup && requiresTrigger !== false;
  }

  function shouldProcess(
    isMainGroup: boolean,
    requiresTrigger: boolean | undefined,
    messages: NewMessage[],
  ): boolean {
    if (!shouldRequireTrigger(isMainGroup, requiresTrigger)) return true;
    return messages.some((m) => TRIGGER_PATTERN.test(m.content.trim()));
  }

  it('main group always processes (no trigger needed)', () => {
    const msgs = [makeMsg({ content: 'hello no trigger' })];
    expect(shouldProcess(true, undefined, msgs)).toBe(true);
  });

  it('main group processes even with requiresTrigger=true', () => {
    const msgs = [makeMsg({ content: 'hello no trigger' })];
    expect(shouldProcess(true, true, msgs)).toBe(true);
  });

  it('non-main group with requiresTrigger=undefined requires trigger (defaults to true)', () => {
    const msgs = [makeMsg({ content: 'hello no trigger' })];
    expect(shouldProcess(false, undefined, msgs)).toBe(false);
  });

  it('non-main group with requiresTrigger=true requires trigger', () => {
    const msgs = [makeMsg({ content: 'hello no trigger' })];
    expect(shouldProcess(false, true, msgs)).toBe(false);
  });

  it('non-main group with requiresTrigger=true processes when trigger present', () => {
    const msgs = [makeMsg({ content: `@${ASSISTANT_NAME} do something` })];
    expect(shouldProcess(false, true, msgs)).toBe(true);
  });

  it('non-main group with requiresTrigger=false always processes (no trigger needed)', () => {
    const msgs = [makeMsg({ content: 'hello no trigger' })];
    expect(shouldProcess(false, false, msgs)).toBe(true);
  });
});
