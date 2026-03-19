import { Channel, NewMessage } from './types.js';
import { formatLocalTime } from './timezone.js';

const TRUNCATION_MARKER = ' [truncated]';

export function escapeXml(s: string): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatMessages(
  messages: NewMessage[],
  timezone: string,
): string {
  const lines = messages.map((m) => {
    const displayTime = formatLocalTime(m.timestamp, timezone);
    return `<message sender="${escapeXml(m.sender_name)}" time="${escapeXml(displayTime)}">${escapeXml(m.content)}</message>`;
  });

  const header = `<context timezone="${escapeXml(timezone)}" />\n`;

  return `${header}<messages>\n${lines.join('\n')}\n</messages>`;
}

function truncateUtf8(text: string, maxBytes: number): string {
  if (maxBytes <= 0) return '';
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return text;
  if (Buffer.byteLength(TRUNCATION_MARKER, 'utf8') >= maxBytes) {
    return '';
  }

  let end = text.length;
  while (end > 0) {
    const candidate = `${text.slice(0, end)}${TRUNCATION_MARKER}`;
    if (Buffer.byteLength(candidate, 'utf8') <= maxBytes) {
      return candidate;
    }
    end -= 1;
  }

  return '';
}

export function formatMessagesWithinBudget(
  messages: NewMessage[],
  timezone: string,
  maxBytes: number,
): { formatted: string; omittedCount: number; truncated: boolean } {
  const headerOnly = formatMessages([], timezone);
  if (Buffer.byteLength(headerOnly, 'utf8') > maxBytes) {
    return {
      formatted: headerOnly,
      omittedCount: messages.length,
      truncated: false,
    };
  }

  const working = [...messages];
  let formatted = formatMessages(working, timezone);
  let omittedCount = 0;
  let truncated = false;

  while (
    working.length > 1 &&
    Buffer.byteLength(formatted, 'utf8') > maxBytes
  ) {
    working.shift();
    omittedCount += 1;
    formatted = formatMessages(working, timezone);
  }

  if (working.length === 1 && Buffer.byteLength(formatted, 'utf8') > maxBytes) {
    const [lastMessage] = working;
    const emptyFormatted = formatMessages(
      [{ ...lastMessage, content: '' }],
      timezone,
    );
    const baseBytes = Buffer.byteLength(emptyFormatted, 'utf8');
    const contentBudget = Math.max(0, maxBytes - baseBytes);
    const trimmedContent = truncateUtf8(lastMessage.content, contentBudget);
    working[0] = { ...lastMessage, content: trimmedContent };
    truncated = trimmedContent !== lastMessage.content;
    formatted = formatMessages(working, timezone);
  }

  return { formatted, omittedCount, truncated };
}

interface FormattedHistoryResult {
  formatted: string;
  omittedCount: number;
  truncated: boolean;
}

const HISTORY_TAIL_MESSAGE_COUNT = 4;

function formatMessageLine(message: NewMessage, timezone: string): string {
  const displayTime = formatLocalTime(message.timestamp, timezone);
  return `<message sender="${escapeXml(message.sender_name)}" time="${escapeXml(displayTime)}">${escapeXml(message.content)}</message>`;
}

function buildHistorySummaryLines(
  omitted: NewMessage[],
  maxLines: number,
): string[] {
  if (omitted.length === 0 || maxLines <= 0) return [];

  const buckets: Array<{
    senders: Set<string>;
    snippets: string[];
  }> = [];

  let current:
    | {
        senders: Set<string>;
        snippets: string[];
      }
    | undefined;

  for (const message of omitted) {
    if (!current) {
      current = { senders: new Set(), snippets: [] };
      buckets.push(current);
    }

    current.senders.add(message.sender_name || message.sender || 'Unknown');
    const snippet = summarizeHistorySnippet(message.content);
    if (snippet && current.snippets.length < 2) {
      current.snippets.push(snippet);
    }

    if (current.snippets.length >= 2 && buckets.length < maxLines) {
      current = undefined;
    }
  }

  return buckets.slice(0, maxLines).map((bucket, index) => {
    const senderList = Array.from(bucket.senders).slice(0, 3).join(', ');
    const snippetList =
      bucket.snippets.length > 0
        ? `Key snippets: ${bucket.snippets.join(' | ')}`
        : 'Routine back-and-forth omitted.';
    return `Earlier context ${index + 1}: ${senderList}. ${snippetList}`;
  });
}

function summarizeHistorySnippet(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';

  const codeFenceIndex = normalized.indexOf('```');
  const source =
    codeFenceIndex >= 0 ? normalized.slice(0, codeFenceIndex).trim() : normalized;
  const summary = source.length > 120 ? `${source.slice(0, 117)}...` : source;
  return summary;
}

function buildHistorySummaryXml(
  omitted: NewMessage[],
  maxLines: number,
): string {
  if (omitted.length === 0) return '';

  const lines = buildHistorySummaryLines(omitted, maxLines);
  const detail =
    lines.length > 0
      ? lines.map((line) => `  <note>${escapeXml(line)}</note>`).join('\n')
      : '  <note>Earlier context omitted to fit the local-model budget.</note>';

  return `<history_compaction omitted_messages="${omitted.length}">\n${detail}\n</history_compaction>\n`;
}

function scoreHistoryMessage(message: NewMessage, index: number): number {
  const text = message.content || '';
  let score = index / 1000;

  if (message.is_from_me) score += 4;
  if (message.is_bot_message) score += 4;
  if (text.includes('```')) score += 5;
  if (/(error|failed|exception|trace|stack|bug|fix|launch|prompt|result)/i.test(text)) {
    score += 4;
  }
  if (/[/?]/.test(text)) score += 2;
  if (/[~/][A-Za-z0-9._/-]+/.test(text) || /\.[A-Za-z0-9]{2,6}\b/.test(text)) {
    score += 2;
  }
  if (text.length > 80) score += 1;

  return score;
}

function buildHistoryWindow(
  messages: NewMessage[],
  selectedIndices: Set<number>,
  timezone: string,
  summaryLines: number,
): FormattedHistoryResult {
  const selected = messages.filter((_, index) => selectedIndices.has(index));
  const omitted = messages.filter((_, index) => !selectedIndices.has(index));
  const summary = buildHistorySummaryXml(omitted, summaryLines);
  const messageLines = selected
    .map((message) => formatMessageLine(message, timezone))
    .join('\n');
  const formatted = `<context timezone="${escapeXml(timezone)}" />\n${summary}<messages>\n${messageLines}\n</messages>`;

  return {
    formatted,
    omittedCount: omitted.length,
    truncated: omitted.length > 0,
  };
}

export function formatHistoryWithinBudget(
  messages: NewMessage[],
  timezone: string,
  maxBytes: number,
): FormattedHistoryResult {
  const full = formatMessages(messages, timezone);
  if (Buffer.byteLength(full, 'utf8') <= maxBytes) {
    return {
      formatted: full,
      omittedCount: 0,
      truncated: false,
    };
  }

  if (messages.length === 0) {
    return {
      formatted: full,
      omittedCount: 0,
      truncated: false,
    };
  }

  let headCount = messages.length > 0 ? 1 : 0;
  let tailCount = Math.min(HISTORY_TAIL_MESSAGE_COUNT, messages.length);
  let summaryLines = 3;
  let selectedIndices = new Set<number>();
  let result: FormattedHistoryResult;

  while (true) {
    selectedIndices = new Set<number>();
    for (let index = 0; index < headCount; index += 1) {
      selectedIndices.add(index);
    }
    const tailStart = Math.max(0, messages.length - tailCount);
    for (let index = tailStart; index < messages.length; index += 1) {
      selectedIndices.add(index);
    }

    result = buildHistoryWindow(messages, selectedIndices, timezone, summaryLines);

    while (
      summaryLines > 0 &&
      Buffer.byteLength(result.formatted, 'utf8') > maxBytes
    ) {
      summaryLines -= 1;
      result = buildHistoryWindow(
        messages,
        selectedIndices,
        timezone,
        summaryLines,
      );
    }

    if (Buffer.byteLength(result.formatted, 'utf8') <= maxBytes) {
      break;
    }

    if (tailCount > 1) {
      tailCount -= 1;
      summaryLines = 3;
      continue;
    }

    if (headCount > 0) {
      headCount -= 1;
      summaryLines = 3;
      continue;
    }

    break;
  }

  const candidates = messages
    .map((message, index) => ({
      index,
      score: scoreHistoryMessage(message, index),
    }))
    .filter(({ index }) => !selectedIndices.has(index))
    .sort((a, b) => b.score - a.score || b.index - a.index);

  for (const candidate of candidates) {
    selectedIndices.add(candidate.index);
    const expanded = buildHistoryWindow(
      messages,
      selectedIndices,
      timezone,
      summaryLines,
    );
    if (Buffer.byteLength(expanded.formatted, 'utf8') <= maxBytes) {
      result = expanded;
    } else {
      selectedIndices.delete(candidate.index);
    }
  }

  if (Buffer.byteLength(result.formatted, 'utf8') <= maxBytes) {
    return result;
  }

  const latestOnly = formatMessagesWithinBudget(
    [messages[messages.length - 1]],
    timezone,
    maxBytes,
  );

  return latestOnly;
}

export function stripInternalTags(text: string): string {
  return text.replace(/<internal>[\s\S]*?<\/internal>/g, '').trim();
}

export function formatOutbound(rawText: string): string {
  const text = stripInternalTags(rawText);
  if (!text) return '';
  return text;
}

export function routeOutbound(
  channels: Channel[],
  jid: string,
  text: string,
): Promise<void> {
  const channel = channels.find((c) => c.ownsJid(jid) && c.isConnected());
  if (!channel) throw new Error(`No channel for JID: ${jid}`);
  return channel.sendMessage(jid, text);
}

export function findChannel(
  channels: Channel[],
  jid: string,
): Channel | undefined {
  return channels.find((c) => c.ownsJid(jid));
}
