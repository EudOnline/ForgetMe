import { afterEach, describe, expect, it, vi } from 'vitest'
import { callLiteLLM, resolveModelRoute } from '../../../src/main/services/modelGatewayService'

afterEach(() => {
  delete process.env.FORGETME_MODEL_MEMORY_DIALOGUE_WORKSPACE_OPENROUTER
  delete process.env.FORGETME_MODEL_MEMORY_DIALOGUE_REVIEW_OPENROUTER
  vi.restoreAllMocks()
})

describe('resolveModelRoute', () => {
  it('routes OCR work through a LiteLLM provider config', () => {
    const route = resolveModelRoute({
      taskType: 'document_ocr',
      preferredProvider: 'siliconflow'
    })

    expect(route.provider).toBe('siliconflow')
    expect(route.baseURL).toBeTruthy()
    expect(route.model).toBeTruthy()
    expect(route.timeoutMs).toBeGreaterThan(0)
  })

  it('attaches agent metadata headers and can vary memory dialogue models by agent role', () => {
    process.env.FORGETME_MODEL_MEMORY_DIALOGUE_WORKSPACE_OPENROUTER = 'workspace-model'
    process.env.FORGETME_MODEL_MEMORY_DIALOGUE_REVIEW_OPENROUTER = 'review-model'

    const workspaceRoute = resolveModelRoute({
      taskType: 'memory_dialogue',
      preferredProvider: 'openrouter',
      agentRole: 'workspace',
      runId: 'run-123',
      policyVersion: 'policy-v1',
      memoryProfile: 'memory-profile-a'
    })
    const reviewRoute = resolveModelRoute({
      taskType: 'memory_dialogue',
      preferredProvider: 'openrouter',
      agentRole: 'review'
    })

    expect(workspaceRoute.model).toBe('workspace-model')
    expect(reviewRoute.model).toBe('review-model')
    expect(workspaceRoute.headers['x-forgetme-agent-role']).toBe('workspace')
    expect(workspaceRoute.headers['x-forgetme-run-id']).toBe('run-123')
    expect(workspaceRoute.headers['x-forgetme-policy-version']).toBe('policy-v1')
    expect(workspaceRoute.headers['x-forgetme-memory-profile']).toBe('memory-profile-a')
  })
})

describe('callLiteLLM', () => {
  it('forwards agent metadata headers to the LiteLLM gateway', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      usage: { total_tokens: 12 }
    }), { status: 200 }))

    const route = resolveModelRoute({
      taskType: 'memory_dialogue',
      preferredProvider: 'openrouter',
      agentRole: 'workspace',
      runId: 'run-123',
      policyVersion: 'policy-v1'
    })

    await callLiteLLM({
      route,
      messages: [{ role: 'user', content: 'hello' }]
    })

    const request = fetchSpy.mock.calls[0]?.[1]
    expect(request).toBeTruthy()
    expect((request?.headers as Record<string, string>)['x-forgetme-agent-role']).toBe('workspace')
    expect((request?.headers as Record<string, string>)['x-forgetme-run-id']).toBe('run-123')
    expect((request?.headers as Record<string, string>)['x-forgetme-policy-version']).toBe('policy-v1')
  })
})
