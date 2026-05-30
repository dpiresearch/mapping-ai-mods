/**
 * Setup script for verification pipeline agents (legacy Anthropic Managed Agents API)
 *
 * This script used Anthropic's beta Managed Agents API, which has no OpenAI equivalent.
 * Use the 1-opus pipelines instead:
 *   - verification/beliefs-1-opus/run.js
 *   - verification/edges-1-opus/run.js
 *   - verification/notes-1-opus/run.js
 */

console.error('ERROR: agents/setup-agents.js requires Anthropic Managed Agents API.')
console.error('Use the OpenAI-backed 1-opus verification pipelines instead:')
console.error('  node verification/beliefs-1-opus/run.js --id=<entity_id>')
console.error('  node verification/edges-1-opus/run.js --id=<entity_id>')
console.error('  node verification/notes-1-opus/run.js --id=<entity_id>')
process.exit(1)
