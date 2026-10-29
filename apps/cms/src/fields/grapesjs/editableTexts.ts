/**
 * Make every text-only element editable, whatever produced the projectData.
 *
 * GrapesJS edits a text on double-click only when its component has the
 * `text` type. Its HTML parser gives that type itself (ParserHtml: "if all
 * children are texts and there is any textnode inside, the parent should be
 * text too otherwise it won't be possible to edit texnodes"), but JSON
 * projectData skips the parser: an `{ tagName: "h1", components: [textnode] }`
 * written in code or stored that way loads as a plain component — selectable,
 * never editable. The starter templates did exactly that, so every page
 * created from them had a title and paragraph nobody could edit (found
 * 2026-10-11).
 *
 * Applied to all projectData entering the editor, so stored pages are fixed
 * on open and future sources (editable templates, shared sections, imports)
 * get the same rule. Same rule as GrapesJS 0.22's parser, bottom-up, with its
 * default `textTypes` / `textTags`; components that already have a type are
 * never changed. Returns a new object; the input is not mutated.
 */
const TEXT_TYPES = new Set(["text", "textnode", "comment"]);
const TEXT_TAGS = new Set(["br", "b", "i", "u", "a", "ul", "ol"]);

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

function promoteComponent(input: unknown): unknown {
  if (!isObject(input)) return input;
  if (!Array.isArray(input.components)) return input;
  const components = input.components.map(promoteComponent);
  const out: Json = { ...input, components };
  if (!out.type && components.length) {
    let allText = true;
    let foundTextNode = false;
    for (const child of components) {
      const type = isObject(child) ? child.type : undefined;
      const tagName = isObject(child) && typeof child.tagName === "string" ? child.tagName.toLowerCase() : undefined;
      if (!(typeof type === "string" && TEXT_TYPES.has(type)) && !(tagName && TEXT_TAGS.has(tagName))) {
        allText = false;
        break;
      }
      if (type === "textnode") foundTextNode = true;
    }
    if (allText && foundTextNode) out.type = "text";
  }
  return out;
}

export function promoteEditableTexts<T>(projectData: T): T {
  if (!isObject(projectData) || !Array.isArray(projectData.pages)) return projectData;
  const pages = projectData.pages.map((page) => {
    if (!isObject(page) || !Array.isArray(page.frames)) return page;
    const frames = page.frames.map((frame) =>
      isObject(frame) && isObject(frame.component) ? { ...frame, component: promoteComponent(frame.component) } : frame,
    );
    return { ...page, frames };
  });
  return { ...projectData, pages } as T;
}
