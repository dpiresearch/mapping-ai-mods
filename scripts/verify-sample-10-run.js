/**
 * One-off: verify 10 people from local map JSON (read-only, no DB writes).
 * Usage: node scripts/verify-sample-10-run.js
 */
import fs from 'fs'
import path from 'path'
import 'dotenv/config'
import { fileURLToPath } from 'url'
import { openaiChatCompletion } from './lib/openai-chat.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const INPUT = path.join(root, 'data/verify-sample-10-input.json')
const OUTPUT = path.join(root, 'data/verify-sample-10-results.json')

const PROMPT_PREFIX = `You are a fact-checker reviewing a database of people in the US AI policy landscape. For each person below, verify the data and return corrections as a JSON array. ONLY include entries that need fixing.

ALLOWED VALUES:
- category: Executive, Researcher, Policymaker, Investor, Organizer, Journalist, Academic, Cultural figure
- regulatory_stance: Accelerate, Light-touch, Targeted, Moderate, Restrictive, Precautionary, Mixed/unclear, Unknown
- agi_timeline: Already here, 2-3 years, 5-10 years, 10-25 years, 25+ years or never, Ill-defined, Unknown
- ai_risk_level: Overstated, Manageable, Serious, Catastrophic, Existential, Mixed/nuanced, Unknown
- threat_models: max 3 from: Labor displacement, Economic inequality, Power concentration, Democratic erosion, Cybersecurity, Misinformation, Environmental, Weapons, Loss of control, Copyright/IP, Existential risk
- influence_type: max 3 from: Decision-maker, Advisor/strategist, Researcher/analyst, Funder/investor, Builder, Organizer/advocate, Narrator, Implementer, Connector/convener
- location: "City, ST" for US or "City, Country" for international. Must be a real place.
- twitter: must be a real @handle or null

For each correction object, add a short "reason" field explaining the issue.

DATA TO REVIEW:
`

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY required')
    process.exit(1)
  }

  const all = JSON.parse(fs.readFileSync(INPUT, 'utf8'))
  const model = process.env.OPENAI_VERIFY_MODEL || 'gpt-4o-mini'
  const runMeta = {
    run_at: new Date().toISOString(),
    process: 'scripts/deep-quality-review.js (same prompt/logic)',
    llm: { provider: 'openai', model },
    exa: { used: false, reason: 'EXA_API_KEY not set in .env' },
    database: { writes: false, reason: 'DATABASE_URL not set; local map JSON only' },
    fields_verified: [
      'category',
      'title',
      'primary_org',
      'location',
      'regulatory_stance',
      'agi_timeline',
      'ai_risk_level',
      'threat_models',
      'influence_type',
      'twitter',
    ],
    entities: all.map((e) => ({ id: e.id, name: e.name })),
    batches: [],
  }

  let totalIn = 0
  let totalOut = 0

  for (let i = 0; i < all.length; i += 5) {
    const batch = all.slice(i, i + 5)
    const batchIds = batch.map((b) => b.id)
    console.log(`\nBatch ${i / 5 + 1}: ${batch.map((b) => b.name).join(', ')}`)

    const { text, usage } = await openaiChatCompletion({
      messages: [{ role: 'user', content: PROMPT_PREFIX + JSON.stringify(batch, null, 1) }],
      maxTokens: 2500,
    })
    totalIn += usage.input_tokens
    totalOut += usage.output_tokens

    let corrections = []
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      try {
        corrections = JSON.parse(jsonMatch[0])
      } catch (e) {
        corrections = [{ parse_error: e.message, raw: text.slice(0, 500) }]
      }
    }

    const correctedIds = new Set(corrections.map((c) => c.id).filter(Boolean))
    const perEntity = batch.map((row) => ({
      id: row.id,
      name: row.name,
      status: correctedIds.has(row.id) ? 'needs_correction' : 'no_correction_suggested',
      input_snapshot: row,
      corrections: corrections.filter((c) => c.id === row.id),
    }))

    runMeta.batches.push({
      batch_index: i / 5 + 1,
      entity_ids: batchIds,
      tokens: usage,
      raw_response_length: text.length,
      correction_count: corrections.filter((c) => c.id).length,
      per_entity: perEntity,
      unparsed_corrections: corrections.filter((c) => !c.id),
    })

    for (const row of perEntity) {
      const mark = row.status === 'no_correction_suggested' ? '✓' : '✎'
      console.log(`  ${mark} ${row.name}`)
      for (const c of row.corrections) {
        const { id, reason, ...fields } = c
        console.log(`      → ${Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(', ')}${reason ? ` (${reason})` : ''}`)
      }
    }

    await new Promise((r) => setTimeout(r, 300))
  }

  runMeta.token_totals = { input: totalIn, output: totalOut }
  runMeta.estimated_cost_usd = ((totalIn * 0.15 + totalOut * 0.6) / 1e6).toFixed(4)

  fs.writeFileSync(OUTPUT, JSON.stringify(runMeta, null, 2))
  console.log(`\nWrote ${OUTPUT}`)
  console.log(`Tokens: ${totalIn} in / ${totalOut} out (~$${runMeta.estimated_cost_usd})`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
