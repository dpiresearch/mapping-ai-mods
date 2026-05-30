# Verification Pipeline Agents (legacy)

Multi-agent verification system that previously used Anthropic's Managed Agents API.

**Note:** The Managed Agents API has no OpenAI equivalent. Use the OpenAI-backed 1-opus pipelines instead:

- `verification/beliefs-1-opus/run.js`
- `verification/edges-1-opus/run.js`
- `verification/notes-1-opus/run.js`

## Architecture

```
Coordinator (Opus)
├── enum-validator (code)
├── enum-repair (Sonnet)
├── decomposer (Sonnet)
├── url-validator (Haiku)
├── search-attribution (Sonnet) ← NO access to candidate URLs
├── prosecutor (Sonnet)
├── defender (Sonnet)
├── judge (Opus) ← ONLY sees debate transcript
├── correction-proposal (Sonnet)
└── write-back (Haiku)
```

## Setup

The legacy `setup-agents.js` and `test-sample.js` scripts require Anthropic Managed Agents and are no longer supported. Use the 1-opus pipelines documented in `../beliefs-1-opus/README.md`.

## Files

- `setup-agents.js` - Creates all agents and coordinator
- `prompts/` - System prompts for each agent
- `test-sample.js` - Test runner for sample entities
- `lib/` - Shared utilities (DB, schema validation)
