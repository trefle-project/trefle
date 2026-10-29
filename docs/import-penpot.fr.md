# Importer un site Penpot

Guide d'utilisation pour les admins et éditeurs de Trefle (feature 015). Il
explique comment préparer un fichier dans Penpot, l'importer dans Trefle, et
ce qu'il faut relire avant de publier les pages créées. Il couvre aussi les
« Polices du domaine », que l'import complète.

## En bref

- Chaque **board** d'une page Penpot devient une **page brouillon** de Trefle,
  faite de blocs modifiables dans l'éditeur. Rien n'est publié
  automatiquement.
- Les liens de prototype entre boards deviennent de vrais liens entre les
  pages.
- Les images du fichier vont dans la médiathèque. Les polices Google sont
  ajoutées au domaine et servies par Trefle, jamais par Google.
- L'import ne coûte rien (aucune IA) et prend quelques secondes.
- Il ne modifie jamais une page existante : un nouvel import crée de
  nouveaux brouillons.

## Qui peut faire quoi

| Action | Admin | Éditeur |
|---|---|---|
| Importer un site Penpot | ✅ | ✅ |
| Annuler son propre import | ✅ | ✅ |
| Lancer ou annuler l'import d'un autre utilisateur | ✅ | ❌ |
| Gérer les « Polices du domaine » à la main | ✅ | ❌ |

Le bouton **« Importer un site Penpot »** apparaît au-dessus de la liste des
pages, et sur la fiche d'un domaine actif. S'il n'apparaît pas, la
fonctionnalité n'est pas activée sur cette installation (voir « Pour les
administrateurs » en fin de guide).

## Préparer le fichier dans Penpot

### Une page Penpot, un board par page du site

- Rangez les pages du site dans **une même page Penpot** (par exemple
  « Site »). Les autres pages du fichier (composants, brouillons) sont
  ignorées si vous ne les choisissez pas.
- Chaque **board de premier niveau** de cette page devient une page. Les
  boards sont proposés dans l'ordre de lecture : de haut en bas, puis de
  gauche à droite.
- **Nommez les boards** comme les pages : le nom devient le titre public de
  la page (« Accueil », « À propos »…) et sert à proposer son adresse
  (`/a-propos`). Le premier board est proposé en `/`.
- **10 pages au plus par import.** Pour un site plus grand, faites plusieurs
  imports.

### Mise en page : flex et grid

- Les boards et cadres en **disposition flex ou grid** sont reproduits avec
  leurs espacements, alignements et dimensions, et **s'adaptent au mobile**
  (les rangées s'empilent, les marges se réduisent).
- Un contenu **positionné librement** (sans flex ni grid) est reproduit à
  l'identique sur ordinateur, mais il est seulement **réduit
  proportionnellement** sur mobile, ce qui le rend vite illisible. Le
  rapport le signale. Si c'est tout le board, il le demande comme action
  avant publication.
- Les textes en **largeur automatique** restent sur une ligne tant que la
  place le permet, comme dans Penpot.
- Les calques **masqués** ne sont pas importés.

### Textes et polices

- Les textes sont repris **mot pour mot**, avec leur police, taille,
  graisse, couleur, interligne et espacement.
- Les **polices Google** (et la police par défaut de Penpot, « Source Sans
  3 ») sont ajoutées aux polices du domaine. Une police qui n'existe pas chez
  Google est remplacée par une police système proche (serif, sans-serif ou
  monospace), et le rapport l'indique.
- Les niveaux de titre viennent des **styles de texte** (typographies) de
  Penpot : un texte qui utilise un style nommé « H1 », « Heading 2 »,
  « Titre 3 »… prend ce niveau. Sans style nommé ainsi, le plus grand texte
  du board devient le **titre principal** (`h1`) et les grands textes
  suivants des sous-titres. Chaque page a un seul titre principal.

### Images et icônes

- Les images (remplissages image) sont enregistrées dans la **médiathèque**
  en WebP. Une image dont le calque porte un nom parlant (« Photo de
  l'équipe ») reçoit ce nom comme texte alternatif. Sinon, elle est marquée
  **« À décrire »** et le rapport demande de la décrire avant de publier.
- Les icônes et formes vectorielles deviennent des SVG dans la page.

### Liens (prototype)

Dans le mode Prototype de Penpot, sur un élément :

- **« Naviguer vers » un board, au clic** : devient un lien vers la page
  créée pour ce board, à l'adresse choisie dans l'assistant. Si ce board
  n'est pas importé, le lien n'est pas créé et le rapport le liste.
- **« Ouvrir une URL », au clic** : devient un lien. Seuls `https:`,
  `http:`, `mailto:` et `tel:` sont acceptés.
- Les autres interactions (survol, superpositions, « Retour », délais) ne
  sont pas reprises. Le rapport les liste.

### Ce qui n'est pas repris tel quel

- **Carrousels** : Penpot n'en a pas. La diapositive visible est
  reproduite telle que dessinée, sans défilement, et le rapport le signale.
  Vous pouvez ensuite le refaire avec le bloc « Carrousel » (voir
  [Le bloc Carrousel](carrousel.fr.md)).
- **Couleurs** : elles ne sont jamais modifiées. Un contraste insuffisant
  du design est signalé dans la section « Accessibilité » du rapport, à vous
  de décider de le corriger.
- **Boards mobiles** : si votre fichier contient aussi des versions mobiles
  des pages, ne les cochez pas. Trefle adapte lui-même la version ordinateur
  au téléphone.
- Les masques, les modes de fusion et la rotation sont simplifiés, et le
  rapport le dit.

### Exporter le fichier

Dans Penpot : menu du fichier › **Exporter** › **fichier .penpot**. Exportez
le fichier seul, **sans les bibliothèques**. Le fichier doit venir de
Penpot 2 et peser **100 Mo au plus** (allégez les images si besoin).

## Importer dans Trefle

Cliquez sur **« Importer un site Penpot »** (liste des pages, ou fiche du
domaine). L'assistant compte quatre étapes.

1. **Domaine** : choisissez le domaine du site. Les pages seront créées en
   brouillon sur ce domaine. Il ne peut plus être changé une fois le fichier
   analysé. Depuis la fiche d'un domaine, cette étape est déjà remplie.
2. **Fichier** : déposez le fichier `.penpot` (ou cliquez pour le choisir).
   Trefle l'analyse en quelques secondes.
3. **Pages** :
   - si le fichier a plusieurs pages Penpot, choisissez celle du site ;
   - cochez les boards à importer (les 10 premiers le sont d'avance) ;
   - vérifiez l'**adresse** de chaque page. Pas d'espace, de « ? » ni de
     « # ». L'adresse « /confirmation » est réservée. Deux pages ne peuvent
     pas avoir la même adresse ;
   - la mention **« Déjà publiée sur ce domaine »** signale une adresse déjà
     prise par une page publiée. L'import est possible, mais le brouillon ne
     pourra être publié qu'à une autre adresse, ou après avoir dépublié
     l'autre page ;
   - choisissez la **langue** des pages (pré-remplie avec celle du domaine) ;
   - cliquez sur **« Importer N pages »**.
4. **Import** : la progression s'affiche (lecture, polices, images,
   construction, vérification des formats d'écran, enregistrement). Vous
   pouvez **annuler** : aucune page ni image n'est alors gardée. Vous pouvez
   aussi quitter la page, l'import continue. À la fin, les brouillons créés
   sont listés avec un lien vers chacun.

Tous les imports sont listés dans **Content › Imports de sites Penpot**,
avec leurs pages. Le fichier déposé est supprimé dès la fin de l'import. Une
analyse jamais lancée est abandonnée au bout d'une heure.

## Après l'import : relire, puis publier

### Les brouillons

- Leur **nom dans l'admin** est `<board>_<date>_<heure>`, par exemple
  `Accueil_2026-10-07_14h32`. Renommez-les si vous le souhaitez.
- Leur **titre public** (SEO) est le nom du board.
- Ce sont des pages « Libre » ordinaires : tout se modifie bloc par bloc
  dans l'éditeur, y compris dans la vue « Code ».

### Le rapport d'import

En haut de chaque brouillon importé, le **rapport d'import** indique :

- **À faire avant de publier** : par exemple décrire des images, ou adapter
  une page en positionnement libre au mobile ;
- **Simplifié** : ce qui a été reproduit plus simplement (carrousel,
  positionnement libre, polices ajoutées au domaine…) ;
- **Non repris** : interactions et liens qui n'ont pas pu être créés ;
- **Images non récupérées** : remplacées par une image neutre à changer ;
- **Polices remplacées** par une police système ;
- **Accessibilité** : contrastes insuffisants, niveaux de titre ;
- **Formats d'écran** : les problèmes vus sur ordinateur, tablette et
  mobile, regroupés par type.

**« Masquer le rapport »** le replie, seulement dans votre navigateur. **« Supprimer le
rapport »** le retire pour tout le monde, définitivement.

### Publier

Relisez la page sur ordinateur et sur mobile (aperçus de l'éditeur), faites
les actions demandées, puis publiez comme une page faite à la main.

### Réimporter un fichier modifié

Un nouvel import du même fichier **crée de nouveaux brouillons**, à côté des
anciens. Il ne modifie, ne dépublie et ne supprime jamais une page
existante. Pour remplacer une page publiée par sa nouvelle version, dépubliez
l'ancienne (ou changez son adresse), puis publiez la nouvelle.

## Polices du domaine

Sur la fiche d'un domaine (admins), la section **« Polices du domaine »**
liste les polices Google utilisables par toutes les pages du domaine.

- **Ajouter une police** : son nom exact sur Google Fonts (par exemple
  « Inter Tight »), ses graisses, et « Aussi en italique » si besoin. À
  l'enregistrement, Trefle télécharge les fichiers une fois et les sert
  lui-même. Les visiteurs ne contactent jamais Google.
- Un nom ou une graisse inconnus empêchent l'enregistrement, avec un message
  qui les nomme.
- Chaque police indique **« utilisée par N pages »** : vérifiez-le avant de
  la retirer.
- Dans l'éditeur, les polices du domaine de la page apparaissent en tête de
  la liste des polices.
- **Un import Penpot ajoute** au domaine les polices, graisses et italiques
  utilisés par les boards importés. Il n'en retire et n'en modifie jamais.

## Messages d'erreur

| Message | Que faire |
|---|---|
| Ce fichier dépasse 100 Mo… | Exportez-le avec des images plus légères. |
| Ce fichier n'est pas un export Penpot… | Exportez depuis Penpot : menu du fichier › Exporter › fichier .penpot. |
| Ce fichier vient d'une ancienne version de Penpot… | Ouvrez-le dans Penpot 2, puis exportez-le de nouveau. |
| Ce fichier contient plusieurs fichiers Penpot (bibliothèques incluses)… | Exportez seulement le fichier du site, sans les bibliothèques. |
| Ce fichier est trop volumineux une fois décompressé… | Retirez des pages ou des images inutiles du fichier. |
| 10 pages au maximum par import… | Décochez des boards, puis importez les autres dans un second import. |
| L'analyse a expiré, déposez le fichier de nouveau | L'analyse date de plus d'une heure : recommencez. |
| La page « … » est trop détaillée pour l'éditeur… | Simplifiez ce board dans Penpot, ou décochez-le. |
| Les polices Google n'ont pas pu être récupérées… | Réessayez dans quelques minutes. |
| L'import a pris trop de temps (6 minutes)… | Réessayez avec moins de boards. |

## Pour les administrateurs

- L'import s'active avec la variable **`PENPOT_IMPORT=on`** dans
  `infra/.env` du serveur, puis un redémarrage du service `cms`. Vide (par
  défaut), le bouton est masqué et les routes `/api/site-imports/*`
  répondent « introuvable ».
- Les polices sont téléchargées depuis Google Fonts quand un domaine est
  enregistré ou qu'un import en ajoute. Les pages publiées ne contactent
  jamais Google.
