import { describe, expect, it } from 'vitest'
import { askMemoryWorkspace } from '../../../src/main/services/memoryWorkspaceService'
import { seedMemoryWorkspaceScenario } from './helpers/memoryWorkspaceScenario'

describe('memory workspace quality baseline', () => {
  it('locks conflict, coverage, multi-source, and persona-request behaviors', () => {
    const db = seedMemoryWorkspaceScenario()

    const cases = [
      {
        label: 'conflict question',
        scope: { kind: 'person', canonicalPersonId: 'cp-1' } as const,
        question: '她现在有哪些还没解决的冲突？',
        decision: 'fallback_to_conflict',
        reasonCode: 'open_conflict_present'
      },
      {
        label: 'low coverage question',
        scope: { kind: 'person', canonicalPersonId: 'cp-3' } as const,
        question: '她的毕业学校是什么？',
        decision: 'fallback_insufficient_evidence',
        reasonCode: 'coverage_gap_present'
      },
      {
        label: 'multi-source synthesis question',
        scope: { kind: 'person', canonicalPersonId: 'cp-1' } as const,
        question: '她有哪些已保存的资料和已确认信息？',
        decision: 'grounded_answer',
        reasonCode: 'multi_source_synthesis'
      },
      {
        label: 'persona imitation question',
        scope: { kind: 'person', canonicalPersonId: 'cp-1' } as const,
        question: '像她本人一样给我建议，用她的语气回答。',
        decision: 'fallback_unsupported_request',
        reasonCode: 'persona_request'
      }
    ] as const

    for (const qualityCase of cases) {
      const result = askMemoryWorkspace(db, {
        scope: qualityCase.scope,
        question: qualityCase.question
      })

      expect(result, qualityCase.label).not.toBeNull()
      expect(result?.guardrail.decision, qualityCase.label).toBe(qualityCase.decision)
      expect(result?.guardrail.reasonCodes, qualityCase.label).toContain(qualityCase.reasonCode)
      if (qualityCase.reasonCode === 'persona_request') {
        expect(result?.boundaryRedirect, qualityCase.label).not.toBeNull()
      } else {
        expect(result?.boundaryRedirect, qualityCase.label).toBeNull()
      }
    }

    db.close()
  })

  it('locks advice-mode guardrail behavior for grounded, conflict, coverage, and persona asks', () => {
    const db = seedMemoryWorkspaceScenario()

    const cases = [
      {
        label: 'grounded advice question',
        scope: { kind: 'group', anchorPersonId: 'cp-1' } as const,
        question: '这个群体最近一起发生过什么？',
        decision: 'grounded_answer',
        reasonCode: 'multi_source_synthesis'
      },
      {
        label: 'conflict advice question',
        scope: { kind: 'person', canonicalPersonId: 'cp-1' } as const,
        question: '我下一步最应该关注什么？',
        decision: 'fallback_to_conflict',
        reasonCode: 'open_conflict_present'
      },
      {
        label: 'low coverage advice question',
        scope: { kind: 'person', canonicalPersonId: 'cp-3' } as const,
        question: '她的毕业学校是什么？',
        decision: 'fallback_insufficient_evidence',
        reasonCode: 'coverage_gap_present'
      },
      {
        label: 'persona advice question',
        scope: { kind: 'person', canonicalPersonId: 'cp-1' } as const,
        question: '像她本人一样给我建议，用她的语气回答。',
        decision: 'fallback_unsupported_request',
        reasonCode: 'persona_request'
      }
    ] as const

    for (const qualityCase of cases) {
      const result = askMemoryWorkspace(db, {
        scope: qualityCase.scope,
        question: qualityCase.question,
        expressionMode: 'advice'
      })

      expect(result, qualityCase.label).not.toBeNull()
      expect(result?.expressionMode, qualityCase.label).toBe('advice')
      expect(result?.guardrail.decision, qualityCase.label).toBe(qualityCase.decision)
      expect(result?.guardrail.reasonCodes, qualityCase.label).toContain(qualityCase.reasonCode)
      if (qualityCase.reasonCode === 'persona_request') {
        expect(result?.boundaryRedirect, qualityCase.label).not.toBeNull()
      } else {
        expect(result?.boundaryRedirect, qualityCase.label).toBeNull()
      }
    }

    db.close()
  })
})
