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
        expect(
          result?.boundaryRedirect?.suggestedAsks.some((item) => item.label === 'Past expressions'),
          qualityCase.label
        ).toBe(true)
      } else {
        expect(result?.boundaryRedirect, qualityCase.label).toBeNull()
      }
      expect(result?.communicationEvidence, qualityCase.label).toBeNull()
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
        expect(
          result?.boundaryRedirect?.suggestedAsks.some((item) => item.label === 'Past expressions'),
          qualityCase.label
        ).toBe(true)
      } else {
        expect(result?.boundaryRedirect, qualityCase.label).toBeNull()
      }
      expect(result?.communicationEvidence, qualityCase.label).toBeNull()
    }

    db.close()
  })

  it('locks quote-backed evidence behavior for grounded and insufficient-evidence quote asks', () => {
    const db = seedMemoryWorkspaceScenario()

    const cases = [
      {
        label: 'person quote question',
        scope: { kind: 'person', canonicalPersonId: 'cp-1' } as const,
        question: '她过去是怎么表达记录和归档这类事的？给我看原话。',
        decision: 'grounded_answer',
        hasEvidence: true
      },
      {
        label: 'global quote question',
        scope: { kind: 'global' } as const,
        question: '档案里过去大家怎么说记录和归档这类事的？给我看原话。',
        decision: 'grounded_answer',
        hasEvidence: true
      },
      {
        label: 'quote coverage gap question',
        scope: { kind: 'person', canonicalPersonId: 'cp-1' } as const,
        question: '她过去是怎么说跑步训练这类事的？给我看原话。',
        decision: 'fallback_insufficient_evidence',
        hasEvidence: false
      }
    ] as const

    for (const qualityCase of cases) {
      const result = askMemoryWorkspace(db, {
        scope: qualityCase.scope,
        question: qualityCase.question
      })

      expect(result, qualityCase.label).not.toBeNull()
      expect(result?.guardrail.decision, qualityCase.label).toBe(qualityCase.decision)
      expect(Boolean(result?.communicationEvidence), qualityCase.label).toBe(qualityCase.hasEvidence)
      if (qualityCase.hasEvidence) {
        expect(result?.communicationEvidence?.excerpts.length ?? 0, qualityCase.label).toBeGreaterThan(0)
      } else {
        expect(result?.answer.displayType, qualityCase.label).toBe('coverage_gap')
      }
    }

    db.close()
  })
})
