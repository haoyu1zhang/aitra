// A small in-page stand-in for the chrome.* APIs the extension uses, so the
// real content script UI, options page and background logic can run on a
// normal web page. Storage lives in memory and resets on reload.

type Listener = (...args: any[]) => unknown;

function event() {
  const listeners = new Set<Listener>();
  return {
    addListener: (fn: Listener) => void listeners.add(fn),
    removeListener: (fn: Listener) => void listeners.delete(fn),
    hasListener: (fn: Listener) => listeners.has(fn),
    emit: (...args: unknown[]) => listeners.forEach((fn) => fn(...args)),
    listeners,
  };
}

const store = new Map<string, unknown>();
const storageChanged = event();

function pick(keys: string | string[] | null | undefined) {
  if (keys == null) return Object.fromEntries(store);
  const list = Array.isArray(keys) ? keys : [keys];
  const out: Record<string, unknown> = {};
  for (const k of list) if (store.has(k)) out[k] = structuredClone(store.get(k));
  return out;
}

const local = {
  async get(keys?: string | string[] | null) {
    return pick(keys);
  },
  async set(items: Record<string, unknown>) {
    const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
    for (const [k, v] of Object.entries(items)) {
      changes[k] = { oldValue: store.get(k), newValue: structuredClone(v) };
      store.set(k, structuredClone(v));
    }
    storageChanged.emit(changes, 'local');
  },
  async remove(keys: string | string[]) {
    const changes: Record<string, { oldValue?: unknown }> = {};
    for (const k of Array.isArray(keys) ? keys : [keys]) {
      if (store.has(k)) changes[k] = { oldValue: store.get(k) };
      store.delete(k);
    }
    storageChanged.emit(changes, 'local');
  },
};

export interface FakePort {
  name: string;
  postMessage(message: unknown): void;
  disconnect(): void;
  onMessage: ReturnType<typeof event>;
  onDisconnect: ReturnType<typeof event>;
}

function portPair(name: string): [FakePort, FakePort] {
  let connected = true;
  const make = (): FakePort => ({
    name,
    onMessage: event(),
    onDisconnect: event(),
    postMessage(message) {
      if (!connected) throw new Error('Port disconnected');
      const copy = structuredClone(message);
      setTimeout(() => other(this).onMessage.emit(copy, other(this)), 0);
    },
    disconnect() {
      if (!connected) return;
      connected = false;
      const peer = other(this);
      setTimeout(() => peer.onDisconnect.emit(peer), 0);
    },
  });
  const a = make();
  const b = make();
  const other = (p: FakePort) => (p === a ? b : a);
  return [a, b];
}

/** Where background-side handlers get attached. */
export const backgroundSide = {
  onConnect: event(),
  onMessage: event(),
};

const contentOnMessage = event();

const runtime = {
  id: 'aitra-demo',
  connect({ name }: { name: string }) {
    const [contentPort, bgPort] = portPair(name);
    setTimeout(() => backgroundSide.onConnect.emit(bgPort), 0);
    return contentPort;
  },
  async sendMessage(message: unknown) {
    const [handler] = backgroundSide.onMessage.listeners;
    if (!handler) return undefined;
    return new Promise((resolve) => {
      const keepOpen = handler(structuredClone(message), { url: runtime.getURL('/options.html') }, resolve);
      if (keepOpen !== true) resolve(undefined);
    });
  },
  getURL: (path: string) => `chrome-extension://aitra-demo${path.startsWith('/') ? '' : '/'}${path}`,
  openOptionsPage: async () => {},
  onMessage: contentOnMessage,
};

/** Deliver a message to the content script, as tabs.sendMessage would. */
export function sendToContent(message: unknown) {
  contentOnMessage.emit(structuredClone(message), { id: runtime.id }, () => {});
}

(globalThis as any).chrome = {
  storage: { local, onChanged: storageChanged },
  runtime,
  permissions: {
    contains: async () => true,
    request: async () => true,
  },
  tabs: {
    create: async () => ({}),
  },
};
