// fake-chrome has to run before anything that imports wxt/browser.
import { backgroundSide, sendToContent, type FakePort } from './fake-chrome';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Browser } from 'wxt/browser';
// The extension build already compiled the content script CSS; reuse it as is.
import contentCss from '@/.output/chrome-mv3/content-scripts/content.css?raw';
import '@/assets/tailwind.css';
import { ContentApp } from '@/entrypoints/content/ContentApp';
import { OptionsApp } from '@/entrypoints/options/OptionsApp';
import { handleRuntime, handleTranslatePort } from '@/lib/background/handlers';
import { runtimeRequestSchema } from '@/lib/messaging/protocol';

// Background side ------------------------------------------------------------
backgroundSide.onConnect.addListener((port: FakePort) => {
  handleTranslatePort(port as unknown as Browser.runtime.Port);
});
backgroundSide.onMessage.addListener((raw: unknown, _sender: unknown, sendResponse: (r: unknown) => void) => {
  const parsed = runtimeRequestSchema.safeParse(raw);
  if (!parsed.success) return;
  void handleRuntime(parsed.data).then(sendResponse);
  return true;
});

// Content script UI, mounted the same way WXT does it -------------------------
function mountContentUi() {
  const host = document.createElement('aitra-translate');
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `:host{all:initial !important}\n${contentCss}`;
  const container = document.createElement('div');
  shadow.append(style, container);
  document.documentElement.append(host);
  createRoot(container).render(<ContentApp host={host} shadow={shadow} />);
}

// Alt+T is a browser command in the real extension.
window.addEventListener('keydown', (e) => {
  if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyT') {
    e.preventDefault();
    sendToContent({ type: 'trigger', origin: 'command' });
  }
});

// Demo page -----------------------------------------------------------------
type Tab = 'page' | 'options';

function DemoPage() {
  const [tab, setTab] = useState<Tab>(() => (location.hash === '#options' ? 'options' : 'page'));

  useEffect(() => {
    const onHash = () => setTab(location.hash === '#options' ? 'options' : 'page');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (next: Tab) => {
    setTab(next);
    try {
      history.replaceState(null, '', next === 'options' ? '#options' : '#page');
    } catch {
      // Some embedded viewers refuse history changes; the tab still switches.
    }
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">A</span>
            <span className="font-semibold text-slate-900">Aitra</span>
            <span className="hidden text-sm text-slate-400 sm:inline">在线演示</span>
          </div>
          <nav className="flex rounded-lg bg-slate-100 p-1 text-sm">
            {(['page', 'options'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => go(t)}
                className={`rounded-md px-3 py-1 ${tab === t ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-600'}`}
              >
                {t === 'page' ? '网页划词' : '设置页'}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 pt-5">
        <p className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm leading-relaxed text-indigo-900">
          这个页面运行的是扩展的真实代码：浮动按钮、翻译卡片、设置页和后台的缓存、重试逻辑都是同一份。
          浏览器扩展 API 用内存里的模拟实现代替，刷新后设置和缓存会清空。演示页不能访问外部接口，
          所以只有 <strong>Mock</strong> 能出译文；切到 AI 接口或 DeepL 会看到网络失败的提示。
        </p>
      </div>

      {tab === 'page' ? <Article /> : <OptionsApp />}
    </div>
  );
}

function Article() {
  return (
    <main className="mx-auto max-w-3xl px-5 pb-24">
      <ol className="mt-5 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
        <li className="rounded-lg border border-slate-200 bg-white px-3 py-2">① 用鼠标选中下面任意一段英文</li>
        <li className="rounded-lg border border-slate-200 bg-white px-3 py-2">② 点选区旁边的紫色按钮，或按 Alt+T</li>
        <li className="rounded-lg border border-slate-200 bg-white px-3 py-2">③ 按 Esc 或点外面关闭卡片</li>
      </ol>

      <article className="mt-8 rounded-xl border border-slate-200 bg-white px-6 py-8 font-serif text-[17px] leading-8 text-slate-800 sm:px-10">
        <h1 className="font-sans text-2xl font-semibold text-slate-900">Reading on the web, one sentence at a time</h1>
        <p className="mt-1 font-sans text-sm text-slate-400">A short sample article for trying the extension</p>

        <p className="mt-6">
          Most of the time you don't need a whole page translated. You understand the text, and then one sentence
          stops you. Select it, read the translation next to it, and keep going. The page stays exactly as it was.
        </p>
        <p className="mt-4">
          The quick brown fox jumps over the lazy dog. This is a simple example of web text that you can select
          and translate.
        </p>
        <p className="mt-4">
          Hello world. Thank you for reading, and please select more text to see how the card follows the
          selection when you scroll the page.
        </p>

        <h2 className="mt-8 font-sans text-lg font-semibold text-slate-900">Things worth trying</h2>
        <p className="mt-3">
          Translate the same sentence twice: the second time the card shows a small badge, because the result
          came from the local cache instead of a new request.
        </p>
        <p className="mt-4">
          This sentence contains [[fail]] on purpose, so the mock service returns a network error. The card keeps
          the original text and offers a retry button.
        </p>
        <p className="mt-4 font-sans">
          这一段本身就是中文。目标语言是简体中文时，扩展会改为翻译成备用语言（默认英文）。
        </p>

        <div className="mt-6 font-sans">
          <label htmlFor="demo-input" className="text-sm text-slate-500">
            在输入框里选中文字不会出现按钮：
          </label>
          <textarea
            id="demo-input"
            rows={3}
            defaultValue="Selecting text inside this box should not show the translate button."
            className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <p className="mt-8">
          Scroll down a little with a card open. It stays next to the selected sentence, and closes once the
          sentence leaves the screen.
        </p>
        <div className="h-[60vh]" aria-hidden="true" />
        <p>
          Open source code, a small data model, and a fast browser extension make a good example for people
          who want to learn more about the web.
        </p>
      </article>
    </main>
  );
}

mountContentUi();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DemoPage />
  </StrictMode>,
);
