# Mesure des tests A/B (018) — auto-évaluation CNIL

**Statut** : brouillon rédigé le 2026-10-20 pour l'étape 5 de la mise en
service de `specs/018-ab-significance`, à faire valider par le responsable du
traitement (et un conseil juridique si besoin). **Conclusion : l'exemption ne
s'applique pas** (§ 3). **Décision finale du 2026-10-20 : tests sans cookie**
(§ 7) — rien n'est déposé ni lu sur l'appareil du visiteur, si bien que ni
l'exemption ni le consentement n'entrent en jeu. (Une étape intermédiaire,
« mesure avec consentement », release `018.1-consent`, rendait les landing
pages intestables et a été abandonnée le jour même.) Les tableaux ci-dessous
décrivent la conception évaluée, celle de la release `018-ab-significance`.

**Référence** : CNIL, *Outil d'auto-évaluation relatif à la mise en œuvre
d'une solution de mesure d'audience exemptée de consentement*, juillet 2025
(https://cnil.fr/sites/default/files/2025-07/outil_d_auto-evaluation_mesure_d_audience.pdf),
lu en entier le 2026-10-20. Les réponses ci-dessous suivent le tableau de son
annexe (« modèle de document d'auto-évaluation »).

**Ce qui est évalué** : la mesure telle que construite par 018 et livrée en
production le 2026-10-20 (release `018-ab-significance`), **non activée** :

- sur une page en test A/B, le Worker Cloudflare dépose un identifiant
  aléatoire `tf-visitor` (cookie interne au domaine, 395 jours, jamais
  prolongé) et enregistre la première « exposition » du visiteur : identifiant,
  test, variante vue, date ;
- quand ce visiteur envoie le formulaire de la page, le lead est rattaché à
  l'identifiant et à la variante (`ab_conversions`, avec le lien vers le lead) ;
- GrowthBook, auto-hébergé sur notre serveur, lit ces deux tables et calcule
  la probabilité qu'une variante fasse mieux que l'original ; l'admin n'affiche
  que des totaux par variante ;
- opposition par la page `/audience-measurement` (cookie d'opposition) ; données
  supprimées 30 jours après la fin du test.

Trefle est ici à la fois l'éditeur des sites et le « fournisseur » de la
solution : les critères visant un prestataire tiers sont sans objet.

## 1. Finalité (outil, § 3)

L'outil admet seulement : mesure des performances, détection de problèmes de
navigation, optimisation des performances techniques ou de l'ergonomie,
estimation de la puissance des serveurs, analyse des contenus consultés.

Il **exclut explicitement**, même désactivables :

- « toute mesure à visée marketing, y compris […] la mesure de performance des
  canaux de conversion » ;
- « **toute création de cohorte d'utilisateurs pour leur présenter des contenus
  différenciés, que l'appartenance à une telle cohorte soit définie de manière
  aléatoire** ou bien en fonction des informations précédemment collectées ».

**Évaluation** : un test A/B de page répartit au hasard les visiteurs en
groupes qui voient des contenus différents — c'est la définition même de la
seconde exclusion. Et ce que 018 mesure est un taux de conversion (le lead)
par variante, proche de la première. **Non conforme** à la finalité de
l'exemption, et ce point ne dépend pas d'un réglage : c'est l'objet même de la
fonctionnalité.

## 2. Critères (outil, § 4 et annexe)

| Objectif | Critère | Respecté | Commentaire / action |
|---|---|---|---|
| Finalité unique : mesure d'audience | Instructions pour désactiver ce qui sort du cadre | Oui | Toute la mesure se coupe d'un réglage (`EXPOSURES=off`, runbook 5.1) — mais voir § 1 : la fonctionnalité elle-même sort du cadre |
| | Données minimisées : en-têtes HTTP | Oui | Aucun en-tête n'est enregistré ; le navigateur sert seulement, sur le moment, à écarter les robots déclarés |
| | Au plus trois types d'évènements (présence sur une page, usage d'une fonctionnalité, temps) | Partiel | L'exposition est une « présence sur une page » ; l'envoi du formulaire est un « usage d'une fonctionnalité », **mais il est rattaché au lead**, donc à des données personnelles (voir ligne « marquage ») |
| Sous-traitance | DPA article 28 du RGPD | Sans objet / oui | Pas de prestataire de mesure (GrowthBook auto-hébergé). Cloudflare intervient comme hébergeur de diffusion, avec son accord de traitement (voir `sous-traitant-cloudflare.fr.md`) |
| | Pas de mise en commun entre clients | Oui | Chaque test ne porte que sur les pages d'un domaine ; identifiants propres à chaque domaine |
| | Pas de réutilisation par le prestataire | Oui | Aucun prestataire ne reçoit ces données |
| | Point de contact | Sans objet | Trefle est l'éditeur |
| Pas de suivi hors du site | Aucun import de données externes (CRM, UTM, campagne, référent limité au domaine, aucun outil tiers) | Oui | La mesure n'enregistre ni UTM, ni référent, ni identifiant client ; aucun outil tiers |
| | Identifiant interne au site | Oui | Cookie sans attribut `Domain` : un par domaine, pas de suivi d'un site à l'autre |
| | Adresse IP tronquée si utilisée | Oui | Aucune adresse IP n'est enregistrée par la mesure |
| | Empreinte du terminal | Oui | Aucune |
| | **Aucun marquage permettant de récupérer des informations personnelles, par exemple par le biais de formulaires** | **Non** | `ab_conversions` relie l'identifiant au lead, qui contient e-mail et champs du formulaire. Correction possible : enregistrer la conversion **sans** lien avec le lead (identifiant, variante, date seulement) — mais le « lead confirmé » (double opt-in) ne pourrait plus être compté |
| | Pas de mesure de taux de couverture unifié | Oui | Aucune |
| Statistiques anonymes uniquement | Rapports : statistiques anonymes, arrondies à la dizaine (ou analyse d'anonymat) | Partiel | L'admin et GrowthBook affichent des nombres exacts par variante (visiteurs, leads). Les petits nombres (« 3 leads ») ne désignent personne par eux-mêmes, mais l'admin liste aussi les leads avec leur page, donc leur variante : une analyse d'anonymat serait à écrire, ou un arrondi à la dizaine dans les écrans de test |
| | Anonymisation effective quels que soient les critères choisis | Partiel | Le filtre de période sur les chiffres peut isoler de très petits effectifs : même remarque |
| | Aucun suivi de la navigation d'un utilisateur | Oui | Seule la première exposition à un test est enregistrée ; pas de parcours, pas de rejeu de session |
| Droit d'opposition | Bouton ou lien **dans la politique de confidentialité** | À faire | Prévu dans les mentions légales : à placer plutôt dans la politique de confidentialité, comme le recommande l'outil |
| | Refus pris en compte dans la durée | Oui | Cookie d'opposition (395 jours) : plus d'identifiant, plus d'exposition, plus de rattachement de lead |

## 3. Conclusion

Selon l'outil de juillet 2025, **la mesure de 018 ne peut pas bénéficier de
l'exemption de consentement** :

1. **bloquant** — la finalité : les tests A/B (cohortes aléatoires voyant des
   contenus différents) sont nommément exclus du cadre de l'exemption, de même
   que la mesure de performance d'une conversion ;
2. **bloquant mais corrigeable** — le rattachement de l'identifiant aux
   données du formulaire ;
3. **à compléter** — l'anonymat des statistiques affichées (arrondi ou analyse)
   et l'emplacement du lien d'opposition.

Le point 1 contredit l'hypothèse retenue dans la spec le 2026-10-09 (« option A :
exemption mesure d'audience »), qui s'appuyait sur des sources plus anciennes
ou secondaires citant les tests A/B parmi les usages couverts. L'outil de
juillet 2025 est le document le plus récent de la CNIL sur le sujet et dit
l'inverse.

**Répartition A/B elle-même (008)** : le cookie `tf-ab-*` range le visiteur
dans un groupe pour lui montrer un contenu différent — la même « création de
cohorte ». **Décision du 2026-10-20** : à partir de la release `018.1-consent`,
un visiteur qui n'a pas accepté le bandeau voit toujours la page originale et
ne reçoit aucun cookie de variante. Les cookies posés auparavant expirent
d'eux-mêmes (30 jours) ; la période antérieure n'est pas reprise.

## 4. Options

| Option | Ce que ça change | Coût |
|---|---|---|
| **A. Mesurer seulement avec consentement** | Le Worker ne pose `tf-visitor` et n'enregistre d'exposition que si le visiteur a accepté le bandeau cookies (`tf_consent=accepted`, 007). Les domaines sans bandeau ne sont pas mesurés. La page `/audience-measurement` devient une page d'information ; le retrait passe par le bandeau | Petite évolution de 018 (lecture d'un cookie de plus à l'edge, texte de la page, tests). Échantillon réduit à ceux qui acceptent, donc verdicts plus lents |
| **B. Avis juridique d'abord** | Rien n'est activé tant qu'un DPO ou un avocat n'a pas tranché, en lui transmettant ce document | Délai ; aucune mesure en attendant |
| **C. Ne pas mesurer par visiteur** | La mesure reste coupée ; les tests A/B gardent leurs totaux actuels (visites, leads par variante), sans significativité | Pas de verdict statistique |

Dans tous les cas : corriger le point 2 si la mesure est activée sans lien
avec le lead (ou le garder sous consentement), et placer le lien
`/audience-measurement` dans la politique de confidentialité.

## 5. Registre des traitements — fiche à compléter selon l'option retenue

| Champ | Valeur |
|---|---|
| Traitement | Mesure des tests A/B des pages (comparaison de versions d'une page) |
| Responsable | [à compléter] |
| Finalité | Savoir si une version d'une page obtient plus de demandes de contact que l'original |
| Base légale | Article 82 non concerné : rien n'est déposé ni lu sur l'appareil (§ 7). Pour les données conservées (numéro d'affichage, version, lien avec une demande) : **intérêt légitime** (améliorer nos propres pages) — à confirmer par le responsable du traitement |
| Données | Numéro aléatoire propre à un affichage (jamais stocké sur l'appareil) ; test et version affichés ; date ; si une demande est envoyée depuis cet affichage : date et rattachement à la demande |
| Personnes concernées | Visiteurs des pages en cours de test |
| Destinataires | Aucun tiers. Outil d'analyse (GrowthBook) hébergé sur notre serveur ; Cloudflare en tant que sous-traitant de diffusion |
| Durées | Aucun cookie. Données : supprimées 30 jours après la fin du test ; le lien avec une demande disparaît dès que la demande est effacée ou que son consentement est retiré |
| Mesures de sécurité | Tables non accessibles depuis l'admin ni l'API ; GrowthBook lit avec un rôle en lecture seule limité à ces deux tables ; admin et GrowthBook derrière Cloudflare Access et double authentification |
| Transfert hors UE | Celui de Cloudflare (section 2 de `sous-traitant-cloudflare.fr.md`) ; aucun pour la mesure elle-même |
| Depuis le | [date d'activation] |

## 6. Information des visiteurs

- **Politique de confidentialité** de chaque domaine : un paragraphe sur les
  tests de pages et un lien vers `/audience-measurement`, qui les décrit.
- **Bandeau de cookies** : rien à changer (les tests n'utilisent aucun cookie).

## 7. Décision finale : tests sans cookie (2026-10-20)

Le consentement préalable rendait les landing pages intestables : le
visiteur les voit avant d'avoir répondu au bandeau. La conception retenue
(recherche R15 de la spec) :

- la version est **tirée au hasard à chaque affichage** ; aucun cookie de
  répartition n'est lu ni déposé (un rechargement peut montrer l'autre
  version) ;
- chaque affichage reçoit un **numéro aléatoire** que le Worker place
  uniquement dans le jeton signé du formulaire de la page — il n'est jamais
  stocké sur l'appareil ;
- une « exposition » (numéro, test, version, date) est enregistrée par
  affichage ; une demande envoyée depuis cet affichage est rattachée à son
  numéro et à sa version ;
- conservation : 30 jours après la fin du test ; aucune donnée par affichage
  dans l'admin.

L'article 82 encadre la lecture et l'écriture d'informations sur l'appareil ;
sans aucune, ni le consentement ni son exemption ne sont en cause. Les
critères de l'outil CNIL restent une bonne grille de minimisation : aucun
recoupement hors du test, aucun tiers, statistiques agrégées seulement.
**À confirmer** par le responsable du traitement (base légale des données
conservées : intérêt légitime).
