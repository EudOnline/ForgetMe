import { describe, expect, it } from 'vitest'
import { askMemoryWorkspace } from '../../../src/main/services/memoryWorkspaceService'
import { seedMemoryWorkspaceScenario } from './helpers/memoryWorkspaceScenario'

describe('askMemoryWorkspace', () => {
  it('builds a person-scoped grounded answer from dossier facts and open conflicts', () => {
    const db = seedMemoryWorkspaceScenario()

    const result = askMemoryWorkspace(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '她现在有哪些还没解决的冲突？'
    })

    expect(result?.title).toBe('Memory Workspace · Alice Chen')
    expect(result?.answer.displayType).toBe('open_conflict')
    expect(result?.answer.summary).toContain('school_name')
    expect(result?.guardrail.decision).toBe('fallback_to_conflict')
    expect(result?.guardrail.reasonCodes).toContain('open_conflict_present')
    expect(result?.boundaryRedirect).toBeNull()
    expect(result?.communicationEvidence).toBeNull()
    expect(result?.contextCards.map((card) => card.title)).toContain('Conflicts & Gaps')
    expect(result?.contextCards.some((card) => card.citations.some((citation) => citation.kind === 'review'))).toBe(true)

    db.close()
  })

  it('builds a group-scoped grounded answer from portrait summary and timeline windows', () => {
    const db = seedMemoryWorkspaceScenario()

    const result = askMemoryWorkspace(db, {
      scope: { kind: 'group', anchorPersonId: 'cp-1' },
      question: '这个群体最近一起发生过什么？'
    })

    expect(result?.title).toBe('Memory Workspace · Alice Chen Group')
    expect(result?.answer.summary).toContain('Trip planning')
    expect(result?.guardrail.decision).toBe('grounded_answer')
    expect(result?.boundaryRedirect).toBeNull()
    expect(result?.communicationEvidence).toBeNull()
    expect(result?.contextCards.map((card) => card.title)).toContain('Timeline Windows')
    expect(result?.contextCards.map((card) => card.title)).toContain('Summary')

    db.close()
  })

  it('builds a global-scoped grounded answer from approved people, groups, and review pressure', () => {
    const db = seedMemoryWorkspaceScenario()

    const result = askMemoryWorkspace(db, {
      scope: { kind: 'global' },
      question: '现在档案库里最值得优先关注的是什么？'
    })

    expect(result?.title).toBe('Memory Workspace · Global')
    expect(result?.contextCards.map((card) => card.title)).toEqual(
      expect.arrayContaining(['People Overview', 'Group Overview', 'Review Pressure'])
    )
    expect(result?.answer.summary).toContain('pending')
    expect(result?.guardrail.decision).toBe('fallback_to_conflict')
    expect(result?.boundaryRedirect).toBeNull()
    expect(result?.communicationEvidence).toBeNull()

    db.close()
  })

  it('returns person-scoped communication evidence for quote asks', () => {
    const db = seedMemoryWorkspaceScenario()

    const result = askMemoryWorkspace(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '她过去是怎么表达记录和归档这类事的？给我看原话。'
    })

    expect(result?.guardrail.decision).toBe('grounded_answer')
    expect(result?.boundaryRedirect).toBeNull()
    expect(result?.communicationEvidence?.title).toBe('Communication Evidence')
    expect(result?.communicationEvidence?.excerpts.length).toBe(2)
    expect(result?.communicationEvidence?.excerpts.every((excerpt) => excerpt.speakerDisplayName === 'Alice Chen')).toBe(true)
    expect(new Set(result?.communicationEvidence?.excerpts.map((excerpt) => excerpt.fileId))).toEqual(new Set(['f-1', 'f-2']))
    expect(result?.answer.citations.length ?? 0).toBeGreaterThan(0)

    db.close()
  })

  it('returns global communication evidence across multiple chat files for quote asks', () => {
    const db = seedMemoryWorkspaceScenario()

    const result = askMemoryWorkspace(db, {
      scope: { kind: 'global' },
      question: '档案里过去大家怎么说记录和归档这类事的？给我看原话。'
    })

    expect(result?.guardrail.decision).toBe('grounded_answer')
    expect(result?.boundaryRedirect).toBeNull()
    expect(result?.communicationEvidence?.excerpts.length ?? 0).toBeGreaterThan(1)
    expect(new Set(result?.communicationEvidence?.excerpts.map((excerpt) => excerpt.fileId))).toEqual(new Set(['f-1', 'f-2']))
    expect(result?.communicationEvidence?.excerpts.some((excerpt) => excerpt.speakerDisplayName === 'Alice Chen')).toBe(true)
    expect(result?.communicationEvidence?.excerpts.some((excerpt) => excerpt.speakerDisplayName === 'Bob Li')).toBe(true)

    db.close()
  })

  it('falls back to coverage gap when a quote ask has no relevant excerpts', () => {
    const db = seedMemoryWorkspaceScenario()

    const result = askMemoryWorkspace(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '她过去是怎么说跑步训练这类事的？给我看原话。'
    })

    expect(result?.answer.displayType).toBe('coverage_gap')
    expect(result?.guardrail.decision).toBe('fallback_insufficient_evidence')
    expect(result?.guardrail.reasonCodes).toContain('coverage_gap_present')
    expect(result?.communicationEvidence).toBeNull()
    expect(result?.boundaryRedirect).toBeNull()

    db.close()
  })

  it('builds an advice-mode answer without dropping grounded guardrails', () => {
    const db = seedMemoryWorkspaceScenario()

    const result = askMemoryWorkspace(db, {
      scope: { kind: 'group', anchorPersonId: 'cp-1' },
      question: '这个群体最近一起发生过什么？',
      expressionMode: 'advice'
    })

    expect(result?.expressionMode).toBe('advice')
    expect(result?.title).toBe('Memory Workspace · Alice Chen Group')
    expect(result?.guardrail.decision).toBe('grounded_answer')
    expect(result?.answer.summary).toContain('Based on the archive')
    expect(result?.answer.summary).toContain('safest next step')
    expect(result?.answer.citations.length ?? 0).toBeGreaterThan(0)
    expect(result?.boundaryRedirect).toBeNull()
    expect(result?.communicationEvidence).toBeNull()

    db.close()
  })

  it('keeps conflict fallback semantics in advice mode', () => {
    const db = seedMemoryWorkspaceScenario()

    const result = askMemoryWorkspace(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '我下一步最应该关注什么？',
      expressionMode: 'advice'
    })

    expect(result?.expressionMode).toBe('advice')
    expect(result?.guardrail.decision).toBe('fallback_to_conflict')
    expect(result?.answer.summary).toContain('archive shows unresolved conflicts')
    expect(result?.boundaryRedirect).toBeNull()
    expect(result?.communicationEvidence).toBeNull()

    db.close()
  })

  it('degrades persona-style requests into a grounded policy fallback', () => {
    const db = seedMemoryWorkspaceScenario()

    const result = askMemoryWorkspace(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '如果她本人会怎么建议我？请模仿她的口吻回答。'
    })
    const repeatResult = askMemoryWorkspace(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '如果她本人会怎么建议我？请模仿她的口吻回答。'
    })

    expect(result?.answer.displayType).toBe('coverage_gap')
    expect(result?.answer.summary).toContain('cannot answer as if it were')
    expect(result?.guardrail.decision).toBe('fallback_unsupported_request')
    expect(result?.guardrail.reasonCodes).toContain('persona_request')
    expect(result?.boundaryRedirect).toMatchObject({
      kind: 'persona_request',
      title: 'Persona request blocked'
    })
    expect(result?.communicationEvidence).toBeNull()
    expect(result?.boundaryRedirect?.suggestedAsks.length ?? 0).toBeGreaterThanOrEqual(2)
    expect(result?.boundaryRedirect?.suggestedAsks.length ?? 0).toBeLessThanOrEqual(4)
    expect(result?.boundaryRedirect?.suggestedAsks.some((item) => item.label === 'Past expressions')).toBe(true)
    expect(result?.boundaryRedirect?.suggestedAsks.map((item) => item.expressionMode)).toEqual(
      expect.arrayContaining(['grounded', 'advice'])
    )
    expect(result?.boundaryRedirect?.suggestedAsks.every((item) => ['grounded', 'advice'].includes(item.expressionMode))).toBe(true)
    expect(result?.boundaryRedirect).toEqual(repeatResult?.boundaryRedirect)

    db.close()
  })

  it('keeps persona fallback primary in advice mode', () => {
    const db = seedMemoryWorkspaceScenario()

    const result = askMemoryWorkspace(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '像她本人一样给我建议，用她的语气回答。',
      expressionMode: 'advice'
    })

    expect(result?.expressionMode).toBe('advice')
    expect(result?.guardrail.decision).toBe('fallback_unsupported_request')
    expect(result?.answer.summary).toContain('cannot answer as if it were')
    expect(result?.boundaryRedirect?.kind).toBe('persona_request')
    expect(result?.communicationEvidence).toBeNull()
    expect(result?.boundaryRedirect?.suggestedAsks.some((item) => item.label === 'Past expressions')).toBe(true)
    expect(result?.boundaryRedirect?.suggestedAsks.some((item) => item.expressionMode === 'advice')).toBe(true)

    db.close()
  })

  it('marks low-coverage answers when the archive cannot support the request', () => {
    const db = seedMemoryWorkspaceScenario()

    const result = askMemoryWorkspace(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-3' },
      question: '她的毕业学校是什么？'
    })

    expect(result?.answer.displayType).toBe('coverage_gap')
    expect(result?.guardrail.decision).toBe('fallback_insufficient_evidence')
    expect(result?.guardrail.fallbackApplied).toBe(true)
    expect(result?.boundaryRedirect).toBeNull()
    expect(result?.communicationEvidence).toBeNull()

    db.close()
  })

  it('keeps insufficient-evidence fallback semantics in advice mode', () => {
    const db = seedMemoryWorkspaceScenario()

    const result = askMemoryWorkspace(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-3' },
      question: '她的毕业学校是什么？',
      expressionMode: 'advice'
    })

    expect(result?.expressionMode).toBe('advice')
    expect(result?.guardrail.decision).toBe('fallback_insufficient_evidence')
    expect(result?.answer.summary).toContain('insufficient')
    expect(result?.boundaryRedirect).toBeNull()
    expect(result?.communicationEvidence).toBeNull()

    db.close()
  })

  it('returns null when the requested scope does not exist', () => {
    const db = seedMemoryWorkspaceScenario()

    expect(askMemoryWorkspace(db, {
      scope: { kind: 'person', canonicalPersonId: 'missing' },
      question: 'hi'
    })).toBeNull()

    db.close()
  })
})
