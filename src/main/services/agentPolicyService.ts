import type {
  AgentPolicyVersionRecord,
  AgentRole
} from '../../shared/archiveContracts'
import { createAgentPolicyVersion } from './governancePersistenceService'
import type { ArchiveDatabase } from './db'

type CreateAgentPolicyServiceInput = {
  db: ArchiveDatabase
}

export function createAgentPolicyService(input: CreateAgentPolicyServiceInput) {
  return {
    proposePolicyVersion(policyInput: {
      role: AgentRole
      policyKey: string
      policyBody: string
    }): AgentPolicyVersionRecord {
      return createAgentPolicyVersion(input.db, policyInput)
    }
  }
}
