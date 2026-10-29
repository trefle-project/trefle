import { describe, expect, it } from "vitest";

import { STARTER_TEMPLATES } from "../src/fields/grapesjs/starterTemplates";
import { shouldRedirectToWizard, stashToFieldUpdates, type PageWizardStash } from "../src/components/pageWizardStash";

describe("stashToFieldUpdates (T028a, FR-016)", () => {
  it("maps title/pageType/path plus the chosen template's builder content, coercing a numeric-id domain to a number", () => {
    // Regression for a live wizard walkthrough: `domains` uses Payload's
    // default numeric id, but the wizard's `<select>` only ever produces a
    // string — a plain string here fails the create POST ("This
    // relationship field has the following invalid relationships").
    const stash: PageWizardStash = {
      pageType: "free",
      templateId: STARTER_TEMPLATES.free[0].id,
      domain: "1",
      path: "/a-propos",
      title: "À propos",
    };
    const updates = stashToFieldUpdates(stash);
    const byPath = Object.fromEntries(updates.map((u) => [u.path, u.value]));

    expect(byPath.title).toBe("À propos");
    expect(byPath.pageType).toBe("free");
    expect(byPath.domain).toBe(1);
    expect(byPath.path).toBe("/a-propos");
    expect(byPath["builder.html"]).toBe(STARTER_TEMPLATES.free[0].html);
    expect(byPath["builder.projectData"]).toBe(STARTER_TEMPLATES.free[0].projectData);
    expect(byPath["builder.css"]).toBe(STARTER_TEMPLATES.free[0].css);
  });

  it("leaves a non-numeric domain id untouched", () => {
    const stash: PageWizardStash = {
      pageType: "free",
      templateId: STARTER_TEMPLATES.free[0].id,
      domain: "d1",
      path: "/a-propos",
      title: "À propos",
    };
    const updates = stashToFieldUpdates(stash);
    const byPath = Object.fromEntries(updates.map((u) => [u.path, u.value]));
    expect(byPath.domain).toBe("d1");
  });

  it("omits domain/path updates when the wizard left them blank", () => {
    const stash: PageWizardStash = {
      pageType: "confirmation",
      templateId: STARTER_TEMPLATES.confirmation[0].id,
      title: "Merci",
    };
    const updates = stashToFieldUpdates(stash);
    expect(updates.some((u) => u.path === "domain")).toBe(false);
    expect(updates.some((u) => u.path === "path")).toBe(false);
  });

  // 005-content-language-tagging, US4
  it("maps a numeric-id language, same coercion as domain", () => {
    const stash: PageWizardStash = {
      pageType: "free",
      templateId: STARTER_TEMPLATES.free[0].id,
      title: "À propos",
      language: "2",
    };
    const updates = stashToFieldUpdates(stash);
    const byPath = Object.fromEntries(updates.map((u) => [u.path, u.value]));
    expect(byPath.language).toBe(2);
  });

  it("omits the language update when the wizard left it blank", () => {
    const stash: PageWizardStash = {
      pageType: "free",
      templateId: STARTER_TEMPLATES.free[0].id,
      title: "À propos",
    };
    const updates = stashToFieldUpdates(stash);
    expect(updates.some((u) => u.path === "language")).toBe(false);
  });

  it("falls back to the type's only template when templateId doesn't match", () => {
    const stash: PageWizardStash = {
      pageType: "subscription",
      templateId: "unknown-id",
      title: "Inscription",
    };
    const updates = stashToFieldUpdates(stash);
    const byPath = Object.fromEntries(updates.map((u) => [u.path, u.value]));
    expect(byPath["builder.html"]).toBe(STARTER_TEMPLATES.subscription[0].html);
  });
});

describe("shouldRedirectToWizard (T028b, FR-017)", () => {
  it("redirects on a fresh create visit with no stash and no doc id", () => {
    expect(shouldRedirectToWizard({ hasStash: false, hasDocId: false })).toBe(true);
  });

  it("does not redirect when the wizard just handed off a stash", () => {
    expect(shouldRedirectToWizard({ hasStash: true, hasDocId: false })).toBe(false);
  });

  it("does not redirect when editing an existing document", () => {
    expect(shouldRedirectToWizard({ hasStash: false, hasDocId: true })).toBe(false);
  });

  it("does not redirect when both a stash and a doc id are present", () => {
    expect(shouldRedirectToWizard({ hasStash: true, hasDocId: true })).toBe(false);
  });
});
