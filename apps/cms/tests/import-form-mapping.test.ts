import type { ExtractForm, ExtractFormField } from "@trefle/grapesjs-page-import/serialize";
import { describe, expect, it } from "vitest";

import { mapForm } from "../src/lib/import/form-mapping";
import { reportLine } from "../src/lib/import/report-text";

/** A report line as its French text (023: Trefle's lines are keyed). */
const fr = (line: Parameters<typeof reportLine>[0]) => reportLine(line, "fr");

/**
 * 012-url-page-import (T064, FR-016/FR-016a) — a source form becomes the
 * page's own form settings, with the product's field types only.
 */
const box = { x: 0, y: 0, width: 400, height: 300 };
const form = (fields: ExtractFormField[], submitLabel?: string): ExtractForm => ({ id: "f1", box, fields, submitLabel });
const DEFAULTS = {
  defaultConsentPurposeText: "J'accepte d'être recontacté(e).",
  defaultPrivacyNoticeUrl: "/privacy",
  defaultPrivacyNoticeVersion: "2026-01",
};

describe("field types", () => {
  it("maps every supported source type to the product's list", () => {
    const types = ["email", "text", "search", "url", "tel", "number", "range", "date", "textarea"];
    const { form: out, unmapped } = mapForm(
      form(types.map((type, i) => ({ name: `f${i}`, label: `Champ ${type}`, type, required: i === 0 }))),
      DEFAULTS,
    );
    expect(out.fields!.map((f) => f.type)).toEqual(["email", "text", "text", "text", "tel", "number", "number", "date", "textarea"]);
    expect(out.fields![0]).toMatchObject({ name: "f0", label: "Champ email", required: true });
    expect(unmapped.map(fr)).toEqual([]);
  });

  it("copies select choices, leaving out empty ones", () => {
    const { form: out } = mapForm(
      form([
        { name: "email", label: "Email", type: "email", required: true },
        { name: "size", label: "Taille du jardin", type: "select", required: true, options: ["Petit", "Grand", "Petit", " "] },
      ]),
      DEFAULTS,
    );
    expect(out.fields![1]).toMatchObject({
      name: "size",
      type: "select",
      required: true,
      options: [
        { label: "Petit", value: "Petit" },
        { label: "Grand", value: "Grand" },
      ],
    });
  });

  it("turns radio buttons sharing a name into one radio field labelled by its fieldset legend", () => {
    const { form: out } = mapForm(
      form([
        { name: "email", label: "Email", type: "email", required: true },
        { name: "freq", label: "Chaque semaine", type: "radio", required: true, group: "Fréquence" },
        { name: "freq", label: "Chaque mois", type: "radio", required: true, group: "Fréquence" },
      ]),
      DEFAULTS,
    );
    expect(out.fields).toHaveLength(2);
    expect(out.fields![1]).toMatchObject({
      name: "freq",
      label: "Fréquence",
      type: "radio",
      required: true,
      options: [
        { label: "Chaque semaine", value: "Chaque semaine" },
        { label: "Chaque mois", value: "Chaque mois" },
      ],
    });
  });

  it("keeps a single checkbox, but a group of checkboxes has no equivalent", () => {
    const { form: out, unmapped } = mapForm(
      form([
        { name: "email", label: "Email", type: "email", required: true },
        { name: "bio", label: "Je jardine en bio", type: "checkbox", required: false },
        { name: "legumes", label: "Tomates", type: "checkbox", required: false, group: "Vos légumes" },
        { name: "legumes", label: "Courges", type: "checkbox", required: false, group: "Vos légumes" },
      ]),
      DEFAULTS,
    );
    expect(out.fields!.map((f) => [f.name, f.type])).toEqual([
      ["email", "email"],
      ["bio", "checkbox"],
    ]);
    expect(unmapped.map(fr)).toEqual(["Vos légumes (plusieurs cases à cocher)"]);
  });

  it("lists unsupported fields (file, password, time…) instead of guessing", () => {
    const { form: out, unmapped } = mapForm(
      form([
        { name: "email", label: "Email", type: "email", required: true },
        { name: "cv", label: "Votre CV", type: "file", required: false },
        { name: "pw", label: "Mot de passe", type: "password", required: true },
        { name: "heure", label: "Heure de rappel", type: "time", required: false },
      ]),
      DEFAULTS,
    );
    expect(out.fields).toHaveLength(1);
    expect(unmapped.map(fr)).toEqual(["Votre CV (file)", "Mot de passe (password)", "Heure de rappel (time)"]);
  });
});

describe("email field", () => {
  it("keeps exactly one: a second address field is listed, not added", () => {
    const { form: out, unmapped } = mapForm(
      form([
        { name: "email", label: "Email", type: "email", required: true },
        { name: "email2", label: "Confirmez l'email", type: "email", required: true },
      ]),
      DEFAULTS,
    );
    expect(out.fields!.filter((f) => f.type === "email")).toHaveLength(1);
    expect(unmapped.map(fr)).toEqual(["Confirmez l'email (deuxième adresse email)"]);
  });

  it("without one, asks the editor to add it (publishing requires it)", () => {
    const { actions } = mapForm(form([{ name: "tel", label: "Téléphone", type: "tel", required: true }]), DEFAULTS);
    expect(actions.map(fr)).toContain("Ajouter un champ Email au formulaire (obligatoire pour publier)");
  });
});

describe("consent", () => {
  it("drops the source's consent checkbox: the page renders its own consent control", () => {
    const { form: out, simplified } = mapForm(
      form([
        { name: "email", label: "Email", type: "email", required: true },
        { name: "rgpd", label: "J'accepte la politique de confidentialité *", type: "checkbox", required: true },
      ]),
      DEFAULTS,
    );
    expect(out.fields!.map((f) => f.name)).toEqual(["email"]);
    expect(simplified.map((x) => ({ what: fr(x.what), how: fr(x.how) }))).toEqual([
      { what: "Case « J'accepte la politique de confidentialité » du formulaire source", how: "remplacée par la case de consentement de la page" },
    ]);
  });
});

describe("names and labels", () => {
  it("makes names safe and unique, never one the published form already uses", () => {
    const { form: out } = mapForm(
      form([
        { name: "form[email]", label: "Email", type: "email", required: true },
        { name: "consent", label: "Consentez-vous à être appelé ?", type: "text", required: false },
        { name: "pageId", label: "Référence", type: "text", required: false },
        { label: "Votre prénom", type: "text", required: false },
        { label: "Votre prénom", type: "text", required: false },
        { name: "first-name", label: "Prénom", type: "text", required: false },
        { name: "123", label: "Code", type: "text", required: false },
      ]),
      DEFAULTS,
    );
    expect(out.fields!.map((f) => f.name)).toEqual([
      "email",
      "consent_source",
      "pageId_source",
      "votrePrenom",
      "votrePrenom2",
      "first_name",
      "champ_123",
    ]);
  });

  it("strips the required-marker star and falls back to the legend, the name, then a numbered label", () => {
    const { form: out } = mapForm(
      form([
        { name: "email", label: "Email *", type: "email", required: true },
        { name: "last_name", label: "", type: "text", required: false },
        { label: "", type: "text", required: false },
      ]),
      DEFAULTS,
    );
    expect(out.fields!.map((f) => f.label)).toEqual(["Email", "Last name", "Champ 3"]);
  });
});

describe("form settings", () => {
  it("takes the submit label from the source button and the consent/privacy settings from the workspace defaults", () => {
    const { form: out, actions } = mapForm(form([{ name: "email", label: "Email", type: "email", required: true }], "Je m'inscris"), DEFAULTS);
    expect(out).toMatchObject({
      submitLabel: "Je m'inscris",
      consentPurposeText: DEFAULTS.defaultConsentPurposeText,
      privacyNoticeUrl: DEFAULTS.defaultPrivacyNoticeUrl,
      privacyNoticeVersion: DEFAULTS.defaultPrivacyNoticeVersion,
    });
    expect(out.successMessage).toBeUndefined();
    expect(actions.map(fr)).toEqual(["Rédiger le message affiché après l'envoi du formulaire"]);
  });

  it("lists every setting the workspace has no default for", () => {
    const { form: out, actions } = mapForm(form([{ name: "email", label: "Email", type: "email", required: true }]), {
      defaultConsentPurposeText: " ",
      defaultPrivacyNoticeUrl: null,
    });
    expect(out.submitLabel).toBe("Envoyer");
    expect(out.consentPurposeText).toBeUndefined();
    expect(actions.map(fr)).toEqual([
      "Rédiger le message affiché après l'envoi du formulaire",
      "Renseigner le texte de consentement du formulaire",
      "Renseigner l'adresse de la politique de confidentialité",
      "Renseigner la version de la politique de confidentialité",
    ]);
  });
});
