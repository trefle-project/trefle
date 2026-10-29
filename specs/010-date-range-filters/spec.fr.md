# Feature Specification: Filtres de période par calendrier

**Feature Branch**: `010-date-range-filters`

**Created**: 2026-09-25

**Status**: Draft

**Input**: User description: "Filtre de période graphique (calendrier, granularité jour, 00:00:00 à 23:59:59) pour les vues d'administration Trefle qui n'en ont pas encore : les listes Payload page-stats, activity-log, pages et experiments, ainsi que le panneau de résultats de tests A/B (ExperimentStats), qui aujourd'hui n'a qu'une borne de début figée sur le début du test et aucune borne de fin ni contrôle utilisateur. Le filtre doit permettre de choisir une période avec granularité jour via un sélecteur graphique style agenda, s'additionnant aux filtres déjà existants sur ces vues sans les casser."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Filtrer une liste d'administration par période (Priority: P1)

En tant qu'opérateur de la CMS, je veux choisir une période (date de début et date de fin) via un calendrier graphique sur les listes Statistiques de pages, Journal d'activité, Pages et Tests A/B, afin de ne consulter que les entrées de cette période sans avoir à parcourir toute la liste.

**Why this priority**: C'est la capacité la plus largement utile — elle couvre les quatre vues concernées et répond directement au besoin exprimé ("il n'est pas possible pour les champs dates de définir une période"). Elle apporte de la valeur à elle seule, indépendamment des autres user stories.

**Independent Test**: Sur n'importe laquelle des quatre listes, choisir une date de début et une date de fin dans le calendrier ; vérifier que seules les entrées dont la date tombe dans cet intervalle restent affichées, et que la liste revient à son état non filtré une fois la période effacée.

**Acceptance Scenarios**:

1. **Given** une liste contenant des entrées réparties sur plusieurs jours, **When** l'opérateur choisit une période via le calendrier, **Then** seules les entrées dont la date concernée tombe entre le début (00:00:00) du premier jour choisi et la fin (23:59:59) du dernier jour choisi restent affichées.
2. **Given** une période est déjà appliquée, **When** l'opérateur l'efface, **Then** toutes les entrées réapparaissent (sous réserve des autres filtres actifs).
3. **Given** un autre filtre est déjà actif sur la liste (ex. statut), **When** l'opérateur ajoute une période, **Then** les deux filtres s'appliquent ensemble et se combinent (ET logique).

---

### User Story 2 - Restreindre la fenêtre des résultats de test A/B à une période (Priority: P2)

En tant qu'opérateur, je veux choisir la période sur laquelle sont agrégés les visites et conversions par variante d'un test A/B, afin d'isoler la performance sur un intervalle particulier plutôt que de me limiter aux totaux depuis le début du test.

**Why this priority**: Valeur indépendante et déjà identifiée comme manquante (borne de fin absente aujourd'hui), mais plus spécialisée que le filtrage de listes de la User Story 1 — elle s'appuie sur la même interaction de calendrier.

**Independent Test**: Sur le panneau de résultats d'un test A/B ayant de l'activité sur plusieurs jours, choisir une période ne couvrant qu'une partie de cette activité ; vérifier que les totaux affichés par variante changent en conséquence, et qu'en l'absence de période choisie le comportement par défaut actuel (totaux depuis le début du test) reste inchangé.

**Acceptance Scenarios**:

1. **Given** un test A/B avec de l'activité sur plusieurs jours, **When** l'opérateur choisit une période couvrant seulement une partie de cette durée, **Then** les visites et conversions affichées par variante ne reflètent que cette période.
2. **Given** aucune période n'est choisie, **When** l'opérateur consulte le panneau de résultats, **Then** le comportement par défaut actuel s'applique (totaux depuis le début du test, sans borne de fin).

---

### User Story 3 - Retrouver la période choisie après rechargement (Priority: P3)

En tant qu'opérateur, je veux que la période choisie reste visible et appliquée après un rechargement de page ou l'ouverture du même lien, afin de ne pas avoir à la re-sélectionner et de pouvoir la partager avec un collègue.

**Why this priority**: Confort et partageabilité qui renforcent les User Stories 1 et 2, mais celles-ci restent utilisables sans cette persistance.

**Independent Test**: Choisir une période sur une des vues concernées, recharger la page (ou ouvrir la même URL dans une nouvelle fenêtre) ; vérifier que la même période et les mêmes résultats filtrés sont affichés.

**Acceptance Scenarios**:

1. **Given** une période a été choisie et appliquée, **When** la page est rechargée ou la même URL est ouverte dans une nouvelle session, **Then** la même période apparaît comme active et les résultats restent filtrés en conséquence.

---

### Edge Cases

- Quand la période choisie ne correspond à aucune entrée, le système doit l'indiquer clairement (pas de liste vide sans explication).
- Tant que la date de fin est antérieure à la date de début, ou qu'une seule des deux bornes est renseignée, la période ne doit pas pouvoir être appliquée.
- Une vue dont la date affichée représente déjà une journée entière agrégée (Statistiques de pages) et une vue dont la date est un horodatage précis (Journal d'activité, Pages, Tests A/B) doivent toutes deux se comporter, du point de vue de l'opérateur, comme un filtrage par jour calendaire complet — sans qu'il ait à connaître cette distinction.
- Un opérateur dont le fuseau horaire diffère de celui du serveur doit pouvoir se fier au jour affiché dans le calendrier (voir Assumptions).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le système DOIT permettre à l'opérateur de choisir une période (date de début et date de fin) via un sélecteur calendrier graphique, sur les listes Statistiques de pages, Journal d'activité, Pages et Tests A/B.
- **FR-002**: La période choisie DOIT filtrer les entrées affichées à la journée calendaire complète : depuis 00:00:00 le premier jour sélectionné jusqu'à 23:59:59 le dernier jour sélectionné inclus.
- **FR-003**: Le filtre de période DOIT se combiner avec les filtres déjà existants sur ces listes, sans les désactiver ni les remplacer.
- **FR-004**: L'opérateur DOIT pouvoir effacer la période choisie pour revenir à la liste non filtrée par date, les autres filtres actifs restant appliqués.
- **FR-005**: Le système DOIT empêcher la validation d'une période incomplète ou incohérente (date de fin antérieure à la date de début, ou une seule des deux bornes renseignée).
- **FR-006**: Sur le panneau de résultats d'un test A/B, l'opérateur DOIT pouvoir choisir une période pour restreindre à cet intervalle les visites et conversions affichées par variante, en complément du comportement par défaut existant.
- **FR-007**: La période choisie sur une liste ou sur le panneau de résultats d'un test A/B DOIT rester visible et appliquée après un rechargement de la page ou l'ouverture du même lien dans une nouvelle fenêtre ou session.
- **FR-008**: Lorsqu'aucune entrée ne correspond à la période choisie, le système DOIT l'indiquer explicitement plutôt que d'afficher une liste vide sans explication.
- **FR-009**: Le sélecteur de calendrier DOIT être utilisable au clavier et par un lecteur d'écran, au même titre que les autres contrôles de l'interface d'administration.

### Key Entities

- **Période sélectionnée**: un intervalle borné par une date de début et une date de fin, à granularité jour, actif sur une vue donnée (liste ou panneau de résultats).
- **Vue filtrable**: chacune des quatre listes (Statistiques de pages, Journal d'activité, Pages, Tests A/B) ou le panneau de résultats d'un test A/B, chacune ayant son propre champ date de référence déjà affiché aujourd'hui.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un opérateur peut restreindre n'importe laquelle des quatre listes concernées à une période donnée en moins de 3 interactions, sans quitter la page.
- **SC-002**: Après application d'une période, les entrées affichées correspondent exactement à celles dont la date concernée tombe dans l'intervalle choisi (aucun faux positif ni faux négatif), vérifiable par comptage indépendant.
- **SC-003**: Une période choisie reste correctement appliquée et visible après un rechargement de page dans 100 % des cas testés.
- **SC-004**: Sur le panneau de résultats de test A/B, les totaux affichés par variante reflètent la période choisie sans qu'il soit nécessaire de rouvrir la fiche du test.

## Assumptions

- Les opérateurs de la CMS sont les seuls utilisateurs de ces vues (aucun accès public) : ce filtre n'introduit pas de nouvelle implication RGPD ni de nouveau contrôle d'accès par rapport à l'existant.
- La granularité de la période est la journée calendaire ; un filtrage à l'heure ou à la minute est hors périmètre de cette itération.
- Pour la vue dont la date représente déjà une journée entière agrégée (Statistiques de pages), le jour choisi correspond directement au jour agrégé, quel que soit le fuseau horaire de l'opérateur. Pour les vues dont la date est un horodatage précis (Journal d'activité, Pages, Tests A/B), le jour choisi correspond au jour calendaire de l'opérateur (fuseau horaire de son navigateur).
- Ce filtre est une capacité de consultation supplémentaire ; il ne modifie ni les données affichées, ni les droits d'accès existants.
- Une seule période active à la fois par vue ; la comparaison de plusieurs périodes en parallèle est hors périmètre de cette itération.
