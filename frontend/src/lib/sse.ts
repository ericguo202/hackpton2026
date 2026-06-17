/**
 * Minimal Server-Sent Events reader over a `fetch` Response body.
 *
 * The project has no streaming infra otherwise; this is just enough to consume
 * the Ask Tutor stream. Each SSE block is `event: <type>\ndata: <json>\n\n`.
 * We buffer partial chunks and split on the blank-line block separator, then
 * hand each parsed `{ type, data }` to `onEvent`.
 *
 * `data` is parsed as JSON when possible (the tutor stream always sends JSON),
 * otherwise passed through as the raw string.
 */

export interface SSEEvent {
  type: string;
  data: unknown;
}

function parseBlock(block: string): SSEEvent | null {
  let type = 'message';
  const dataLines: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      type = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''));
    }
    // Comment lines (starting with ':') and unknown fields are ignored.
  }
  if (dataLines.length === 0 && type === 'message') return null;
  const raw = dataLines.join('\n');
  let data: unknown = raw;
  try {
    data = JSON.parse(raw);
  } catch {
    // leave as raw string
  }
  return { type, data };
}

export async function readSSE(
  response: Response,
  onEvent: (event: SSEEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const body = response.body;
  if (!body) throw new Error('Response has no body to stream');
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Normalize CRLF, then drain complete blocks (separated by a blank line).
      buffer = buffer.replace(/\r\n/g, '\n');
      let sep = buffer.indexOf('\n\n');
      while (sep !== -1) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const event = parseBlock(block);
        if (event) onEvent(event);
        sep = buffer.indexOf('\n\n');
      }
    }
    // Flush a trailing block with no final blank line.
    const tail = buffer.trim();
    if (tail) {
      const event = parseBlock(tail);
      if (event) onEvent(event);
    }
  } finally {
    reader.releaseLock();
  }
}
