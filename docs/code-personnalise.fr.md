# Code personnalisé et édition du HTML des pages

Guide d'utilisation pour les admins et éditeurs de Trefle (feature 014). Il
explique comment modifier le HTML d'une page, ajouter des scripts (pixels,
statistiques, widgets) et placer un widget à un endroit précis de la page.

## Qui peut faire quoi

| Action | Admin | Éditeur |
|---|---|---|
| Modifier le HTML et le CSS d'une page (vue « Code ») | ✅ | ✅ |
| Ajouter ou modifier les scripts de la page (section « Scripts ») | ✅ | ❌ (section invisible) |
| Ajouter un bloc « Code personnalisé » ou modifier son code | ✅ | ❌ |
| Déplacer ou supprimer un bloc « Code personnalisé » existant | ✅ | ✅ |

Le code ajouté par un admin s'exécute uniquement sur la page publique, pour
ses visiteurs. Il ne s'exécute jamais dans l'éditeur ni dans l'admin.

## Modifier le HTML et le CSS : la vue « Code »

Dans l'éditeur de la page, cliquez sur **« </> »** (« Modifier le code HTML
et CSS »).

- Deux éditeurs de code s'ouvrent : **HTML** et **CSS**. Le code est coloré
  et mis en forme.
- Après un copier-coller, **« Mettre en forme »** réindente le code.
- **« Vérifier et appliquer »** affiche d'abord la liste de tout ce qui ne
  sera pas publié. Vous pouvez alors revenir au code, ou appliquer quand
  même.
- **Ctrl+Z** (ou **Cmd+Z** sur Mac) annule l'application en une seule fois.
- Rien n'est enregistré tant que vous n'avez pas enregistré la page.

**Accepté dans le HTML :** titres, paragraphes, listes, liens, images,
tableaux, boutons, vidéos et audio, iframes (YouTube, Vimeo, cartes…), SVG,
`details`/`summary`, balises de structure (`header`, `footer`, `article`…).

**Retiré à la publication :**
- `<script>` : utilisez la section « Scripts » ou le bloc « Code
  personnalisé » (admins) ;
- les attributs `onclick`, `onload`… ;
- les liens `javascript:` ;
- `<style>` : mettez le CSS dans la zone CSS ;
- les formulaires et champs de saisie : utilisez le bloc « Formulaire
  (lead) », seul formulaire autorisé, pour que chaque lead soit enregistré
  et protégé.

Les emplacements du formulaire et des blocs de code apparaissent dans le HTML
sous forme de lignes `<div data-block="…">`. Laissez-les en place : les
supprimer supprime le bloc.

## Ajouter des scripts à une page (admins)

En bas de la page, ouvrez la section **« Scripts »**. Elle contient deux
zones.

- **« Dans l'en-tête de la page »** : les balises `<meta>`/`<link>` (par
  exemple une vérification de domaine) sont placées dans l'en-tête. Les
  scripts s'exécutent avant le contenu de la page.
- **« En fin de page »** : exécuté après le contenu. C'est l'endroit
  recommandé pour la plupart des pixels et des widgets de chat.

Collez le code tel que le fournisseur le donne. Limite : 50 000 caractères
par zone.

Ces scripts s'appliquent aussi aux variantes A/B de la page, à l'aperçu et
à la **page de confirmation**, où l'on place en général l'événement de
conversion (lead).

## Le consentement cookies

Chaque script et chaque bloc de code a un réglage **« Consentement »**.

- **« Nécessite le consentement cookies »** (par défaut). Le code ne
  s'exécute qu'après un clic du visiteur sur **« Accepter »** dans le
  bandeau cookies. Il démarre aussitôt, sans rechargement de la page, ou
  dès le chargement si le visiteur avait accepté lors d'une visite
  précédente. Après un refus, il ne s'exécute jamais. À utiliser pour les
  pixels publicitaires et les outils de statistiques.
- **« Essentiel »**. Le code s'exécute toujours. À réserver aux widgets qui
  ne déposent pas de cookie de suivi.

Si le domaine de la page n'a **pas de bandeau cookies**, les visiteurs ne
peuvent pas accepter : le code « Nécessite le consentement » ne s'exécutera
jamais. Un avertissement le signale dans la section « Scripts ». Activez
alors le bandeau du domaine, ou passez le code en « Essentiel » s'il ne
suit pas les visiteurs.

## Placer un widget dans la page : le bloc « Code personnalisé » (admins)

Pour un calendrier de réservation, une carte ou un lecteur vidéo à un
endroit précis :

1. Dans la bibliothèque de blocs, **glissez** « Code personnalisé » dans la
   page. Vous pouvez aussi **cliquer** dessus : il s'ajoute juste après le
   bloc sélectionné.
2. La fenêtre « Code personnalisé » s'ouvre. Collez le code du widget (HTML
   et script), choisissez le consentement, puis cliquez sur
   **« Enregistrer »**.
3. Enregistrez la page.

Dans l'éditeur, le bloc apparaît comme un cadre violet
« </> Code personnalisé ». Le vrai widget s'affiche uniquement sur la page
publiée. Pour modifier le code, double-cliquez sur le bloc.

Un bloc placé dans une section ou une colonne suit sa mise en page, y
compris sur mobile. Un bloc « Nécessite le consentement » reste vide tant
que le visiteur n'a pas accepté.

## Limites à connaître

- **Code du fournisseur.** Certains widgets anciens utilisent des attributs
  `onclick` dans leur propre code ou `document.write`, que la sécurité des
  pages bloque. Les outils courants fonctionnent : pixels Meta, TikTok et
  LinkedIn, Google Analytics (gtag), Hotjar, Calendly, chats HubSpot et
  Crisp, vidéos YouTube et Vimeo.
- **Contenu non vérifié.** Trefle ne vérifie pas le contenu du code collé :
  l'admin en est responsable.
- **Duplication de page.** Un éditeur ne peut pas dupliquer une page qui
  contient des blocs « Code personnalisé », car la copie pointerait vers du
  code qu'il ne peut pas lire. Un admin, lui, le peut. La création de
  variantes A/B fonctionne pour tous.
- **Historique.** Chaque modification de scripts ou de blocs de code est
  enregistrée dans le journal d'activité, avec son auteur.
