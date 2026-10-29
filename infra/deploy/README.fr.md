# Déploiement & exploitation — VPS Debian

> 🇬🇧 English version: [README.md](./README.md)

Cible : un seul hôte Debian 12 faisant tourner les quatre conteneurs Trefle
derrière Caddy. C'est la voie **Phase 4** de la feuille de route de la
constitution ; elle n'ajoute pas d'orchestrateur.

Ce runbook comporte quatre parties :

1. **[Premier déploiement](#étape-1--premier-déploiement)** — une seule fois : monter la stack depuis un hôte nu.
2. **[Mises à jour & rollback](#étape-2--mises-à-jour--rollback)** — passer la stack en marche à une nouvelle release, ou revenir en arrière.
3. **[Configuration permanente](#étape-3--configuration-permanente)** — les réglages, la checklist et le cron que l'on met en place une fois puis que l'on audite.
4. **[Ajout d'un domaine web](#étape-4--ajout-dun-domaine-web)** — raccorder un nouvel hôte de site public à la stack en marche.

Dans tout le document, `$COMPOSE` dans un bloc de commandes suppose que vous avez
exporté ceci dans le shell courant (depuis `~/trefle`) :

```bash
export COMPOSE="docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml"
```

---

## Étape 1 — Premier déploiement

Une seule fois, d'un hôte fraîchement provisionné à une stack en marche.

### 1.1 Préparation de l'hôte (une seule fois)

```bash
# en root
apt update && apt install -y git git-crypt ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" \
  > /etc/apt/sources.list.d/docker.list
apt update && apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
adduser --disabled-password --gecos "" trefle && usermod -aG docker trefle

# pare-feu : uniquement 22, 80, 443
apt install -y ufw && ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw --force enable
```

### 1.2 La clé git-crypt (une seule fois — propriétaire du dépôt, sur son poste)

`infra/.env` est commité **chiffré avec git-crypt**. Le dépôt est déjà
initialisé (`git-crypt init` a été lancé une fois) ; il vous suffit d'exporter
la clé symétrique et de la stocker en lieu sûr — c'est l'unique secret qui
déverrouille tout, et il NE DOIT PAS entrer dans le dépôt, les logs de CI ou un
chat.

```bash
git-crypt export-key ~/trefle-git-crypt.key   # depuis un clone qui peut déjà lire infra/.env
chmod 600 ~/trefle-git-crypt.key
# rangez ~/trefle-git-crypt.key dans votre gestionnaire de mots de passe ; c'est votre seule copie
```

Pour ajouter un·e collègue plutôt que partager la clé brute, utilisez
`git-crypt add-gpg-user <id-de-sa-clé-gpg>` puis commitez.

### 1.3 Récupérer le code + les secrets

```bash
sudo -iu trefle
git clone <url-du-dépôt> ~/trefle && cd ~/trefle
git checkout main

# déverrouiller infra/.env — copier la clé via SSH, ne jamais la commiter
scp vous@poste:~/trefle-git-crypt.key /tmp/k
git-crypt unlock /tmp/k && shred -u /tmp/k
git-crypt status infra/.env          # -> "encrypted: infra/.env"
test -r infra/.env && head -1 infra/.env   # texte clair lisible maintenant
```

Remplacez ensuite chaque valeur de `infra/.env` par une vraie valeur de
production (celles commitées sont des valeurs jetables de dev local) puis :

```bash
./infra/deploy/preflight.sh          # doit afficher "preflight: OK"
```

`infra/.env` doit définir, en plus des clés locales (voir `infra/.env.example`) :

| Clé | Valeur |
|---|---|
| `RELEASE` | le sha ou tag git déployé (alimente la capture d'erreurs) |
| `CMS_PUBLIC_URL` | `https://admin.trefle.example` |
| `CMS_HOSTNAME` | `admin.trefle.example` |
| `WEB_HOSTNAMES` | séparés par des espaces, ex. `trefle.example www.trefle.example promo.acme.com` |
| `IMG_HOSTNAME` | `img.trefle.example` — Caddy le route vers ImgProxy |
| `S3_ENDPOINT` / `S3_*` | l'endpoint du cluster Garage de production + identifiants + bucket (son propre bucket, distinct du substitut de dev). Les quatre sont **obligatoires** — le cms refuse de démarrer en production si l'un manque. Deux options : **(a)** un cluster Garage/S3 externe déjà en place, ou **(b)** le service `garage` mono-nœud de `docker-compose.prod.yml`, auto-hébergé sur ce VPS (`S3_ENDPOINT=http://garage:3900`, `S3_REGION=garage`) — dans ce cas, définissez aussi `ASSET_HOSTNAME` et `GARAGE_RPC_SECRET` ci-dessous. |
| `ASSET_ORIGIN` | URL de base publique, joignable par le navigateur, du bucket, ex. `https://assets.trefle.example`. Les URLs des médias + les vignettes de l'admin s'y résolvent ; les `<img>` des pages publiées sont réécrites via ImgProxy. Le bucket doit autoriser le `GET` public sur les chemins d'objets (ImgProxy lit `s3://` en privé). |
| `ASSET_HOSTNAME` | **option (b) uniquement** — hôte public du bucket auto-hébergé (ex. `assets.trefle.example`), routé par Caddy vers `garage:3902`. Inutile avec un cluster externe (a). |
| `GARAGE_RPC_SECRET` | **option (b) uniquement** — `openssl rand -hex 32`, secret RPC interne du nœud Garage. |
| `IMGPROXY_URL` | `https://img.trefle.example` (= `https://<IMG_HOSTNAME>`) |
| `IMGPROXY_KEY` / `IMGPROXY_SALT` | partagés avec le service `imgproxy` ; le renderer signe les URLs avec |
| `SMTP_*` | le vrai fournisseur mail |
| `ERROR_SINK_URL` | optionnel ; les enveloppes d'erreur sont POSTées ici |
| `ANTHROPIC_API_KEY` | optionnel — la clé de l'API Claude pour « Importer depuis une page web » (Étape 6). **Vide, l'import reste masqué.** |
| `IMPORT_AI_MODEL` / `IMPORT_AI_EFFORT` | optionnels — modèle et effort de la conversion, par défaut `claude-opus-5` / `medium` |

**Clés du stockage objet — à créer maintenant, avant le premier démarrage
(option b).** La clé d'accès Garage, son secret et le `GARAGE_RPC_SECRET`
du dev local sont figés dans `infra/docker-compose.override.yml` : ils sont
donc publics. La production ne doit jamais les réutiliser : générez les siens
sur le VPS.

```bash
echo "S3_ACCESS_KEY_ID=GK$(openssl rand -hex 12)"
echo "S3_SECRET_ACCESS_KEY=$(openssl rand -hex 32)"
echo "GARAGE_RPC_SECRET=$(openssl rand -hex 32)"
```

Collez les trois lignes dans `infra/.env` (à la place des lignes existantes)
et gardez-en une copie dans votre gestionnaire de mots de passe.
L'identifiant de clé est `GK` suivi de 24 caractères hexadécimaux, le format
de Garage ; une installation mise en place avec un autre identifiant le garde
(Garage l'a accepté à son premier démarrage). Au premier démarrage, le service `garage` crée le
bucket et cette clé à partir de ces valeurs (`--default-bucket`) ; il ne le
refait pas ensuite : les changer plus tard impose d'importer la nouvelle clé
dans Garage à la main (`garage key import`) et de lui donner accès au bucket.
`preflight.sh` refuse les valeurs de dev et un identifiant de clé de moins de 20 caractères. Avec un
cluster externe (option a), utilisez la clé fournie par ce cluster.

DNS : pointez chaque hôte de `CMS_HOSTNAME` + `WEB_HOSTNAMES` + `IMG_HOSTNAME`
vers les `A`/`AAAA` du VPS.

### 1.4 Premier démarrage

```bash
cd ~/trefle
$COMPOSE build
$COMPOSE up -d db
$COMPOSE run --rm cms npm --workspace @trefle/cms run payload:migrate
# le seed exige SEED_ADMIN_PASSWORD (>= 16 caractères) dans infra/.env — il
# refuse de créer un mot de passe admin par défaut en production.
$COMPOSE run --rm cms npm --workspace @trefle/cms run seed:dev   # crée le premier admin + la clé de service
$COMPOSE up -d
$COMPOSE ps   # tout doit être "healthy"
```

`CMS_SERVICE_API_KEY` dans `infra/.env` est utilisée telle quelle — `seed:dev`
fixe la clé de l'utilisateur `service` sur cette valeur (et re-synchronise en cas
de dérive), il n'y a donc rien à recopier. Connectez-vous, changez le mot de
passe admin, invitez la vraie équipe (US5).

**Langue de l'admin** *(023)*. L'admin est en français ou en anglais. Une
nouvelle installation démarre en anglais ; pour l'avoir en français,
connectez-vous et réglez *Settings → Default → Langue de l'admin par défaut*
sur *Français*. Le réglage vaut pour la page de connexion et pour chaque
membre qui n'a pas choisi de langue, sous 30 secondes. Chaque membre peut
choisir la sienne dans *Compte → Langue de l'admin* ; elle s'applique tout
de suite et le suit sur tous ses appareils. Une installation mise à jour
vers 023 garde un admin en français : la migration règle la langue de
l'installation sur le français quand des membres existent déjà, et laisse
vide le choix de chaque membre (la langue de l'installation).

---

## Étape 2 — Mises à jour & rollback

Une release est un tag git annoté sur `main`, nommé d'après la fonctionnalité
(`010-date-range-filters`, `011-form-field-types`, …). `RELEASE` dans
`infra/.env` prend la valeur de ce tag. Chaque déploiement jusqu'ici est tombé
dans au moins un des pièges ci-dessous : la procédure est construite autour
d'eux.

### 2.0 La voie rapide — `release.sh`

[`release.sh`](./release.sh) enchaîne 2.1 et 2.2 de bout en bout, avec toutes
les vérifications ci-dessous intégrées. Prenez d'abord le snapshot Hostinger,
puis, en `trefle` sur le VPS :

```bash
git -C ~/trefle fetch -q --tags origin
git -C ~/trefle show <tag>:infra/deploy/release.sh > /tmp/trefle-release.sh
bash /tmp/trefle-release.sh --snapshot-done <tag>
```

Pour un rollback, passez plutôt `--rollback <tag-précédent>`. Prenez toujours
le script du tag **cible** (`git show`), jamais la copie extraite : la release
que vous déployez apporte ainsi sa propre logique de déploiement.

- **Ce qu'il refuse :** de tourner sans `--snapshot-done`, sous un autre
  utilisateur que `trefle`, sur un tag inconnu, ou de redéployer le tag déjà
  en ligne.
- **Quand le modèle `.env` gagne des clés :** il s'arrête et liste les noms des
  clés manquantes. Ajoutez-les dans `infra/.env` avec de vraies valeurs, puis
  relancez la même commande.
- **Le relancer après n'importe quel arrêt est sans risque :** il reprend sans
  écraser `infra/.env` et sans refaire de `migrate:down`.
- **Ce qu'il affiche :** uniquement des noms de clés, jamais de valeurs.
- **Le cache de build Docker :** en fin de release, il supprime le cache de
  plus de 7 jours (`docker builder prune --filter until=168h`) et affiche
  l'espace disque. Sans ça, chaque build l'accumule : 66 Go en octobre 2026.

Depuis Claude, on l'envoie de la même façon via SSH (le script met déjà
`</dev/null` sur chaque appel compose) :
`ssh root@<ip-du-vps> 'sudo -u trefle bash -s' <<'EOF' … EOF`.

Les sections suivantes décrivent ce que fait le script, étape par étape.
Servez-vous-en pour comprendre un arrêt ou pour déployer à la main.

### 2.1 Mettre à jour vers une nouvelle release

**0. Avant de commencer (sur votre poste).**

- Prenez un **snapshot Hostinger** manuel du VPS (hPanel → VPS → Snapshots).
  Un seul est conservé : c'est toujours « juste avant le dernier
  déploiement ». C'est le filet de sécurité de toute la machine, en plus du
  `down` des migrations.
- Connectez-vous en `root@<ip-du-vps>`, puis passez en `trefle`. L'alias du
  domaine dans `~/.ssh/config` pointe vers un utilisateur qui n'existe pas sur
  le VPS et échoue avec `Permission denied (publickey)`.
- Notez le tag actuellement déployé (`git describe --tags` sur le VPS). Il sert
  à la comparaison du `.env` et à un éventuel rollback.

**1. Mettre `infra/.env` de côté et vérifier si son modèle change.**

`infra/.env` est chiffré par git-crypt et, sur le VPS, contient les vrais
secrets sous forme de modification locale non commitée. Git le voit comme un
fichier binaire et ne sait pas le fusionner.

```bash
cd ~/trefle
export COMPOSE="docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml"
cp infra/.env ~/env.backup-before-<nouveau-tag>
git fetch --tags origin
git diff --quiet <tag-actuel> <nouveau-tag> -- infra/.env && echo "modèle inchangé" || echo "MODÈLE MODIFIÉ"
```

- **Modèle inchangé** (le cas habituel) : `git checkout <nouveau-tag>` conserve
  le `.env` local tel quel. Passez à l'étape 2.
- **Modèle modifié** (la release ajoute des clés) : abandonnez la copie
  locale, faites le checkout, remettez la sauvegarde, puis ajoutez **à la
  main** uniquement les nouvelles clés du nouveau modèle :

  ```bash
  git checkout -- infra/.env
  git checkout <nouveau-tag>
  cp ~/env.backup-before-<nouveau-tag> infra/.env
  diff <(git show --textconv <nouveau-tag>:infra/.env | grep -oE '^[A-Z_]+=' | sort) <(grep -oE '^[A-Z_]+=' infra/.env | sort)
  ```

  Les lignes préfixées par `<` sont les clés à ajouter (avec de vraies valeurs
  de prod, pas les valeurs de dev du modèle).

  N'utilisez jamais `git stash` / `git stash pop` sur ce fichier. La fusion
  binaire de git se replie en silence : lors du déploiement 008, le résultat
  paraissait propre dans `git status` mais avait perdu 8 clés de prod
  (hostnames, `GARAGE_RPC_SECRET`, `RELEASE`, …). Lisez toujours la version
  commitée avec `git show --textconv <ref>:infra/.env`. Sans `--textconv`,
  git-crypt ne déchiffre pas et vous obtenez du charabia ou un résultat vide.

**2. Checkout, mise à jour de `RELEASE`, preflight.**

```bash
git checkout <nouveau-tag>
sed -i 's/^RELEASE=.*/RELEASE=<nouveau-tag>/' infra/.env
diff <(grep -oE '^[A-Z_]+=' ~/env.backup-before-<nouveau-tag> | sort) <(grep -oE '^[A-Z_]+=' infra/.env | sort) && echo "mêmes clés"
./infra/deploy/preflight.sh
```

Le diff des listes de clés doit être vide, sauf si vous avez volontairement
ajouté des clés à l'étape 1. Comparez **uniquement les noms** : n'affichez
jamais les valeurs du `.env`, ni `docker compose config` sans `--quiet`, ni
les logs bruts de `seed:dev` (ils affichent `apiKey = …`). Des secrets ont
déjà fuité deux fois dans une conversation de cette façon.

**3. Build, migration, recréation.**

```bash
$COMPOSE build cms web
$COMPOSE run --rm cms npm --workspace @trefle/cms run payload:migrate </dev/null
$COMPOSE up -d --wait cms web </dev/null
```

- Ne construisez que `cms` et `web` : les autres services utilisent des images
  amont figées.
- Les anciens `cms`/`web` continuent de servir pendant le build et la
  migration. Les migrations sont additives par principe, donc l'ancien code
  tolère le nouveau schéma pendant ces quelques secondes.
- **Le `</dev/null` est obligatoire quand les commandes tournent dans un
  script** (par exemple `ssh root@<ip-du-vps> 'sudo -u trefle bash -s' <<'EOF'
  … EOF`, qui est la façon dont Claude déploie). `docker compose run` lit
  l'entrée standard et avale donc toutes les lignes restantes du script : la
  migration s'exécute, puis plus rien, sans aucune erreur. C'est ce qui a
  laissé la prod sur les anciens conteneurs lors des déploiements 010 et 011.
- Si la release ne modifie que `infra/deploy/Caddyfile`, `up -d` ne le prend
  **pas** en compte (compose ne voit aucun changement de service). Un
  `caddy reload` non plus : le Caddyfile est monté comme fichier seul, et le
  checkout a remplacé le fichier, donc le conteneur voit encore l'ancien.
  Recréez Caddy (une ou deux secondes sans proxy) :
  `$COMPOSE up -d --force-recreate --no-deps caddy </dev/null`.

**4. Vérifier, ne pas supposer.**

```bash
$COMPOSE ps cms web
for s in cms web; do [ "$(docker inspect trefle-$s-1 -f '{{.Image}}')" = "$(docker image inspect trefle-$s -f '{{.Id}}')" ] && echo "$s sur la nouvelle image" || echo "$s ENCORE SUR L'ANCIENNE IMAGE"; done
curl -s -o /dev/null -w '%{http_code}\n' https://<domaine-apex>/
curl -s -o /dev/null -w '%{http_code}\n' https://<hostname-cms>/admin
```

- Les deux conteneurs doivent être `healthy` **et** annoncés « sur la nouvelle
  image ». Un temps `Up` récent ne suffit pas.
- La sortie de migration doit lister chaque nouvelle migration
  (`Migrated: <nom>`). Si la release en contient une, vérifiez aussi son effet
  directement en base (`docker exec trefle-db-1 psql -U <user> <db> -c '…'`).
- Une fois tout vérifié, supprimez `~/env.backup-before-<nouveau-tag>` ou
  gardez-le jusqu'au prochain déploiement. Il contient les secrets de prod : il
  doit rester lisible par `trefle` uniquement.

### 2.2 Retour arrière (rollback)

Les migrations livrent un `down` testé (Principe III de la constitution), mais
le code de ce `down` n'existe **que dans la release qui a ajouté la
migration**. Annulez le schéma *avant* de quitter le mauvais tag :

```bash
cd ~/trefle
$COMPOSE run --rm cms npm --workspace @trefle/cms run payload -- migrate:down </dev/null
git checkout <tag-précédent>
sed -i 's/^RELEASE=.*/RELEASE=<tag-précédent>/' infra/.env
$COMPOSE build cms web
$COMPOSE up -d --wait cms web </dev/null
```

- `migrate:down` annule le **dernier lot**, c'est-à-dire toutes les migrations
  appliquées par le dernier `payload:migrate`. Cela correspond exactement à une
  release quand chaque déploiement le lance une seule fois. Vérifiez sa sortie
  avant d'aller plus loin.
- Faire le checkout du tag précédent puis y lancer `payload:migrate`
  n'annule **rien**. Ce tag ne connaît pas les migrations plus récentes et les
  laisse en place.
- Si le modèle `.env` a changé dans la mauvaise release, restaurez
  `~/env.backup-before-<mauvais-tag>`.
- Refaites ensuite les vérifications de l'étape 4 du 2.1.
- Si ce sont les données elles-mêmes qui sont abîmées, restaurez le snapshot
  Hostinger ou le dump Postgres (§3.4).

---

## Étape 3 — Configuration permanente

La stack des étapes 1–2 tourne ensuite d'elle-même. Cette section, c'est la
configuration que l'on pose une fois puis que l'on **audite régulièrement** —
rien ici n'est une action à refaire à chaque déploiement.

### 3.1 Garanti par le code / la config (vérifier, ne pas réimplémenter)

- `infra/deploy/preflight.sh` passe (longueurs des secrets, pas de
  `POSTGRES_PASSWORD` par défaut, tous les `S3_*` définis) — à lancer avant le
  premier `up`.
- Le cms refuse de démarrer en production si un `S3_*` manque ; `seed:dev`
  refuse un mot de passe admin par défaut sans `SEED_ADMIN_PASSWORD`.
- `db` / `cms` / `web` / `imgproxy` / `browser` ne publient **aucun** port hôte
  (`ports: !reset []` dans `docker-compose.prod.yml`) — seul Caddy est exposé.
- Import de pages (Étape 6) : le cms refuse de démarrer en production
  (`DEPLOY_ENV=production`) si `IMPORT_AI_MODE=fixture` ou
  `IMPORT_ALLOW_PRIVATE_HOSTS` (réservés aux tests) sont définis, et
  `preflight.sh` signale les deux. Toute adresse chargée par un import — la
  page, ses ressources, ses images et chaque redirection — doit résoudre vers
  une IP publique (jamais `cms`, `db`, l'hôte ou l'adresse de métadonnées du
  cloud).
- Caddy ajoute `Strict-Transport-Security` + `nosniff` et retire `Server`
  (snippet `(sechdr)`) ; la redirection HTTP → HTTPS est automatique.
- Le renderer envoie une CSP à nonce (`script-src` sans `'unsafe-inline'`),
  `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, pas de
  `X-Powered-By` ; l'admin envoie le jeu statique + `frame-ancestors 'self'`.
- ImgProxy ne répond qu'aux URLs signées (`IMGPROXY_KEY`/`SALT`) et aux sources
  `s3://` ; `IMGPROXY_MAX_SRC_RESOLUTION=50`.
- `infra/.env` est commité chiffré git-crypt ; la clé circule uniquement hors
  bande (jamais le dépôt ni les logs de CI).
- `npm audit --omit=dev` : 0 critique / 0 élevé au moment du lot
  002-security-hardening (16 modérés/faibles résiduels — outillage de dev + DoS
  de parseur non atteignable ; à ré-auditer au prochain mineur Payload/Next).

### 3.2 Checklist manuelle hôte / ops

- [ ] SSH par clé uniquement, login root désactivé, `ufw` limité à 22/80/443.
- [ ] Mises à jour automatiques (`unattended-upgrades`) activées pour l'OS hôte.
- [ ] `RELEASE` est défini pour que les enveloppes d'erreur soient attribuables.
- [ ] Le worker de rétention tourne (`JOBS_AUTORUN=true` sur `cms`) ; vérifiez
      qu'une entrée `retention-deletion` apparaît après le premier passage
      planifié (03:00).
- [ ] Changez le mot de passe admin seedé à la première connexion ; invitez
      l'équipe.
- [ ] Testez une première connexion d'un·e Éditeur·rice (le e2e `us5-roles` est
      en quarantaine pour une raison de harnais de test multi-hôtes — la prod
      mono-hôte est OK, mais confirmez-le une fois à la main).
- [ ] Le cron de sauvegarde hors-machine (3.3) est installé et son dernier
      passage a réussi.

### 3.3 Sauvegardes hors-machine

`pg-backup` écrit chaque nuit dans le volume `backups` de `~/trefle` (03:30,
rétention 14 jours). Si le stockage objet est le service `garage` auto-hébergé
(option b, §1.3), `garage-backup` fait de même à 03:45 (`tar` de
`garage-data` + `garage-meta`, même rétention). Expédiez tout ça hors-machine
avec un cron hôte — `find -mmin` récupère les deux, pas juste le plus récent :

```bash
# cron sur l'hôte, 04:00
docker run --rm -v trefle_backups:/b -v /home/trefle/offsite:/o alpine \
  sh -c "find /b -maxdepth 1 -type f -mmin -180 -exec cp {} /o/ \;" \
  && rclone copy /home/trefle/offsite <remote>:trefle-backups
```

Si le stockage objet est un cluster Garage/S3 **externe** (option a, §1.3) au
lieu du service `garage` sur ce VPS, sauvegardez-le de son côté — il n'écrit
rien dans le volume `backups` local. Le fournisseur SMTP est de toute façon
externe, rien à sauvegarder ici.

### 3.4 Restauration

```bash
$COMPOSE up -d db
gunzip -c backups/trefle-AAAAMMJJ-HHMMSS.sql.gz | \
  $COMPOSE exec -T db psql -U trefle -d trefle
```

### 3.5 Suites à traiter (non faites dans 002-security-hardening)

Contournement du rate-limit via X-Forwarded-For (prendre le `client_ip` de
Caddy) ; échapper le `referer` reflété / le `label` d'éditeur dans
`apps/web/.../api/leads/route.ts` ; assainir le HTML GrapesJS de l'éditeur (ou
resserrer encore la CSP du renderer) ; MFA admin / liste d'IP autorisées devant
`CMS_HOSTNAME` ; passer le rate-limiter en mémoire vers un store partagé ; faire
expirer les jetons de prévisualisation ; revoir les plafonds de corps de requête
à 10 Mo ; resserrer le `script-src` de la CSP admin.

---

## Étape 4 — Ajout d'un domaine web

> Une fois la plateforme derrière Cloudflare (étape 7), un domaine client
> s'ajoute sur `www.` avec la section 7.4 au lieu de 4.1 ; 4.2 à 4.5 ne
> changent pas.

Raccorder un nouvel hôte de site public (ex. `promo.acme.com`) touche quatre
endroits. Aucune modification de code, aucune modification du Caddyfile et
aucun déploiement de release ne sont nécessaires. Faites-les dans cet ordre :

| # | Où | Quoi | Obligatoire |
|---|---|---|---|
| [4.1](#41-dns--pointer-lhôte-vers-le-vps) | DNS du domaine (registrar) | `A` + `AAAA` → le VPS | oui |
| [4.2](#42-vps--ajouter-lhôte-à-web_hostnames--recréer-caddy) | VPS, en `trefle` | `WEB_HOSTNAMES` + recréer Caddy (certificat TLS) | oui |
| [4.3](#43-admin--enregistrer-le-domaine) | admin | enregistrement **Domains** + pages | oui |
| [4.4](#44-vérifier) | navigateur / `curl` | TLS, page, formulaire | oui |
| [4.5](#45-brevo--lexpéditeur-e-mail-propre-au-domaine-optionnel) | Brevo + DNS + admin | envoyer les e-mails d'opt-in en `@promo.acme.com` | optionnel |

**Inutile pour un nouveau domaine** — ces hôtes existent une seule fois pour
toute la plateforme et servent tous les sites. Ils ne reçoivent **aucun**
enregistrement DNS sous le nouveau domaine :

- `experiments.` / `experiments-api.` (GrowthBook) — l'affectation A/B se
  fait côté serveur, dans le middleware du renderer, qui lit le test auprès du
  cms par le réseau Docker interne. Le navigateur n'appelle jamais GrowthBook.
  Les tests A/B fonctionnent sur tout domaine enregistré.
- `img.` / `assets.` — les images de chaque page sont réécrites vers
  `IMGPROXY_URL` / `ASSET_ORIGIN`, communs à toute la plateforme. La CSP du
  renderer autorise `img-src https:`. Une page sur `promo.acme.com` qui charge
  depuis `img.<domaine plateforme>` fonctionne donc telle quelle.
- `admin.` — l'admin unique sert tous les domaines.

### 4.1 DNS — pointer l'hôte vers le VPS

Chez le registrar qui héberge la zone DNS du nouveau domaine (souvent **pas**
Hostinger), créez :

| Type | Nom | Valeur |
|---|---|---|
| `A` | `@` (apex) ou le sous-domaine | l'IPv4 du VPS |
| `AAAA` | idem | l'IPv6 du VPS |

Pour l'apex **et** `www`, créez les deux paires. Chaque hôte est aussi une
entrée distincte en 4.2 et un enregistrement distinct en 4.3. Les valeurs sont
celles vers lesquelles `CMS_HOSTNAME` pointe déjà. Copiez-les plutôt que de les
retaper :

```bash
dig +short A admin.<domaine plateforme>
dig +short AAAA admin.<domaine plateforme>
```

Avant de continuer, vérifiez que les deux enregistrements se résolvent via un
résolveur public. Sinon, le challenge ACME HTTP-01 de Caddy échoue, et
Let's Encrypt limite les échecs répétés :

```bash
dig +short A promo.acme.com @1.1.1.1
dig +short AAAA promo.acme.com @1.1.1.1
```

Supprimez tout `A`/`AAAA`/`CNAME` créé par défaut par le registrar sur le même
nom (page de parking, « bientôt disponible »), sinon une partie des requêtes
part ailleurs.

### 4.2 VPS — ajouter l'hôte à `WEB_HOSTNAMES` + recréer Caddy

Le dépôt et `infra/.env` appartiennent à l'utilisateur **`trefle`**
(`/home/trefle/trefle`). En `root`, `~/trefle` désigne `/root/trefle`, qui
n'existe pas : `infra/.env` paraît alors vide. Changez toujours d'utilisateur
d'abord. `sudo -iu trefle` ouvre un nouveau shell de connexion, donc
`export COMPOSE` doit venir **après**. Sinon, `$COMPOSE up` devient un simple
`up` (`command not found`) :

```bash
ssh root@<IP du VPS>
sudo -iu trefle
cd ~/trefle
export COMPOSE="docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml"
```

Ajoutez le ou les nouveaux hôtes à `WEB_HOSTNAMES`, sur une seule ligne,
séparés par des espaces :

```bash
nano infra/.env
```

```
WEB_HOSTNAMES=<hôtes existants> promo.acme.com www.promo.acme.com
```

Dans nano, `Ctrl+O` puis `Entrée` enregistre, et `Ctrl+X` quitte. Vérifiez la
ligne, puis recréez Caddy et suivez l'obtention des certificats :

```bash
grep '^WEB_HOSTNAMES=' infra/.env
./infra/deploy/preflight.sh
$COMPOSE up -d caddy
docker exec trefle-caddy-1 printenv WEB_HOSTNAMES
$COMPOSE logs -f caddy
```

- `preflight` doit toujours afficher `preflight: OK`.
- `printenv` doit montrer le ou les nouveaux hôtes. Caddy ne lit
  `WEB_HOSTNAMES` qu'à la **recréation** du conteneur. Un `caddy reload` ou un
  redémarrage sans `up -d` garde l'ancienne liste.
- Dans les logs, attendez `certificate obtained successfully` pour **chaque**
  nouvel hôte, puis `Ctrl+C` (ce qui arrête l'affichage des logs, pas Caddy).

`{$WEB_HOSTNAMES}` dans `deploy/Caddyfile` route chaque hôte listé vers
`web:3001`. Aucune modification du Caddyfile n'est nécessaire.

Cette modification n'existe que dans le `infra/.env` non commité du VPS (le
fichier commité est le modèle de dev). `release.sh` le sauvegarde et le
restaure à chaque déploiement : elle survit donc aux mises à jour.
**Exception :** `release.sh --rollback` restaure le fichier tel qu'il était
*avant la release annulée*. Un domaine ajouté après ce déploiement disparaît
alors. Revérifiez `WEB_HOSTNAMES` après tout rollback.

### 4.3 Admin — enregistrer le domaine

Le renderer résout le `Host` de la requête via la collection **Domains**
(`apps/web/src/lib/domains.ts`). Tant qu'aucun enregistrement *actif*
n'existe, il renvoie « not-found » pour tout chemin sur cet hôte, même si
Caddy le sert déjà avec un certificat valide.

Dans `https://<CMS_HOSTNAME>` → **Content → Domains → New**, un
enregistrement par hôte (apex et `www` font deux enregistrements) :

| Champ | Valeur |
|---|---|
| `hostname` | hôte nu, en minuscules, sans schéma ni chemin — ex. `promo.acme.com` (validé) |
| `isActive` | coché — décoché ⇒ le renderer renvoie « not-found » pour cet hôte |
| `label` | nom optionnel affiché dans l'admin |
| `defaultLanguage` | optionnel (005) — pré-remplit la langue d'une nouvelle page créée sous ce domaine ; aucun effet sur les pages existantes |
| `senderName` / `senderEmail` | **laissez vides pour l'instant** — ne les renseignez qu'à l'étape 7 de la 4.5, une fois le domaine authentifié dans Brevo |
| `branding` | favicon / image OG par défaut / tokens de thème, optionnels |
| `notFoundPagePath` | recommandé — le `path` d'une page publiée **de ce même domaine**, servie sur tout chemin sans page (y compris la racine, si aucune page n'a le chemin `/`) au lieu d'un 404. La page de repli est cherchée sur cet enregistrement Domain uniquement : faire pointer le `www` vers une page de l'apex (ou l'inverse) donne toujours un 404 |
| `gtmContainerId` | optionnel (007) — le conteneur Google Tag Manager de ce domaine, ex. `GTM-ABC1234`. Vide ⇒ pas de snippet GTM |
| `consentBannerEnabled` | coché par défaut (007) — bandeau de consentement cookies sur ce domaine |

Créez ou assignez ensuite des pages au domaine. Les enregistrements
déclenchent une revalidation ciblée (`domain-changed`), l'hôte est donc en
ligne en quelques secondes.

018 : décrire les tests de pages dans la politique de confidentialité du
domaine et y ajouter un lien vers `/audience-measurement` — voir 5.1.

### 4.4 Vérifier

```bash
curl -sSI https://promo.acme.com/ | head -n 20
```

Attendu : un `200` (ou la page `notFoundPagePath`), un certificat valide et
l'en-tête `strict-transport-security`. Puis, dans un navigateur :

- ouvrez une page assignée au domaine et vérifiez que les images se chargent
  (depuis `img.<domaine plateforme>`) ;
- soumettez son formulaire et vérifiez que le lead apparaît dans l'admin ;
- si la page a une page de confirmation (003), vérifiez que la redirection
  reste sur `promo.acme.com`.

### 4.5 Brevo — l'expéditeur e-mail propre au domaine (optionnel)

**Ce que ça change :** uniquement **l'e-mail de confirmation double opt-in**
(006-double-optin-email), envoyé au visiteur après qu'il a soumis un
formulaire sur une page de ce domaine. Avec `senderEmail` renseigné sur
l'enregistrement Domain, il part par exemple de
`Acme Promo <no-reply@promo.acme.com>`. Sinon, il part de l'expéditeur par
défaut de la plateforme (`SMTP_FROM`). Dans les deux cas, le lien de
confirmation pointe vers le domaine de la page. Les invitations admin et les
notifications de nouveau lead utilisent toujours l'expéditeur de la
plateforme, quel que soit le domaine.

**Ce que ça ne change pas :** rien sur le VPS. C'est le même compte Brevo, la
même clé SMTP et le même bloc `SMTP_*`. Le `From` est choisi à chaque envoi
d'après l'enregistrement Domain.

Passez cette section si l'expéditeur de la plateforme convient à ce domaine.
Sinon, **authentifiez le domaine dans Brevo avant** de renseigner
`senderEmail`. Un e-mail envoyé depuis un domaine non authentifié est filtré
comme spam ou rejeté.

1. **Ajouter le domaine dans Brevo.** Allez dans Expéditeurs, domaines & IP
   dédiées → **Domaines** → **Ajouter un domaine**. Saisissez le domaine
   d'expédition nu (`promo.acme.com`, pas `no-reply@promo.acme.com`).
   Choisissez d'ajouter les enregistrements vous-même (DNS manuel), sauf si
   Brevo propose de se connecter à ce registrar précis.

2. **Recopier les enregistrements de Brevo dans la zone DNS du domaine**
   (même registrar qu'en 4.1). Utilisez exactement les couples nom/valeur
   affichés par Brevo pour *ce* domaine — ne réutilisez jamais ceux d'un
   autre. Brevo affiche actuellement :

   | Type | Nom (relatif) | Rôle | Nécessaire |
   |---|---|---|---|
   | `TXT` | `@` | `brevo-code:…` — preuve de propriété | oui |
   | `CNAME` | `brevo1._domainkey` | clé DKIM 1 | oui |
   | `CNAME` | `brevo2._domainkey` | clé DKIM 2 | oui |
   | `CNAME` | `mail` | domaine de suivi à votre marque | recommandé |
   | `CNAME` | `r.mail` | liens de suivi des clics à votre marque | recommandé |
   | `CNAME` | `img.mail` | pixel de suivi des ouvertures / images à votre marque | recommandé |

   Les noms peuvent varier légèrement — suivez l'écran de Brevo, pas ce
   tableau. Les trois CNAME `*.mail` font passer les liens suivis et le pixel
   d'ouverture par `…mail.promo.acme.com` au lieu d'un domaine Brevo. Ils
   correspondent ainsi au domaine de l'expéditeur, ce qui aide la
   délivrabilité. Ils pointent vers Brevo, **jamais** vers le VPS : ne les
   ajoutez ni à `WEB_HOSTNAMES` ni à Domains.

   Pièges chez le registrar :
   - **Noms relatifs.** La plupart des interfaces ajoutent la zone
     automatiquement. Tapez `r.mail`, pas `r.mail.promo.acme.com`, sinon vous
     obtenez `r.mail.promo.acme.com.promo.acme.com`.
   - **Un enregistrement `mail` existant.** Beaucoup de registrars créent par
     défaut un `A`/`CNAME` `mail` pour leur webmail. Un `CNAME` ne peut pas
     coexister avec un autre enregistrement du même nom. Supprimez celui par
     défaut, sauf si vous utilisez vraiment la messagerie du registrar sur ce
     domaine.
   - **TXT existants sur `@`.** Le TXT `brevo-code` s'ajoute *à côté* des TXT
     existants (SPF, vérification Google…). Ne les remplacez pas.
   - **SPF.** Rien à ajouter pour Brevo. Si le domaine a déjà un SPF pour un
     autre expéditeur, laissez-le tel quel.

3. **DMARC.** Brevo en attend un. Vérifiez d'abord si le domaine a déjà un
   TXT `_dmarc` (certains registrars en créent un). Sinon, commencez par une
   politique de simple surveillance :

   | Type | Nom | Valeur |
   |---|---|---|
   | `TXT` | `_dmarc` | `v=DMARC1; p=none; rua=mailto:<une adresse que vous lisez>` |

   Passez plus tard à `p=quarantine`, une fois que les rapports ne montrent
   aucun envoi légitime en échec.

4. **Vérifier la propagation** depuis votre poste, avec les noms donnés par
   Brevo :

   ```bash
   dig +short TXT promo.acme.com @1.1.1.1
   dig +short CNAME brevo1._domainkey.promo.acme.com @1.1.1.1
   dig +short CNAME brevo2._domainkey.promo.acme.com @1.1.1.1
   dig +short CNAME r.mail.promo.acme.com @1.1.1.1
   dig +short TXT _dmarc.promo.acme.com @1.1.1.1
   ```

5. **Authentifier dans Brevo.** Revenez sur le domaine dans Brevo et cliquez
   sur **Authentifier ce domaine** / **Vérifier**. Cela peut prendre de
   quelques minutes à quelques heures. Attendez que chaque enregistrement
   soit au vert et que le domaine soit **Authentifié**.

6. **Adresse d'expédition.** L'authentification du domaine couvre toutes les
   adresses `@promo.acme.com`. Si l'onglet Expéditeurs de Brevo n'en liste
   encore aucune, ajoutez `no-reply@promo.acme.com` dans **Expéditeurs**
   (aucune boîte mail n'est nécessaire pour une adresse `no-reply` sur un
   domaine authentifié).

7. **Admin.** Sur l'enregistrement Domain (4.3), renseignez :

   | Champ | Valeur |
   |---|---|
   | `senderName` | nom affiché, ex. `Acme Promo` |
   | `senderEmail` | une adresse sur le domaine authentifié, ex. `no-reply@promo.acme.com` |

   L'apex et le `www` sont deux enregistrements Domain. Renseignez
   l'expéditeur sur **les deux**, sinon les pages de celui resté vide
   continuent d'envoyer depuis l'expéditeur par défaut.

8. **Vérifier de bout en bout.** Sur une page publiée de ce domaine avec un
   e-mail de confirmation double opt-in attaché (006, US2), soumettez le
   formulaire avec une vraie adresse que vous lisez (idéalement Gmail + un
   autre fournisseur). Vérifiez que :
   - le `From` est `Acme Promo <no-reply@promo.acme.com>` ;
   - l'e-mail arrive en boîte de réception, pas en spam — c'est la preuve
     que l'authentification fonctionne, pas seulement que Brevo a accepté
     l'envoi ;
   - dans les en-têtes (« Afficher l'original » dans Gmail), `SPF`, `DKIM` et
     `DMARC` sont tous à `PASS`, avec DKIM `d=promo.acme.com` ;
   - le lien de confirmation ouvre `https://promo.acme.com/…` et confirme le
     lead ;
   - Brevo → Transactionnel → Logs montre l'e-mail comme délivré.

### 4.6 Retirer un domaine

- **Admin :** décochez `isActive` (réversible) ou supprimez l'enregistrement
  Domains.
- **VPS :** retirez l'hôte de `WEB_HOSTNAMES` dans `infra/.env`, puis
  `$COMPOSE up -d caddy`.
- **DNS :** supprimez ou redirigez les `A`/`AAAA`.
- **Brevo :** si le domaine est passé par la 4.5, videz d'abord
  `senderName` / `senderEmail` sur tout enregistrement Domain qui l'utilise
  encore. Supprimer le domaine dans Brevo et ses enregistrements DNS est
  optionnel — les laisser est sans risque.

### 4.7 Dépannage

| Symptôme | Cause | Solution |
|---|---|---|
| Erreur de certificat dans le navigateur ; `curl` donne `tlsv1 alert internal error` (alerte 80) | Caddy n'a pas de certificat pour cet hôte : il n'est pas dans le `WEB_HOSTNAMES` du conteneur en cours | 4.2. Comparez `grep '^WEB_HOSTNAMES=' infra/.env` et `docker exec trefle-caddy-1 printenv WEB_HOSTNAMES`, puis `$COMPOSE up -d caddy` |
| Les logs Caddy montrent des erreurs ACME (`challenge failed`, `NXDOMAIN`, `unauthorized`) | le DNS ne pointe pas (encore) vers le VPS, ou un enregistrement de parking répond aussi | 4.1. Corrigez le DNS, attendez `dig @1.1.1.1`, puis refaites `$COMPOSE up -d caddy` |
| Certificat valide, mais 404 sur tous les chemins | pas d'enregistrement Domains **actif** pour cet hôte exact (`www` ≠ apex), ou pas de page publiée à ce chemin | 4.3 — vérifiez `hostname`, `isActive`, le domaine et le statut de la page |
| Les pages fonctionnent, mais la racine (`/`) donne un 404 | la page d'accueil a le chemin `/index` (ou autre chose que `/`), ou elle appartient à l'autre hôte (apex vs `www`), et pas de `notFoundPagePath` | donnez à la page d'accueil le chemin `/` sur cet hôte, ou mettez dans `notFoundPagePath` une page de **cet** enregistrement Domain (4.3). Attendez quelques secondes après l'enregistrement avant de retester |
| `infra/.env` paraît vide | vous êtes `root`, dans `/root` | `sudo -iu trefle`, `cd ~/trefle` |
| `-bash: up: command not found` | `$COMPOSE` non exporté dans ce shell | la ligne `export COMPOSE=…` de la 4.2 |
| SSH demande de confirmer l'empreinte de la clé du serveur | première connexion depuis cette machine ou ce compte | comparez avec l'empreinte déjà présente dans le `known_hosts` d'une machine de confiance (`ssh-keygen -F <IP du VPS> -l`) ; répondez `no` si elles diffèrent |
| E-mail d'opt-in en spam / absent | domaine non **Authentifié** dans Brevo, `senderEmail` sur un autre domaine, ou DMARC en échec | 4.5, étapes 2 à 5. Vérifiez les en-têtes et les logs transactionnels Brevo |
| E-mail d'opt-in encore envoyé par l'expéditeur de la plateforme | `senderEmail` vide sur cet enregistrement Domain précis (ex. renseigné sur l'apex, pas sur `www`) | 4.5, étape 7 |

### Notes / pièges

- **Limites de débit Let's Encrypt** — 50 certificats par domaine enregistré
  et par semaine, 5 certificats dupliqués par semaine. Groupez les ajouts de
  domaines en une seule recréation de Caddy, et corrigez le DNS *avant* de
  recréer plutôt que de réessayer en boucle.
- **`www` vs apex** — entrées distinctes dans `WEB_HOSTNAMES` **et**
  enregistrements Domain distincts. Aucune redirection ni canonicalisation
  automatique entre les deux (003-post-launch-improvements).
- **`CMS_ALLOWED_ORIGINS`** — utile seulement si quelque chose sur le nouvel
  hôte appelle l'API de l'admin en cross-origin. Les pages normales et les
  formulaires postent vers le renderer, qui relaie vers le cms côté serveur.
- Un domaine relève du **routage / de la présentation uniquement**, ce n'est
  pas une frontière de tenant — un seul espace de travail partagé, un seul jeu
  d'utilisateurs.
- **L'authentification Brevo se fait par domaine d'expédition, pas par
  adresse** — authentifier `promo.acme.com` une fois couvre toutes les
  adresses `@promo.acme.com`.
- **`senderEmail` n'a pas besoin d'être sur le domaine du site** —
  `hostname` (ce que le visiteur consulte) et le domaine authentifié dans
  Brevo (celui d'où part l'e-mail) sont indépendants. Un site sur
  `promo.acme.com` peut envoyer depuis `no-reply@acme.com` si c'est `acme.com`
  qui est authentifié.
- Laisser `senderName`/`senderEmail` vides est toujours un état sûr et
  pleinement supporté.

## Étape 5 — Tests A/B : GrowthBook (008, 018)

Les conteneurs `growthbook` et `growthbook-mongo` démarrent avec le
`$COMPOSE up -d` habituel. Une seule fois : renseigner les variables
`GROWTHBOOK_*` de `infra/.env` (voir `.env.example`), pointer
`experiments.` et `experiments-api.` vers le VPS, puis créer le premier
compte sur `https://<GROWTHBOOK_HOSTNAME>` (son propre identifiant,
indépendant de l'admin Payload). La source de données n'est plus créée dans
l'interface : depuis 018 elle est décrite dans `infra/growthbook/config.yml`.

### 5.1 Significativité statistique (018-ab-significance)

Le CMS demande à GrowthBook l'analyse de chaque test en cours (toutes les
heures, et « Rafraîchir » sur l'écran du test) et affiche un verdict simple.
GrowthBook ne lit que deux tables (`ab_exposures`, `ab_conversions`), avec
le rôle en lecture seule `growthbook_reader`. Les visiteurs ne sont mesurés
qu'une fois `EXPOSURES=on` dans le Worker. Depuis le 2026-10-20 les tests
sont **sans cookie** (recherche R15) : la version est tirée à chaque
affichage, rien n'est déposé ni lu sur l'appareil du visiteur, et chaque
affichage est numéroté dans le jeton signé du formulaire — le bandeau de
cookies n'intervient pas et les landing pages sont testables dès le premier
affichage (`docs/mesure-ab-cnil.fr.md`).

Mise en service, dans cet ordre (aucun identifiant ne doit être posé avant
que les étapes 3 et 4 existent) :

1. **Avant `release.sh`** : ajouter un `GROWTHBOOK_PG_PASSWORD` solide dans
   `infra/.env` du VPS (`openssl rand -hex 32`, jamais affiché). Le fichier
   compose de production l'exige ; la migration de la release crée
   `growthbook_reader` avec, et GrowthBook s'y connecte.
2. Après la release : dans GrowthBook (Settings → API Keys), créer une **clé
   secrète** au rôle admin, la mettre dans `GROWTHBOOK_API_KEY` de
   `infra/.env` du VPS, recréer `cms`. Clé vide = analyse coupée (les écrans
   montrent seulement les chiffres).
3. Juridique : valider le texte de `/audience-measurement` et ajouter la mesure au
   registre des traitements (brouillon : `docs/mesure-ab-cnil.fr.md` § 5,
   base légale : consentement).
4. La politique de confidentialité de chaque domaine (étape 9) décrit déjà
   les tests de pages et renvoie à `/audience-measurement` : vérifier seulement
   que les pages légales de chaque domaine sont complètes. Aucun changement
   du bandeau de cookies n'est nécessaire.
5. Déployer le Worker (`apps/edge`), puis passer `EXPOSURES=on` dans
   `apps/edge/wrangler.jsonc` et redéployer.

**Couper la mesure** (quelques secondes, rien d'autre ne change) :
`EXPOSURES=off` dans `wrangler.jsonc` et redéployer le Worker. Plus aucun
identifiant posé ni exposition enregistrée ; les analyses déjà calculées
restent.

**Vérification locale** : `npm --workspace @trefle/cms run ab:seed` crée
trois tests de démonstration (gagnant net, identiques, répartition 70/30 ;
`-- --clean` les supprime) ; avec une clé GrowthBook locale dans
l'environnement du cms, « Rafraîchir » affiche leurs verdicts.

## Étape 6 — Import de pages depuis une URL (012-url-page-import)

« Importer depuis une page web » (assistant de création de page) affiche une
page publique dans le conteneur `browser`, la convertit en blocs de l'éditeur
avec l'API Claude et range ses images dans la médiathèque.

**Services.** `browser` (`mcr.microsoft.com/playwright:v1.63.0-noble`,
`playwright run-server` sur le port 3100) démarre avec le `$COMPOSE up -d`
habituel. Il ne publie aucun port, est sur son propre réseau `browser`
partagé uniquement avec `cms`, et plafonné à `mem_limit: 1g`. Au premier
démarrage il télécharge Playwright 1.63.0 depuis npm (quelques secondes).
Mémoire : le navigateur utilise au plus 1 Go des 8 Go du KVM 2, et chaque
import affiche une page à la fois ; après activation, vérifier avec
`docker stats --no-stream` pendant un import que l'hôte garde de la marge.

**Activer.**

1. Mettre la clé de l'API Claude dans `infra/.env` (`ANTHROPIC_API_KEY`,
   éventuellement `IMPORT_AI_MODEL` / `IMPORT_AI_EFFORT`), puis
   `$COMPOSE up -d cms`.
2. Dans l'admin, **Réglages → « Plafond mensuel des imports (€) »**
   (20 par défaut) est le plafond mensuel de l'espace, et « Budget d'import
   par défaut par utilisateur (€) » le budget par défaut de chaque
   utilisateur ; chaque fiche utilisateur peut le modifier (« Budget IA
   mensuel (€) »). La liste « Imports de pages » montre les dépenses du mois
   par utilisateur.

**Désactiver.** Mettre le plafond mensuel à `0` dans les Réglages (immédiat,
sans redéploiement) ou vider `ANTHROPIC_API_KEY` puis `$COMPOSE up -d cms`.
Dans les deux cas l'option disparaît de l'assistant ; les imports en cours
se terminent.

**Sites derrière un service anti-robots** (Cloudflare, Akamai…) : ils
refusent l'import, et l'éditeur voit « Le site a bloqué la visite
automatique ». L'import n'essaie pas de passer outre. Quand la page est celle
du client, il peut autoriser l'importeur dans ce service : les requêtes
portent `TrefleImport/1.0` dans leur `User-Agent` et viennent de l'IP
publique du VPS. Sinon, l'assistant propose l'autre voie : l'éditeur
enregistre la page depuis son propre navigateur (« Page web, un seul
fichier », ou l'extension SingleFile) et dépose le fichier
(013-saved-page-import ; proposé aussi quand une page demande une
connexion). Rien à configurer : le fichier reste dans le dossier temporaire
du conteneur cms le temps de son import, 25 Mo au plus.

**Jamais en production :** `IMPORT_AI_MODE` et `IMPORT_ALLOW_PRIVATE_HOSTS`
servent uniquement aux tests (conversion factice, site de test privé). Les
laisser non définis — le cms refuse de démarrer avec l'un ou l'autre, et
`preflight.sh` les signale.

**Mises en production.** Le `infra/.env` commité ne contient aucune clé
d'import, donc `release.sh` n'en demande jamais : ajouter `ANTHROPIC_API_KEY`
directement dans la copie du VPS (point 1 ci-dessus) le jour où l'on veut les
imports. Si la clé est un jour ajoutée au fichier commité, `release.sh`
arrêtera la release suivante tant que la copie du VPS ne l'a pas aussi.

---

## Étape 7 — Cloudflare devant (017-edge-protection)

Tous les hôtes passent par Cloudflare : les attaques sont absorbées en
bordure, les images et polices viennent du cache de Cloudflare, et le VPS ne
répond qu'à Cloudflare agissant pour notre zone. Le HTML des pages n'est
**pas** mis en cache en bordure (lot 1). La configuration est du code dans
`infra/cloudflare/` — son README liste chaque fichier, jeton et opération
courante ; cette section est la procédure d'exploitation.

Valeurs : `infra/cloudflare/secret.env` (git-crypt, sur votre poste — les
scripts Cloudflare s'y exécutent) et, sur le VPS, `CLOUDFLARE_DNS_TOKEN` et
`ACME_DELEGATE_HOSTNAME` dans `infra/.env` (Caddy). Scénarios de validation :
`specs/017-edge-protection/quickstart.md` (V1–V12).

### 7.1 Bascule (une fois, dans cet ordre)

Chaque étape s'annule par la précédente ; ne sautez aucune étape.

1. **Code en ligne** — la release avec les clés média uniques et la table
   d'alias est déployée (quickstart V0, V10).
2. **Mesure de charge de référence** — `infra/loadtest/README.md`, en heure creuse.
3. **Zone** — ajouter `example.com` à Cloudflare (Free, full
   setup), recopier chaque enregistrement de la checklist de
   `infra/cloudflare/README.md` avec le proxy **désactivé**, comparer avec
   `dig` sur les serveurs de noms Cloudflare, puis changer les serveurs de noms
   chez GoDaddy. Envoyer un e-mail d'opt-in de test : reçu, DKIM `pass` (V1).
4. **Configuration** — sur votre poste :

   ```bash
   infra/cloudflare/apply.sh --dry-run
   infra/cloudflare/apply.sh
   infra/cloudflare/aop-cert.sh
   ```

   Commiter `infra/deploy/aop/ca.pem` et `infra/cloudflare/secret-aop-*`.
   Dans le DNS Cloudflare, ajouter `_acme-challenge.<hôte> CNAME acme-delegate.example.com`
   (proxy désactivé) pour chaque hôte Trefle, et un enregistrement A `cf-check`
   proxifié pour répéter.
5. **Certificats d'origine par DNS-01** — sur le VPS, renseigner
   `CLOUDFLARE_DNS_TOKEN` et `ACME_DELEGATE_HOSTNAME` dans `infra/.env` ; dans
   le Caddyfile, ajouter `import origin_tls` à chaque site ; release. Le trafic
   est encore direct. Vérifier que le journal de Caddy montre l'émission DNS-01
   et que chaque hôte répond (V3). Caddy refuse de démarrer si le jeton manque
   ou est mal formé.
6. **Proxy** — passer chaque enregistrement Trefle en orange dans Cloudflare ;
   vérifier chaque hôte via Cloudflare (V2 3e point, V4, V5).
7. **Exiger le certificat de Cloudflare** — seulement quand **tous** les hôtes
   sont proxifiés : remplacer `import origin_tls` par `import origin_tls_aop`
   dans chaque site, release. Une requête directe échoue alors dès la
   négociation TLS (V2). Les vérifications de `release.sh` présentent le
   certificat client de `infra/cloudflare/secret-aop-client.*`.
8. **Pare-feu** — panneau Hostinger → VPS → Pare-feu : autoriser 443/tcp
   depuis chaque plage affichée par `infra/cloudflare/refresh-ips.sh` (IPv4
   **et** IPv6), fermer 80/tcp, garder 22/tcp. `ufw` ne suffit pas : les ports
   publiés par Docker le contournent. Si le panneau ne peut pas contenir
   toutes les plages, utiliser une chaîne iptables `DOCKER-USER` et la
   documenter ici.
9. **Non-régression** — suite e2e complète contre la production (V8), V6, V7 ;
   nouvelle mesure de charge (V12).
10. **Nouvelle adresse du VPS** — en dernier (support Hostinger, ou nouveau VPS
    + restauration) ; mettre à jour seulement les enregistrements proxifiés, et
    vérifier qu'aucun enregistrement non proxifié ne pointe vers la nouvelle
    adresse.

### 7.2 Retour arrière (< 15 minutes)

Avant le changement d'adresse (7.1 étape 10) :

1. Cloudflare → DNS : chaque enregistrement Trefle en DNS seul (nuage gris).
2. VPS : sites du Caddyfile revenus à `import origin_tls` (ou sans snippet),
   release (ou `$COMPOSE up -d --force-recreate --no-deps caddy` — un reload
   relirait l'ancien fichier, voir 2.1).
3. Pare-feu Hostinger : 80 et 443 ouverts à tous.

Après le changement d'adresse, le nuage gris publie la nouvelle adresse et
annule la protection. Préférer annuler seulement ce qui a cassé (Caddyfile,
pare-feu) en restant proxifié. Si le nuage gris a été inévitable, prévoir un
nouveau changement d'adresse ensuite.

Les hôtes `www.` des clients (7.4) ne se rétablissent pas sans le client : il
doit remplacer son `CNAME` par des enregistrements `A`/`AAAA` — plus lent,
d'où le passage des domaines clients seulement une fois 7.1 stable.

### 7.3 Opérations courantes

- **Plages Cloudflare modifiées** (quelques fois par an) :
  `infra/cloudflare/refresh-ips.sh`, commiter `infra/deploy/cloudflare-ips.caddy`,
  release (Caddy recharge), puis mettre à jour le pare-feu Hostinger avec la
  liste affichée.
- **Membres de l'admin** : après en avoir ajouté, désactivé ou supprimé un,
  `infra/cloudflare/apply.sh --sync-members` (étape 8.5).
- **Certificat AOP** : `infra/cloudflare/aop-cert.sh --renew` avant la date
  d'expiration affichée (2 ans), commiter, puis supprimer dans le tableau de
  bord Cloudflare l'ancien certificat qu'il liste.
- **Passer en Pro** (~20 $/mois) quand l'un de ces cas arrive : une attaque
  passe les règles gérées Free et dégrade les sites ; une seule règle de
  limitation de débit ne suffit plus (un autre point d'entrée en a besoin) ;
  les 5 règles WAF personnalisées sont toutes utilisées.

### 7.4 Un domaine client (remplace 4.1 une fois derrière Cloudflare)

Les sites clients sont servis sur `www.` via Cloudflare for SaaS ; la racine
redirige vers `www.` chez le registrar du client.

```bash
infra/cloudflare/add-client-domain.sh www.domaine-client.fr
```

Le script affiche les deux enregistrements que le client ajoute —
`www CNAME sites.example.com` et
`_acme-challenge.www CNAME acme-delegate.example.com` — et la
redirection à configurer chez son registrar. Redirection acceptable : HTTPS
sur la racine, **301**, chemin **et** paramètres conservés. Vérifier avec :

```bash
curl -sI 'https://domaine-client.fr/confirm?token=x&y=1' | grep -i '^location'
```

La réponse doit être `https://www.domaine-client.fr/confirm?token=x&y=1`. Si
le registrar ne sait pas le faire, transférer plutôt toute la zone du client
dans notre compte Cloudflare (research R2).

Ensuite, comme à l'étape 4 : ajouter `www.domaine-client.fr` à
`WEB_HOSTNAMES` (à la place de la racine), release, et dans l'admin mettre
`www.domaine-client.fr` comme nom d'hôte de la fiche **Domains**. Relancer le
script jusqu'à ce que les deux statuts soient `active`.

### 7.5 Retirer une image

Les copies en cache survivent au fichier ; retirer une image des sites se
fait donc en deux temps :

- **Image inutilisée** : la supprimer dans l'admin (Médiathèque), puis
  `infra/cloudflare/purge-media.sh <son nom de fichier>`.
- **Image utilisée** (l'admin refuse de la supprimer tant qu'une page
  l'utilise) : l'ouvrir, choisir un fichier corrigé ou neutre, confirmer
  « Remplacer partout », puis `infra/cloudflare/purge-media.sh <ancien nom de fichier>`.
  Les pages affichent tout de suite le nouveau fichier.

Le script purge l'URL du fichier sur l'hôte des assets et tout l'hôte des
images (chaque image est retraitée une fois — une action rare et délibérée).

### 7.6 Couper le cache des pages (020-edge-html-cache)

Les pages peuvent être servies depuis le cache de Cloudflare par le Worker
edge (`apps/edge`, `infra/cloudflare/README.md`). Si quelque chose cloche
sur les pages en cache — un contenu périmé qu'une purge ne corrige pas, un
formulaire cassé, une erreur inattendue — coupez-le : chaque requête va
alors directement au serveur, qui la rend comme avant. Sans déploiement,
effectif en quelques secondes :

```bash
infra/cloudflare/edge-off.sh
```

Pour le remettre (`live` = tous les sites, `test` = l'hôte de test seul) :

```bash
infra/cloudflare/edge-on.sh live
```

Les deux affichent ensuite les routes en place. Ils demandent
`CLOUDFLARE_WORKERS_TOKEN` dans `infra/cloudflare/secret.env` (poste de
l'opérateur). Pour de simples pages périmées : d'abord
`infra/cloudflare/purge-pages.sh`. Si le Worker lui-même plante, Cloudflare
renvoie déjà la requête au serveur.

## Étape 8 — Double authentification à l'admin (019-admin-access)

Depuis la 019, l'admin demande, après le mot de passe, un code à 6 chiffres
produit par une application d'authentification sur le téléphone du membre
(Google Authenticator, 1Password, Authy…). Les endpoints de l'API refusent
aussi une session qui n'a passé que le mot de passe. La clé API du rendu
(`service`) n'est pas concernée.

### 8.1 Ce que voient les membres

- **À la première connexion après la mise en prod** : une page « Setup
  Two-Factor Authentication » avec un QR code. Le membre le scanne avec son
  application, puis tape le code affiché. Il ne peut rien faire d'autre dans
  l'admin tant que ce n'est pas fait.
- **Ensuite, à chaque connexion** : le mot de passe, puis le code.
- **Après 5 codes faux** : le compte est bloqué 10 minutes (mêmes réglages que
  pour le mot de passe). Un Administrateur peut le débloquer plus tôt avec
  « Force Unlock » sur la fiche du membre.

Chaque enrôlement, réinitialisation et blocage est inscrit dans le journal
d'activité (`totp-enrolled`, `totp-reset`, `totp-locked`).

### 8.2 La clé de secours (pas de codes de récupération)

Le plugin n'a pas de codes de récupération. À l'enrôlement, sous le QR code,
« Add code manually » affiche la **clé** : chaque membre l'enregistre dans le
gestionnaire de mots de passe de l'équipe (la page le rappelle). Beaucoup de
gestionnaires savent aussi produire les codes eux-mêmes.

Deux règles, parce que cette clé reste valable tant qu'elle n'est pas
remplacée :

1. **Après toute utilisation de la copie du coffre**, le membre refait sa
   double authentification (réinitialisation 8.3, puis nouvel enrôlement) et
   remplace la copie du coffre. L'ancienne clé cesse alors de fonctionner.
2. **Un membre qui part est désactivé** (« isActive » décoché) : sa connexion
   est refusée immédiatement, quelle que soit la clé.

### 8.3 Téléphone perdu — réinitialiser un membre

Le membre utilise d'abord sa clé du coffre (8.2), puis on le réinitialise
pour qu'il refasse son enrôlement. Si aucun Administrateur ne peut se
connecter, la même réinitialisation se lance sur le VPS, en `trefle` dans
`~/trefle` :

```bash
$COMPOSE exec cms npm --workspace @trefle/cms run totp:reset -- <email>
```

Elle efface la clé du membre et lève les blocages (codes et mot de passe), et
l'inscrit au journal (`totp-reset`, via `ssh`). Le membre reconfigure son
application à sa prochaine connexion. Elle répond « Aucun membre avec
l'adresse … » si l'adresse est inconnue.

### 8.4 Retour arrière

Si la double authentification empêche de travailler, coupez-la sans
redéployer : dans `infra/.env` sur le VPS, ajoutez les deux lignes, puis
recréez `cms`.

```bash
TOTP_DISABLED=1
ALLOW_TOTP_DISABLED=1
```

```bash
$COMPOSE up -d --force-recreate cms
```

`ALLOW_TOTP_DISABLED=1` dit que c'est voulu : sans elle, le CMS refuse de
démarrer et `preflight.sh` refuse la release. Les clés déjà enregistrées sont
conservées : retirez les deux lignes et recréez `cms` pour revenir à la double
authentification, sans nouvel enrôlement.

### 8.5 Le code par e-mail avant l'admin (Cloudflare Access, 019 étape 2)

Avant même la page de connexion de l'admin (et de GrowthBook), Cloudflare
demande une adresse e-mail et y envoie un code à 6 chiffres. Seules les
adresses des membres actifs du CMS en reçoivent un. La session dure 24 heures
par navigateur. Ensuite viennent le mot de passe et le code de l'application
(8.1).

- **Après avoir ajouté, désactivé ou supprimé un membre**, depuis votre poste :
  `infra/cloudflare/apply.sh --sync-members`. Sans ça, un nouveau membre est
  arrêté à l'étape du code e-mail.
- **Le serveur vérifie aussi** (019 étape 3) : Caddy refuse (`401`) toute
  requête vers l'admin ou GrowthBook qui ne porte pas le jeton signé par
  Cloudflare Access. Contourner Cloudflare ne mène donc plus à rien.
- **Retour arrière** : d'abord la release, `--rollback 019.2-edge-access`
  (§2.0), qui retire la vérification côté serveur. Ensuite seulement, si
  besoin, `ACCESS_ENABLED=0 infra/cloudflare/apply.sh --sync-members`
  supprime l'application Access. Dans l'autre ordre, l'admin devient
  inaccessible.
- **Si l'application Access est recréée**, elle a un nouvel identifiant AUD :
  le reporter dans `ACCESS_AUD` du `infra/.env` du VPS et recréer Caddy.

Mise en place et détails : `infra/cloudflare/README.md`, « Cloudflare Access ».

### 8.6 Membres : arrivée, départ, téléphone perdu, urgence

**Ajouter un membre**
1. Admin → Workspace → Users → créer le membre (rôle, e-mail). Il reçoit le
   lien pour choisir son mot de passe. Le bandeau jaune en haut de l'admin
   indique alors « à ajouter <adresse> ».
2. Sur votre poste : `infra/cloudflare/apply.sh --sync-members`. Le bandeau
   disparaît au rechargement suivant.
3. À sa première connexion, le membre reçoit le code e-mail, choisit son mot
   de passe, puis configure son application d'authentification (8.1) et range
   sa clé de secours dans le gestionnaire de mots de passe (8.2).

**Retirer un membre** : décocher **isActive** sur sa fiche (sa connexion est
refusée immédiatement), puis `apply.sh --sync-members` (il ne reçoit plus de
code e-mail).

**Téléphone perdu** : le membre se connecte avec la clé de secours du coffre
(8.2). Puis un Administrateur ouvre sa fiche et clique sur
**Réinitialiser la double authentification** ; le membre reconfigure son
application à la connexion suivante et remplace la copie du coffre. Ce
bouton n'existe pas sur son propre compte.

**Urgence : aucun Administrateur ne peut se connecter.** Trois moyens, dans
cet ordre, chacun en moins de 30 minutes :

1. **La clé de secours du coffre** : l'Administrateur l'utilise pour se
   connecter, puis refait sa double authentification (réinitialisation par
   un autre Administrateur, ou le moyen 2) et remplace la copie du coffre.
   L'ancienne clé ne fonctionne alors plus.
2. **La réinitialisation par SSH** (8.3) :
   `$COMPOSE exec cms npm --workspace @trefle/cms run totp:reset -- <email>`.
   L'Administrateur reconfigure son application à la connexion suivante.
3. **Le code e-mail n'arrive pas** (boîte inaccessible, e-mails Cloudflare
   bloqués) : dans le dashboard Cloudflare, Zero Trust → Access controls →
   Policies → `trefle-members` → ajouter temporairement une autre adresse
   e-mail de l'Administrateur, enregistrer, se connecter avec. Ensuite,
   `apply.sh --sync-members` remet la règle exactement à la liste des
   membres, ce qui retire l'adresse ajoutée. Ne supprimez pas l'application
   Access pour « ouvrir » : depuis l'étape 3, le serveur refuse alors tout
   (8.5).

Chaque réinitialisation est inscrite au journal d'activité (`totp-reset`,
par un Administrateur ou par `ssh`).

## Étape 9 — Pages légales (021-legal-pages)

Chaque domaine sert `/privacy` (politique de confidentialité) et
`/legal-notice`, construites à partir de textes éditables et de deux
identités, et chaque page se termine par une ligne de liens vers les deux.
Les formulaires sans lien propre pointent vers la politique du domaine ;
chaque consentement enregistre la version de la politique, dont le texte est
archivé (« Versions des pages légales »).

1. **Réglages → Opérateur de l'installation** (administrateurs) : la société
   qui exploite cette installation (sous-traitant des propriétaires de
   domaine et hébergeur des sites). **Sous-traitants** : ses prestataires qui
   traitent des données des visiteurs — cocher « Hébergeur des sites » pour
   celui qui héberge le serveur, avec son adresse et son téléphone.
2. **Réglages → Textes juridiques** : des textes français par défaut sont
   installés par la migration ; **les relire** (c'est un modèle, pas un avis
   juridique) et ajouter une ligne par autre langue si besoin. Les variables
   sont listées dans l'aide du champ ; un paragraphe dont une variable est
   vide n'est pas affiché.
3. **Chaque domaine → Propriétaire du domaine** : le propriétaire
   (responsable du traitement et éditeur). La liste des domaines indique
   « Pages légales : Complètes / À compléter ». Un propriétaire qui a ses
   propres pages ailleurs donne leurs adresses à la place.
4. Hors produit : signer le contrat de sous-traitance avec chaque
   propriétaire (`docs/legal/contrat-sous-traitance.fr.md`) et tenir les
   registres (`docs/legal/registre-traitements.fr.md`).

Nouveau domaine (étape 4) : renseigner le propriétaire avant la mise en ligne.

**Chemins (depuis 023-admin-i18n).** Les pages que sert chaque domaine ont des
chemins anglais : `/privacy`, `/legal-notice`, `/audience-measurement`. Les
chemins français d'avant (`/confidentialite`, `/mentions-legales`,
`/mesure-audience`) répondent par une seule redirection permanente (308,
paramètres gardés), ou mènent directement à la page du propriétaire quand le
domaine en a une ; aucun des six ne peut servir de chemin à une page de
l'éditeur. La migration ne change les liens des textes juridiques par défaut
que si personne ne les a modifiés ; un texte modifié garde ses anciens liens,
qui redirigent.

Note de version (023 US7) : **déployer le Worker de l'edge dans la même
fenêtre** que l'origine (`npm run deploy --workspace @trefle/edge`) : c'est lui
qui laisse passer les nouveaux chemins vers l'origine. Tant qu'il n'est pas
déployé, les pages légales sont mises en cache à l'edge sans leur `?lang=`.
Vérifier ensuite, sur un domaine :

```bash
curl -sI https://www.example.com/mentions-legales?lang=en | grep -iE '^(HTTP|location)'
curl -sI https://www.example.com/legal-notice?lang=en | grep -iE '^HTTP'
```

La première répond `308` avec `location: /legal-notice?lang=en` (ou la page du
propriétaire, en `307`) ; la seconde `200`.
