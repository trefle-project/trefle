# Le bloc Carrousel

Guide d'utilisation pour les admins et éditeurs de Trefle (feature 016). Il
explique comment ajouter un carrousel à une page, remplir ses diapositives
et régler son fonctionnement.

Un carrousel montre plusieurs contenus au même endroit, l'un après l'autre :
des témoignages clients, une galerie de photos, une suite d'arguments avec
une image chacun. Tous les éditeurs peuvent l'utiliser, admins comme
non-admins.

## Ajouter un carrousel

Dans l'éditeur de la page, ouvrez la bibliothèque de blocs et :

- **glissez** le bloc **« Carrousel »** à l'endroit voulu ;
- ou **cliquez** dessus : il s'ajoute juste après le bloc sélectionné (ou en
  fin de page si rien n'est sélectionné).

Le carrousel arrive avec **3 diapositives d'exemple**, chacune avec une image
et un texte à remplacer.

## Remplir les diapositives

L'éditeur montre **une diapositive à la fois**. Le bandeau gris au-dessus
indique laquelle : « Diapositive 2 / 4 ».

Chaque diapositive se remplit comme une Section : déposez-y les blocs
habituels (Image, Texte, Témoignage, Bouton d'action, Colonnes…) et
modifiez-les comme partout ailleurs.

Sélectionnez le carrousel (cliquez sur son bandeau gris) pour faire
apparaître ses boutons dans la barre d'outils :

| Bouton | Effet |
|---|---|
| **‹** et **›** | montrer la diapositive précédente ou suivante |
| **+** | ajouter une diapositive vide après celle affichée |

Sélectionnez une diapositive (par exemple avec le bouton « parent » ↑ depuis
un bloc qu'elle contient) pour :

| Bouton | Effet |
|---|---|
| **←** et **→** | la déplacer d'un cran avant ou après |
| copier | la dupliquer (la copie s'affiche aussitôt) |
| corbeille | la supprimer |

Pour retrouver un bloc dans une diapositive cachée, ouvrez la liste des
calques et cliquez dessus : le carrousel affiche sa diapositive.

**Limites :**
- de **1 à 12 diapositives** : au-delà de 12, « + » et « dupliquer »
  n'ajoutent plus rien ; la dernière diapositive ne peut pas être supprimée
  (supprimez alors le carrousel entier) ;
- **pas de formulaire (lead) dans un carrousel** : le formulaire doit rester
  visible sans action du visiteur. L'éditeur refuse de l'y déposer, et la
  publication est refusée s'il s'y trouve quand même (par exemple via la vue
  « Code ») ;
- **pas de carrousel dans un carrousel**.

## Régler le carrousel

Sélectionnez le carrousel, puis ouvrez les **réglages** (icône ⚙) :

| Réglage | Par défaut | Effet |
|---|---|---|
| Nom du carrousel | « Carrousel » | nom annoncé par les lecteurs d'écran ; donnez-en un parlant, par exemple « Avis clients » |
| Diapositives visibles | 1 | 2 ou 3 diapositives côte à côte sur ordinateur ; 2 au plus sur tablette, toujours 1 sur téléphone |
| Défilement automatique | non | fait avancer le carrousel tout seul |
| Intervalle (secondes) | 5 | délai entre deux diapositives, de 3 à 10 secondes |
| Afficher les flèches | oui | les boutons ‹ › sous les diapositives |
| Afficher les points | oui | un point par position, pour aller directement à une diapositive |

Avec plusieurs diapositives visibles, il y a un point par position de
défilement, pas par diapositive : 5 diapositives dont 3 visibles donnent 3
points.

Le défilement automatique est désactivé par défaut, car il gêne une partie
des visiteurs. Si vous l'activez, le visiteur dispose d'un bouton pause, et
le carrousel s'arrête de lui-même quand la souris le survole, quand il a le
focus clavier, ou dès que le visiteur s'en sert.

## Ce que voient les visiteurs

- La première diapositive, puis les flèches ‹ › et les points sous le
  carrousel. Après la dernière diapositive, « suivant » revient à la
  première.
- Sur téléphone, un glissement horizontal change de diapositive ; un
  glissement vertical fait défiler la page normalement.
- Au clavier, la touche Tab atteint le carrousel puis ses boutons ; les
  flèches du clavier font défiler les diapositives.
- La hauteur du carrousel est celle de sa plus haute diapositive : la suite
  de la page ne bouge pas quand on change de diapositive. Une diapositive
  plus courte laisse donc un espace en dessous.
- Les images des diapositives suivantes se chargent après le reste de la
  page, pour ne pas la ralentir.
- Si le visiteur a demandé à son système de réduire les animations, les
  diapositives changent sans glisser et le défilement automatique ne
  démarre pas.
- Sans JavaScript, toutes les diapositives restent accessibles en faisant
  défiler le carrousel horizontalement.

## Carrousels et imports

Les imports de page (URL ou fichier Penpot) ne créent pas encore de bloc
Carrousel. Un carrousel du site d'origine est reproduit par sa première
diapositive (ou celle dessinée, pour Penpot), et le rapport d'import le
signale. Vous pouvez ensuite le refaire avec ce bloc.
