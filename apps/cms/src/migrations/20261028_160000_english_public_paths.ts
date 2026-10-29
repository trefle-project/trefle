import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'
import { convertMarkdownToLexical, editorConfigFactory } from '@payloadcms/richtext-lexical'

/**
 * 023-admin-i18n (US7, data-model.md) — the public paths are English since
 * 023. The default legal texts 021 stored link to the old French paths: an
 * installation that never touched them gets the same texts with the new
 * links. A text is « untouched » only when it is identical to the old default
 * converted the way 021 did, links' random ids aside; only its link addresses
 * change. Any other text is left as is — its old links keep working, they
 * redirect. The old markdown is frozen here (the
 * defaults in lib/legal/defaults.ts now carry the new paths). Also moves the
 * hidden Settings default privacy link of imported forms when it is still the
 * old path, and lists the editor pages that sit on a new path (an editor page
 * there would be hidden by Trefle's own page). Down: the reverse, same rule.
 */

export const OLD_PRIVACY_POLICY_FR = `Cette politique explique comment vos données personnelles sont traitées lorsque vous consultez le site {{site}} et lorsque vous nous adressez une demande par son formulaire.

## Qui est responsable de vos données

Le responsable du traitement est {{owner.name}}.

Forme juridique : {{owner.legalForm}}.

Immatriculation : {{owner.registration}}.

Adresse : {{owner.address}}.

Pour toute question sur vos données ou pour exercer vos droits : {{owner.email}}.

## Qui traite vos données pour son compte

Le site est fourni et hébergé par {{operator.name}}, qui traite vos données uniquement pour le compte du responsable du traitement et selon ses instructions (sous-traitant au sens de l'article 28 du RGPD).

Adresse : {{operator.address}}.

Contact : {{operator.email}}.

Ce prestataire s'appuie lui-même sur les sous-traitants suivants :

{{suppliers}}

## Les données que nous traitons et pourquoi

**Votre demande de contact.** Lorsque vous remplissez le formulaire, nous enregistrons les informations que vous y saisissez (par exemple votre nom, votre adresse e-mail, votre téléphone et votre message), la page depuis laquelle vous l'avez envoyé, sa date et les informations techniques nécessaires pour prouver votre consentement (texte accepté, date, adresse IP, navigateur). Ces données servent à répondre à votre demande et à vous recontacter à son sujet. Elles reposent sur votre consentement, donné en cochant la case du formulaire, et sur les mesures précontractuelles prises à votre demande.

**L'e-mail de confirmation.** Si le site vous demande de confirmer votre adresse e-mail, un message vous est envoyé ; la date de votre confirmation est enregistrée avec votre demande.

**Les tests de pages.** Le site compare parfois deux versions d'une même page pour savoir laquelle est la plus claire. La version affichée est choisie au hasard à chaque visite et rien n'est déposé ni lu sur votre appareil pour cela. Un numéro tiré au hasard pour chaque affichage permet de compter les visites de chaque version et, si vous envoyez le formulaire, de savoir depuis quelle version. Ce traitement repose sur l'intérêt légitime du responsable du traitement à améliorer ses pages. Voir [Tests de pages et mesure d'audience](/mesure-audience).

{{cookieBanner}} **Les cookies de mesure et de marketing.** Avec votre accord, donné ou refusé dans le bandeau de gestion des cookies, des outils de mesure d'audience ou de marketing peuvent être activés. Vous pouvez changer d'avis à tout moment avec le bouton de gestion des cookies affiché en bas de chaque page. Votre choix est conservé six mois.

## Combien de temps nous les conservons

Votre demande et la preuve de votre consentement sont conservées {{retention.leads}} au plus, puis effacées. Les données des tests de pages sont supprimées 30 jours après la fin de chaque test.

## Qui peut y accéder

Seules les personnes habilitées du responsable du traitement et de son prestataire y ont accès. Vos données ne sont ni vendues ni louées.

## Transferts hors de l'Union européenne

Le site est diffusé à travers le réseau de Cloudflare, Inc. (États-Unis). Ce transfert est encadré par le Data Privacy Framework UE–États-Unis et par les clauses contractuelles types de la Commission européenne.

## Vos droits

Vous pouvez accéder à vos données, les faire rectifier ou effacer, en limiter le traitement, vous opposer à leur traitement, en demander la portabilité et retirer votre consentement à tout moment, sans que cela remette en cause ce qui a été fait avant. Le lien de désinscription présent dans nos messages permet aussi de retirer votre consentement. Pour exercer ces droits, écrivez à {{owner.email}}.

Vous pouvez également introduire une réclamation auprès de la Commission nationale de l'informatique et des libertés (CNIL), 3 place de Fontenoy, TSA 80715, 75334 Paris Cedex 07, www.cnil.fr.

{{extra}}
`

export const OLD_LEGAL_NOTICE_FR = `## Éditeur du site

Le site {{site}} est édité par {{owner.name}}.

Forme juridique : {{owner.legalForm}}.

Immatriculation : {{owner.registration}}.

Adresse : {{owner.address}}.

Contact : {{owner.email}}.

Directeur de la publication : {{owner.director}}.

## Prestataire technique

Le site est fourni par {{operator.name}}.

Forme juridique : {{operator.legalForm}}.

Adresse : {{operator.address}}.

Contact : {{operator.email}}.

Téléphone : {{operator.phone}}.

## Hébergement

Le site est hébergé par {{host.name}}.

Adresse : {{host.address}}.

Téléphone : {{host.phone}}.

## Données personnelles

Le traitement de vos données personnelles est décrit dans la [politique de confidentialité](/confidentialite).

{{extra}}
`

const LINKS: Record<string, string> = {
  '/mesure-audience': '/audience-measurement',
  '/confidentialite': '/privacy',
  '/mentions-legales': '/legal-notice',
}

const NEW_PATHS = ['/privacy', '/legal-notice', '/audience-measurement']

/** The markdown with the other paths' links: `up` = the new paths. */
export const rewrite = (markdown: string, direction: 'up' | 'down') =>
  Object.entries(LINKS).reduce(
    (text, [oldPath, newPath]) => (direction === 'up' ? text.split(`(${oldPath})`).join(`(${newPath})`) : text.split(`(${newPath})`).join(`(${oldPath})`)),
    markdown,
  )

type Node = { type?: string; fields?: { url?: string }; children?: Node[]; [key: string]: unknown }

/**
 * Lexical gives every link a random `id`: two conversions of the same text
 * never match byte for byte. A stored text is the default when it matches
 * with those ids left out (and jsonb's key order ignored).
 */
const canonical = (value: unknown): string =>
  Array.isArray(value)
    ? `[${value.map(canonical).join(',')}]`
    : value && typeof value === 'object'
      ? `{${Object.keys(value)
          .filter((k) => k !== 'id')
          .sort()
          .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
          .join(',')}}`
      : JSON.stringify(value)

/** The same document with its links to the moved paths pointing the other way; ids and everything else kept. */
const relink = (node: Node, direction: 'up' | 'down'): Node => {
  const map = direction === 'up' ? LINKS : Object.fromEntries(Object.entries(LINKS).map(([o, n]) => [n, o]))
  const url = node.type === 'link' ? node.fields?.url : undefined
  return {
    ...node,
    ...(url && map[url] ? { fields: { ...node.fields, url: map[url] } } : {}),
    ...(node.children ? { children: node.children.map((c) => relink(c, direction)) } : {}),
  }
}

const rows = <T>(r: unknown) => ((r as { rows?: T[] }).rows ?? [])

async function moveTexts({ db, payload }: MigrateUpArgs, direction: 'up' | 'down') {
  const editorConfig = await editorConfigFactory.default({ config: payload.config })
  const lexical = (markdown: string) => convertMarkdownToLexical({ editorConfig, markdown })
  const texts = rows<{ id: string; privacy_policy: { root: Node } | null; legal_notice: { root: Node } | null }>(
    await db.execute(sql`SELECT "id", "privacy_policy", "legal_notice" FROM "settings_legal_texts"`),
  )
  for (const [column, oldMarkdown] of [
    ['privacy_policy', OLD_PRIVACY_POLICY_FR],
    ['legal_notice', OLD_LEGAL_NOTICE_FR],
  ] as const) {
    const expected = canonical(lexical(direction === 'up' ? oldMarkdown : rewrite(oldMarkdown, 'up')))
    let moved = 0
    for (const text of texts) {
      const stored = text[column]
      if (!stored || canonical(stored) !== expected) continue
      const doc = JSON.stringify({ ...stored, root: relink(stored.root, direction) })
      await db.execute(sql`UPDATE "settings_legal_texts" SET ${sql.identifier(column)} = ${doc}::jsonb WHERE "id" = ${text.id}`)
      moved++
    }
    payload.logger.info(`english_public_paths (${direction}): ${column} — ${moved} default text(s) moved`)
  }
}

export async function up(args: MigrateUpArgs): Promise<void> {
  const { db, payload } = args
  await moveTexts(args, 'up')
  await db.execute(sql`UPDATE "settings" SET "default_privacy_notice_url" = '/privacy' WHERE "default_privacy_notice_url" = '/confidentialite'`)
  const hidden = rows<{ id: number; path: string }>(
    await db.execute(sql`SELECT "id", "path" FROM "pages" WHERE rtrim("path", '/') IN (${sql.join(NEW_PATHS.map((p) => sql`${p}`), sql`, `)}) ORDER BY "id"`),
  )
  for (const page of hidden) {
    payload.logger.warn(`english_public_paths: page ${page.id} is at ${page.path}, now Trefle's own page on every domain — give it another path`)
  }
}

export async function down(args: MigrateDownArgs): Promise<void> {
  await moveTexts(args as unknown as MigrateUpArgs, 'down')
  await args.db.execute(sql`UPDATE "settings" SET "default_privacy_notice_url" = '/confidentialite' WHERE "default_privacy_notice_url" = '/privacy'`)
}
