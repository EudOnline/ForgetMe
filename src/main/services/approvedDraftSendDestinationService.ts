import type { ApprovedDraftSendDestination } from '../../shared/archiveContracts'
import { resolveModelRoute } from './modelGatewayService'

const MEMORY_DIALOGUE_DEFAULT_DESTINATION_ID = 'memory-dialogue-default'

function buildDefaultDestination(): ApprovedDraftSendDestination {
  const route = resolveModelRoute({
    taskType: 'memory_dialogue'
  })

  return {
    destinationId: MEMORY_DIALOGUE_DEFAULT_DESTINATION_ID,
    label: 'Memory Dialogue Default',
    resolutionMode: 'memory_dialogue_default',
    provider: route.provider,
    model: route.model,
    isDefault: true
  }
}

function buildProviderModelDestinations(): ApprovedDraftSendDestination[] {
  return [
    {
      destinationId: 'siliconflow-qwen25-72b',
      label: 'SiliconFlow / Qwen2.5-72B-Instruct',
      resolutionMode: 'provider_model',
      provider: 'siliconflow',
      model: 'Qwen/Qwen2.5-72B-Instruct',
      isDefault: false
    },
    {
      destinationId: 'openrouter-qwen25-72b',
      label: 'OpenRouter / qwen-2.5-72b-instruct',
      resolutionMode: 'provider_model',
      provider: 'openrouter',
      model: 'qwen/qwen-2.5-72b-instruct',
      isDefault: false
    }
  ]
}

export function listApprovedDraftSendDestinations(): ApprovedDraftSendDestination[] {
  return [
    buildDefaultDestination(),
    ...buildProviderModelDestinations()
  ]
}

export function getApprovedDraftSendDestination(destinationId?: string): ApprovedDraftSendDestination {
  const destinations = listApprovedDraftSendDestinations()

  if (!destinationId) {
    return destinations[0]!
  }

  const matchingDestination = destinations.find((destination) => destination.destinationId === destinationId)
  if (!matchingDestination) {
    throw new Error(`Unknown approved draft send destination: ${destinationId}`)
  }

  return matchingDestination
}

export { MEMORY_DIALOGUE_DEFAULT_DESTINATION_ID }
