import type { Editor } from 'grapesjs';

// grapesjs exports a `Plugin<T>` type, but only from 0.23. Declaring the
// signature by hand keeps this compiling across the whole peer range in
// package.json. Narrow the range to ^0.23 and you can `import type { Plugin }`
// instead.
export type GrapesPlugin<T> = (editor: Editor, opts?: T) => void;

export interface MyPluginOptions {
  /** Category the blocks land in. */
  category?: string;
  /** Prefix for every registered id. Change it to avoid collisions. */
  prefix?: string;
  /** All user-facing strings, so consumers can translate them. */
  labels?: {
    card?: string;
  };
}

const plugin: GrapesPlugin<MyPluginOptions> = (editor, opts = {}) => {
  const options: Required<MyPluginOptions> = {
    category: 'My blocks',
    prefix: 'my-',
    ...opts,
    labels: { card: 'Card', ...opts.labels },
  };

  const type = `${options.prefix}card`;

  // Idempotent: hot reload runs plugins more than once, and re-registering
  // must not throw or duplicate palette entries.
  if (editor.Components.getType(type)) return;

  editor.Components.addType(type, {
    isComponent: (el) =>
      el.tagName === 'DIV' && el.classList.contains(type) ? { type } : undefined,
    model: {
      defaults: {
        tagName: 'div',
        classes: [type],
        droppable: false,
        traits: ['title'],
        components: [{ type: 'text', content: 'Card title' }],
      },
    },
    // Ship the block alongside the type so the two can't drift apart.
    block: {
      label: options.labels.card,
      category: options.category,
      media: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" fill="currentColor"/></svg>',
    },
  });
};

export default plugin;
