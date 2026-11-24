/**
 * There is no standard way to switch reasoning off in an OpenAI-compatible
 * request, and strict servers (OpenAI included) reject fields they don't know.
 * So each request tries a short list of variants, most likely first, and moves
 * on when the server answers 400/422. The variant that worked is remembered
 * per endpoint and model.
 */

export const THINKING_VARIANTS = {
  // DeepSeek, Zhipu GLM, and several proxies that copy their format.
  'thinking-disabled': { thinking: { type: 'disabled' } },
  // Qwen on DashScope and SiliconFlow.
  'enable-thinking-false': { enable_thinking: false },
  // vLLM / SGLang serving Qwen3 and similar chat templates.
  'chat-template': { chat_template_kwargs: { enable_thinking: false } },
  // OpenAI reasoning models. Newer ones accept "none", older ones "minimal".
  'effort-none': { reasoning_effort: 'none' },
  'effort-minimal': { reasoning_effort: 'minimal' },
  'effort-low': { reasoning_effort: 'low' },
  // OpenRouter's unified switch.
  'openrouter-off': { reasoning: { enabled: false } },
  // Plain request, for models that never think or can't be told not to.
  plain: {},
} as const satisfies Record<string, Record<string, unknown>>;

export type ThinkingVariant = keyof typeof THINKING_VARIANTS;

function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function thinkingCandidates(baseUrl: string, model: string): ThinkingVariant[] {
  const host = hostOf(baseUrl);
  const m = model.toLowerCase();
  const openaiReasoning = /^(o\d|gpt-5)/.test(m);

  if (host === 'api.openai.com') {
    return openaiReasoning ? ['effort-none', 'effort-minimal', 'effort-low', 'plain'] : ['plain'];
  }
  if (host === 'api.deepseek.com') return ['thinking-disabled', 'plain'];
  if (host.endsWith('openrouter.ai')) return ['openrouter-off', 'effort-none', 'plain'];

  if (/deepseek|glm|zhipu/.test(m) || host.includes('bigmodel')) return ['thinking-disabled', 'plain'];
  if (/qwen|qwq/.test(m) || host.includes('dashscope')) {
    return ['enable-thinking-false', 'chat-template', 'plain'];
  }
  if (openaiReasoning) return ['effort-none', 'effort-minimal', 'plain'];
  if (/gpt-oss/.test(m)) return ['effort-low', 'plain'];

  // Unknown model behind an unknown endpoint: try the common switches.
  return ['thinking-disabled', 'enable-thinking-false', 'effort-none', 'plain'];
}

/** Puts a remembered variant first, keeping the rest as fallbacks. */
export function orderCandidates(candidates: ThinkingVariant[], remembered?: ThinkingVariant): ThinkingVariant[] {
  if (!remembered) return candidates;
  return [remembered, ...candidates.filter((c) => c !== remembered)];
}

const OPEN = '<think>';
const CLOSE = '</think>';

/** Removes a leading <think>…</think> block from a complete reply. */
export function stripThinkBlock(text: string): string {
  return text.replace(/^\s*<think>[\s\S]*?<\/think>\s*/, '');
}

/**
 * Streaming version of stripThinkBlock: holds back the start of the reply
 * until it knows whether it opens with <think>, then drops everything up to
 * the matching </think>.
 */
export class ThinkStripper {
  private state: 'start' | 'thinking' | 'text' = 'start';
  private buffer = '';

  push(delta: string): string {
    if (this.state === 'text') return delta;
    this.buffer += delta;

    if (this.state === 'start') {
      const head = this.buffer.trimStart();
      if (head.length < OPEN.length && OPEN.startsWith(head)) return '';
      if (!head.startsWith(OPEN)) {
        this.state = 'text';
        const out = this.buffer;
        this.buffer = '';
        return out;
      }
      this.state = 'thinking';
      this.buffer = head.slice(OPEN.length);
    }

    const end = this.buffer.indexOf(CLOSE);
    if (end === -1) {
      // Keep just enough to spot a closing tag split across chunks.
      this.buffer = this.buffer.slice(-(CLOSE.length - 1));
      return '';
    }
    this.state = 'text';
    const rest = this.buffer.slice(end + CLOSE.length).replace(/^\s+/, '');
    this.buffer = '';
    return rest;
  }

  /** Whatever is still held back when the stream ends. */
  flush(): string {
    const out = this.state === 'start' ? this.buffer : '';
    this.buffer = '';
    return out;
  }
}
