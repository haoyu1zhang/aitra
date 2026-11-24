import { createRoot, type Root } from 'react-dom/client';
import './content/style.css';
import { ContentApp } from './content/ContentApp';

export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    const ui = await createShadowRootUi<Root>(ctx, {
      name: 'aitra-translate',
      position: 'inline',
      anchor: 'html',
      append: 'last',
      onMount(container, shadow, host) {
        const root = createRoot(container);
        root.render(<ContentApp host={host} shadow={shadow} />);
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });
    ui.mount();
  },
});
