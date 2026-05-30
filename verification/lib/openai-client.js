/**
 * OpenAI client with Anthropic-shaped messages API for verification pipelines.
 *
 * Allows existing verification scripts to keep their agent loops unchanged while
 * calling OpenAI instead of Anthropic.
 */
import OpenAI from 'openai'

export function resolveOpenAIApiKey() {
  return (
    process.env.OPENAI_MULTIAGENT_VERIFICATION_KEY ||
    process.env.OPENAI_VERIFICATION_KEY ||
    process.env.OPENAI_API_KEY
  )
}

function resolveModel(anthropicModel, thinking) {
  if (thinking?.type === 'enabled' || anthropicModel?.includes('opus')) {
    return process.env.OPENAI_VERIFICATION_MODEL || 'gpt-4.1'
  }
  if (anthropicModel?.includes('haiku')) {
    return process.env.OPENAI_VERIFICATION_MINI_MODEL || 'gpt-4.1-mini'
  }
  return process.env.OPENAI_VERIFICATION_FAST_MODEL || 'gpt-4.1'
}

function toOpenAITools(tools) {
  if (!tools?.length) return undefined
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  }))
}

function anthropicMessagesToOpenAI(messages, system) {
  const openaiMessages = []
  if (system) {
    openaiMessages.push({ role: 'system', content: system })
  }

  for (const msg of messages) {
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        openaiMessages.push({ role: 'user', content: msg.content })
        continue
      }
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'tool_result') {
            openaiMessages.push({
              role: 'tool',
              tool_call_id: block.tool_use_id,
              content:
                typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
            })
          }
        }
      }
      continue
    }

    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      const textParts = msg.content.filter((b) => b.type === 'text').map((b) => b.text)
      const toolCalls = msg.content
        .filter((b) => b.type === 'tool_use')
        .map((b) => ({
          id: b.id,
          type: 'function',
          function: {
            name: b.name,
            arguments: JSON.stringify(b.input ?? {}),
          },
        }))

      openaiMessages.push({
        role: 'assistant',
        content: textParts.length ? textParts.join('\n') : null,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      })
    }
  }

  return openaiMessages
}

function toAnthropicContent(message) {
  const content = []
  if (message.content) {
    content.push({ type: 'text', text: message.content })
  }
  for (const toolCall of message.tool_calls || []) {
    let input = {}
    try {
      input = JSON.parse(toolCall.function.arguments || '{}')
    } catch {
      input = {}
    }
    content.push({
      type: 'tool_use',
      id: toolCall.id,
      name: toolCall.function.name,
      input,
    })
  }
  return content
}

function normalizeUsage(usage) {
  return {
    input_tokens: usage?.prompt_tokens ?? 0,
    output_tokens: usage?.completion_tokens ?? 0,
  }
}

function mapStopReason(finishReason) {
  if (finishReason === 'tool_calls') return 'tool_use'
  return 'end_turn'
}

/**
 * Drop-in replacement for `new Anthropic()` in verification scripts.
 */
export function createOpenAICompat(options = {}) {
  const apiKey = resolveOpenAIApiKey()
  if (!apiKey) {
    throw new Error(
      'No OpenAI API key found. Set OPENAI_MULTIAGENT_VERIFICATION_KEY or OPENAI_API_KEY in .env',
    )
  }

  const client = new OpenAI({
    apiKey,
    timeout: options.timeout ?? 300000,
    maxRetries: options.maxRetries ?? 2,
  })

  return {
    messages: {
      async create(params) {
        const model = resolveModel(params.model, params.thinking)
        const openaiMessages = anthropicMessagesToOpenAI(params.messages, params.system)
        const request = {
          model,
          messages: openaiMessages,
          tools: toOpenAITools(params.tools),
        }

        if (model.startsWith('o')) {
          request.max_completion_tokens = params.max_tokens
          if (params.thinking?.type === 'enabled') {
            request.reasoning_effort = 'high'
          }
        } else {
          request.max_tokens = params.max_tokens
        }

        const response = await client.chat.completions.create(request)
        const choice = response.choices[0]

        return {
          content: toAnthropicContent(choice.message),
          stop_reason: mapStopReason(choice.finish_reason),
          usage: normalizeUsage(response.usage),
        }
      },
    },
  }
}
