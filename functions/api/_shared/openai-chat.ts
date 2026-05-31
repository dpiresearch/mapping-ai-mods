/**
 * OpenAI Chat Completions for Pages Functions (verification, submission review).
 */

export async function openaiChatCompletion(params: {
  apiKey: string
  model?: string
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  maxTokens?: number
  signal?: AbortSignal
}): Promise<{ text: string }> {
  const { apiKey, messages, maxTokens = 2000, signal } = params
  const model = params.model?.trim() || 'gpt-4o-mini'

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
    }),
    signal,
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`OpenAI API ${res.status}: ${errText.slice(0, 300)}`)
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  return { text: data.choices?.[0]?.message?.content ?? '' }
}
