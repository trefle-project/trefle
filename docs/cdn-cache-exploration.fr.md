# Cache et CDN : notes d'exploration

Statut : **exploration avant spec** (2026-10-09, révisée le même jour après les décisions de cadrage du §6). **Mise à jour 2026-10-11 : étude du cache HTML et décisions au §11, qui prime sur les §7–§8 en cas d'écart.** Hors §11, rien n'est décidé ici :
ce document rassemble l'état mesuré en prod, les contraintes du code et la
recherche, pour alimenter `/speckit-specify` sans tout refaire.

## 1. Point de départ

Question posée : comment Trefle gère-t-il le cache des pages et des médias, et
faut-il un CDN (Cloudflare ou autre) ? Exigence explicite : **ne pas casser
l'A/B test** (008-ab-testing).

## 2. État actuel, mesuré en prod le 2026-10-09

Aucun CDN : tous les hôtes résolvent directement vers le VPS
(203.0.113.10, Caddy en façade, `via: 1.1 Caddy`). DNS des deux domaines
chez GoDaddy (`ns*.domaincontrol.com`).

| Ressource | Servie par | `Cache-Control` observé | Remarque |
|---|---|---|---|
| HTML des pages | Next.js (`web:3001`) | `private, no-cache, no-store, max-age=0` | rendu à chaque requête (voir §3.1) ; TTFB mesuré ≈ 0,10–0,14 s |
| Données Payload utilisées par le rendu | cache `fetch` de Next | — (interne) | 1 h + tags, invalidées par `POST /api/revalidate` à la publication |
| `/_next/static/*` | Next.js | `public, max-age=31536000, immutable` | noms hachés, correct |
| Images (`img.example.com`) | imgproxy ← Garage S3 | `public, max-age=31536000` + `Vary: Accept` | WebP si le navigateur l'accepte (`IMGPROXY_ENFORCE_WEBP`), sinon format d'origine. **imgproxy n'a aucun cache** : chaque requête qui n'est pas en cache navigateur relit S3 et retraite l'image |
| Polices (`assets.example.com/fonts/…`) | Garage (website endpoint) | **absent** | `ETag` + `Last-Modified` seulement → cache heuristique navigateur, revalidations fréquentes. CORS `*` OK |

Fichiers clés : [Caddyfile](../infra/deploy/Caddyfile),
[middleware.ts](../apps/web/src/middleware.ts),
[page.tsx](../apps/web/src/app/[[...slug]]/page.tsx),
[payload-client](../apps/web/src/lib/payload-client/index.ts),
[imgproxy.ts](../apps/web/src/lib/imgproxy.ts),
[api/leads/route.ts](../apps/web/src/app/api/leads/route.ts).

## 3. Contraintes à préserver

### 3.1 Le HTML est forcément dynamique
Le middleware génère une **CSP à nonce par requête** (002-security-hardening).
La doc Next.js est explicite : nonce ⇒ rendu dynamique ; ISR, rendu statique
et PPR sont incompatibles avec une CSP à nonce. Le `revalidate = 3600` de
`page.tsx` ne met donc en cache que les *données*, pas la page rendue.

### 3.2 L'A/B test vit à chaque requête, côté serveur
- Le middleware lit/pose le cookie `tf-ab-<experimentKey>` (30 j, `httpOnly`)
  et réécrit vers `/ab-variant/<id>`.
- La vue est comptée **côté serveur pendant le rendu** (`pingPageView`), et
  les conversions sont les leads reçus par `/api/leads`.
- Conséquence : toute mise en cache du HTML en périphérie (« Cache
  Everything ») figerait une variante pour tout le monde *et* ferait
  disparaître les vues du comptage. Les deux faussent l'expérience.

### 3.3 L'IP réelle du visiteur
`/api/leads` limite à 10/min et 100/jour **par IP**, lue dans `X-Real-IP`
posé par Caddy depuis le pair TCP. Derrière un proxy CDN, ce pair devient
le CDN : des visiteurs différents partagent alors la même IP, et le limiteur
bloque de vrais leads, ce qui fausse aussi les conversions A/B. Même problème
pour `ADMIN_ALLOWED_IPS` sur `admin.` et `growthbook*` (liste d'adresses
remplacée depuis par Cloudflare Access, 019-admin-access).

### 3.4 Domaines clients
Les domaines publics (ex. `client-site.example`) pointent vers le VPS
par un `A`/`AAAA` chez le registrar du client, et Caddy obtient leurs
certificats (README de déploiement §4.1). Les mettre derrière un CDN implique
de toucher au DNS de *chaque* client.

## 4. Ce que la recherche établit

**Cloudflare**
- Ne met pas le HTML en cache par défaut. Respecte le `Cache-Control` de
  l'origine : rien n'est mis en cache si `private`/`no-store`/`max-age=0`, ni
  si la réponse contient `Set-Cookie`. Derrière Cloudflare sans règle
  particulière, l'A/B test passe donc intact.
- **`Vary`** : historiquement ignoré (sauf `Accept-Encoding`), donc risque de
  servir du WebP à un navigateur qui ne le gère pas. **Depuis le 22/09/2026**,
  la prise en charge de `Vary` est disponible dans les Cache Rules **sur toutes
  les offres, Free compris**, avec une normalisation de `Accept`. À
  configurer explicitement. « Vary for Images » (l'ancien mécanisme) reste
  réservé à Pro+. Polish ne s'applique pas si l'origine envoie `Vary: Accept`,
  et imgproxy recommande de toute façon de désactiver l'optimisation d'images
  du CDN.
- **Setup partiel (CNAME)** réservé à Business/Enterprise. En Free, il faut
  déplacer **toute la zone DNS** (nameservers) de `example.com`
  chez Cloudflare, en recopiant tous les enregistrements (MX, DKIM/SPF Brevo…).
- **Domaines clients** : soit déplacer leurs nameservers, soit Cloudflare for
  SaaS (100 hostnames inclus même en Free, puis 0,10 $/mois chacun).
- **Bot Fight Mode** (Free) injecte un script de détection, sans
  désactivation possible. Cloudflare lit le nonce de la CSP et l'ajoute à ses
  scripts : compatible en principe avec notre CSP, mais à tester.
  **Rocket Loader** et **Email Obfuscation** réécrivent le HTML : à désactiver.
  Le cookie `__cf_bm` est classé strictement nécessaire (exempté de
  consentement).
- **IP réelle dans Caddy** : `trusted_proxies` avec les plages Cloudflare
  (liste statique, ou module `caddy-cloudflare-ip` qui demande une build
  personnalisée) + `client_ip_headers CF-Connecting-IP` (seul en-tête
  non falsifiable chez Cloudflare), puis `header_up X-Real-IP {client_ip}`.
- **Certificats** : derrière le proxy Cloudflare, TLS-ALPN-01 ne passe plus et
  HTTP-01 est fragile. Options : DNS-01 (plugin `caddy-dns/cloudflare`, build
  personnalisée), certificat Cloudflare Origin CA, ou première émission
  en DNS seul puis bascule en proxy.
- **CGU** : depuis la réécriture des conditions (fin de l'ex-§2.8), servir des
  images via le CDN est admis. La restriction porte sur la vidéo et les gros
  fichiers non hébergés chez Cloudflare.

**Bunny.net (alternative)**
- Pull zone avec hostname personnalisé par simple **CNAME**, sans déplacer
  la zone DNS, avec SSL gratuit.
- **Vary Cache « WebP support »** natif, qui sépare WebP et non-WebP dans le
  cache.
- 0,01 $/Go (Europe/Amérique du Nord), minimum 1 $/mois. Société européenne.

**imgproxy**
- Conçu pour être placé derrière un CDN ou un cache. Il envoie `public,
  max-age=31536000` (`IMGPROXY_TTL`). La doc demande d'inclure `Accept` dans
  la clé de cache si l'on utilise la négociation de format, ce qui est notre
  cas.
- Cache interne réservé à la version Pro. Alternative locale gratuite : le
  module Caddy `cache-handler` (Souin, compatible RFC, gère `Vary`), qui
  demande une build personnalisée de Caddy.

## 5. Options

| | Option | Gain | A/B, rate limit, CSP | Coût / risque |
|---|---|---|---|---|
| **A** | Correctifs côté origine seulement : `Cache-Control` sur `assets.` (polices) dans Caddy ; éventuellement cache Souin devant imgproxy | revalidations des polices supprimées ; plus de retraitement d'images (Souin) | intacts | très faible ; Souin = build Caddy personnalisée |
| **B** | **CDN uniquement sur `img.` et `assets.`** (Bunny par CNAME, ou Cloudflare avec déplacement de la zone `example.com`) | l'essentiel du poids des pages (images, polices) servi depuis la périphérie ; plus de charge imgproxy | **intacts** : les hôtes de pages ne changent pas, et imgproxy/Garage n'utilisent pas l'IP du visiteur | faible ; à régler : la clé de cache `Accept` et le nom d'hôte d'origine |
| **C** | Cloudflare devant les pages aussi (proxy, sans cache HTML) | protection DDoS/WAF, `/_next/static` en périphérie | intacts **si** IP réelle restaurée dans Caddy, Rocket Loader/Email Obfuscation désactivés, et aucune règle de cache HTML | moyen : DNS de chaque domaine client, certificats, `trusted_proxies`, tests CSP avec Bot Fight Mode |
| **D** | Cache du HTML en périphérie | TTFB minimal | **casse** l'A/B et le comptage des vues tant que le nonce, le cookie et le comptage serveur existent | gros chantier (CSP par hash ou SRI, A/B en périphérie, comptage côté client) : hors périmètre |

## 6. Décisions de cadrage (2026-10-09)

Réponses aux questions de la première version de cette note :

1. **Objectif : résister à un fort volume de trafic par conception.** Pas
   seulement accélérer les images : une pointe de trafic légitime ne doit pas
   dépendre de la capacité du VPS.
2. **La protection anti-attaques (DDoS/WAF) est nécessaire**, sur les pages
   comme sur le reste.
3. **Images remplacées** : soit interdire la réutilisation d'une adresse déjà
   utilisée, soit, mieux, pouvoir invalider le cache d'une image qui en
   écrase une autre.

Conséquences : l'option B seule ne suffit plus, et l'option D (cache du HTML)
redevient nécessaire, puisqu'un HTML rendu à chaque requête sur un seul VPS
est précisément le goulot. Bunny sort du périmètre : sa protection
anti-attaques ne vaut pas celle de Cloudflare.

## 7. Ce qui empêche aujourd'hui de cacher le HTML

Trois éléments rendent chaque réponse HTML unique. Il faut les sortir du HTML
pour qu'il soit partageable entre visiteurs :

| Élément | Où | Pourquoi c'est bloquant | Piste |
|---|---|---|---|
| **Nonce CSP** | `middleware.ts`, `code-context.ts`, `page-shell.tsx` (code admin 014) | un nonce mis en cache n'en est plus un ; Next.js déclare ISR et PPR incompatibles avec le nonce | **nonce injecté en périphérie** (§8.2) |
| **Jeton de formulaire** | `page.tsx:65` → `signFormToken(pageId, Date.now())` ; vérifié avec un âge entre 2 s et 2 h | un HTML en cache plus de 2 h donne un jeton expiré : **plus aucun lead**. L'heuristique des 2 s perd aussi son sens | jeton obtenu par le navigateur au chargement (petite route dynamique) |
| **Comptage des vues** | `pingPageView` appelé pendant le rendu | une page servie depuis le cache ne passe plus par l'origine : vues et expositions A/B ne sont plus comptées | balise côté navigateur (`sendBeacon`) sans cookie, ou comptage dans le Worker |

Et l'**A/B test**, qui choisit la variante à chaque requête dans le
middleware, doit être déplacé avant le cache (§8.3).

**Pistes écartées pour la CSP**
- **SRI expérimental de Next.js** : il protège les fichiers JS, mais pas les
  scripts inline `self.__next_f.push(…)` qu'App Router injecte dans chaque
  page. Il ne suffit donc pas pour une CSP stricte.
- **`'unsafe-inline'`** : recul net sur 002-security-hardening, et le code
  admin (014) ne serait plus du tout contrôlé.

## 8. Architecture cible proposée

### 8.1 Cloudflare devant tout, origine verrouillée
- Zone `example.com` migrée chez Cloudflare (offre Free :
  nameservers déplacés, MX/DKIM/SPF Brevo recopiés).
- **Domaines clients** : Cloudflare for SaaS (100 hostnames inclus, puis
  0,10 $/mois chacun). **Mais les domaines apex** (`client-site.example`)
  ne peuvent pas recevoir de CNAME chez la plupart des registrars, et
  l'« apex proxying » est réservé à Enterprise. Alternatives : zone du client
  déplacée chez Cloudflare (dans notre compte), ou `www.` en principal avec
  redirection de l'apex chez le registrar. **À trancher.**
- **Origine joignable seulement via Cloudflare** : sinon un attaquant contourne
  le CDN en visant l'IP. Caddy (ou le pare-feu du VPS) n'accepte que les plages
  Cloudflare, avec en plus Authenticated Origin Pulls (mTLS, gratuit).
  L'IP actuelle 203.0.113.10 est publique dans l'historique DNS : prévoir
  d'en changer après la bascule.
- `admin.` et `growthbook*` passent aussi derrière Cloudflare (sinon l'origine
  reste exposée). Leur liste d'IP autorisées est alors appliquée par une règle
  WAF ou Cloudflare Access, plutôt que par Caddy seul.
- Certificats d'origine : DNS-01 (`caddy-dns/cloudflare`) ou Cloudflare
  Origin CA, avec SSL en « Full (strict) ».
- IP réelle dans Caddy (`trusted_proxies` + `CF-Connecting-IP`), qui reste
  utile pour `/api/leads`. En plus, la règle de rate limiting gratuite (1 règle,
  par IP, fenêtre de 10 s) se place sur `/api/leads`.

### 8.2 HTML mis en cache en périphérie, nonce injecté par un Worker
- Le renderer produit un HTML **identique pour tous**, avec un nonce
  « placeholder » fixe.
- Un **Worker Cloudflare** sert le HTML depuis le cache, génère un nonce neuf
  à chaque requête, le remplace dans le HTML (`HTMLRewriter`) et pose l'en-tête
  CSP correspondant. C'est une technique documentée (Scott Helme ; mêmes
  schémas chez Akamai et pour nginx). La CSP stricte et le code admin de 014
  restent intacts.
- **Invalidation** : le hook de publication appelle, en plus de
  `/api/revalidate`, la purge Cloudflare. La purge par tag, préfixe ou
  hostname est disponible sur toutes les offres depuis avril 2025 ; le
  renderer pose `Cache-Tag: page-<id>,domain-<id>`.
- Coût : Workers Paid 5 $/mois pour 10 M requêtes (l'offre gratuite plafonne à
  100 k/jour, trop juste pour du « fort trafic »). Le Worker ne tourne que sur
  les hôtes de pages, pas sur `img.` ni `/_next/static`.

### 8.3 A/B test déplacé dans le Worker
- Le Worker lit le cookie `tf-ab-<experimentKey>`, tire au sort si besoin, pose
  le cookie et sert `/ab-variant/<id>` **depuis le cache** (une entrée par
  variante, déjà prévue par le contrat de 008).
- La liste des tests en cours vient d'un JSON exposé par l'origine et mis en
  cache peu de temps (ou poussé dans Workers KV à chaque changement).
- Les vues et expositions passent par la balise navigateur (§7).
- Risque : la logique de tirage existe alors en deux endroits (middleware pour
  le dev local, Worker en prod). Il faut un module partagé (`@trefle/shared`)
  et des tests communs, ou un seul chemin avec le Worker simulé en local.
- Variante plus prudente pour un premier lot : **ne pas cacher les pages
  sous test** (l'origine les sert en `no-store`, comme aujourd'hui), et cacher
  tout le reste. On garde l'A/B actuel sans le toucher ; en contrepartie, une
  page sous test en pleine pointe de trafic reste à la charge du VPS.

### 8.4 Images : versionner plutôt que purger
- imgproxy a une option **`cachebuster` (`cb:`)**, signée avec l'URL et sans
  effet sur le traitement. Le renderer y met la version du média (`updatedAt`
  ou un hash du fichier) : **quand une image en écrase une autre, toutes ses
  URL changent automatiquement**, partout (navigateurs et CDN), sans purge.
  Cela correspond à la solution « mieux » demandée, plus robuste qu'une purge.
- Les pages qui utilisent l'image doivent alors être revalidées et purgées.
  Il faut donc un hook `afterChange` sur `media` qui retrouve les pages
  concernées (le HTML GrapesJS contient l'URL de l'asset, ou une table
  « page ↔ média » à créer).
- Purge réelle (ex. retrait légal d'une image) : supprimer l'objet S3 puis
  purger par hostname `img.` (méthode radicale mais rare), ou par URL si on
  sait lister les variantes générées.
- Vérifier comment Payload se comporte quand on remplace le fichier d'un
  média existant : réutilise-t-il la même clé S3 ? (rien de clair dans la
  doc, à tester).
- Cache Rule `Vary` sur `img.` avec normalisation de `Accept`
  (`image/webp`), ou bien WebP pour tout le monde et plus de `Vary` du tout.
  Polish désactivé.

### 8.5 Polices
`Cache-Control` explicite sur `assets.` (Caddy) et versionnement des URL des
polices de domaine (même principe que les images).

## 9. Points de vigilance pour la spec

- **Constitution** : le Worker est du code exécuté hors de la stack déclarée
  (principe II), et l'architecture décrit « SSR with ISR » sans CDN. Cela
  demande au minimum une justification, probablement un amendement de la
  section Architecture.
- **Découpage** (principe III, petits changements réversibles) suggéré :
  1. Cloudflare en proxy + origine verrouillée + IP réelle + images/polices
     en cache (sans cache HTML) ;
  2. jeton de formulaire et comptage des vues sortis du HTML ;
  3. Worker (nonce + cache HTML + purge) sur les pages hors A/B ;
  4. A/B dans le Worker.
- **Tests de charge** : définir l'objectif chiffré (ex. N requêtes/s
  soutenues, pointe ×10), et le vérifier avant et après.
- **Offre Cloudflare** : Free + Workers Paid suffit au départ ; Pro
  (20 $/mois par zone) apporte le jeu de règles OWASP complet et plus de
  règles de rate limiting. À décider selon le niveau de menace.
- **RGPD** : Cloudflare est un sous-traitant américain (mentions légales et
  registre à mettre à jour). La balise de vues reste sans cookie.
- **Dev local et e2e** : le Worker doit pouvoir tourner en local (Wrangler)
  ou être contourné proprement, sans casser les specs Playwright existantes.

## 10. Tests A/B de blocs et rôle de GrowthBook (2026-10-09)

Analyse complète : `docs/ab-testing-exploration.md` §8. En bref :

- **GrowthBook n'est pas sur le chemin des requêtes** dans la 008 livrée :
  définitions dans Payload, tirage au sort par notre `assignVariant`,
  statistiques depuis `page-stats`. GrowthBook est un moteur de
  significativité optionnel lisant Postgres. Déplacer le tirage dans le
  Worker (lot 4) ne le concerne donc pas.
- **Tests de blocs compatibles, et mieux servis** : une seule page en cache
  contenant toutes les variantes balisées ; le Worker garde le fragment
  gagnant (`HTMLRewriter`, même passe que le nonce). Pas d'explosion du
  cache, pas de clignotement, pas de JS client.
- **Contraintes à reprendre dans les specs :**
  - **Lot 2** : la balise navigateur qui remplace `pingPageView` enregistre
    *toutes* les expositions de la page (clé, variante, identifiant anonyme
    du cookie `tf-ab-*`, date) et les leads gardent les variantes vues —
    `page-stats` ne peut pas distinguer deux fragments d'une même page. C'est
    aussi le format attendu par GrowthBook. Décider conservation, base légale
    et registre (données pseudonymes).
  - **Lot 4** : Worker A/B générique (réécriture de page **et** sélection de
    fragments) ; `assignVariant` et la sélection de fragments dans
    `packages/shared`, un seul code pour renderer et Worker.
  - **Lot 1** : rien à changer (une image d'une variante perdante compte comme
    utilisée, c'est voulu).
- **Décision (2026-10-09) : GrowthBook est conservé** et sera réellement
  branché au lot 2 (source Postgres, requêtes d'exposition et de conversion,
  significativité affichée à côté des comptes). Le retirer a été envisagé et
  écarté. La 017 garde donc ses deux hôtes GrowthBook protégés.

## Sources

- Cloudflare, comportement de cache par défaut : https://developers.cloudflare.com/cache/concepts/default-cache-behavior/
- Cloudflare, Vary (toutes offres) : https://developers.cloudflare.com/cache/concepts/vary/ et https://blog.cloudflare.com/vary-support/
- Cloudflare, Vary for Images (Pro+) : https://developers.cloudflare.com/cache/advanced-configuration/serve-tailored-content/
- Cloudflare, setup partiel (Business+) : https://developers.cloudflare.com/dns/zone-setups/partial-setup/
- Cloudflare for SaaS, tarifs : https://domainee.dev/blog/cloudflare-for-saas-pricing
- Cloudflare, JavaScript detections et CSP : https://developers.cloudflare.com/bots/additional-configurations/javascript-detections
- Cloudflare, cookies : https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/
- Cloudflare, nouvelles CGU : https://blog.cloudflare.com/updated-tos/
- Caddy derrière Cloudflare (IP réelle) : https://caddy.community/t/cloudflare-proxy-x-forwarded-for-client-ip-issue/25154
- Caddy derrière Cloudflare (ACME) : https://caddy.community/t/letsencrypt-error-when-caddy-is-behind-cloudflare/14100/6
- Next.js, CSP et nonce : https://nextjs.org/docs/app/guides/content-security-policy
- imgproxy, cache externe : https://docs.imgproxy.net/cache/external
- Caddy cache-handler (Souin) : https://github.com/caddyserver/cache-handler
- Bunny, tarifs et Vary Cache : https://docs.bunny.net/cdn/pricing et https://docs.bunny.net/cdn/vary-cache
- Cloudflare, purge pour toutes les offres : https://developers.cloudflare.com/changelog/post/2025-04-01-purge-for-all/
- Cloudflare, rate limiting gratuit : https://blog.cloudflare.com/unmetered-ratelimiting/
- Cloudflare for SaaS, apex proxying (Enterprise) : https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/advanced-settings/apex-proxying/setup/
- Nonce CSP injecté par Worker : https://scotthelme.co.uk/csp-nonces-the-easy-way-with-cloudflare-workers/
- Next.js App Router, scripts inline et SRI : https://dev.to/0xdbe/nextjs-consequence-of-approuter-on-your-csp-839
- imgproxy, option cachebuster : https://github.com/koenpunt/imgproxy/blob/master/docs/generating_the_url_advanced.md

## 11. Étude du cache HTML en périphérie (2026-10-11)

Question posée : peut-on mettre le HTML des pages en cache chez Cloudflare,
pour augmenter le nombre de pages servies par seconde, **sans perdre aucune
fonctionnalité** ? Cette section reprend les §7–§8 avec le code actuel (après
la 017) et la doc Cloudflare à jour, et remplace le découpage en lots 2–4 par
une seule feature, la **020**.

### 11.1 Point de départ mesuré

Test de charge du 2026-10-10 (`infra/loadtest/results/`) : le VPS **sature à
~26 pages/s** (p95 ≈ 20 s), avant comme après le passage derrière Cloudflare.
L'objectif du programme est 1 000 pages/s soutenues, pointes à 10 000/s.
Seul le cache du HTML peut combler cet écart : l'origine ne rend plus qu'environ
une page par page publiée, par niveau de cache et par durée de vie du cache.

### 11.2 Verdict

**Faisable sans perte de fonctionnalité, à une condition : un Worker
Cloudflare personnalise chaque réponse servie depuis le cache.** Une simple
règle « Cache Everything » casserait la CSP, les leads, l'A/B et le comptage
des vues. Le Worker s'exécute donc à chaque vue ; c'est lui qui coûte
(§11.7), pas le comptage.

### 11.3 Ce qui rend chaque réponse unique, et son traitement

| Élément | Où | Traitement retenu |
|---|---|---|
| **Nonce CSP** | `middleware.ts`, scripts de Next, code admin (014), **et la prop `nonce` de `ConsentCodeRunner`, sérialisée dans le payload RSC** | L'origine rend avec un nonce factice fixe ; le Worker le remplace par un nonce neuf **dans tout le corps** (remplacement de texte en flux, pas seulement les attributs : sinon l'hydratation repart avec le factice) et pose l'en-tête CSP. |
| **Jeton de formulaire** | `page.tsx` → `signFormToken` (âge accepté 2 s–2 h) | **Le Worker signe le jeton** (HMAC-SHA256 via WebCrypto, même format, même secret). `verifyFormToken` ne change pas et **le formulaire fonctionne toujours sans JavaScript**. Remplace la piste du §7 (« jeton obtenu par le navigateur »), qui aurait perdu le mode sans JS (constitution, principe V). |
| **Comptage des vues** | `pingPageView` à chaque rendu | Le Worker écrit un point dans **Workers Analytics Engine** ; une tâche par minute additionne et appelle `incrementPageStat(…, by = N)`. Voir §11.6. |
| **A/B** (cookie `tf-ab-*`, réécriture) | middleware | Le Worker lit ou pose le cookie et sert `/ab-variant/<id>` **depuis le cache** (une entrée par variante). La liste des tests vient d'un JSON de l'origine, en cache 30 s et purgé quand un test change. Tirage dans `packages/shared`, un seul code. |
| **Mode « edge » de l'origine** | middleware | Avec un en-tête secret posé par le Worker : nonce factice, pas d'A/B, pas de `Set-Cookie`. **Sans cet en-tête, comportement actuel inchangé** : dev, e2e, et repli si le Worker échoue (`passThroughOnException`). |

Le reste est déjà identique pour tous : bandeau cookies lu côté client, GTM
et `dataLayer` fixes par page, polices et alias de médias. Les UTM sont lus
par `/api/leads` dans le `Referer`, pas par la page.

### 11.4 Quel cache : celui de la zone, pas « Workers Caching »

- **Workers Caching** (le cache propre au Worker) est **inutilisable** : sur un
  hit, le Worker ne s'exécute pas (donc pas de nonce ni de jeton), et sa clé
  de cache **ignore le nom d'hôte** (`/` de deux domaines clients se
  mélangeraient).
- **Cache de zone, via `fetch()` du Worker vers l'origine** : l'hôte fait
  partie de la clé, les Cache Rules s'appliquent, la purge par `Cache-Tag`
  marche en Free, et le Smart Tiered Cache aussi. L'origine pose
  `Cache-Tag: page-<id>,domain-<id>`.
- Route `*/*` sur la zone (indispensable pour les hôtes clients de
  Cloudflare for SaaS), avec des routes **sans Worker** pour `admin.`,
  `growthbook*`, `img.`, `assets.` et `*/api/*` (IP réelle et rate limit
  inchangés).

### 11.5 Pièges identifiés

1. **Requêtes RSC de Next** (en-tête `RSC`, paramètre `_rsc`) : même URL,
   autre contenu, et Cloudflare ignore `Vary`. Toujours contournées, sinon du
   payload RSC serait servi comme HTML.
2. **Déploiement** : chaque build change les noms des chunks
   `/_next/static` ; un HTML resté en cache pointerait vers des JS disparus.
   `release.sh` purge les hôtes de pages après chaque déploiement.
3. **Remplacement d'un média** : l'ancien objet est supprimé tout de suite
   (017). La purge Cloudflare se fait dans le même hook que
   `/api/revalidate`, sinon une image reste cassée jusqu'à expiration du TTL.
4. **Hors cache** : `/api/*`, `/preview`, `/confirm`, `/confirmation`,
   `/unsubscribe`, `/form-retry`, toute méthode autre que GET/HEAD, les 5xx,
   les hôtes inconnus. Les 404 sont mis en cache peu de temps, avec le tag du
   domaine (une publication les purge).
5. **Bug existant** : `incrementPageStat` fait un find puis un update, non
   atomique ; des vues simultanées se perdent dès aujourd'hui. L'ajout par
   lot (§11.6) le corrige au passage.
6. **Gains annexes** : le Worker retire `x-middleware-rewrite` (qui révèle
   l'id de la variante, FR-006 de la 008) ; le cache peut servir une version
   périmée si l'origine tombe.

### 11.6 Comptage : vues et expositions A/B

**Vues (compteurs `page-stats`) — décidé** : Workers Analytics Engine + tâche
par minute. Les compteurs de l'admin ont jusqu'à ~1 min de retard, sans
conséquence (un test se lit sur des jours ; un lead peut brièvement précéder
sa vue). À très fort volume, Analytics Engine échantillonne : les totaux
restent justes (pondérés par `_sample_interval`) mais deviennent des
estimations très précises plutôt que des comptes à l'unité.

**Expositions A/B pour GrowthBook (018) — décidé** :
- GrowthBook calcule visiteur par visiteur : une exposition perdue sort un
  visiteur converti de l'expérience et fausse le verdict. Analytics Engine,
  échantillonné, **ne convient pas** pour ces données.
- Le Worker envoie les expositions dans une **file Cloudflare (Queues)**,
  sans perte ; un consommateur les envoie à l'origine **par paquets**, une
  seule insertion SQL par paquet.
- **Seule la première exposition** d'un visiteur à un test est enregistrée
  (celle que GrowthBook utilise) : le volume suit les visiteurs uniques des
  pages sous test, pas les vues.
- L'attribution des leads reste à l'origine : `/api/leads` lit les cookies.

**Pistes écartées** :
- *Appeler l'origine à chaque vue* : le VPS travaillerait de nouveau à chaque
  vue, pour gagner une minute de délai.
- *Écrire dans la base Mongo de GrowthBook* : elle ne contient que sa
  configuration et ses résultats ; GrowthBook lit les expositions dans notre
  Postgres, par SQL. Le regroupement est fait de notre côté (paquets).
- *Tag GTM* : bloqué par les bloqueurs de publicité (vues manquantes, taux de
  conversion gonflés), absent des domaines sans conteneur et dépendant du
  client, et un tiers (Google) fait perdre l'exemption CNIL de la 018.

### 11.7 Coût (Workers Paid, validé)

| Poste | Inclus | Au-delà |
|---|---|---|
| Worker (exécution à chaque vue) | 10 M requêtes, 30 M ms CPU / mois | 0,30 $ / M requêtes + ~2 ms CPU → **~0,35 $ / M vues** |
| Analytics Engine (vues) | 10 M points / mois *(à confirmer)* | ~0,25 $ / M *(à confirmer)* |
| Queues (expositions) | 1 M opérations / mois (~330 000 expositions) | ~1,20 $ / M expositions |

Base : 5 $/mois. Exemple : 30 M vues/mois ≈ 12 $/mois. Le comptage ajoute
quelques centimes par million de vues, souvent zéro.

### 11.8 Découpage : feature 020

Les lots 2–4 deviennent une seule feature, **020-edge-html-cache**, livrée par
tranches réversibles (constitution, principe III) :

1. mode « edge » de l'origine (nonce factice, sans A/B) et intake des vues
   par lot ;
2. Worker (nonce, jeton signé, Analytics Engine, cache de zone, purge à la
   publication et au déploiement), pages sous test encore en `no-store` ;
3. A/B dans le Worker, expositions par la file ; puis test de charge à
   1 000/s et 10 000/s.

Un amendement de la constitution (puce « Edge ») accompagne la tranche qui
met le HTML en cache.

### 11.9 Ce que l'implémentation a changé (020, 2026-10-12)

En production sur tous les hôtes depuis le 12/10/2026 (`edge-on.sh live`).
Écarts et vérifications par rapport à cette étude :

- **Routes** : Cloudflare accepte bien les exclusions sans hôte
  (`*/_next/*`, `*/api/*`, `*/favicon.ico`, …) à côté de `*/*`. Elles sont
  créées avant `*/*` et retirées après, pour qu'aucune requête exclue ne
  passe par le Worker pendant un changement (`worker-routes.sh`).
- **Règle de cache « Pages : jamais de HTML »** : elle n'empêche pas le
  Worker de mettre les pages en cache ; aucune modification de `cache.json`.
- **Retard d'une version (corrigé)** : la revalidation `"max"` de Next servait
  l'ancienne donnée à la première requête après un changement — celle du
  Worker juste après la purge, qui gardait alors l'ancienne page un jour. Le
  renderer expire désormais chaque tag immédiatement (`{ expire: 0 }`).
- **Jeton de formulaire** : un segment aléatoire est ajouté au jeton signé par
  le Worker (deux visites dans la même milliseconde avaient le même jeton) ;
  le renderer l'accepte sans changement.
- **A/B** : plus aucun en-tête interne ne révèle la variante
  (`x-middleware-rewrite` reste visible sur le chemin classique).
- **Mesures** : 1 000 vues/s sur l'hôte de test avec 1 seul rendu au serveur
  (p95 55 ms) ; comptage des vues exact à 0,06 % en moins de 2 min ;
  publication visible en 1 à 3 s ; répartition A/B 50,15/49,85 % sur 9 926
  visiteurs ; repli vérifié (Worker en panne, coupure des routes, renderer
  arrêté 44 s sans interruption des pages en cache).
- **CPU par vue** : pas encore mesuré ; à relever avec la première facture
  (§11.7, T067).
