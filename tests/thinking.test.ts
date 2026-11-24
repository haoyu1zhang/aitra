import { describe, expect, it, vi } from 'vitest';
import { ThinkStripper, stripThinkBlock, thinkingCandidates } from '../lib/providers/thinking';
import { OpenAICompatibleProvider } from '../lib/providers/openai';
import { memoryHints } from '../lib/storage/thinking-hints';

const signal = new AbortController().signal;
const ok = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const bad = () => new Response(JSON.stringify({ error: { message: 'unknown parameter' } }), { status: 400 });
const bodyOf = (fetchMock: ReturnType<typeof vi.fn>, i: number) =>
  JSON.parse((fetchMock.mock.calls[i] as unknown as [string, RequestInit])[1].body as string);

describe('thinkingCandidates', () => {
  it('picks the right switch per family', () => {
    expect(thinkingCandidates('https://api.deepseek.com', 'deepseek-flash')[0]).toBe('thinking-disabled');
    expect(thinkingCandidates('https://dashscope.aliyuncs.com/compatible-mode/v1', 'qwen-plus')[0]).toBe('enable-thinking-false');
    expect(thinkingCandidates('https://api.openai.com/v1', 'gpt-5-mini')[0]).toBe('effort-none');
    expect(thinkingCandidates('https://api.openai.com/v1', 'gpt-4.1-mini')).toEqual(['plain']);
    expect(thinkingCandidates('https://openrouter.ai/api/v1', 'anything')[0]).toBe('openrouter-off');
    expect(thinkingCandidates('https://proxy.dev/v1', 'glm-4.6')[0]).toBe('thinking-disabled');
  });

  it('always ends with a plain request', () => {
    for (const [url, model] of [['https://x.dev', 'mystery'], ['https://api.openai.com/v1', 'o4-mini']]) {
      const list = thinkingCandidates(url!, model!);
      expect(list[list.length - 1]).toBe('plain');
    }
  });
});

describe('think tag stripping', () => {
  it('removes a leading block from a full reply', () => {
    expect(stripThinkBlock('<think>\nlet me see\n</think>\n\n你好')).toBe('你好');
    expect(stripThinkBlock('你好 <think>x</think>')).toBe('你好 <think>x</think>');
  });

  it('works when tags are split across stream chunks', () => {
    const s = new ThinkStripper();
    const out = ['<th', 'ink>reason', 'ing...</th', 'ink>\n', '你', '好'].map((c) => s.push(c)).join('') + s.flush();
    expect(out).toBe('你好');
  });

  it('passes normal text through untouched', () => {
    const s = new ThinkStripper();
    expect(['<', 'b>你好'].map((c) => s.push(c)).join('') + s.flush()).toBe('<b>你好');
    const t = new ThinkStripper();
    expect(t.push('Hi') + t.flush()).toBe('Hi');
  });
});

describe('falling back between switches', () => {
  it('tries the next switch on 400 and remembers the one that worked', async () => {
    const hints = memoryHints();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(bad())
      .mockResolvedValueOnce(ok('一'))
      .mockResolvedValueOnce(ok('二'));
    const p = new OpenAICompatibleProvider(
      { baseUrl: 'https://unknown.dev/v1', apiKey: 'k', model: 'mystery-model' },
      fetchMock as unknown as typeof fetch,
      hints,
    );
    expect((await p.translate('one', { targetLang: 'zh-CN', signal })).text).toBe('一');
    expect(bodyOf(fetchMock, 0).thinking).toEqual({ type: 'disabled' });
    expect(bodyOf(fetchMock, 1).enable_thinking).toBe(false);
    expect(bodyOf(fetchMock, 1).thinking).toBeUndefined();

    // Second request goes straight to the switch that worked.
    expect((await p.translate('two', { targetLang: 'zh-CN', signal })).text).toBe('二');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(bodyOf(fetchMock, 2).enable_thinking).toBe(false);
  });

  it('reports the real error when every variant is rejected', async () => {
    const fetchMock = vi.fn(async () => bad());
    const p = new OpenAICompatibleProvider(
      { baseUrl: 'https://api.deepseek.com', apiKey: 'k', model: 'nope' },
      fetchMock as unknown as typeof fetch,
    );
    await expect(p.translate('x', { targetLang: 'zh-CN', signal })).rejects.toMatchObject({ code: 'BAD_CONFIG' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry on auth errors', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 401 }));
    const p = new OpenAICompatibleProvider(
      { baseUrl: 'https://unknown.dev/v1', apiKey: 'k', model: 'm' },
      fetchMock as unknown as typeof fetch,
    );
    await expect(p.translate('x', { targetLang: 'zh-CN', signal })).rejects.toMatchObject({ code: 'INVALID_KEY' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('hides think blocks in streamed replies', async () => {
    const sse = ['<think>', 'hmm', '</think>', '你好']
      .map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`).join('') + 'data: [DONE]\n\n';
    const fetchMock = vi.fn(async () => new Response(sse, { status: 200 }));
    const chunks: string[] = [];
    const p = new OpenAICompatibleProvider(
      { baseUrl: 'https://x.dev/v1', apiKey: 'k', model: 'qwen3-8b' },
      fetchMock as unknown as typeof fetch,
    );
    const r = await p.translate('hi', { targetLang: 'zh-CN', signal, onChunk: (c) => chunks.push(c) });
    expect(r.text).toBe('你好');
    expect(chunks.join('')).toBe('你好');
  });
});
