import { describe, expect, it } from "vitest";

import { ERROR_COPY } from "../src/lib/error-copy";
import { fill, langIfDifferent, VISITOR_COPY, visitorCopy } from "../src/lib/visitor-copy";

/**
 * 023-admin-i18n (US6, T058) — the visitor texts: both languages have the
 * same keys and placeholders (FR-019), any other language gets English, and
 * French is the wording visitors saw before 023, frozen below.
 */
const leaves = (o: object, prefix = ""): [string, string][] =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === "string" ? [[prefix + k, v] as [string, string]] : leaves(v as object, `${prefix}${k}.`)));
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("visitor texts", () => {
  it("French and English have the same keys and the same placeholders, none empty", () => {
    const fr = new Map(leaves(VISITOR_COPY.fr));
    const en = new Map(leaves(VISITOR_COPY.en));
    expect([...en.keys()]).toEqual([...fr.keys()]);
    for (const [key, text] of fr) {
      expect(text, key).not.toBe("");
      expect(en.get(key), key).not.toBe("");
      expect(placeholders(en.get(key)!), key).toEqual(placeholders(text));
    }
    expect(Object.keys(ERROR_COPY.en)).toEqual(Object.keys(ERROR_COPY.fr));
  });

  it("French and English by their code; any other language, or none, gets English", () => {
    expect(visitorCopy("fr")).toEqual({ lang: "fr", copy: VISITOR_COPY.fr });
    expect(visitorCopy("en")).toEqual({ lang: "en", copy: VISITOR_COPY.en });
    for (const code of ["es", "de", "", null, undefined]) expect(visitorCopy(code).lang).toBe("en");
    expect(langIfDifferent("en", "es")).toBe("en");
    expect(langIfDifferent("fr", "fr")).toBeUndefined();
  });

  it("validation messages keep the editor's field label", () => {
    expect(fill(VISITOR_COPY.en.lead.tel, { label: "Téléphone" })).toBe("The field “Téléphone” must be a valid phone number.");
    expect(fill(VISITOR_COPY.fr.lead.required, { label: "Prénom" })).toBe("Le champ « Prénom » est requis.");
    expect(fill("{a} {b}", { a: 1 })).toBe("1 {b}");
  });

  it("French is the wording before 023, byte for byte", () => {
    const fr = VISITOR_COPY.fr;
    expect(fr.lead).toEqual({
      back: "← Revenir au formulaire",
      tel: "Le champ « {label} » doit être un numéro de téléphone valide.",
      number: "Le champ « {label} » doit être un nombre.",
      date: "Le champ « {label} » doit être une date valide.",
      radio: "Veuillez choisir une option pour « {label} ».",
      required: "Le champ « {label} » est requis.",
      invalidEmail: "Adresse email invalide.",
      consentRequired: "Vous devez accepter pour envoyer le formulaire.",
      unknownHostTitle: "Erreur",
      unknownHost: "Ce site n'accepte pas ce formulaire.",
      thanksTitle: "Merci",
      thanks: "Merci, votre demande a bien été enregistrée.",
      waitTitle: "Un instant",
      wait: "Merci de réessayer dans quelques secondes.",
      tooManyTitle: "Trop de tentatives",
      tooMany: "Merci de réessayer plus tard.",
      unavailableTitle: "Service momentanément indisponible",
      unavailable: "Merci de réessayer dans un instant.",
      closedTitle: "Indisponible",
      closed: "Cette page n'accepte plus de soumissions.",
      notSavedTitle: "Envoi impossible",
      notSaved: "Votre demande n'a pas pu être enregistrée.",
      withdrawBefore: "Vous pouvez ",
      withdrawLink: "retirer votre consentement",
      withdrawAfter: " à tout moment.",
    });
    expect(fr.form).toEqual({
      privacyLink: "Politique de confidentialité",
      newWindow: " (nouvelle fenêtre)",
      submit: "Envoyer",
      honeypot: "Ne pas remplir",
    });
    expect(fr.retry.fallback).toBe("Votre demande n'a pas pu être affichée. Merci de revenir à la page d'origine et de réessayer.");
    expect(fr.link).toEqual({ invalidTitle: "Lien invalide", invalid: "Ce lien est invalide ou a expiré." });
    expect(fr.confirm).toEqual({
      title: "Confirmer votre adresse",
      text: "Confirmez pour valider votre adresse email. Cette action est immédiate et sans connexion.",
      button: "Confirmer",
      doneTitle: "Adresse confirmée",
      done: "Merci, votre adresse email est confirmée.",
    });
    expect(fr.unsubscribe).toEqual({
      title: "Retirer votre consentement",
      text: "Confirmez pour retirer votre consentement. Cette action est immédiate et sans connexion.",
      button: "Confirmer le retrait",
      doneTitle: "Consentement retiré",
      done: "Votre demande a été prise en compte. Vous ne serez plus recontacté(e) au titre de ce consentement.",
    });
    expect(fr.error).toEqual({
      title: "Une erreur est survenue",
      text: "Cette page n’a pas pu s’afficher. Vous pouvez réessayer.",
      retry: "Réessayer",
      globalTitle: "Service momentanément indisponible",
      globalText: "Merci de réessayer dans quelques instants.",
    });
    expect(fr.legal).toEqual({
      privacyTitle: "Politique de confidentialité",
      noticeTitle: "Mentions légales",
      beingWritten: "Cette page est en cours de rédaction.",
      version: "Version {version} du {date}",
    });
    expect(fr.carousel).toEqual({
      label: "Carrousel",
      role: "carrousel",
      slideRole: "diapositive",
      slideOf: "{n} sur {count}",
      announce: "Diapositive {n} sur {count}",
      pause: "Mettre en pause",
      resume: "Reprendre le défilement",
      previous: "Diapositive précédente",
      next: "Diapositive suivante",
      goTo: "Aller à la diapositive {n}",
    });
    expect(fr.measurement.metaTitle).toBe("Tests de pages");
    expect(fr.measurement.title).toBe("Tests de pages et mesure d’audience");
  });
});
