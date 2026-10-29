# Contrat de sous-traitance (article 28 du RGPD) — modèle

**Statut** : modèle rédigé le 2026-10-21 pour `specs/021-legal-pages` (research
R10). À adapter et faire relire ; ce n'est pas un avis juridique. Il lie
l'**opérateur** d'une installation Trefle (sous-traitant) et le
**propriétaire d'un domaine** servi par cette installation (responsable du
traitement).

---

**Entre**

[Raison sociale du propriétaire du domaine], [forme juridique], immatriculée
[RCS / SIREN], dont le siège est [adresse], représentée par [nom, qualité],
ci-après « le Responsable du traitement »,

**et**

[Raison sociale de l'opérateur], [forme juridique], immatriculée [RCS / SIREN],
dont le siège est [adresse], représentée par [nom, qualité], ci-après « le
Sous-traitant ».

## 1. Objet

Le Sous-traitant fournit au Responsable du traitement le service Trefle pour
le domaine [domaine] : création et hébergement de pages, formulaires de
contact, enregistrement des demandes et des consentements, envoi des e-mails
de confirmation, tests de pages et leur mesure. Le présent contrat fixe les
conditions dans lesquelles il traite, pour le compte du Responsable du
traitement, les données personnelles nécessaires à ce service.

## 2. Description du traitement

| | |
|---|---|
| Nature | Collecte par formulaire, enregistrement, conservation, consultation, export, effacement ; envoi d'e-mails transactionnels ; mesure des tests de pages |
| Finalités | Recevoir et gérer les demandes de contact des visiteurs du domaine ; prouver leur consentement ; comparer des versions de pages |
| Personnes concernées | Visiteurs du domaine, personnes qui envoient le formulaire |
| Données | Champs du formulaire (identité, coordonnées, message), page et date d'envoi, preuve du consentement (texte, date, adresse IP, navigateur), numéro d'affichage et version de page vue lors d'un test |
| Durée | Celle du contrat de service ; durées de conservation : [24 mois] pour les demandes, 30 jours après la fin d'un test pour les données de test |

## 3. Obligations du Sous-traitant

Le Sous-traitant s'engage à :

1. traiter les données uniquement pour les finalités ci-dessus et sur
   instruction documentée du Responsable du traitement, y compris pour les
   transferts hors de l'Union européenne ; s'il estime qu'une instruction
   enfreint la réglementation, il en informe immédiatement le Responsable du
   traitement ;
2. garantir la confidentialité des données et veiller à ce que les personnes
   autorisées à les traiter s'engagent à la confidentialité ;
3. mettre en œuvre les mesures de sécurité décrites en annexe 2 ;
4. ne recourir qu'aux sous-traitants ultérieurs listés en annexe 1 ; informer
   le Responsable du traitement de tout ajout ou remplacement au moins
   [30] jours à l'avance, celui-ci pouvant s'y opposer ; imposer à chacun les
   mêmes obligations que celles du présent contrat ;
5. aider le Responsable du traitement à répondre aux demandes d'exercice des
   droits des personnes (accès, rectification, effacement, opposition,
   limitation, portabilité), notamment par les fonctions d'export et
   d'effacement de l'outil ;
6. notifier au Responsable du traitement toute violation de données dans un
   délai de [48 heures] après en avoir pris connaissance, avec les éléments
   utiles à sa propre notification à la CNIL ;
7. aider le Responsable du traitement pour ses analyses d'impact et la
   consultation préalable de la CNIL lorsque c'est nécessaire ;
8. au terme du service, selon le choix du Responsable du traitement, lui
   restituer les données (export) puis les supprimer, ainsi que leurs copies,
   sauf obligation légale de conservation ;
9. mettre à disposition les informations nécessaires pour démontrer le
   respect du présent contrat et permettre des audits, y compris des
   inspections, par le Responsable du traitement ou un auditeur mandaté, à
   raison d'[une fois par an] sauf incident.

## 4. Obligations du Responsable du traitement

Le Responsable du traitement s'engage à : fournir au Sous-traitant les
informations nécessaires (identité, contact pour la protection des données,
textes propres au domaine) ; informer les personnes concernées (la politique
de confidentialité du domaine, générée par l'outil, est à relire) ; veiller
au respect du RGPD pendant toute la durée du traitement ; superviser le
traitement.

## 5. Durée

Le présent contrat prend effet à sa signature et dure autant que le service.

---

## Annexe 1 — Sous-traitants ultérieurs

| Sous-traitant | Rôle | Localisation | Garanties |
|---|---|---|---|
| [Hostinger International Ltd] | Hébergement du serveur | [Union européenne] | [Accord de traitement, hébergement UE] |
| Cloudflare, Inc. | Diffusion, sécurité, cache | États-Unis / réseau mondial | Data Privacy Framework, clauses contractuelles types |
| [Brevo (Sendinblue SAS)] | Envoi des e-mails | [France / UE] | [Accord de traitement] |

(La liste à jour est celle des réglages « Sous-traitants » de l'installation,
reprise dans chaque politique de confidentialité.)

## Annexe 2 — Mesures de sécurité

- Accès à l'administration limité aux membres actifs, derrière Cloudflare
  Access (code par e-mail) et une double authentification ; vérification du
  jeton d'accès par le serveur.
- Serveur joignable uniquement par le réseau de Cloudflare (pare-feu et
  certificat client) ; chiffrement TLS de bout en bout.
- Secrets chiffrés dans le dépôt de code ; sauvegardes quotidiennes de la base.
- Journal des actions sensibles (exports, effacements, connexions).
- Durées de conservation appliquées automatiquement (purge quotidienne).
- Données de test de pages sans aucun traceur sur l'appareil des visiteurs.
