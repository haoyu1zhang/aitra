import { describe, expect, it } from 'vitest';
import { readSse } from '../lib/providers/sse';

function streamOf(parts: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const p of parts) controller.enqueue(enc.encode(p));
      controller.close();
    },
  });
}

async function collect(parts: string[]) {
  const out: string[] = [];
  for await (const d of readSse(streamOf(parts))) out.push(d);
  return out;
}

describe('readSse', () => {
  it('handles events split across chunks', async () => {
    expect(await collect(['data: {"a"', ':1}\n\nda', 'ta: [DONE]\n\n'])).toEqual(['{"a":1}', '[DONE]']);
  });

  it('ignores comments and other fields, supports CRLF', async () => {
    expect(await collect([': keep-alive\r\n\r\nevent: x\r\ndata: one\r\n\r\n'])).toEqual(['one']);
  });

  it('joins multi-line data and flushes the tail', async () => {
    expect(await collect(['data: a\ndata: b\n\ndata: tail'])).toEqual(['a\nb', 'tail']);
  });
});
