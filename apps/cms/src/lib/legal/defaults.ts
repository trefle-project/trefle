/**
 * 021-legal-pages (research R9) — the default French legal texts, in
 * Markdown with the placeholders of research R2. The migration converts them
 * to rich text and stores them in Settings only when no legal text exists
 * yet; from then on the operator edits them in the admin. A template to
 * review, not legal advice.
 */
export const DEFAULT_PRIVACY_POLICY_FR = `Cette politique explique comment vos données personnelles sont traitées lorsque vous consultez le site {{site}} et lorsque vous nous adressez une demande par son formulaire.

## Qui est responsable de vos données

Le responsable du traitement est {{owner.name}}.

Forme juridique : {{owner.legalForm}}.

Immatriculation : {{owner.registration}}.

Adresse : {{owner.address}}.

Pour toute question sur vos données ou pour exercer vos droits : {{owner.email}}.

## Qui traite vos données pour son compte

Le site est fourni et hébergé par {{operator.name}}, qui traite vos données uniquement pour le compte du responsable du traitement et selon ses instructions (sous-traitant au sens de l'article 28 du RGPD).

Adresse : {{operator.address}}.

Contact : {{operator.email}}.

Ce prestataire s'appuie lui-même sur les sous-traitants suivants :

{{suppliers}}

## Les données que nous traitons et pourquoi

**Votre demande de contact.** Lorsque vous remplissez le formulaire, nous enregistrons les informations que vous y saisissez (par exemple votre nom, votre adresse e-mail, votre téléphone et votre message), la page depuis laquelle vous l'avez envoyé, sa date et les informations techniques nécessaires pour prouver votre consentement (texte accepté, date, adresse IP, navigateur). Ces données servent à répondre à votre demande et à vous recontacter à son sujet. Elles reposent sur votre consentement, donné en cochant la case du formulaire, et sur les mesures précontractuelles prises à votre demande.

**L'e-mail de confirmation.** Si le site vous demande de confirmer votre adresse e-mail, un message vous est envoyé ; la date de votre confirmation est enregistrée avec votre demande.

**Les tests de pages.** Le site compare parfois deux versions d'une même page pour savoir laquelle est la plus claire. La version affichée est choisie au hasard à chaque visite et rien n'est déposé ni lu sur votre appareil pour cela. Un numéro tiré au hasard pour chaque affichage permet de compter les visites de chaque version et, si vous envoyez le formulaire, de savoir depuis quelle version. Ce traitement repose sur l'intérêt légitime du responsable du traitement à améliorer ses pages. Voir [Tests de pages et mesure d'audience](/audience-measurement).

{{cookieBanner}} **Les cookies de mesure et de marketing.** Avec votre accord, donné ou refusé dans le bandeau de gestion des cookies, des outils de mesure d'audience ou de marketing peuvent être activés. Vous pouvez changer d'avis à tout moment avec le bouton de gestion des cookies affiché en bas de chaque page. Votre choix est conservé six mois.

## Combien de temps nous les conservons

Votre demande et la preuve de votre consentement sont conservées {{retention.leads}} au plus, puis effacées. Les données des tests de pages sont supprimées 30 jours après la fin de chaque test.

## Qui peut y accéder

Seules les personnes habilitées du responsable du traitement et de son prestataire y ont accès. Vos données ne sont ni vendues ni louées.

## Transferts hors de l'Union européenne

Le site est diffusé à travers le réseau de Cloudflare, Inc. (États-Unis). Ce transfert est encadré par le Data Privacy Framework UE–États-Unis et par les clauses contractuelles types de la Commission européenne.

## Vos droits

Vous pouvez accéder à vos données, les faire rectifier ou effacer, en limiter le traitement, vous opposer à leur traitement, en demander la portabilité et retirer votre consentement à tout moment, sans que cela remette en cause ce qui a été fait avant. Le lien de désinscription présent dans nos messages permet aussi de retirer votre consentement. Pour exercer ces droits, écrivez à {{owner.email}}.

Vous pouvez également introduire une réclamation auprès de la Commission nationale de l'informatique et des libertés (CNIL), 3 place de Fontenoy, TSA 80715, 75334 Paris Cedex 07, www.cnil.fr.

{{extra}}
`;

export const DEFAULT_LEGAL_NOTICE_FR = `## Éditeur du site

Le site {{site}} est édité par {{owner.name}}.

Forme juridique : {{owner.legalForm}}.

Immatriculation : {{owner.registration}}.

Adresse : {{owner.address}}.

Contact : {{owner.email}}.

Directeur de la publication : {{owner.director}}.

## Prestataire technique

Le site est fourni par {{operator.name}}.

Forme juridique : {{operator.legalForm}}.

Adresse : {{operator.address}}.

Contact : {{operator.email}}.

Téléphone : {{operator.phone}}.

## Hébergement

Le site est hébergé par {{host.name}}.

Adresse : {{host.address}}.

Téléphone : {{host.phone}}.

## Données personnelles

Le traitement de vos données personnelles est décrit dans la [politique de confidentialité](/privacy).

{{extra}}
`;

export const DEFAULT_LINK_LABELS_FR = { policyLinkLabel: "Confidentialité", noticeLinkLabel: "Mentions légales" } as const;
