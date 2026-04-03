import fs from 'node:fs'
import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  AgentObjectiveDetail as LegacyAgentObjectiveDetail,
  AgentObjectiveKind as LegacyAgentObjectiveKind,
  AgentProposalRecord as LegacyAgentProposalRecord,
  CreateAgentObjectiveInput as LegacyCreateAgentObjectiveInput,
  CreateAgentProposalInput as LegacyCreateAgentProposalInput,
  RespondToAgentProposalInput as LegacyRespondToAgentProposalInput
} from '../../../src/shared/archiveContracts'
import type {
  AgentObjectiveDetail,
  AgentObjectiveKind,
  AgentProposalRecord,
  CreateAgentObjectiveInput,
  CreateAgentProposalInput,
  RespondToAgentProposalInput
} from '../../../src/shared/objectiveRuntimeContracts'

describe('objective runtime contract module', () => {
  it('exports the message-native runtime contracts without changing their public shapes', () => {
    expectTypeOf<AgentObjectiveKind>().toEqualTypeOf<LegacyAgentObjectiveKind>()
    expectTypeOf<AgentObjectiveDetail>().toEqualTypeOf<LegacyAgentObjectiveDetail>()
    expectTypeOf<AgentProposalRecord>().toEqualTypeOf<LegacyAgentProposalRecord>()
    expectTypeOf<CreateAgentObjectiveInput>().toEqualTypeOf<LegacyCreateAgentObjectiveInput>()
    expectTypeOf<CreateAgentProposalInput>().toEqualTypeOf<LegacyCreateAgentProposalInput>()
    expectTypeOf<RespondToAgentProposalInput>().toEqualTypeOf<LegacyRespondToAgentProposalInput>()
  })

  it('is imported directly by the objective persistence runtime slice', () => {
    const files = [
      '/Users/lvxiaoer/Documents/codeWork/ForgetMe/src/main/services/objectivePersistenceMutationService.ts',
      '/Users/lvxiaoer/Documents/codeWork/ForgetMe/src/main/services/objectivePersistenceQueryService.ts',
      '/Users/lvxiaoer/Documents/codeWork/ForgetMe/src/main/services/objectivePersistenceRowMapperService.ts',
      '/Users/lvxiaoer/Documents/codeWork/ForgetMe/src/main/services/objectivePersistenceDetailService.ts',
      '/Users/lvxiaoer/Documents/codeWork/ForgetMe/src/main/services/objectivePersistenceInteractionMutationService.ts'
    ]

    for (const filePath of files) {
      const source = fs.readFileSync(filePath, 'utf8')
      expect(source).toContain("shared/objectiveRuntimeContracts")
    }
  })
})
