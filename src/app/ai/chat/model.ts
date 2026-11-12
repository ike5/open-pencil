import { createAnthropic } from '@ai-sdk/anthropic'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { LanguageModel } from 'ai'

import { IS_TAURI } from '@open-pencil/core/constants'
import type { AIProviderID } from '@open-pencil/core/constants'

import { terminalLog } from '@/app/ai/chat/terminal-log'

let tauriFetchPromise: Promise<typeof fetch> | null = null
function getTauriFetch(): Promise<typeof fetch> {
  if (!tauriFetchPromise) {
    tauriFetchPromise = import('@tauri-apps/plugin-http').then(
      ({ fetch: tauriFetch }) => tauriFetch as unknown as typeof fetch
    )
  }
  return tauriFetchPromise
}

export type ModelConfig = {
  providerID: AIProviderID
  apiKey: string
  modelID: string
  customModelID: string
  customBaseURL: string
  customAPIType: 'completions' | 'responses'
}

function createLoggingFetch(providerID: AIProviderID): typeof fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    const transport = IS_TAURI ? 'tauri' : 'browser'
    terminalLog.log(`[ai-chat] → ${providerID} [${transport}] ${method} ${url}`)
    try {
      const fetchFn = IS_TAURI ? await getTauriFetch() : fetch
      const res = await fetchFn(input, init)
      terminalLog.log(`[ai-chat] ← ${providerID} ${res.status} ${res.statusText} ${url}`)
      if (!res.ok) {
        const clone = res.clone()
        clone
          .text()
          .then((body) => terminalLog.error(`[ai-chat] ✗ ${providerID} body:`, body))
          .catch(() => {})
      }
      return res
    } catch (err) {
      terminalLog.error(`[ai-chat] ✗ ${providerID} fetch failed for ${url}:`, err)
      throw err
    }
  }
}

export function createLanguageModel(config: ModelConfig): LanguageModel {
  const needsCustomModel =
    config.providerID === 'openai-compatible' || config.providerID === 'anthropic-compatible'
  const effectiveModelID = needsCustomModel ? config.customModelID : config.modelID

  terminalLog.log('[ai-chat] createLanguageModel', {
    provider: config.providerID,
    model: effectiveModelID,
    apiKeyLength: config.apiKey?.length ?? 0,
    baseURL: config.customBaseURL || undefined
  })

  const fetchLog = createLoggingFetch(config.providerID)

  switch (config.providerID) {
    case 'openrouter': {
      const openrouter = createOpenRouter({
        apiKey: config.apiKey,
        headers: {
          'X-OpenRouter-Title': 'OpenPencil',
          'HTTP-Referer': 'https://github.com/open-pencil/open-pencil'
        },
        fetch: fetchLog
      })
      return openrouter(effectiveModelID)
    }
    case 'anthropic': {
      const anthropic = createAnthropic({
        apiKey: config.apiKey,
        headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
        fetch: fetchLog
      })
      return anthropic(effectiveModelID)
    }
    case 'openai': {
      const openai = createOpenAI({ apiKey: config.apiKey, fetch: fetchLog })
      return openai(effectiveModelID)
    }
    case 'google': {
      const google = createGoogleGenerativeAI({ apiKey: config.apiKey, fetch: fetchLog })
      return google(effectiveModelID)
    }
    case 'deepseek': {
      const deepseek = createDeepSeek({ apiKey: config.apiKey, fetch: fetchLog })
      return deepseek(effectiveModelID)
    }
    case 'zai': {
      const zai = createAnthropic({
        apiKey: config.apiKey,
        baseURL: 'https://api.z.ai/api/anthropic',
        headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
        fetch: fetchLog
      })
      return zai(effectiveModelID)
    }
    case 'minimax': {
      const minimax = createOpenAI({
        apiKey: config.apiKey,
        baseURL: 'https://api.minimax.io/v1',
        fetch: fetchLog
      })
      return minimax.chat(effectiveModelID)
    }
    case 'openai-compatible': {
      const custom = createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.customBaseURL,
        fetch: fetchLog
      })
      return config.customAPIType === 'responses'
        ? custom.responses(effectiveModelID)
        : custom.chat(effectiveModelID)
    }
    case 'anthropic-compatible': {
      const custom = createAnthropic({
        apiKey: config.apiKey,
        baseURL: config.customBaseURL,
        headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
        fetch: fetchLog
      })
      return custom(effectiveModelID)
    }
    default: {
      if (config.providerID.startsWith('acp:')) {
        throw new Error('ACP providers do not use direct API models')
      }
      throw new Error(`Unknown provider: ${config.providerID}`)
    }
  }
}
