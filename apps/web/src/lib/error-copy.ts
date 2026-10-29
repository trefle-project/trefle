/**
 * 023-admin-i18n (US6) — the error pages' texts, apart from the rest of
 * `visitor-copy.ts` because the error boundaries run in the browser: only
 * these few strings reach the visitor's bundle (SC-009).
 */
export const ERROR_COPY = {
  fr: {
    title: "Une erreur est survenue",
    text: "Cette page n’a pas pu s’afficher. Vous pouvez réessayer.",
    retry: "Réessayer",
    globalTitle: "Service momentanément indisponible",
    globalText: "Merci de réessayer dans quelques instants.",
  },
  en: {
    title: "Something went wrong",
    text: "This page could not be displayed. You can try again.",
    retry: "Try again",
    globalTitle: "Service temporarily unavailable",
    globalText: "Please try again in a few moments.",
  },
};
