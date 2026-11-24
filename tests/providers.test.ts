import { describe, expect, it, vi } from 'vitest';
import { OpenAICompatibleProvider, completionsUrl } from '../lib/providers/openai';
import { DeepLProvider, deeplEndpoint, deeplTarget } from '../lib/providers/deepl';
import { MockProvider } from '../lib/providers/mock';

const signal = new AbortController().signal;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function sseResponse(events: string[]) {
  const body = events.map((e) => `data: ${e}\n\n`).join('');
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

const deepseek = { baseUrl: 'https://api.deepseek.com', apiKey: 'sk-test-123456', model: 'deepseek-flash' };

describe('OpenAICompatibleProvider', () => {
  it('builds the completions URL', () => {
    expect(completionsUrl('https://api.openai.com/v1/')).toBe('https://api.openai.com/v1/chat/completions');
  });

  it('requires a key', async () => {
    const p = new OpenAICompatibleProvider({ ...deepseek, apiKey: '' }, vi.fn());
    await expect(p.translate('hi', { targetLang: 'zh-CN', signal })).rejects.toMatchObject({ code: 'NO_API_KEY' });
  });

  it('reads a non-streaming reply and disables DeepSeek thinking', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ choices: [{ message: { content: '  你好  ' } }] }));
    const p = new OpenAICompatibleProvider(deepseek, fetchMock as unknown as typeof fetch);
    const result = await p.translate('hello', { targetLang: 'zh-CN', signal });
    expect(result.text).toBe('你好');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    const body = JSON.parse(init.body as string);
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(body.stream).toBe(false);
    expect(body.messages[1].content).toBe('hello');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test-123456');
  });

  it('does not send the DeepSeek flag to other hosts', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ choices: [{ message: { content: 'x' } }] }));
    const p = new OpenAICompatibleProvider({ ...deepseek, baseUrl: 'https://api.openai.com/v1' }, fetchMock as unknown as typeof fetch);
    await p.translate('hello', { targetLang: 'zh-CN', signal });
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.thinking).toBeUndefined();
  });

  it('streams deltas', async () => {
    const fetchMock = vi.fn(async () => sseResponse([
      JSON.stringify({ choices: [{ delta: { role: 'assistant', content: '' } }] }),
      JSON.stringify({ choices: [{ delta: { content: '\n你' } }] }),
      'not json',
      JSON.stringify({ choices: [{ delta: { content: '好' } }] }),
      '[DONE]',
    ]));
    const chunks: string[] = [];
    const p = new OpenAICompatibleProvider(deepseek, fetchMock as unknown as typeof fetch);
    const result = await p.translate('hello', { targetLang: 'zh-CN', signal, onChunk: (d) => chunks.push(d) });
    expect(chunks).toEqual(['你', '好']);
    expect(result.text).toBe('你好');
  });

  it('maps 401 and keeps the key out of the message', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: { message: 'Incorrect API key provided: sk-test-123456' } }, 401));
    const p = new OpenAICompatibleProvider(deepseek, fetchMock as unknown as typeof fetch);
    const err = await p.translate('hello', { targetLang: 'zh-CN', signal }).catch((e) => e);
    expect(err.code).toBe('INVALID_KEY');
    expect(err.toInfo().message).not.toContain('sk-test-123456');
  });

  it('rejects malformed replies', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ unexpected: true }));
    const p = new OpenAICompatibleProvider(deepseek, fetchMock as unknown as typeof fetch);
    await expect(p.translate('hello', { targetLang: 'zh-CN', signal })).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
  });
});

describe('DeepLProvider', () => {
  it('picks the host from the key', () => {
    expect(deeplEndpoint('abc:fx')).toBe('https://api-free.deepl.com/v2/translate');
    expect(deeplEndpoint('abc')).toBe('https://api.deepl.com/v2/translate');
  });

  it('maps target languages', () => {
    expect(deeplTarget('zh-CN')).toBe('ZH-HANS');
    expect(deeplTarget('en')).toBe('EN-US');
  });

  it('returns text and detected language', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ translations: [{ detected_source_language: 'EN', text: '你好' }] }));
    const p = new DeepLProvider('abc:fx', fetchMock as unknown as typeof fetch);
    const r = await p.translate('hello', { targetLang: 'zh-CN', signal });
    expect(r).toEqual({ text: '你好', detectedSourceLang: 'en' });
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toEqual({ text: ['hello'], target_lang: 'ZH-HANS' });
  });

  it('maps quota errors', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ message: 'Quota exceeded' }, 456));
    const p = new DeepLProvider('abc:fx', fetchMock as unknown as typeof fetch);
    await expect(p.translate('hello', { targetLang: 'zh-CN', signal })).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
  });
});

describe('MockProvider', () => {
  it('works without a key and streams', async () => {
    const chunks: string[] = [];
    const r = await new MockProvider(0).translate('hello world', { targetLang: 'zh-CN', signal, onChunk: (c) => chunks.push(c) });
    expect(r.text).toContain('你好');
    expect(chunks.join('')).toBe(r.text);
  });

  it('can simulate a failure', async () => {
    await expect(new MockProvider(0).translate('[[fail]]', { targetLang: 'zh-CN', signal })).rejects.toMatchObject({ code: 'NETWORK' });
  });
});
