# Contract: admin (CMS)

Research R1, R5, R8.

- **Settings** (Administrators): « Opérateur de l'installation » group,
  « Sous-traitants » array, « Textes juridiques » array (one row per
  language, French required — save refused with a French message
  otherwise); a banner listing the operator's missing details.
- **Domains** (Editors, Administrators): « Propriétaire du domaine » group,
  « Pages légales propres » (two optional URLs), « Paragraphes propres au
  domaine » array; column « Pages légales » in the list (« Complètes » or
  « À compléter : … »); banner on the edit view with the missing items.
- **Archive** « Versions des pages légales » (`legal-versions`): list and
  read-only view (domain, kind, language, version, date, rendered text);
  Editors and Administrators; no create/edit/delete buttons.
- **Consent records**: UI field « Politique acceptée » → link to the archive
  row of its version, or « Version non archivée » for older records.
- Every admin endpoint/collection read here requires the second factor
  (019 access helpers).

Tests: access rules (Editor cannot edit Settings legal fields; nobody
writes `legal-versions`); French-row hook; completeness column/banner logic
(pure function, unit-tested).
