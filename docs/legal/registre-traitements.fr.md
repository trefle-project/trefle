# Registre des traitements — fiches à reprendre

**Statut** : brouillon du 2026-10-21 (`specs/021-legal-pages`, research R10).
Deux registres : celui de chaque **propriétaire de domaine** (responsable du
traitement, article 30.1 du RGPD) et celui de l'**opérateur** (sous-traitant,
article 30.2). À compléter et faire relire.

## A. Registre du propriétaire du domaine (responsable du traitement)

### A1. Demandes de contact

| Champ | Valeur |
|---|---|
| Responsable | [Raison sociale, adresse, contact] |
| Finalité | Recevoir les demandes de contact du site [domaine] et y répondre |
| Base légale | Consentement (case du formulaire) et mesures précontractuelles |
| Personnes | Personnes qui envoient le formulaire |
| Données | Champs du formulaire, page et date d'envoi, preuve du consentement (texte, date, adresse IP, navigateur) |
| Destinataires | Personnes habilitées du responsable ; le sous-traitant [opérateur] et ses sous-traitants ultérieurs |
| Transferts | Cloudflare, Inc. (États-Unis) : Data Privacy Framework, clauses contractuelles types |
| Durée | [24 mois] après la demande, puis effacement automatique |
| Sécurité | Voir l'annexe 2 du contrat de sous-traitance |

### A2. Preuve du consentement et e-mail de confirmation

| Champ | Valeur |
|---|---|
| Finalité | Prouver le consentement donné ; confirmer l'adresse e-mail (double opt-in) |
| Base légale | Obligation de pouvoir démontrer le consentement (art. 7.1 RGPD) |
| Données | Texte accepté, version de la politique, date, adresse IP, navigateur ; date de confirmation |
| Durée | Celle de la demande à laquelle il se rattache |

### A3. Tests de pages (018)

| Champ | Valeur |
|---|---|
| Finalité | Comparer deux versions d'une page pour savoir laquelle est la plus claire |
| Base légale | Intérêt légitime (rien n'est déposé ni lu sur l'appareil du visiteur) |
| Données | Numéro aléatoire propre à un affichage, test et version affichés, date ; rattachement à une demande envoyée depuis cet affichage |
| Durée | 30 jours après la fin du test |
| Destinataires | Aucun tiers ; outil d'analyse hébergé par le sous-traitant |

### A4. Cookies de mesure et de marketing (si le bandeau est activé)

| Champ | Valeur |
|---|---|
| Finalité | Mesure d'audience et marketing par les outils configurés (Google Tag Manager) |
| Base légale | Consentement (bandeau) |
| Durée | Choix conservé 6 mois ; durées propres aux outils activés |

## B. Registre de l'opérateur (sous-traitant)

| Champ | Valeur |
|---|---|
| Sous-traitant | [Raison sociale de l'opérateur, adresse, contact] |
| Responsables pour le compte desquels il traite | Les propriétaires des domaines servis (liste dans l'administration, collection « Domains ») |
| Catégories de traitements | A1 à A4 ci-dessus, pour chaque domaine |
| Sous-traitants ultérieurs | Réglages « Sous-traitants » (Hostinger, Cloudflare, Brevo…) |
| Transferts | Cloudflare, Inc. (États-Unis) : Data Privacy Framework, clauses contractuelles types |
| Sécurité | Voir l'annexe 2 du contrat de sous-traitance |

### B2. Traitement propre à l'opérateur : contrôle d'accès à l'administration

Voir `docs/sous-traitant-cloudflare.fr.md` § 3 (Cloudflare Access, membres de
l'équipe).
