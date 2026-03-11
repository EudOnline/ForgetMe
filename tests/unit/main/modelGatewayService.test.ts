import { describe, expect, it } from 'vitest'
import { resolveModelRoute } from '../../../src/main/services/modelGatewayService'

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
})
