export type ModelTaskType = 'document_ocr' | 'image_understanding' | 'chat_screenshot' | 'memory_dialogue'
export type ModelProvider = 'siliconflow' | 'openrouter'

export type ModelRoute = {
  provider: ModelProvider
  baseURL: string
  model: string
  timeoutMs: number
  retryCount: number
  apiKeyEnvName: string
  headers: Record<string, string>
}

const DEFAULT_LITELLM_BASE_URL = 'http://127.0.0.1:4000'
const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_RETRY_COUNT = 2

function normalizeProvider(provider?: string): ModelProvider {
  if (provider === 'openrouter') {
    return 'openrouter'
  }

  return 'siliconflow'
}

function defaultModelForTask(taskType: ModelTaskType, provider: ModelProvider) {
  const defaults = {
    document_ocr: {
      siliconflow: 'Qwen/Qwen2.5-VL-72B-Instruct',
      openrouter: 'qwen/qwen2.5-vl-72b-instruct'
    },
    image_understanding: {
      siliconflow: 'Qwen/Qwen2.5-VL-72B-Instruct',
      openrouter: 'qwen/qwen2.5-vl-72b-instruct'
    },
    chat_screenshot: {
      siliconflow: 'Qwen/Qwen2.5-VL-32B-Instruct',
      openrouter: 'qwen/qwen2.5-vl-32b-instruct'
    },
    memory_dialogue: {
      siliconflow: 'Qwen/Qwen2.5-72B-Instruct',
      openrouter: 'qwen/qwen-2.5-72b-instruct'
    }
  } as const

  return defaults[taskType][provider]
}

function apiKeyEnvNameForProvider(provider: ModelProvider) {
  return provider === 'openrouter' ? 'OPENROUTER_API_KEY' : 'SILICONFLOW_API_KEY'
}

function modelEnvName(taskType: ModelTaskType, provider: ModelProvider) {
  return `FORGETME_MODEL_${taskType.toUpperCase()}_${provider.toUpperCase()}`
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function resolveModelRoute(input: {
  taskType: ModelTaskType
  preferredProvider?: ModelProvider
}) {
  const provider = normalizeProvider(input.preferredProvider ?? process.env.FORGETME_DEFAULT_MODEL_PROVIDER)
  const baseURL = process.env.FORGETME_LITELLM_BASE_URL ?? DEFAULT_LITELLM_BASE_URL
  const timeoutMs = parsePositiveInteger(process.env.FORGETME_LITELLM_TIMEOUT_MS, DEFAULT_TIMEOUT_MS)
  const retryCount = parsePositiveInteger(process.env.FORGETME_LITELLM_RETRY_COUNT, DEFAULT_RETRY_COUNT)
  const model = process.env[modelEnvName(input.taskType, provider)] ?? defaultModelForTask(input.taskType, provider)
  const apiKeyEnvName = apiKeyEnvNameForProvider(provider)

  return {
    provider,
    baseURL,
    model,
    timeoutMs,
    retryCount,
    apiKeyEnvName,
    headers: {
      'x-forgetme-provider': provider,
      'x-forgetme-task-type': input.taskType
    }
  } satisfies ModelRoute
}

export async function callLiteLLM(input: {
  route: ModelRoute
  messages: Array<Record<string, unknown>>
  responseFormat?: Record<string, unknown>
}) {
  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(), input.route.timeoutMs)
  const apiKey = process.env[input.route.apiKeyEnvName]

  try {
    const response = await fetch(`${input.route.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        ...input.route.headers
      },
      body: JSON.stringify({
        model: input.route.model,
        messages: input.messages,
        ...(input.responseFormat ? { response_format: input.responseFormat } : {})
      }),
      signal: controller.signal
    })

    if (!response.ok) {
      throw new Error(`LiteLLM request failed with status ${response.status}`)
    }

    const payload = await response.json() as Record<string, unknown>

    return {
      provider: input.route.provider,
      model: input.route.model,
      payload,
      usage: (payload.usage as Record<string, unknown> | undefined) ?? null,
      receivedAt: new Date().toISOString()
    }
  } finally {
    clearTimeout(timeoutHandle)
  }
}
