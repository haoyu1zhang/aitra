/**
 * Yields the `data:` payload of each server-sent event. Comments, ids and
 * event names are ignored; multi-line data fields are joined with "\n".
 */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let data: string[] = [];

  const flushLine = function* (line: string): Generator<string> {
    if (line === '') {
      if (data.length) yield data.join('\n');
      data = [];
      return;
    }
    if (line.startsWith(':')) return;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    if (field !== 'data') return;
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    data.push(value);
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.search(/\r\n|\r|\n/)) !== -1) {
        const line = buffer.slice(0, newline);
        const sepLength = buffer.startsWith('\r\n', newline) ? 2 : 1;
        buffer = buffer.slice(newline + sepLength);
        yield* flushLine(line);
      }
    }
    buffer += decoder.decode();
    if (buffer) yield* flushLine(buffer);
    if (data.length) yield data.join('\n');
  } finally {
    reader.releaseLock();
  }
}
