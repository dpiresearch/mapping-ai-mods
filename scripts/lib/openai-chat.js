/**
 * OpenAI Chat Completions helper for verification / quality scripts.
 * Uses OPENAI_API_KEY and optional OPENAI_VERIFY_MODEL from .env.
 */

const DEFAULT_MODEL = 'gpt-4o-mini'

export async function openaiChatCompletion({
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_VERIFY_MODEL || DEFAULT_MODEL,
  messages,
  maxTokens = 2000,
  temperature,
  signal,
}) {
  if (!apiKey?.trim()) {
    throw new Error('OPENAI_API_KEY is not set')
  }

  const body = {
    model,
    messages,
    max_tokens: maxTokens,
  }
  if (temperature !== undefined) {
    body.temperature = temperature
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`OpenAI API ${res.status}: ${errText.slice(0, 300)}`)
  }

  const data = await res.json()
  const usage = data.usage || {}
  return {
    text: data.choices?.[0]?.message?.content ?? '',
    usage: {
      input_tokens: usage.prompt_tokens ?? 0,
      output_tokens: usage.completion_tokens ?? 0,
    },
  }
}
