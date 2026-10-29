import { describe, expect, it } from "vitest";

import { promoteEditableTexts } from "../src/fields/grapesjs/editableTexts";
import { STARTER_TEMPLATES } from "../src/fields/grapesjs/starterTemplates";

// Regression (2026-10-11): starter templates wrote h1/p as JSON without a
// type, so GrapesJS loaded them as plain components — selectable, never
// editable. The rule below is GrapesJS 0.22's own HTML-parser rule.

type Comp = { type?: string; tagName?: string; content?: string; components?: Comp[]; attributes?: Record<string, string> };

const text = (content: string): Comp => ({ type: "textnode", content });
const project = (...components: Comp[]) => ({ pages: [{ frames: [{ component: { type: "wrapper", components } }] }] });
function first(p: unknown): Comp {
  const c = (p as { pages?: { frames?: { component?: Comp }[] }[] }).pages?.[0]?.frames?.[0]?.component?.components?.[0];
  if (!c) throw new Error("no first component");
  return c;
}

function walk(c: Comp, visit: (c: Comp) => void) {
  visit(c);
  for (const child of c.components ?? []) walk(child, visit);
}

describe("promoteEditableTexts", () => {
  it("makes an untyped element holding only text a `text` component", () => {
    const out = promoteEditableTexts(project({ tagName: "h1", components: [text("Titre")] }));
    expect(first(out).type).toBe("text");
  });

  it("works bottom-up through inline tags (a <p> with a <b> and a link)", () => {
    const p: Comp = {
      tagName: "p",
      components: [text("Lire "), { tagName: "b", components: [text("ceci")] }, { tagName: "a", components: [text("ici")] }],
    };
    expect(first(promoteEditableTexts(project(p))).type).toBe("text");
  });

  it("leaves a container of paragraphs alone (no direct text of its own)", () => {
    const section: Comp = { tagName: "section", components: [{ tagName: "p", components: [text("Un")] }] };
    const out = first(promoteEditableTexts(project(section)));
    expect(out.type).toBeUndefined();
    expect(out.components?.[0]?.type).toBe("text");
  });

  it("never changes a component that already has a type", () => {
    const form: Comp = { type: "lead-form", tagName: "div", components: [text("x")] };
    expect(first(promoteEditableTexts(project(form))).type).toBe("lead-form");
  });

  it("does not mutate its input and is idempotent", () => {
    const input = project({ tagName: "h1", components: [text("Titre")] });
    const once = promoteEditableTexts(input);
    expect(first(input).type).toBeUndefined();
    expect(promoteEditableTexts(once)).toEqual(once);
  });

  it("passes anything that is not projectData through", () => {
    expect(promoteEditableTexts(undefined)).toBeUndefined();
    expect(promoteEditableTexts({ foo: 1 })).toEqual({ foo: 1 });
  });
});

describe("starter templates", () => {
  it.each(Object.entries(STARTER_TEMPLATES))("%s: every element holding text is editable as stored", (_name, [template]) => {
    const offenders: string[] = [];
    const data = template.projectData as ReturnType<typeof project>;
    for (const page of data.pages) {
      for (const frame of page.frames) {
        walk(frame.component as Comp, (c) => {
          const holdsText = (c.components ?? []).some((child) => child.type === "textnode");
          if (holdsText && c.type !== "text" && c.tagName !== "a") offenders.push(c.tagName ?? "?");
        });
      }
    }
    expect(offenders).toEqual([]);
  });
});
