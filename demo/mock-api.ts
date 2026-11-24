// Stands in for api.deepseek.com on the demo page, which can't reach the
// network. It answers /chat/completions the way the real API does (JSON or a
// server-sent event stream), so the extension's own provider code runs as is.

// A tiny word list so the demo shows something that looks like Chinese.
// It is not meant to be a real translation.
const EN_ZH: Record<string, string> = {
  hello: '你好', world: '世界', the: '', a: '一个', an: '一个', is: '是', are: '是', was: '曾是',
  this: '这个', that: '那个', it: '它', and: '和', or: '或', of: '的', to: '到', in: '在', on: '在',
  for: '为了', with: '和', you: '你', i: '我', we: '我们', they: '他们', he: '他', she: '她',
  not: '不', can: '能', will: '将', be: '是', have: '有', has: '有', do: '做', make: '制作',
  good: '好的', new: '新的', time: '时间', day: '天', year: '年', people: '人们', way: '方式',
  page: '页面', text: '文本', web: '网络', browser: '浏览器', extension: '扩展', select: '选择',
  translate: '翻译', translation: '翻译', language: '语言', model: '模型', data: '数据',
  open: '打开', source: '来源', code: '代码', example: '例子', use: '使用', user: '用户',
  read: '阅读', more: '更多', about: '关于', simple: '简单的', fast: '快速的', quick: '快速的',
  brown: '棕色的', fox: '狐狸', jumps: '跳过', over: '越过', lazy: '懒惰的', dog: '狗',
  thank: '谢谢', thanks: '谢谢', please: '请', yes: '是', no: '不', learn: '学习',
};

function toChinese(text: string): string {
  return text.replace(/[A-Za-z']+/g, (word) => {
    const hit = EN_ZH[word.toLowerCase()];
    return hit === undefined ? word : hit;
  }).replace(/ +/g, (spaces, offset: number, all: string) => {
    // Drop spaces between CJK characters, keep them around Latin words.
    const prev = all[offset - 1] ?? '';
    const next = all[offset + spaces.length] ?? '';
    return /[一-鿿]/.test(prev) && /[一-鿿]/.test(next) ? '' : ' ';
  });
}

const DEMO_HOST = 'https://api.deepseek.com';

function sleep(ms: number, signal?: AbortSignal | null) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });
}

function fakeTranslate(system: string, user: string): string {
  // The user message is "<instruction>\n\n<text>".
  const text = user.includes('\n\n') ? user.slice(user.indexOf('\n\n') + 2) : user;
  if (/Chinese/.test(system)) return toChinese(text);
  const lang = /into ([A-Za-z ]+)\./.exec(system)?.[1] ?? 'the target language';
  return `(${lang}) ${text}`;
}

function sse(chunks: string[], signal?: AbortSignal | null): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        for (const piece of chunks) {
          await sleep(25, signal);
          const event = { choices: [{ delta: { content: piece } }] };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

export function installDemoApi() {
  const realFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(`${DEMO_HOST}/`)) return realFetch(input, init);

    const body = JSON.parse(String(init?.body ?? '{}')) as {
      stream?: boolean;
      messages?: { role: string; content: string }[];
    };
    const system = body.messages?.find((m) => m.role === 'system')?.content ?? '';
    const user = body.messages?.find((m) => m.role === 'user')?.content ?? '';

    await sleep(250, init?.signal);
    if (user.includes('[[fail]]')) throw new TypeError('Failed to fetch');

    const output = fakeTranslate(system, user);
    if (body.stream) {
      const pieces = output.match(/[\s\S]{1,3}/g) ?? [];
      return new Response(sse(pieces, init?.signal), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: output } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

/** A saved API pointing at the stand-in, so the demo works without setup. */
export const DEMO_API = {
  id: 'demo',
  name: 'DeepSeek（演示）',
  baseUrl: DEMO_HOST,
  apiKey: 'sk-demo',
  model: 'deepseek-flash',
};
