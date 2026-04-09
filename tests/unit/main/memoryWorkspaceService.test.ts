import { describe, expect, it } from 'vitest'
import { askMemoryWorkspace } from '../../../src/main/services/memoryWorkspaceService'
import { askMemoryWorkspacePersisted } from '../../../src/main/services/memoryWorkspaceSessionService'
import {
  seedMemoryWorkspacePersonAgentScenario,
  seedMemoryWorkspaceScenario
} from './helpers/memoryWorkspaceScenario'

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
    expect(result?.workflowKind).toBe('default')
    expect(result?.personaDraft).toBeNull()
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
    expect(result?.workflowKind).toBe('default')
    expect(result?.personaDraft).toBeNull()
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
    expect(result?.workflowKind).toBe('default')
    expect(result?.personaDraft).toBeNull()

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
    expect(result?.workflowKind).toBe('default')
    expect(result?.personaDraft).toBeNull()
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
    expect(result?.workflowKind).toBe('default')
    expect(result?.personaDraft).toBeNull()
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
    expect(result?.workflowKind).toBe('default')
    expect(result?.personaDraft).toBeNull()

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
    expect(result?.workflowKind).toBe('default')
    expect(result?.personaDraft).toBeNull()

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
    expect(result?.workflowKind).toBe('default')
    expect(result?.personaDraft).toBeNull()

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
    expect(result?.workflowKind).toBe('default')
    expect(result?.personaDraft).toBeNull()
    expect(result?.boundaryRedirect?.suggestedActions.length ?? 0).toBeGreaterThanOrEqual(2)
    expect(result?.boundaryRedirect?.suggestedActions.length ?? 0).toBeLessThanOrEqual(5)
    expect(result?.boundaryRedirect?.suggestedActions.some((item) => item.label === 'Past expressions' && item.kind === 'ask')).toBe(true)
    expect(
      result?.boundaryRedirect?.suggestedActions.some(
        (item) => item.kind === 'open_persona_draft_sandbox' && item.workflowKind === 'persona_draft_sandbox'
      )
    ).toBe(true)
    expect(result?.boundaryRedirect?.suggestedActions.map((item) => item.expressionMode)).toEqual(
      expect.arrayContaining(['grounded', 'advice'])
    )
    expect(result?.boundaryRedirect?.suggestedActions.every((item) => ['grounded', 'advice'].includes(item.expressionMode))).toBe(true)
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
    expect(result?.workflowKind).toBe('default')
    expect(result?.personaDraft).toBeNull()
    expect(result?.boundaryRedirect?.suggestedActions.some((item) => item.label === 'Past expressions' && item.kind === 'ask')).toBe(true)
    expect(result?.boundaryRedirect?.suggestedActions.some((item) => item.expressionMode === 'advice')).toBe(true)

    db.close()
  })

  it('builds a reviewed persona draft sandbox from quote-backed communication evidence', () => {
    const db = seedMemoryWorkspaceScenario()

    const result = askMemoryWorkspace(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '如果她来写一段关于记录和归档的回复，会怎么写？',
      workflowKind: 'persona_draft_sandbox'
    })

    expect(result?.workflowKind).toBe('persona_draft_sandbox')
    expect(result?.guardrail.decision).toBe('sandbox_review_required')
    expect(result?.guardrail.reasonCodes).toEqual(
      expect.arrayContaining(['persona_draft_sandbox', 'quote_trace_required'])
    )
    expect(result?.answer.summary).toContain('Reviewed simulation draft')
    expect(result?.boundaryRedirect).toBeNull()
    expect(result?.communicationEvidence?.excerpts.length).toBe(2)
    expect(result?.personaDraft?.reviewState).toBe('review_required')
    expect(result?.personaDraft?.disclaimer).toContain('Simulation draft')
    expect(result?.personaDraft?.supportingExcerpts).toEqual(['ce-1', 'ce-3'])
    expect(result?.personaDraft?.trace.length).toBeGreaterThan(0)
    expect(result?.personaDraft?.draft).toContain('归档')

    db.close()
  })

  it('builds a reviewed persona draft sandbox from the default redirect question when person evidence exists', () => {
    const db = seedMemoryWorkspaceScenario()

    const result = askMemoryWorkspace(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '如果她来写这段话，会怎么写？先给我一个可审阅草稿。',
      workflowKind: 'persona_draft_sandbox'
    })

    expect(result?.workflowKind).toBe('persona_draft_sandbox')
    expect(result?.guardrail.decision).toBe('sandbox_review_required')
    expect(result?.communicationEvidence?.excerpts.length).toBeGreaterThanOrEqual(2)
    expect(result?.personaDraft?.disclaimer).toContain('Simulation draft')
    expect(result?.personaDraft?.trace.length).toBeGreaterThan(0)

    db.close()
  })

  it('falls back safely when a persona draft sandbox request lacks enough relevant excerpts', () => {
    const db = seedMemoryWorkspaceScenario()

    const result = askMemoryWorkspace(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '如果她来写一段关于跑步训练的回复，会怎么写？',
      workflowKind: 'persona_draft_sandbox'
    })

    expect(result?.workflowKind).toBe('persona_draft_sandbox')
    expect(result?.answer.displayType).toBe('coverage_gap')
    expect(result?.guardrail.decision).toBe('fallback_insufficient_evidence')
    expect(result?.boundaryRedirect).toBeNull()
    expect(result?.communicationEvidence).toBeNull()
    expect(result?.personaDraft).toBeNull()

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
    expect(result?.workflowKind).toBe('default')
    expect(result?.personaDraft).toBeNull()

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
    expect(result?.workflowKind).toBe('default')
    expect(result?.personaDraft).toBeNull()

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

  it('routes person-scoped factual questions through an active person agent when available', () => {
    const { db, personAgent } = seedMemoryWorkspacePersonAgentScenario()

    const result = askMemoryWorkspace(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '她的生日是什么？'
    })

    expect(result?.answer.summary).toContain('1997-02-03')
    expect(result?.personAgentContext).toMatchObject({
      consultedAgents: [{
        personAgentId: personAgent.personAgentId,
        canonicalPersonId: 'cp-1',
        reason: 'scope_person'
      }],
      archiveRouting: {
        strategy: 'person_agent',
        reason: 'agent_consulted'
      },
      activeCanonicalPersonId: 'cp-1',
      usedAnswerPack: true,
      strategyProfile: expect.objectContaining({
        evidencePreference: 'quote_first',
        conflictBehavior: 'conflict_forward'
      })
    })
    expect(result?.answer.citations.some((citation) => citation.kind === 'file')).toBe(true)

    db.close()
  })

  it('routes global questions through exactly one resolved promoted person agent', () => {
    const { db, personAgent } = seedMemoryWorkspacePersonAgentScenario()

    const result = askMemoryWorkspace(db, {
      scope: { kind: 'global' },
      question: 'Alice Chen 的生日是什么？'
    })

    expect(result?.title).toBe('Memory Workspace · Global')
    expect(result?.answer.summary).toContain('1997-02-03')
    expect(result?.personAgentContext).toMatchObject({
      consultedAgents: [{
        personAgentId: personAgent.personAgentId,
        canonicalPersonId: 'cp-1',
        reason: 'global_resolved_person'
      }],
      archiveRouting: {
        strategy: 'person_agent',
        reason: 'agent_consulted'
      },
      activeCanonicalPersonId: 'cp-1',
      usedAnswerPack: true
    })

    db.close()
  })

  it('falls back to the archive path for non-promoted people while keeping routing metadata bounded', () => {
    const { db } = seedMemoryWorkspacePersonAgentScenario()

    const result = askMemoryWorkspace(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-3' },
      question: '她的毕业学校是什么？'
    })

    expect(result?.answer.displayType).toBe('coverage_gap')
    expect(result?.personAgentContext).toMatchObject({
      consultedAgents: [],
      archiveRouting: {
        strategy: 'archive_fallback',
        reason: 'no_active_person_agent'
      },
      activeCanonicalPersonId: 'cp-3',
      usedAnswerPack: false
    })

    db.close()
  })

  it('injects a conversation context card for persisted follow-up asks in the same session', () => {
    const db = seedMemoryWorkspaceScenario()

    const firstTurn = askMemoryWorkspacePersisted(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '她现在有哪些还没解决的冲突？',
      expressionMode: 'advice'
    })
    const followUpTurn = askMemoryWorkspacePersisted(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '那为什么这个冲突最值得先处理？',
      expressionMode: 'advice',
      sessionId: firstTurn!.sessionId
    })

    expect(followUpTurn?.response.contextCards.map((card) => card.title)).toContain('Conversation Context')
    expect(
      followUpTurn?.response.contextCards.find((card) => card.title === 'Conversation Context')?.body
    ).toContain('她现在有哪些还没解决的冲突？')
    expect(
      followUpTurn?.response.contextCards.find((card) => card.title === 'Conversation Context')?.body
    ).toContain(firstTurn!.response.answer.summary)
    expect(followUpTurn?.response.answer.summary).toContain('Based on the archive')

    db.close()
  })

  it('prefers prior-turn context over generic summary selection for explicit follow-up wording', () => {
    const db = seedMemoryWorkspaceScenario()

    const firstTurn = askMemoryWorkspacePersisted(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '她有哪些已保存的资料？',
      expressionMode: 'advice'
    })
    const followUpTurn = askMemoryWorkspacePersisted(db, {
      scope: { kind: 'person', canonicalPersonId: 'cp-1' },
      question: '为什么这个最值得继续看？',
      expressionMode: 'advice',
      sessionId: firstTurn!.sessionId
    })

    expect(followUpTurn?.response.contextCards[0]?.title).toBe('Conversation Context')
    expect(
      followUpTurn?.response.contextCards.find((card) => card.title === 'Conversation Context')?.body
    ).toContain('她有哪些已保存的资料？')
    expect(
      followUpTurn?.response.contextCards.find((card) => card.title === 'Conversation Context')?.body
    ).toContain(firstTurn!.response.answer.summary)
    expect(followUpTurn?.response.answer.summary).toContain('Based on the archive')

    db.close()
  })
})
