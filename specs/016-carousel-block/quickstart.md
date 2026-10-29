# Quickstart / validation guide: Carousel block (016)

How to prove the feature works end to end. Contracts:
[markup.md](contracts/markup.md), [editor.md](contracts/editor.md).
Data: [data-model.md](data-model.md). Decisions: [research.md](research.md).

## 0. Prerequisites

- Stack up with both compose files (the dev overlay is required):
  `docker compose -f infra/docker-compose.yml -f infra/docker-compose.override.yml up --build`
- No migration for this feature.
- One editor (non-admin) account and one domain with a published
  subscription page to edit.

## 1. Automated checks

```bash
npm run typecheck
npm run lint
npm run test
npm run test:e2e:docker
```

Expected: all green, including the test obligations of
[markup.md](contracts/markup.md#test-obligations) and
[editor.md](contracts/editor.md#test-obligations), and the new e2e
`apps/web/tests/e2e/us-carousel.spec.ts` (run with `E2E_RUN_A11Y=1` for the
axe part).

## 2. Editor (manual, as a non-admin editor) — US1, US3

1. Open the page, click « Carrousel » in the block library. → A carousel with
   3 slides appears after the selected block, label « Diapositive 1 / 3 ».
2. Drop an Image and a Témoignage into slide 1. Use ▶ to reach slide 2, edit
   its text. → Only one slide visible at a time; the label follows.
3. Select slide 2 and duplicate it. → 4 slides, the copy is shown. With the
   copy selected, « Déplacer avant » twice. → It is now slide 1, still shown.
4. Drag the « Formulaire (lead) » block into a slide. → Refused. Select a
   text inside a slide and click « Carrousel » in the library. → The new
   carousel lands after the current one, not in the slide.
5. Delete slides until one is left. → The last slide offers no delete.
6. In the Layer manager, select a text inside slide 3 (re-add slides first).
   → The canvas switches to slide 3.
7. Open the « Code » view, change nothing, apply. → Still a carousel, same
   slides and settings.
8. Settings panel: « Diapositives visibles » 3, « Défilement automatique » on,
   interval 4, « Afficher les points » off. Save, reload the editor. →
   Settings and slides unchanged.
9. Duplicate the page (Payload « Dupliquer »), open the copy. → Same
   carousel, slides and settings (FR-009).

## 3. Published page — US1, US2, US3

Publish, then open the public page.

| Check | How | Expected |
|-------|-----|----------|
| Arrows / wrap | click « suivant » on the last slide | first slide shown |
| Dots | click dot 3 | slide 3 shown, dot 3 current |
| Swipe | phone or DevTools touch emulation, swipe left/right | next/previous; vertical swipe scrolls page |
| Keyboard | Tab through | sliding area → pause (if any) → ‹ → dots → ›; focus visible; no focus in hidden slides |
| Screen reader | VoiceOver on the carousel | « carrousel, Carrousel », slides « 2 sur 4 », change announced |
| Reduced motion | macOS « Réduire les animations » | no slide animation, no autoplay |
| No JS | DevTools → disable JavaScript, reload | all slides reachable by horizontal scroll; no dead buttons |
| Layout shift | slides of different heights | content below the carousel never moves |
| Lazy images | Network tab, reload | only slide 1 images (and visible ones) load first |
| Load time (SC-004) | Lighthouse mobile, 3 runs, median: 6-image carousel page vs same page with only slide 1's image | LCP / FCP within +10 % |
| Track focus | carousel of text and images only: Tab, then → | the sliding area takes focus (visible) and scrolls |
| Autoplay | settings of step 2.8 | moves every 4 s; stops on hover, on focus, after a click; « Mettre en pause » works |
| Phone, 3 per view | 360 px wide | one slide at a time |

## 4. Publish guard

Via the « Code » view (admin), place `<div data-block="lead-form"></div>` inside
a slide and try to publish. → Refused with « the lead-form block cannot be placed
inside a carousel » (the guard's messages are in English).

## 5. Record

Write the manual checks run (sections 2–4) in the PR body (constitution IV).
