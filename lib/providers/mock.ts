import { TranslateError } from '../errors';
import { guessLanguage } from '../languages';
import { sleep, type TranslateOptions, type TranslateResult, type TranslationProvider } from './types';

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

export class MockProvider implements TranslationProvider {
  readonly label = 'Mock';

  constructor(private readonly delayMs = 25) {}

  async translate(text: string, options: TranslateOptions): Promise<TranslateResult> {
    const { targetLang, signal, onChunk } = options;
    await sleep(this.delayMs * 8, signal);

    if (text.includes('[[fail]]')) throw new TranslateError('NETWORK', '模拟失败');
    if (text.includes('[[ratelimit]]')) throw new TranslateError('RATE_LIMITED', '模拟限流');

    const output = targetLang.startsWith('zh')
      ? `〔模拟〕${toChinese(text)}`
      : `〔模拟 · ${targetLang}〕${text}`;

    if (onChunk) {
      for (let i = 0; i < output.length; i += 3) {
        await sleep(this.delayMs, signal);
        onChunk(output.slice(i, i + 3));
      }
    }
    return { text: output, detectedSourceLang: guessLanguage(text) ?? 'en' };
  }
}
