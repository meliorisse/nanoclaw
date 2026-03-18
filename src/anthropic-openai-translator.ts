/**
 * Anthropic ↔ OpenAI API translator for the credential proxy.
 *
 * When nanoclaw is configured to use a local LM Studio endpoint, the
 * claude-agent-sdk sends requests in Anthropic Messages API format but
 * LM Studio speaks OpenAI Chat Completions API format.  This module
 * translates both directions — request bodies and streaming SSE responses —
 * so the claude binary and LM Studio can understand each other.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { request as httpRequest, RequestOptions } from 'http';
import { request as httpsRequest } from 'https';

// ─── Request translation (Anthropic → OpenAI) ─────────────────────────────

type AnthropicMessage = {
  role: string;
  content: string | AnthropicContent[];
};

type AnthropicContent = {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string | AnthropicContent[];
};

type AnthropicTool = {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
};

type AnthropicRequest = {
  model: string;
  max_tokens?: number;
  system?: string | { type: string; text: string }[];
  messages: AnthropicMessage[];
  tools?: AnthropicTool[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  stop_sequences?: string[];
};

function anthropicMessageToOpenAI(msg: AnthropicMessage): object[] {
  const role = msg.role === 'user' ? 'user' : 'assistant';
  const content = msg.content;

  if (typeof content === 'string') {
    return [{ role, content }];
  }

  const out: object[] = [];
  let textParts: string[] = [];
  const toolCalls: object[] = [];
  const toolResults: object[] = [];

  for (const block of content) {
    if (block.type === 'text' && block.text) {
      textParts.push(block.text);
    } else if (block.type === 'tool_use' && block.id && block.name) {
      toolCalls.push({
        id: block.id,
        type: 'function',
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input ?? {}),
        },
      });
    } else if (block.type === 'tool_result') {
      const resultContent =
        typeof block.content === 'string'
          ? block.content
          : Array.isArray(block.content)
            ? block.content
                .filter((b: AnthropicContent) => b.type === 'text')
                .map((b: AnthropicContent) => b.text)
                .join('\n')
            : '';
      toolResults.push({
        role: 'tool',
        tool_call_id: block.tool_use_id,
        content: resultContent,
      });
    }
  }

  const text = textParts.join('');
  if (toolCalls.length > 0) {
    out.push({
      role: 'assistant',
      content: text || null,
      tool_calls: toolCalls,
    });
  } else if (toolResults.length > 0) {
    out.push(...toolResults);
  } else {
    out.push({ role, content: text });
  }

  return out;
}

function translateRequestToOpenAI(
  body: AnthropicRequest,
  localModel: string,
): Record<string, unknown> {
  const messages: object[] = [];

  // Flatten system prompt into first system message
  if (body.system) {
    const systemText =
      typeof body.system === 'string'
        ? body.system
        : body.system
            .filter((b) => b.type === 'text')
            .map((b) => b.text)
            .join('\n');
    if (systemText) messages.push({ role: 'system', content: systemText });
  }

  for (const msg of body.messages) {
    messages.push(...anthropicMessageToOpenAI(msg));
  }

  const openAIBody: Record<string, unknown> = {
    model: localModel,
    messages,
    max_tokens: Math.min(body.max_tokens ?? 4096, 4096),
    stream: body.stream ?? false,
  };

  if (body.temperature !== undefined) openAIBody.temperature = body.temperature;
  if (body.top_p !== undefined) openAIBody.top_p = body.top_p;
  if (body.stop_sequences?.length) openAIBody.stop = body.stop_sequences;

  if (body.tools?.length) {
    openAIBody.tools = body.tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description ?? '',
        parameters: t.input_schema,
      },
    }));
    openAIBody.tool_choice = 'auto';
  }

  return openAIBody;
}

// ─── Response translation (OpenAI → Anthropic) ────────────────────────────

function makeMsgId(): string {
  return 'msg_' + Math.random().toString(36).slice(2, 18);
}

/**
 * Convert a non-streaming OpenAI response to Anthropic Messages format.
 */
function translateResponseToAnthropic(
  oaResp: Record<string, unknown>,
  model: string,
): Record<string, unknown> {
  const choice = (oaResp.choices as Record<string, unknown>[])?.[0] ?? {};
  const message = (choice.message ?? {}) as Record<string, unknown>;
  const content: object[] = [];
  const stopReason =
    choice.finish_reason === 'tool_calls'
      ? 'tool_use'
      : choice.finish_reason === 'length'
        ? 'max_tokens'
        : 'end_turn';

  const text = message.content as string | null;
  if (text) content.push({ type: 'text', text });

  const toolCalls = message.tool_calls as
    | { id: string; function: { name: string; arguments: string } }[]
    | undefined;
  if (toolCalls?.length) {
    for (const tc of toolCalls) {
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(tc.function.arguments);
      } catch {}
      content.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input });
    }
  }

  const usage = oaResp.usage as Record<string, number> | undefined;

  return {
    id: makeMsgId(),
    type: 'message',
    role: 'assistant',
    model,
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: usage?.prompt_tokens ?? 0,
      output_tokens: usage?.completion_tokens ?? 0,
    },
  };
}

// ─── Streaming SSE translation ─────────────────────────────────────────────

/**
 * Transform a stream of OpenAI SSE chunks into Anthropic SSE format.
 * We buffer tool call argument fragments until they're complete.
 */
function createSseTransformer(inputTokensHint: number) {
  const msgId = makeMsgId();
  let headerSent = false;
  let textBlockOpen = false;
  let toolBlockIndex = 0;
  const toolCallBuffers: Map<
    number,
    { id: string; name: string; args: string }
  > = new Map();

  function emit(eventName: string, data: unknown): string {
    return `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  }

  function processChunk(line: string): string {
    if (!line.startsWith('data: ')) return '';
    const raw = line.slice(6);
    if (raw === '[DONE]') {
      let out = '';
      // Close any open tool call blocks
      for (const [idx] of toolCallBuffers) {
        const tc = toolCallBuffers.get(idx)!;
        let input: Record<string, unknown> = {};
        try { input = JSON.parse(tc.args); } catch {}
        // We already emitted the block_start, now emit the complete input delta and stop
        out += emit('content_block_delta', {
          type: 'content_block_delta',
          index: idx,
          delta: { type: 'input_json_delta', partial_json: tc.args },
        });
        out += emit('content_block_stop', { type: 'content_block_stop', index: idx });
      }
      toolCallBuffers.clear();
      if (textBlockOpen) {
        out += emit('content_block_stop', { type: 'content_block_stop', index: 0 });
        textBlockOpen = false;
      }
      out += emit('message_delta', {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 0 },
      });
      out += emit('message_stop', { type: 'message_stop' });
      return out;
    }

    let chunk: Record<string, unknown>;
    try { chunk = JSON.parse(raw); } catch { return ''; }

    const choices = chunk.choices as Record<string, unknown>[] | undefined;
    if (!choices?.length) return '';
    const delta = choices[0].delta as Record<string, unknown> | undefined;
    if (!delta) return '';

    let out = '';

    // Send header once
    if (!headerSent) {
      headerSent = true;
      out += emit('message_start', {
        type: 'message_start',
        message: {
          id: msgId,
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'claude-3-5-sonnet-20241022',
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: inputTokensHint, output_tokens: 1 },
        },
      });
      out += emit('ping', { type: 'ping' });
    }

    // Text content
    const textDelta = delta.content as string | null | undefined;
    if (typeof textDelta === 'string' && textDelta !== '') {
      if (!textBlockOpen) {
        out += emit('content_block_start', {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' },
        });
        textBlockOpen = true;
      }
      out += emit('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: textDelta },
      });
    }

    // Tool calls
    const toolCalls = delta.tool_calls as
      | { index: number; id?: string; function?: { name?: string; arguments?: string } }[]
      | undefined;

    if (toolCalls?.length) {
      for (const tc of toolCalls) {
        const idx = tc.index + 1; // index 0 reserved for text block
        if (tc.id && tc.function?.name) {
          // New tool call block starting
          toolCallBuffers.set(idx, { id: tc.id, name: tc.function.name, args: '' });
          out += emit('content_block_start', {
            type: 'content_block_start',
            index: idx,
            content_block: {
              type: 'tool_use',
              id: tc.id,
              name: tc.function.name,
              input: {},
            },
          });
          toolBlockIndex = idx;
        }
        if (tc.function?.arguments) {
          const buf = toolCallBuffers.get(idx) ?? { id: '', name: '', args: '' };
          buf.args += tc.function.arguments;
          toolCallBuffers.set(idx, buf);
          // Don't emit partial_json here — we emit it all at [DONE]
          // because Anthropic expects the full JSON in individual deltas
          // and partial emission confuses the SDK
        }
      }
    }

    const finishReason = choices[0].finish_reason as string | null;
    if (finishReason === 'tool_calls') {
      // Will be closed at [DONE]
    } else if (finishReason && finishReason !== 'stop' && !toolCalls?.length) {
      if (textBlockOpen) {
        out += emit('content_block_stop', { type: 'content_block_stop', index: 0 });
        textBlockOpen = false;
      }
    }

    return out;
  }

  return { processChunk };
}

// ─── Main translation handler ──────────────────────────────────────────────

export function handleAnthropicTranslation(
  req: IncomingMessage,
  res: ServerResponse,
  body: Buffer,
  upstreamUrl: URL,
  authHeaders: Record<string, string | number | string[] | undefined>,
  localModel: string,
): void {
  const isHttps = upstreamUrl.protocol === 'https:';
  const makeRequest = isHttps ? httpsRequest : httpRequest;

  let parsed: AnthropicRequest;
  try {
    parsed = JSON.parse(body.toString()) as AnthropicRequest;
  } catch {
    res.writeHead(400);
    res.end('Bad JSON');
    return;
  }

  const openAIBody = translateRequestToOpenAI(parsed, localModel);
  const openAIJson = Buffer.from(JSON.stringify(openAIBody));

  const outHeaders: Record<string, string | number | string[] | undefined> = {
    ...authHeaders,
    'content-type': 'application/json',
    'content-length': openAIJson.length,
    host: upstreamUrl.host,
  };
  delete outHeaders['anthropic-version'];
  delete outHeaders['anthropic-beta'];
  delete outHeaders['x-api-key'];
  // LM Studio uses OpenAI auth — keep Authorization if present, or add none
  if (!outHeaders['authorization']) {
    outHeaders['authorization'] = 'Bearer lm-studio';
  }

  const options: RequestOptions = {
    hostname: upstreamUrl.hostname,
    port: upstreamUrl.port || (isHttps ? 443 : 80),
    path: '/v1/chat/completions',
    method: 'POST',
    headers: outHeaders,
  };

  const upstream = makeRequest(options, (upRes) => {
    if (parsed.stream) {
      // Streaming: translate SSE on the fly
      const inputTokensHint = (parsed.messages?.length ?? 0) * 50;
      const transformer = createSseTransformer(inputTokensHint);

      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });

      let buffer = '';
      upRes.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            const translated = transformer.processChunk(trimmed);
            if (translated) res.write(translated);
          }
        }
      });
      upRes.on('end', () => {
        // Flush any remaining buffer
        if (buffer.trim()) {
          const translated = transformer.processChunk(buffer.trim());
          if (translated) res.write(translated);
        }
        // Ensure [DONE] is processed
        const done = transformer.processChunk('data: [DONE]');
        if (done) res.write(done);
        res.end();
      });
    } else {
      // Non-streaming: buffer and transform
      const chunks: Buffer[] = [];
      upRes.on('data', (chunk: Buffer) => chunks.push(chunk));
      upRes.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try {
          const oaResp = JSON.parse(raw) as Record<string, unknown>;
          if (oaResp.error) {
            // Forward error as-is with Anthropic error wrapper
            res.writeHead(upRes.statusCode ?? 500, { 'content-type': 'application/json' });
            res.end(JSON.stringify({
              type: 'error',
              error: { type: 'api_error', message: JSON.stringify(oaResp.error) },
            }));
            return;
          }
          const anthropicResp = translateResponseToAnthropic(oaResp, parsed.model);
          const out = JSON.stringify(anthropicResp);
          res.writeHead(200, { 'content-type': 'application/json', 'content-length': out.length });
          res.end(out);
        } catch {
          res.writeHead(upRes.statusCode ?? 500, { 'content-type': 'application/json' });
          res.end(raw);
        }
      });
    }
  });

  upstream.on('error', (err) => {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: err.message } }));
  });

  upstream.write(openAIJson);
  upstream.end();
}
