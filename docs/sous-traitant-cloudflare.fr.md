# Cloudflare comme sous-traitant — textes prêts à l'emploi

**Statut** : brouillon rédigé le 2026-10-11 pour la tâche T059 de
`specs/017-edge-protection` (FR-019, research R19). Il sera repris par une
feature dédiée aux mentions légales et au registre des traitements ; rien
n'est publié tant que cette feature n'est pas faite.

**Faits vérifiés le 2026-10-11** : Cloudflare est devant tous les hôtes
depuis le 2026-10-10 ; aucune page publique ne dépose de cookie (Bot Fight
Mode désactivé, pas de `__cf_bm` ni de `cf_clearance`) ; la page de
confidentialité est l'URL du réglage `defaultPrivacyNoticeUrl` (contenu géré
dans l'admin, pas dans le dépôt).

## 1. Politique de confidentialité — section « Sous-traitants »

Destinataires : les visiteurs des sites.

> **Cloudflare (sécurité et diffusion du site)**
>
> Le site est diffusé à travers le réseau de Cloudflare, Inc. (États-Unis),
> qui le protège contre les attaques et accélère l'affichage des images et des
> polices. Pour cela, Cloudflare traite, pour notre compte, l'adresse IP des
> visiteurs et les données techniques de chaque requête (adresse de la page,
> navigateur, date et heure). Les informations saisies dans les formulaires
> transitent également par ce réseau, chiffrées entre votre navigateur et
> Cloudflare puis entre Cloudflare et notre serveur. Cloudflare ne les utilise
> pas pour son propre compte.
>
> Cloudflare ne dépose aucun cookie sur votre appareil.
>
> Le transfert de ces données vers les États-Unis est encadré par le Data
> Privacy Framework UE–États-Unis, auquel Cloudflare est certifié, et par les
> clauses contractuelles types de son accord de traitement des données.

## 2. Registre des traitements — sous-traitant

| Champ | Valeur |
|---|---|
| Sous-traitant | Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, États-Unis |
| Traitements concernés | Tous les sites publics (pages, formulaire de contact, images, polices) ; l'admin et GrowthBook |
| Finalités | Protection contre les attaques, filtrage du trafic, mise en cache des images et des polices |
| Données | Adresse IP, données techniques des requêtes, contenu des requêtes en transit (dont les données du formulaire) |
| Personnes concernées | Visiteurs des sites, membres de l'équipe |
| Transfert hors UE | États-Unis : Data Privacy Framework et clauses contractuelles types (accord de traitement des données de Cloudflare, accepté avec ses conditions d'utilisation) |
| Depuis le | 2026-10-10 |

## 3. Registre des traitements — contrôle d'accès à l'administration (019)

Depuis le 2026-10-16, Cloudflare Access contrôle l'accès à l'admin et à
GrowthBook (019-admin-access, FR-014). Ligne à ajouter au registre :

| Champ | Valeur |
|---|---|
| Traitement | Contrôle d'accès à l'administration (admin Payload, GrowthBook) |
| Sous-traitant | Cloudflare, Inc. (Cloudflare Access, plan Zero Trust Free) |
| Finalité | Vérifier, avant tout accès, qu'une personne est un membre actif de l'équipe (code à usage unique envoyé par e-mail) |
| Données | Adresse e-mail des membres ; adresse IP, date et heure de chaque connexion ; un jeton de session de 24 h |
| Personnes concernées | Membres de l'équipe (pas les visiteurs des sites) |
| Base légale | Intérêt légitime : sécurité du système d'information et des données des prospects |
| Source de la liste | Les membres actifs de l'admin, synchronisés par `infra/cloudflare/apply.sh --sync-members` |
| Transfert hors UE | États-Unis : mêmes garanties que la section 2 |
| Depuis le | 2026-10-16 |

Information des membres : une phrase suffit, par exemple dans le message
d'invitation ou la page « Mon compte » — « L'accès à l'administration passe
par Cloudflare Access, qui reçoit votre adresse e-mail pour vous envoyer un
code de connexion et journalise chaque connexion (adresse IP, date et heure). »

## À trancher dans la feature

- **Durée de conservation des journaux chez Cloudflare** : non vérifiée pour
  le plan Free ; à ajouter si le registre exige une durée.
- **019 (accès admin)** : fait, voir la section 3 (en place depuis le
  2026-10-16).
- **Lot 3 et suivants** (HTML servi depuis Cloudflare, Worker) : relire le
  texte, notamment la phrase sur les cookies.
