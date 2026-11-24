import { browser } from 'wxt/browser';
import { TranslateError } from '@/lib/errors';
import { handleRuntime, handleTranslatePort } from '@/lib/background/handlers';
import { TRANSLATE_PORT, runtimeRequestSchema, type TriggerMessage } from '@/lib/messaging/protocol';
import { resolveUiLang, translate } from '@/lib/i18n';
import { getSettings, watchSettings, type Settings } from '@/lib/storage/settings';

const MENU_ID = 'aitra-translate-selection';

function menuTitle(settings: Settings): string {
  return translate(resolveUiLang(settings.uiLang), 'menu.translate');
}

async function refreshMenuTitle(settings?: Settings) {
  const title = menuTitle(settings ?? (await getSettings()));
  try {
    await browser.contextMenus.update(MENU_ID, { title });
  } catch {
    // The menu doesn't exist yet; onInstalled creates it with the right title.
  }
}

async function triggerInTab(tabId: number | undefined, message: TriggerMessage) {
  if (tabId === undefined || tabId < 0) return;
  try {
    // frameId 0: the content script only runs in the top frame.
    await browser.tabs.sendMessage(tabId, message, { frameId: 0 });
  } catch {
    // chrome:// pages, the Web Store, PDFs, or tabs opened before install.
    console.warn('[aitra] no content script in this tab');
  }
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(async () => {
    const settings = await getSettings();
    await browser.contextMenus.removeAll();
    browser.contextMenus.create({ id: MENU_ID, title: menuTitle(settings), contexts: ['selection'] });
  });

  // Keep the menu in the interface language the user picked.
  watchSettings((settings) => void refreshMenuTitle(settings));
  void refreshMenuTitle();

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== MENU_ID) return;
    void triggerInTab(tab?.id, {
      type: 'trigger',
      origin: 'contextMenu',
      fallbackText: info.selectionText,
    });
  });

  browser.commands.onCommand.addListener((command, tab) => {
    if (command !== 'translate-selection') return;
    void triggerInTab(tab?.id, { type: 'trigger', origin: 'command' });
  });

  browser.runtime.onConnect.addListener((port) => {
    if (port.name === TRANSLATE_PORT) handleTranslatePort(port);
  });

  browser.runtime.onMessage.addListener((raw: unknown, sender, sendResponse) => {
    // Settings tests and cache management only come from extension pages.
    if (!sender.url?.startsWith(browser.runtime.getURL('/'))) return;
    const parsed = runtimeRequestSchema.safeParse(raw);
    if (!parsed.success) return;
    handleRuntime(parsed.data)
      .then(sendResponse)
      .catch(() => sendResponse({ ok: false, error: new TranslateError('UNKNOWN').toInfo() }));
    return true;
  });
});
