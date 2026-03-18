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
    return { formatted: headerOnly, omittedCount: messages.length, truncated: false };
  }

  const working = [...messages];
  let formatted = formatMessages(working, timezone);
  let omittedCount = 0;
  let truncated = false;

  while (working.length > 1 && Buffer.byteLength(formatted, 'utf8') > maxBytes) {
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
