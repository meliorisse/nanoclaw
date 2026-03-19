/**
 * Credential proxy for container isolation.
 * Containers connect here instead of directly to the Anthropic API.
 * The proxy injects real credentials so containers never see them.
 *
 * Two auth modes:
 *   API key:  Proxy injects x-api-key on every request.
 *   OAuth:    Container CLI exchanges its placeholder token for a temp
 *             API key via /api/oauth/claude_cli/create_api_key.
 *             Proxy injects real OAuth token on that exchange request;
 *             subsequent requests carry the temp key which is valid as-is.
 */
import { createServer, Server } from 'http';
import { request as httpsRequest } from 'https';
import { request as httpRequest, RequestOptions } from 'http';

import { readEnvFile } from './env.js';
import { logger } from './logger.js';

const MAX_OUTPUT_TOKENS = 4000;
// LM Studio is now configured for a 65,536-token context window. Keep a
// meaningful reserve for output tokens and estimator drift instead of trying to
// consume the full ceiling.
const LOCAL_MODEL_INPUT_TOKEN_LIMIT = 48_000;

function estimateLocalModelInputTokens(body: Record<string, unknown>): number {
  // Conservative heuristic for Anthropic-style payloads headed to LM Studio.
  // Tool schemas and escaped XML-like prompts tokenize denser than plain
  // English, but using 3 chars/token turned out to reject workable requests
  // once the scheduled-task tool surface was slimmed down. 3.6 keeps a
  // meaningful safety margin while still allowing prompts that fit 32k models.
  return Math.ceil(JSON.stringify(body).length / 3.6);
}
import { handleAnthropicTranslation } from './anthropic-openai-translator.js';

function estimateSectionBytes(value: unknown): number {
  if (value === undefined) return 0;
  if (typeof value === 'string') return Buffer.byteLength(value, 'utf8');
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

export type AuthMode = 'api-key' | 'oauth';

export interface ProxyConfig {
  authMode: AuthMode;
}

export function startCredentialProxy(
  port: number,
  host = '127.0.0.1',
): Promise<Server> {
  const secrets = readEnvFile([
    'ANTHROPIC_API_KEY',
    'CLAUDE_CODE_OAUTH_TOKEN',
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_BASE_URL',
    'LOCAL_MODEL',
  ]);

  const authMode: AuthMode = secrets.ANTHROPIC_API_KEY ? 'api-key' : 'oauth';
  const oauthToken =
    secrets.CLAUDE_CODE_OAUTH_TOKEN || secrets.ANTHROPIC_AUTH_TOKEN;

  const upstreamUrl = new URL(
    secrets.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
  );
  const isHttps = upstreamUrl.protocol === 'https:';
  const makeRequest = isHttps ? httpsRequest : httpRequest;

  // When the upstream is a local model (e.g. LM Studio), activate the
  // Anthropic ↔ OpenAI translator so the claude binary and LM Studio
  // can understand each other's API formats (tool calls, messages, SSE).
  const isLocalModel =
    upstreamUrl.hostname === 'localhost' ||
    upstreamUrl.hostname === '127.0.0.1' ||
    !upstreamUrl.hostname.includes('anthropic.com');
  const localModel = secrets.LOCAL_MODEL || 'local-model';

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks);
        const headers: Record<string, string | number | string[] | undefined> =
          {
            ...(req.headers as Record<string, string>),
            host: upstreamUrl.host,
            'content-length': body.length,
          };

        // Strip hop-by-hop headers that must not be forwarded by proxies
        delete headers['connection'];
        delete headers['keep-alive'];
        delete headers['transfer-encoding'];

        if (authMode === 'api-key') {
          delete headers['x-api-key'];
          headers['x-api-key'] = secrets.ANTHROPIC_API_KEY;
        } else {
          if (headers['authorization']) {
            delete headers['authorization'];
            if (oauthToken) headers['authorization'] = `Bearer ${oauthToken}`;
          }
        }

        // For local models: LM Studio handles /v1/messages natively (Anthropic API compat).
        // We just patch max_tokens so the claude binary's default 32000 doesn't overflow
        // a 32k context window when combined with a large prompt.
        let forwardBody = body;
        if (isLocalModel && req.url?.includes('/messages')) {
          try {
            const parsed = JSON.parse(body.toString()) as Record<
              string,
              unknown
            >;
            if (
              typeof parsed.max_tokens === 'number' &&
              parsed.max_tokens > MAX_OUTPUT_TOKENS
            ) {
              parsed.max_tokens = MAX_OUTPUT_TOKENS;
            }

            const estimatedInputTokens = estimateLocalModelInputTokens(parsed);
            if (estimatedInputTokens > LOCAL_MODEL_INPUT_TOKEN_LIMIT) {
              logger.warn(
                {
                  url: req.url,
                  estimatedInputTokens,
                  limit: LOCAL_MODEL_INPUT_TOKEN_LIMIT,
                  bodyBytes: Buffer.byteLength(JSON.stringify(parsed), 'utf8'),
                  messageCount: Array.isArray(parsed.messages)
                    ? parsed.messages.length
                    : 0,
                  toolsCount: Array.isArray(parsed.tools)
                    ? parsed.tools.length
                    : 0,
                  toolNames: Array.isArray(parsed.tools)
                    ? parsed.tools
                        .map((tool) =>
                          typeof tool === 'object' &&
                          tool !== null &&
                          'name' in tool &&
                          typeof tool.name === 'string'
                            ? tool.name
                            : 'unknown',
                        )
                        .slice(0, 40)
                    : [],
                  systemBytes: estimateSectionBytes(parsed.system),
                  messagesBytes: estimateSectionBytes(parsed.messages),
                  toolsBytes: estimateSectionBytes(parsed.tools),
                },
                'Rejected oversized local-model request before forwarding to LM Studio',
              );
              res.writeHead(400, { 'content-type': 'application/json' });
              res.end(
                JSON.stringify({
                  type: 'error',
                  error: {
                    type: 'invalid_request_error',
                    message:
                      'Prompt exceeds the safe local-model context budget before reaching LM Studio. Reduce preserved history or task context and try again.',
                  },
                }),
              );
              return;
            }

            const patched = JSON.stringify(parsed);
            forwardBody = Buffer.from(patched);
            headers['content-length'] = forwardBody.length;
          } catch {
            // Non-JSON body — forward unchanged
          }
        }

        const upstream = makeRequest(
          {
            hostname: upstreamUrl.hostname,
            port: upstreamUrl.port || (isHttps ? 443 : 80),
            path: req.url,
            method: req.method,
            headers,
            // For local models, cap time waiting for a response to 10 minutes.
            // LM Studio can stall indefinitely on large contexts.
            ...(isLocalModel ? { timeout: 10 * 60 * 1000 } : {}),
          } as RequestOptions,
          (upRes) => {
            res.writeHead(upRes.statusCode!, upRes.headers);
            upRes.pipe(res);
          },
        );

        // Timeout fires if LM Studio stalls before sending any response bytes
        upstream.on('timeout', () => {
          logger.warn(
            { url: req.url },
            'Local model request timed out after 10 minutes',
          );
          upstream.destroy();
          if (!res.headersSent) {
            res.writeHead(504, { 'content-type': 'application/json' });
            res.end(
              JSON.stringify({
                type: 'error',
                error: {
                  type: 'overloaded_error',
                  message: 'Local model request timed out',
                },
              }),
            );
          }
        });

        upstream.on('error', (err) => {
          logger.error(
            { err, url: req.url },
            'Credential proxy upstream error',
          );
          if (!res.headersSent) {
            res.writeHead(502);
            res.end('Bad Gateway');
          }
        });

        upstream.write(forwardBody);

        upstream.end();
      });
    });

    server.listen(port, host, () => {
      logger.info({ port, host, authMode }, 'Credential proxy started');
      resolve(server);
    });

    server.on('error', reject);
  });
}

/** Detect which auth mode the host is configured for. */
export function detectAuthMode(): AuthMode {
  const secrets = readEnvFile(['ANTHROPIC_API_KEY']);
  return secrets.ANTHROPIC_API_KEY ? 'api-key' : 'oauth';
}
