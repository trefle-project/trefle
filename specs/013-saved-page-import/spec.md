# Feature Specification: Import a page from a saved file

**Feature Branch**: `012-url-page-import` (complement to 012, same branch until it ships)

**Created**: 2026-09-27

**Status**: Draft

**Input**: User description: "Importer une page depuis un fichier enregistré (complément de 012-url-page-import). Quand un site refuse la visite automatique de l'import (protection anti-robots : Cloudflare, Akamai…), l'éditeur peut quand même importer la page : il l'ouvre dans son propre navigateur, l'enregistre (« Enregistrer sous… › Page web complète », ou un fichier HTML unique produit par une extension comme SingleFile), puis dépose le fichier dans l'assistant de création de page (option « Importer depuis une page web »). Le CMS affiche ce fichier dans le conteneur navigateur isolé, sans contacter le site d'origine pour la page elle-même, et la suite de l'import est inchangée : conversion en blocs par Claude, récupération des images (celles encore accessibles ; les autres deviennent des emplacements signalés dans le rapport), formulaire, rapport, budget. Le message « Le site a bloqué la visite automatique » propose cette option. Contraintes : aucune tentative de contournement des protections ; le fichier déposé est non fiable (taille maximale, types acceptés, aucun script exécuté qui puisse atteindre le réseau interne — même garde d'adresses que l'import par URL) ; les textes restent repris à l'identique ; pas de nouveau stockage durable du fichier source au-delà de l'import. Utilisé aussi pour l'évaluation T070 de mariages.net et parisjetaime.com."

## Context

Feature 012 imports a public page from its address. Some sites refuse
automated visits (anti-bot services such as Cloudflare or Akamai); the import
reports them as « Le site a bloqué la visite automatique » and deliberately
does not try to get past the protection. The same page opens normally in the
editor's own browser, because a person is visiting it. This feature lets the
editor save that page from their browser and hand the file to the import
instead of an address. The address stays the normal path: the file is
offered as a fallback when an address import fails because the site refuses
automated visits or needs a login, plus a discreet link for editors who
already have the page saved. Everything after the page is loaded — conversion into
blocks, images, form, report, budget, draft creation — is the 012 import,
unchanged.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Import a page the site refuses to serve to the importer (Priority: P1)

An editor tries to import a competitor's or client's page by address and gets
« Le site a bloqué la visite automatique ». The message explains how to
save the page from their browser and offers to import the file. They open the
page in their browser, save it as a single file, come back to the wizard —
title, page type, domain, path and language still filled in — drop the file,
and confirm. The import runs exactly like an address import and opens
the editor on a draft page with its report.

**Why this priority**: Without it, pages behind an anti-bot service cannot be
imported at all; two of the ten reference pages are in this case.

**Independent Test**: Save a page as a single HTML file from a desktop
browser, import it as a free page: a draft opens whose texts, sections and
images match the saved page, and the report names the page's original address.

**Acceptance Scenarios**:

1. **Given** a single-file HTML page saved from a browser, **When** the editor
   drops it in the wizard and confirms, **Then** the import runs with the same
   steps, report and budget rules as an address import and opens a draft page.
2. **Given** a saved page whose images are still publicly reachable, **When**
   the import completes, **Then** those images are in the Media library and the
   page uses them, as for an address import.
3. **Given** a saved page whose images can no longer be fetched (protected,
   removed, or only present inside the file), **When** the import completes,
   **Then** images embedded in the file are imported from the file itself,
   and those neither embedded nor reachable become image placeholders listed
   in the report.
4. **Given** an address import that failed with « Le site a bloqué la visite
   automatique », **When** the editor reads the message, **Then** it explains
   how to save the page from their browser and offers to import the file,
   keeping the title, page type, domain, path and language already entered.

---

### User Story 2 - Import a page only the editor can see (Priority: P2)

Some pages are only reachable by the editor: a page behind the client's own
login, a preview of an unpublished page. An address import fails with « Cette
page demande une connexion ou un paiement »; the message offers the same file
fallback as Story 1. An editor who already has the page saved (e.g. a page
they adjusted in their browser before saving) uses the discreet « Vous avez
déjà la page enregistrée ? » link under the address field instead.

**Why this priority**: Same mechanism as Story 1, useful beyond anti-bot
refusals, but not the reason the feature exists.

**Independent Test**: Save a page that needs a login (signed in as the editor),
import the file: the draft reproduces what the editor saw.

**Acceptance Scenarios**:

1. **Given** an address import that failed with « Cette page demande une
   connexion ou un paiement », **When** the editor reads the message, **Then**
   it offers the file fallback like Story 1 AS-4.
2. **Given** a page saved while signed in to the source site, **When** it is
   imported, **Then** the draft reproduces the saved content, and nothing is
   fetched from the source site with the editor's session (the import has no
   access to it).
3. **Given** the wizard's address step, **When** the editor follows « Vous avez
   déjà la page enregistrée ? », **Then** they can drop a file directly,
   without a failed address import first.

---

### Edge Cases

- **Wrong file**: a PDF, an image, a ZIP or a folder is dropped → refused
  before anything runs, with a message naming the accepted formats.
- **Too large**: a file above the size limit → refused before upload
  completes, with the limit in the message.
- **A page saved as "HTML only"** (no styles or images inside, relative links
  to the original site) → imported; styles and images load from the original
  address when the site serves them, otherwise the report says the page was
  saved without its styles and suggests saving it as a single file.
- **The file references internal addresses** (e.g. an image on
  `http://cms:3000/`, a script calling `169.254.169.254`) → those requests are
  refused exactly as for an address import; the rest of the page renders.
- **The file contains scripts** → not run; the saved page is already the
  rendered result the editor saw.
- **The file claims an original address** that is internal or not http(s) →
  the claim is ignored for fetching; the report shows the file name instead.
- **A cookie banner or chat widget was saved with the page** → removed like
  for an address import.
- **The same file is imported twice** → two independent imports, two drafts,
  images stored once each in the Media library (012 FR-015).
- **The import is cancelled or fails** → no page, no Media left behind, and
  the uploaded file is gone.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The address MUST remain the default and only prominent input of
  the "Importer depuis une page web" option (012). A saved file MUST be
  offered (a) as the fallback of an address import that failed as `blocked`
  or `login-required` (FR-010), and (b) through a discreet link under the
  address field (« Vous avez déjà la page enregistrée ? ») for editors who
  already have the page saved. Other failures (unresolvable, internal
  address, not a web page, timeout…) MUST NOT offer the file fallback.
- **FR-002**: The system MUST accept a single file saved from a desktop
  browser in these formats: a single HTML page (`.html`/`.htm`, including
  pages saved with a "single file" extension such as SingleFile) and a
  single-file web archive (`.mhtml`/`.mht`, Chrome/Edge "Page web, fichier
  unique"). Any other file MUST be refused before the import starts, with a
  French message naming the accepted formats and how to produce one.
- **FR-003**: The system MUST refuse files larger than 25 MB, before the
  import starts, with the limit stated in the message.
- **FR-004**: The file MUST be treated as untrusted: its scripts MUST NOT run;
  every request its content makes while it is displayed (styles, fonts,
  images) MUST go through the same internal-address guard as an address
  import (012 FR-002); nothing it contains may reach the CMS's internal
  network.
- **FR-005**: Displaying the file MUST NOT fetch the page itself from its
  original site. Resources the file references by absolute public address MAY
  be loaded (through the guard) so the page looks as saved.
- **FR-006**: From the moment the file is displayed, the import MUST behave
  exactly as an address import: same steps and progress, cancel, deadline,
  conversion into library blocks with texts taken verbatim from the file,
  per-device adjustments, images into the Media library, lead form rules per
  page type, accessibility and device checks, report, draft creation, cost
  recording and budget rules (012 FR-005 to FR-030).
- **FR-007**: Images embedded in the file (inline data) MUST be imported from
  the file itself; images referenced by address MUST be fetched as in an
  address import; images that are neither MUST become image placeholders
  listed in the report.
- **FR-008**: The import record and the report MUST show the page's original
  address when the file declares one (as browsers and single-file tools
  record it) and it is a public http(s) address; otherwise the file name.
  The record MUST say the import came from a file.
- **FR-009**: The uploaded file MUST be kept only for the duration of the
  import and deleted when it completes, fails or is cancelled (including when
  the stale-import sweep ends it); it MUST NOT become a Media item or be
  stored with the page.
- **FR-010**: The message shown when an address import fails as `blocked` or
  `login-required` MUST explain, in French, how to save the page as a single
  file from the browser, and offer to continue with a file import without
  re-entering the wizard's other fields (title, page type, domain, path,
  language).
- **FR-011**: The system MUST NOT attempt to get past a site's anti-bot
  protection by any other means (no disguised browser identity, no proxy
  networks, no challenge solving). File import is the only fallback.
- **FR-012**: Only users allowed to import by address (012 FR-003) MAY import
  a file, under the same monthly cap and per-user budgets.

### Key Entities

- **Import request** (012): gains its origin — address or file — and, for a
  file, the file name and the original address the file declares (if any).
  The file content itself is not part of the record.
- **Uploaded source file**: the saved page handed in by the editor; exists
  only while its import runs.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An editor who gets « Le site a bloqué la visite automatique »
  can produce a draft of that page from a saved file in under 3 minutes of
  their own time (saving included), without help.
- **SC-002**: Both reference pages that refuse the importer (mariages.net,
  parisjetaime.com), saved as single files, import successfully and meet the
  same fidelity bar as address imports in the reference-set evaluation
  (012 SC-002, SC-006, SC-009).
- **SC-003**: For a single-file save, the imported draft is judged "clearly
  the same page" as the address import of the same page, when the site allows
  both, in 9 cases out of 10.
- **SC-004**: No file, whatever it contains, makes a request to an internal
  address or runs a script during import (verified by tests with crafted
  files).
- **SC-005**: No uploaded file remains stored once its import has ended.

## Assumptions

- Editors use a desktop browser able to save a page as a single file
  (Chrome/Edge natively save MHTML; any browser can with the SingleFile
  extension). Safari web archives (`.webarchive`) and "complete page" saves
  that produce an HTML file plus a folder are out of scope; the refusal
  message points to the single-file options.
- 25 MB covers single-file saves of typical landing pages with their images
  inlined; larger pages are rare and can be saved without their largest media.
- Not running the file's scripts is acceptable because a saved page already
  contains the rendered result; pages whose visible content only appears
  through a script after load are rare once saved.
- The editor is responsible for having the right to reuse the page's content,
  exactly as with address imports.
- The conversion cost of a file import is the same as an address import of the
  same page; the existing budget rules need no change.
- Legal/ethical position: importing what a person legitimately displayed in
  their own browser is the editor's action, not an automated visit; the
  product still never tries to defeat a site's bot protection (FR-011).
