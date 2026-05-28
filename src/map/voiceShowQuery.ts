/** Parse natural-language "show …" voice queries into structured map filters. */

import { normalizeVoiceText } from './voiceCommands'

export type EntityTypeFilter = 'person' | 'organization' | 'resource'

export type VoiceShowSpec =
  | { type: 'text'; query: string }
  | { type: 'find'; name: string }
  | {
      type: 'connections'
      anchorName: string
      entityTypes?: EntityTypeFilter[]
      categoryHint?: string
      includeAnchor?: boolean
    }

const ENTITY_TYPE_PATTERNS: { type: EntityTypeFilter; re: RegExp }[] = [
  { type: 'person', re: /\b(people|persons?|individuals?|researchers?|executives?|policymakers?)\b/ },
  { type: 'organization', re: /\b(organi[sz]ations?|orgs?|companies|institutions?|labs?)\b/ },
  { type: 'resource', re: /\b(resources?|papers?|reports?|publications?)\b/ },
]

/** Person/org categories from the map (subset used for voice hints). */
const CATEGORY_HINTS = [
  'Executive',
  'Researcher',
  'Policymaker',
  'Investor',
  'Organizer',
  'Journalist',
  'Academic',
  'Cultural figure',
  'Frontier Lab',
  'AI Safety',
  'AI Safety/Alignment',
  'Think Tank',
  'Think Tank/Policy Org',
  'Government',
  'Government/Agency',
  'VC',
  'VC/Capital/Philanthropy',
  'Labor',
  'Labor/Civil Society',
  'Ethics',
  'Ethics/Bias/Rights',
  'Media',
  'Media/Journalism',
  'Infrastructure',
  'Deployers',
]

function parseEntityTypes(fragment: string): EntityTypeFilter[] | undefined {
  const t = normalizeVoiceText(fragment)
  if (!t) return undefined
  const found = new Set<EntityTypeFilter>()
  for (const { type, re } of ENTITY_TYPE_PATTERNS) {
    if (re.test(t)) found.add(type)
  }
  return found.size > 0 ? [...found] : undefined
}

function parseCategoryHint(fragment: string): string | undefined {
  const t = normalizeVoiceText(fragment)
  if (!t) return undefined
  const types = parseEntityTypes(t)
  if (types && normalizeVoiceText(fragment.replace(/\b(organi[sz]ations?|orgs?|people|persons?|resources?)\b/g, '')) === '') {
    return undefined
  }
  let best: string | undefined
  let bestLen = 0
  for (const cat of CATEGORY_HINTS) {
    const c = normalizeVoiceText(cat)
    if (t.includes(c) || c.includes(t)) {
      if (c.length > bestLen) {
        best = cat
        bestLen = c.length
      }
    }
  }
  if (best) return best
  const stripped = t
    .replace(/\b(that are|who are|which are|of type|type)\b/g, '')
    .replace(/\b(organi[sz]ations?|orgs?|people|persons?|resources?)\b/g, '')
    .trim()
  if (stripped.length >= 3 && !parseEntityTypes(stripped)) return stripped
  return undefined
}

function stripFiller(text: string): string {
  return text
    .replace(/^(?:all|the|every|any)\s+/i, '')
    .replace(/\s+(?:only|please)$/i, '')
    .trim()
}

/** Preserve original casing from the spoken phrase when possible. */
function anchorFromRaw(raw: string, normalizedAnchor: string): string {
  const norm = stripFiller(normalizedAnchor)
  if (!norm) return normalizedAnchor
  const idx = raw.toLowerCase().indexOf(norm.toLowerCase())
  if (idx === -1) return norm
  return raw.slice(idx, idx + norm.length).trim()
}

/**
 * Turn the part after "show " into a structured spec when possible.
 * Unrecognized phrasing falls back to plain text search.
 */
export function parseShowQuery(query: string): VoiceShowSpec {
  const raw = query.trim()
  let q = normalizeVoiceText(raw)
  q = q.replace(/^(?:me|us)\s+/, '')

  // "people connected to openai" / "organizations at openai"
  let m = q.match(
    /^(people|persons?|organizations?|orgs?|resources?)\s+(?:connected to|linked to|affiliated with|associated with|at|from|of|with)\s+(.+)$/,
  )
  if (m?.[1] && m[2]) {
    const entityTypes = parseEntityTypes(m[1])
    const anchorName = anchorFromRaw(raw, stripFiller(m[2]))
    if (anchorName && entityTypes) {
      return { type: 'connections', anchorName, entityTypes, includeAnchor: true }
    }
  }

  // "openai connections that are organizations" / "connections to openai that are orgs"
  m = q.match(
    /^(.+?)\s+connections?\s+(?:that are|who are|which are|of type|where type is)\s+(.+)$/,
  )
  if (m?.[1] && m[2]) {
    const anchorName = anchorFromRaw(raw, stripFiller(m[1]))
    const constraint = m[2]
    const entityTypes = parseEntityTypes(constraint)
    const categoryHint = parseCategoryHint(constraint)
    if (anchorName) {
      return {
        type: 'connections',
        anchorName,
        entityTypes,
        categoryHint,
        includeAnchor: true,
      }
    }
  }

  // "connections to openai" / "connected to openai"
  m = q.match(/^(?:all\s+)?(?:entities\s+)?connected\s+to\s+(.+)$/)
  if (m?.[1]) {
    const anchorName = anchorFromRaw(raw, stripFiller(m[1]))
    if (anchorName) return { type: 'connections', anchorName, includeAnchor: true }
  }

  m = q.match(/^(?:all\s+)?connections?\s+(?:to|for|of|with|at)\s+(.+)$/)
  if (m?.[1]) {
    const anchorName = anchorFromRaw(raw, stripFiller(m[1]))
    if (anchorName) return { type: 'connections', anchorName, includeAnchor: true }
  }

  // "openai connections" (no type constraint)
  m = q.match(/^(.+?)\s+connections?$/)
  if (m?.[1]) {
    const anchorName = anchorFromRaw(raw, stripFiller(m[1]))
    if (anchorName.length >= 2) {
      return { type: 'connections', anchorName, includeAnchor: true }
    }
  }

  // Short exact name: prefer find+zoom over loose text search
  const words = q.split(/\s+/).filter(Boolean)
  if (words.length <= 4 && !/\b(connected|connections|that are|who are)\b/.test(q)) {
    return { type: 'find', name: raw }
  }

  return { type: 'text', query: raw }
}
