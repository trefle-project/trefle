/**
 * 023-admin-i18n (US6, contracts/visitor-copy.md) — every text Trefle itself
 * shows to visitors, in French (the wording before 023, unchanged) and
 * English. A page in any other language gets English, marked `lang="en"` by
 * the caller (FR-017). Texts editors write themselves (the page's success
 * message, banner and legal translations, opt-in e-mails) are never here and
 * keep priority (FR-018).
 *
 * Placeholders are `{name}`, filled by `fill()`. A field label is the
 * editor's, as written.
 */
import { ERROR_COPY } from "./error-copy";

const fr = {
  lead: {
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
  },
  form: {
    privacyLink: "Politique de confidentialité",
    newWindow: " (nouvelle fenêtre)",
    submit: "Envoyer",
    honeypot: "Ne pas remplir",
  },
  retry: {
    fallback: "Votre demande n'a pas pu être affichée. Merci de revenir à la page d'origine et de réessayer.",
  },
  link: {
    invalidTitle: "Lien invalide",
    invalid: "Ce lien est invalide ou a expiré.",
  },
  confirm: {
    title: "Confirmer votre adresse",
    text: "Confirmez pour valider votre adresse email. Cette action est immédiate et sans connexion.",
    button: "Confirmer",
    doneTitle: "Adresse confirmée",
    done: "Merci, votre adresse email est confirmée.",
  },
  unsubscribe: {
    title: "Retirer votre consentement",
    text: "Confirmez pour retirer votre consentement. Cette action est immédiate et sans connexion.",
    button: "Confirmer le retrait",
    doneTitle: "Consentement retiré",
    done: "Votre demande a été prise en compte. Vous ne serez plus recontacté(e) au titre de ce consentement.",
  },
  error: ERROR_COPY.fr,
  legal: {
    privacyTitle: "Politique de confidentialité",
    noticeTitle: "Mentions légales",
    beingWritten: "Cette page est en cours de rédaction.",
    version: "Version {version} du {date}",
  },
  carousel: {
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
  },
  measurement: {
    metaTitle: "Tests de pages",
    title: "Tests de pages et mesure d’audience",
    whatTitle: "Ce que nous faisons",
    what: "Ce site compare parfois deux versions d’une même page pour savoir laquelle est la plus claire. À chaque affichage d’une page en test, l’une des versions est choisie au hasard : si vous rechargez la page, vous pouvez voir l’autre.",
    storedTitle: "Ce que nous enregistrons",
    stored: "Rien n’est déposé ni lu sur votre appareil pour ces tests : ni cookie, ni identifiant. Chaque affichage d’une page en test reçoit un numéro tiré au hasard, valable pour cet affichage seulement et conservé uniquement dans le formulaire de la page. Nous enregistrons ce numéro avec la version affichée et, si vous envoyez le formulaire, le fait que votre demande vient de cette version.",
    use: "Ces données servent uniquement à calculer des statistiques sur nos propres pages. Elles ne sont jamais transmises à des tiers et sont supprimées 30 jours après la fin de chaque test.",
  },
};

export type VisitorCopy = typeof fr;
export type CarouselCopy = VisitorCopy["carousel"];
export type VisitorLanguage = "fr" | "en";

const en: VisitorCopy = {
  lead: {
    back: "← Back to the form",
    tel: "The field “{label}” must be a valid phone number.",
    number: "The field “{label}” must be a number.",
    date: "The field “{label}” must be a valid date.",
    radio: "Please choose an option for “{label}”.",
    required: "The field “{label}” is required.",
    invalidEmail: "Invalid email address.",
    consentRequired: "You must agree to send the form.",
    unknownHostTitle: "Error",
    unknownHost: "This site does not accept this form.",
    thanksTitle: "Thank you",
    thanks: "Thank you, your request has been received.",
    waitTitle: "One moment",
    wait: "Please try again in a few seconds.",
    tooManyTitle: "Too many attempts",
    tooMany: "Please try again later.",
    unavailableTitle: "Service temporarily unavailable",
    unavailable: "Please try again in a moment.",
    closedTitle: "Unavailable",
    closed: "This page no longer accepts submissions.",
    notSavedTitle: "Could not send",
    notSaved: "Your request could not be saved.",
    withdrawBefore: "You can ",
    withdrawLink: "withdraw your consent",
    withdrawAfter: " at any time.",
  },
  form: {
    privacyLink: "Privacy policy",
    newWindow: " (new window)",
    submit: "Send",
    honeypot: "Do not fill in",
  },
  retry: {
    fallback: "Your request could not be shown. Please go back to the original page and try again.",
  },
  link: {
    invalidTitle: "Invalid link",
    invalid: "This link is invalid or has expired.",
  },
  confirm: {
    title: "Confirm your address",
    text: "Confirm to validate your email address. This takes effect at once, no sign-in needed.",
    button: "Confirm",
    doneTitle: "Address confirmed",
    done: "Thank you, your email address is confirmed.",
  },
  unsubscribe: {
    title: "Withdraw your consent",
    text: "Confirm to withdraw your consent. This takes effect at once, no sign-in needed.",
    button: "Confirm withdrawal",
    doneTitle: "Consent withdrawn",
    done: "Your request has been processed. You will no longer be contacted under this consent.",
  },
  error: ERROR_COPY.en,
  legal: {
    privacyTitle: "Privacy policy",
    noticeTitle: "Legal notice",
    beingWritten: "This page is being written.",
    version: "Version {version} of {date}",
  },
  carousel: {
    label: "Carousel",
    role: "carousel",
    slideRole: "slide",
    slideOf: "{n} of {count}",
    announce: "Slide {n} of {count}",
    pause: "Pause",
    resume: "Resume scrolling",
    previous: "Previous slide",
    next: "Next slide",
    goTo: "Go to slide {n}",
  },
  measurement: {
    metaTitle: "Page tests",
    title: "Page tests and audience measurement",
    whatTitle: "What we do",
    what: "This site sometimes compares two versions of the same page to find out which one is clearer. Each time a page under test is shown, one of the versions is picked at random: if you reload the page, you may see the other one.",
    storedTitle: "What we record",
    stored: "Nothing is stored on or read from your device for these tests: no cookie, no identifier. Each display of a page under test gets a random number, valid for that display only and kept only in the page's form. We record this number with the version shown and, if you send the form, the fact that your request came from that version.",
    use: "This data is used only to compute statistics about our own pages. It is never passed on to third parties and is deleted 30 days after the end of each test.",
  },
};

export const VISITOR_COPY: Record<VisitorLanguage, VisitorCopy> = { fr, en };

/** `fr` → French, `en` → English, anything else or nothing → English. */
export function visitorCopy(languageCode: string | null | undefined): { lang: VisitorLanguage; copy: VisitorCopy } {
  const lang: VisitorLanguage = languageCode === "fr" ? "fr" : "en";
  return { lang, copy: VISITOR_COPY[lang] };
}

export { fill } from "./fill-text";

/** The `lang` attribute a built-in text needs inside a page in `pageLanguage`: only when they differ. */
export function langIfDifferent(lang: VisitorLanguage, pageLanguage: string | null | undefined): VisitorLanguage | undefined {
  return lang === pageLanguage ? undefined : lang;
}
