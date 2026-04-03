import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type {
  AgentObjectiveDetail,
  AgentObjectiveRecord,
  AgentProposalRecord,
  AgentRole,
  AgentThreadDetail,
  CreateAgentObjectiveInput
} from '../../shared/archiveContracts'
import { getObjectiveClient } from '../clients/objectiveClient'
import { useI18n } from '../i18n'

const objectiveKinds: CreateAgentObjectiveInput['objectiveKind'][] = [
  'evidence_investigation',
  'review_decision',
  'user_response',
  'policy_change',
  'publication'
]

function asErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function humanize(value: string) {
  return value.replaceAll('_', ' ')
}

function formatBudgetSummary(budget: AgentProposalRecord['budget']) {
  if (!budget) {
    return 'none'
  }

  return `${budget.maxRounds} rounds · ${budget.maxToolCalls} tools · ${Math.round(budget.timeoutMs / 1000)}s`
}

function summarizeObjective(detail: AgentObjectiveDetail): AgentObjectiveRecord {
  return {
    objectiveId: detail.objectiveId,
    title: detail.title,
    objectiveKind: detail.objectiveKind,
    status: detail.status,
    prompt: detail.prompt,
    initiatedBy: detail.initiatedBy,
    ownerRole: detail.ownerRole,
    mainThreadId: detail.mainThreadId,
    riskLevel: detail.riskLevel,
    budget: detail.budget,
    requiresOperatorInput: detail.requiresOperatorInput,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt
  }
}

function proposalSummary(proposal: AgentProposalRecord) {
  const claim = typeof proposal.payload.claim === 'string'
    ? proposal.payload.claim
    : null
  if (claim) {
    return claim
  }

  const queueItemId = typeof proposal.payload.queueItemId === 'string'
    ? proposal.payload.queueItemId
    : null
  if (queueItemId) {
    return `Queue item ${queueItemId}`
  }

  return `Owner ${proposal.ownerRole}`
}

function shouldShowProposal(proposal: AgentProposalRecord) {
  return proposal.status !== 'committed' && proposal.status !== 'superseded'
}

function inferConfidence(proposal: AgentProposalRecord | null, blocker: string | null) {
  if (blocker) {
    return 'guarded'
  }

  if (proposal?.status === 'awaiting_operator' || proposal?.status === 'committable') {
    return 'high'
  }

  if (proposal) {
    return 'building'
  }

  return 'listening'
}

export function ObjectiveWorkbenchPage() {
  const objectiveClient = useMemo(() => getObjectiveClient(), [])
  const { t } = useI18n()
  const [objectives, setObjectives] = useState<AgentObjectiveRecord[]>([])
  const [selectedObjectiveId, setSelectedObjectiveId] = useState<string | null>(null)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [objectiveDetail, setObjectiveDetail] = useState<AgentObjectiveDetail | null>(null)
  const [threadDetail, setThreadDetail] = useState<AgentThreadDetail | null>(null)
  const [titleInput, setTitleInput] = useState('Verify an external claim before responding')
  const [promptInput, setPromptInput] = useState('Check the source before we answer the user.')
  const [objectiveKind, setObjectiveKind] = useState<CreateAgentObjectiveInput['objectiveKind']>('evidence_investigation')
  const [isLoading, setIsLoading] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [activeProposalId, setActiveProposalId] = useState<string | null>(null)
  const [isThreadExpanded, setIsThreadExpanded] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [pendingActionId, setPendingActionId] = useState<string | null>(null)

  const loadThreadDetail = useCallback(async (threadId: string) => {
    try {
      const detail = await objectiveClient.getAgentThread({ threadId })
      setThreadDetail(detail)
    } catch (error) {
      setThreadDetail(null)
      setErrorMessage(t('objectiveWorkbench.loadFailed', {
        message: asErrorMessage(error)
      }))
    }
  }, [objectiveClient, t])

  const loadObjectiveDetail = useCallback(async (objectiveId: string) => {
    try {
      const detail = await objectiveClient.getAgentObjective({ objectiveId })
      const nextThreadId = detail?.mainThreadId || detail?.threads[0]?.threadId || null
      setObjectiveDetail(detail)
      setActiveProposalId((current) => (
        current && detail?.proposals.some((proposal) => proposal.proposalId === current)
          ? current
          : detail?.proposals.find(shouldShowProposal)?.proposalId ?? null
      ))
      setSelectedThreadId((current) => {
        if (current && detail?.threads.some((thread) => thread.threadId === current)) {
          return current
        }

        return nextThreadId
      })

      if (nextThreadId) {
        await loadThreadDetail(nextThreadId)
      } else {
        setThreadDetail(null)
      }
    } catch (error) {
      setObjectiveDetail(null)
      setErrorMessage(t('objectiveWorkbench.loadFailed', {
        message: asErrorMessage(error)
      }))
    }
  }, [objectiveClient, loadThreadDetail, t])

  const refreshObjectives = useCallback(async (preferredObjectiveId?: string | null) => {
    setIsLoading(true)
    setErrorMessage(null)

    try {
      await objectiveClient.refreshObjectiveTriggers()
      const nextObjectives = await objectiveClient.listAgentObjectives()
      const nextSelectedObjectiveId = preferredObjectiveId && nextObjectives.some((item) => item.objectiveId === preferredObjectiveId)
        ? preferredObjectiveId
        : selectedObjectiveId && nextObjectives.some((item) => item.objectiveId === selectedObjectiveId)
          ? selectedObjectiveId
          : nextObjectives[0]?.objectiveId ?? null

      setObjectives(nextObjectives)
      setSelectedObjectiveId(nextSelectedObjectiveId)

      if (nextSelectedObjectiveId) {
        await loadObjectiveDetail(nextSelectedObjectiveId)
      } else {
        setObjectiveDetail(null)
        setSelectedThreadId(null)
        setThreadDetail(null)
      }
    } catch (error) {
      setErrorMessage(t('objectiveWorkbench.loadFailed', {
        message: asErrorMessage(error)
      }))
    } finally {
      setIsLoading(false)
    }
  }, [loadObjectiveDetail, objectiveClient, selectedObjectiveId, t])

  useEffect(() => {
    void refreshObjectives()
  }, [refreshObjectives])

  useEffect(() => {
    if (!selectedObjectiveId) {
      setObjectiveDetail(null)
      return
    }

    void loadObjectiveDetail(selectedObjectiveId)
  }, [loadObjectiveDetail, selectedObjectiveId])

  useEffect(() => {
    if (!selectedThreadId) {
      setThreadDetail(null)
      return
    }

    void loadThreadDetail(selectedThreadId)
  }, [loadThreadDetail, selectedThreadId])

  const visibleCheckpoints = useMemo(() => {
    if (!objectiveDetail) {
      return []
    }

    return [...objectiveDetail.checkpoints]
      .filter((checkpoint) => !selectedThreadId || checkpoint.threadId === selectedThreadId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }, [objectiveDetail, selectedThreadId])

  const visibleProposals = useMemo(() => {
    if (!objectiveDetail) {
      return []
    }

    return objectiveDetail.proposals
      .filter(shouldShowProposal)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }, [objectiveDetail])

  const visibleToolExecutions = useMemo(() => {
    const threadScopedExecutions = threadDetail?.toolExecutions ?? []
    if (threadScopedExecutions.length > 0) {
      return threadScopedExecutions
    }

    return (objectiveDetail?.toolExecutions ?? [])
      .filter((execution) => !selectedThreadId || execution.threadId === selectedThreadId)
  }, [objectiveDetail, selectedThreadId, threadDetail])

  const facilitatorRound = useMemo(() => {
    const threadMessages = threadDetail?.messages ?? []
    return threadMessages.reduce((highestRound, message) => (
      Math.max(highestRound, message.round ?? 0)
    ), 0)
  }, [threadDetail])

  const facilitatorReason = useMemo(() => {
    if (!objectiveDetail) {
      return null
    }

    if (objectiveDetail.status === 'stalled') {
      return visibleCheckpoints.find((checkpoint) => checkpoint.checkpointKind === 'stalled')?.summary ?? null
    }

    if (objectiveDetail.status === 'completed') {
      return visibleCheckpoints.find((checkpoint) => checkpoint.title === 'Objective completed')?.summary ?? null
    }

    return null
  }, [objectiveDetail, visibleCheckpoints])

  const roleStances = useMemo(() => {
    if (!objectiveDetail) {
      return []
    }

    const threadMessages = threadDetail?.messages ?? []

    return objectiveDetail.participants
      .filter((participant, index, participants) => (
        participant.role
          && participants.findIndex((candidate) => candidate.role === participant.role) === index
      ))
      .map((participant) => {
        const role = participant.role as AgentRole
        const latestProposal = [...objectiveDetail.proposals]
          .filter((proposal) => proposal.ownerRole === role || proposal.proposedByParticipantId === role)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null
        const latestChallenge = [...threadMessages]
          .filter((message) => message.kind === 'challenge' && message.fromParticipantId === role)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null
        const blocker = latestChallenge?.body ?? null
        const permissions = [
          visibleProposals.some((proposal) => proposal.ownerRole === role)
            ? t('objectiveWorkbench.permission.owner')
            : null,
          role === 'governance' && visibleProposals.some((proposal) => proposal.allowVetoBy.includes('governance'))
            ? t('objectiveWorkbench.permission.veto')
            : null
        ].filter((value): value is string => Boolean(value))

        return {
          role,
          latestProposal,
          latestChallenge,
          blocker,
          permissions,
          confidence: inferConfidence(latestProposal, blocker)
        }
      })
  }, [objectiveDetail, threadDetail, visibleProposals, t])

  const selectedProposal = visibleProposals.find((proposal) => proposal.proposalId === activeProposalId) ?? null

  const participantLabel = useCallback((participantId: string) => {
    if (participantId === 'operator') {
      return 'operator'
    }

    const participant = threadDetail?.participants.find((candidate) => candidate.participantId === participantId)
      ?? objectiveDetail?.participants.find((candidate) => candidate.participantId === participantId)

    return participant?.displayLabel ?? participantId
  }, [objectiveDetail?.participants, threadDetail?.participants])

  const proposalSourceLabel = (proposal: AgentProposalRecord) => {
    if (proposal.proposedByParticipantId === 'operator') {
      return t('objectiveWorkbench.proposalSourceOperator')
    }

    return t('objectiveWorkbench.proposalSourceAgent', {
      actor: participantLabel(proposal.proposedByParticipantId)
    })
  }

  const blockedReason = useMemo(() => {
    const blockingMessage = [...(threadDetail?.messages ?? [])]
      .reverse()
      .find((message) => message.blocking)
    if (blockingMessage) {
      return t('objectiveWorkbench.blockedByLine', {
        actor: participantLabel(blockingMessage.fromParticipantId),
        reason: blockingMessage.body
      })
    }

    const failedSubagentPool = (threadDetail?.subagents?.length ?? 0) > 0
      ? (threadDetail?.subagents ?? [])
      : (objectiveDetail?.subagents ?? [])
    const failedSubagent = [...failedSubagentPool]
      .reverse()
      .find((subagent) => subagent.status === 'failed')
    if (failedSubagent?.summary) {
      return t('objectiveWorkbench.blockedByLine', {
        actor: failedSubagent.specialization,
        reason: failedSubagent.summary
      })
    }

    const failedTool = [...visibleToolExecutions]
      .reverse()
      .find((execution) => execution.status === 'failed' || execution.status === 'blocked')
    const failedToolReason = typeof failedTool?.outputPayload?.message === 'string'
      ? failedTool.outputPayload.message
      : typeof failedTool?.outputPayload?.reason === 'string'
        ? failedTool.outputPayload.reason
        : null
    if (failedTool && failedToolReason) {
      return t('objectiveWorkbench.blockedByLine', {
        actor: failedTool.toolName,
        reason: failedToolReason
      })
    }

    return null
  }, [objectiveDetail, participantLabel, t, threadDetail, visibleToolExecutions])

  const subagentLineage = useMemo(() => {
    return (objectiveDetail?.subagents ?? [])
      .filter((subagent) => !selectedThreadId || subagent.threadId === selectedThreadId || subagent.parentThreadId === selectedThreadId)
      .map((subagent) => ({
        subagentId: subagent.subagentId,
        summary: `${subagent.parentAgentRole} -> ${subagent.specialization}`,
        status: subagent.status,
        toolPolicyId: subagent.toolPolicyId,
        budget: formatBudgetSummary(subagent.budget)
      }))
  }, [objectiveDetail, selectedThreadId])

  const handleCreateObjective = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!titleInput.trim() || !promptInput.trim()) {
      return
    }

    setIsCreating(true)
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      const created = await objectiveClient.createAgentObjective({
        title: titleInput.trim(),
        objectiveKind,
        prompt: promptInput.trim(),
        initiatedBy: 'operator'
      })
      setObjectives((current) => [
        summarizeObjective(created),
        ...current.filter((item) => item.objectiveId !== created.objectiveId)
      ])
      setSelectedObjectiveId(created.objectiveId)
      setObjectiveDetail(created)
      setSelectedThreadId(created.mainThreadId || created.threads[0]?.threadId || null)
      setStatusMessage(t('objectiveWorkbench.createSuccess', {
        title: created.title
      }))
    } catch (error) {
      setErrorMessage(t('objectiveWorkbench.createFailed', {
        message: asErrorMessage(error)
      }))
    } finally {
      setIsCreating(false)
    }
  }

  const refreshSelectedObjective = async () => {
    if (!selectedObjectiveId) {
      return
    }

    await refreshObjectives(selectedObjectiveId)
    await loadObjectiveDetail(selectedObjectiveId)
    if (selectedThreadId) {
      await loadThreadDetail(selectedThreadId)
    }
  }

  const handleProposalResponse = async (proposal: AgentProposalRecord, response: 'approve' | 'challenge' | 'veto') => {
    setPendingActionId(proposal.proposalId)
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      await objectiveClient.respondToAgentProposal({
        proposalId: proposal.proposalId,
        responderRole: response === 'approve' ? proposal.ownerRole : 'governance',
        response,
        comment: response === 'approve'
          ? `Approved by ${proposal.ownerRole}.`
          : response === 'challenge'
            ? 'Need stronger evidence before this can proceed.'
            : 'Governance veto pending policy alignment.'
      })
      setStatusMessage(t('objectiveWorkbench.actionSuccess', {
        proposalKind: humanize(proposal.proposalKind)
      }))
      await refreshSelectedObjective()
    } catch (error) {
      setErrorMessage(t('objectiveWorkbench.actionFailed', {
        message: asErrorMessage(error)
      }))
    } finally {
      setPendingActionId(null)
    }
  }

  const handleProposalConfirmation = async (proposal: AgentProposalRecord, decision: 'confirm' | 'block') => {
    setPendingActionId(proposal.proposalId)
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      await objectiveClient.confirmAgentProposal({
        proposalId: proposal.proposalId,
        decision,
        operatorNote: decision === 'confirm'
          ? 'Operator confirmed after reviewing the checkpoint summary.'
          : 'Operator blocked until the objective is clarified.'
      })
      setStatusMessage(t('objectiveWorkbench.actionSuccess', {
        proposalKind: humanize(proposal.proposalKind)
      }))
      await refreshSelectedObjective()
    } catch (error) {
      setErrorMessage(t('objectiveWorkbench.actionFailed', {
        message: asErrorMessage(error)
      }))
    } finally {
      setPendingActionId(null)
    }
  }

  return (
    <section className="fmObjectiveWorkbench">
      <header className="fmObjectiveWorkbenchHeader">
        <div>
          <h1>{t('objectiveWorkbench.title')}</h1>
          <p>{t('objectiveWorkbench.description')}</p>
        </div>
        <div className="fmButtonRow">
          <button type="button" onClick={() => void refreshObjectives(selectedObjectiveId)} disabled={isLoading}>
            {t('objectiveWorkbench.refreshButton')}
          </button>
          {statusMessage ? <span className="fmObjectiveWorkbenchStatus">{statusMessage}</span> : null}
        </div>
      </header>

      {errorMessage ? (
        <p className="fmObjectiveWorkbenchError" role="alert">{errorMessage}</p>
      ) : null}

      <div className="fmObjectiveWorkbenchLayout">
        <div className="fmObjectiveWorkbenchColumn">
          <section aria-label={t('objectiveWorkbench.createTitle')}>
            <h2>{t('objectiveWorkbench.createTitle')}</h2>
            <form className="fmObjectiveWorkbenchComposer" onSubmit={handleCreateObjective}>
              <label className="fmObjectiveWorkbenchField">
                <span>{t('objectiveWorkbench.titleLabel')}</span>
                <input
                  aria-label={t('objectiveWorkbench.titleLabel')}
                  value={titleInput}
                  onChange={(event) => setTitleInput(event.target.value)}
                />
              </label>
              <label className="fmObjectiveWorkbenchField">
                <span>{t('objectiveWorkbench.promptLabel')}</span>
                <textarea
                  aria-label={t('objectiveWorkbench.promptLabel')}
                  value={promptInput}
                  onChange={(event) => setPromptInput(event.target.value)}
                />
              </label>
              <label className="fmObjectiveWorkbenchField">
                <span>{t('objectiveWorkbench.objectiveKindLabel')}</span>
                <select
                  aria-label={t('objectiveWorkbench.objectiveKindLabel')}
                  value={objectiveKind}
                  onChange={(event) => setObjectiveKind(event.target.value as CreateAgentObjectiveInput['objectiveKind'])}
                >
                  {objectiveKinds.map((kind) => (
                    <option key={kind} value={kind}>{humanize(kind)}</option>
                  ))}
                </select>
              </label>
              <button type="submit" disabled={isCreating}>
                {t('objectiveWorkbench.createButton')}
              </button>
            </form>
          </section>

          <aside className="fmObjectiveWorkbenchInbox" aria-label={t('objectiveWorkbench.inboxTitle')}>
            <h2>{t('objectiveWorkbench.inboxTitle')}</h2>
            {objectives.length === 0 ? (
              <p>{t('objectiveWorkbench.inboxEmpty')}</p>
            ) : (
              <ul className="fmObjectiveWorkbenchInboxList">
                {objectives.map((objective) => (
                  <li key={objective.objectiveId}>
                    <button
                      className="fmObjectiveWorkbenchInboxButton"
                      type="button"
                      aria-pressed={selectedObjectiveId === objective.objectiveId}
                      onClick={() => setSelectedObjectiveId(objective.objectiveId)}
                    >
                      <strong>{objective.title}</strong>
                      <span>{humanize(objective.objectiveKind)}</span>
                      <span>{humanize(objective.status)} · {objective.ownerRole}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>

        <div className="fmObjectiveWorkbenchColumn">
          <section aria-label={t('objectiveWorkbench.timelineTitle')}>
            <h2>{t('objectiveWorkbench.timelineTitle')}</h2>
            {objectiveDetail?.threads.length && objectiveDetail.threads.length > 1 ? (
              <div className="fmObjectiveWorkbenchThreadTabs">
                {objectiveDetail.threads.map((thread) => (
                  <button
                    key={thread.threadId}
                    type="button"
                    aria-pressed={selectedThreadId === thread.threadId}
                    onClick={() => setSelectedThreadId(thread.threadId)}
                  >
                    {thread.title}
                  </button>
                ))}
              </div>
            ) : null}
            {visibleCheckpoints.length === 0 ? (
              <p>{t('objectiveWorkbench.timelineEmpty')}</p>
            ) : (
              <ol className="fmObjectiveWorkbenchTimeline">
                {visibleCheckpoints.map((checkpoint) => (
                  <li key={checkpoint.checkpointId} className="fmObjectiveWorkbenchTimelineItem">
                    <div className="fmObjectiveWorkbenchTimelineMeta">
                      <span>{checkpoint.title}</span>
                      <span>{humanize(checkpoint.checkpointKind)}</span>
                    </div>
                    <p>{checkpoint.summary}</p>
                    {checkpoint.relatedProposalId ? (
                      <small>{t('objectiveWorkbench.relatedProposalLine', { proposalId: checkpoint.relatedProposalId })}</small>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section aria-label={t('objectiveWorkbench.fullThreadTitle')}>
            <div className="fmObjectiveWorkbenchSectionHeader">
              <h2>{t('objectiveWorkbench.fullThreadTitle')}</h2>
              <button type="button" onClick={() => setIsThreadExpanded((current) => !current)}>
                {isThreadExpanded
                  ? t('objectiveWorkbench.hideThreadDetail')
                  : t('objectiveWorkbench.showThreadDetail')}
              </button>
            </div>
            {isThreadExpanded ? (
              threadDetail?.messages.length ? (
                <ol className="fmObjectiveWorkbenchThreadMessages">
                  {threadDetail.messages.map((message) => (
                    <li key={message.messageId}>
                      <div className="fmObjectiveWorkbenchTimelineMeta">
                        <span>{participantLabel(message.fromParticipantId)}</span>
                        <span>{humanize(message.kind)}</span>
                      </div>
                      <p>{message.body}</p>
                      {message.refs.length ? (
                        <small>{t('objectiveWorkbench.threadRefsLine', { count: message.refs.length })}</small>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : (
                <p>{t('objectiveWorkbench.fullThreadEmpty')}</p>
              )
            ) : null}
          </section>
        </div>

        <div className="fmObjectiveWorkbenchColumn">
          <section aria-label={t('objectiveWorkbench.stancesTitle')}>
            <h2>{t('objectiveWorkbench.stancesTitle')}</h2>
            <div className="fmObjectiveWorkbenchStances">
              {roleStances.map((stance) => (
                <article key={stance.role} className="fmObjectiveWorkbenchStanceCard">
                  <header>
                    <strong>{stance.role}</strong>
                    <span>{stance.confidence}</span>
                  </header>
                  <p>
                    <span>{t('objectiveWorkbench.latestProposalLabel')}</span>
                    {stance.latestProposal
                      ? ` ${humanize(stance.latestProposal.proposalKind)}`
                      : ` ${t('objectiveWorkbench.none')}`}
                  </p>
                  <p>
                    <span>{t('objectiveWorkbench.latestChallengeLabel')}</span>
                    {stance.latestChallenge
                      ? ` ${stance.latestChallenge.body}`
                      : ` ${t('objectiveWorkbench.none')}`}
                  </p>
                  <p>
                    <span>{t('objectiveWorkbench.blockerLabel')}</span>
                    {stance.blocker ? ` ${stance.blocker}` : ` ${t('objectiveWorkbench.none')}`}
                  </p>
                  <p>
                    <span>{t('objectiveWorkbench.permissionsLabel')}</span>
                    {stance.permissions.length ? ` ${stance.permissions.join(', ')}` : ` ${t('objectiveWorkbench.none')}`}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section aria-label={t('objectiveWorkbench.runtimeTitle')}>
            <h2>{t('objectiveWorkbench.runtimeTitle')}</h2>
            <p>
              <span>{t('objectiveWorkbench.objectiveStatusLabel')}</span>
              {objectiveDetail ? ` ${humanize(objectiveDetail.status)}` : ` ${t('objectiveWorkbench.none')}`}
            </p>
            <p>
              <span>{t('objectiveWorkbench.threadStatusLabel')}</span>
              {threadDetail ? ` ${humanize(threadDetail.status)}` : ` ${t('objectiveWorkbench.none')}`}
            </p>
            <p>
              <span>{t('objectiveWorkbench.operatorInputLabel')}</span>
              {objectiveDetail
                ? ` ${objectiveDetail.requiresOperatorInput
                    ? t('objectiveWorkbench.operatorInputRequired')
                    : t('objectiveWorkbench.operatorInputNone')}`
                : ` ${t('objectiveWorkbench.none')}`}
            </p>
            <p>
              <span>{t('objectiveWorkbench.facilitatorRoundLabel')}</span>
              {threadDetail ? ` ${facilitatorRound}` : ` ${t('objectiveWorkbench.none')}`}
            </p>
            <p>
              <span>{t('objectiveWorkbench.facilitatorReasonLabel')}</span>
              {facilitatorReason ? ` ${facilitatorReason}` : ` ${t('objectiveWorkbench.none')}`}
            </p>
            <p>
              <span>{t('objectiveWorkbench.blockedReasonLabel')}</span>
              {blockedReason ? ` ${blockedReason}` : ` ${t('objectiveWorkbench.none')}`}
            </p>
            <p>
              <span>{t('objectiveWorkbench.selectedBudgetLabel')}</span>
              {selectedProposal ? ` ${formatBudgetSummary(selectedProposal.budget)}` : ` ${t('objectiveWorkbench.none')}`}
            </p>
            <p>
              <span>{t('objectiveWorkbench.selectedPolicyLabel')}</span>
              {selectedProposal?.toolPolicyId ? ` ${selectedProposal.toolPolicyId}` : ` ${t('objectiveWorkbench.none')}`}
            </p>
            <div className="fmObjectiveWorkbenchSectionHeader">
              <h3>{t('objectiveWorkbench.toolExecutionsTitle')}</h3>
            </div>
            {visibleToolExecutions.length === 0 ? (
              <p>{t('objectiveWorkbench.noToolExecutions')}</p>
            ) : (
              <div className="fmObjectiveWorkbenchProposalList">
                {visibleToolExecutions.map((execution) => (
                  <article key={execution.toolExecutionId} className="fmObjectiveWorkbenchProposalCard">
                    <strong>{execution.toolName}</strong>
                    <p>{humanize(execution.status)}</p>
                    <p>{execution.toolPolicyId ?? t('objectiveWorkbench.none')}</p>
                  </article>
                ))}
              </div>
            )}
            <div className="fmObjectiveWorkbenchSectionHeader">
              <h3>{t('objectiveWorkbench.subagentLineageTitle')}</h3>
            </div>
            {subagentLineage.length === 0 ? (
              <p>{t('objectiveWorkbench.noSubagentLineage')}</p>
            ) : (
              <div className="fmObjectiveWorkbenchProposalList">
                {subagentLineage.map((entry) => (
                  <article key={entry.subagentId} className="fmObjectiveWorkbenchProposalCard">
                    <strong>{entry.summary}</strong>
                    <p>{humanize(entry.status)}</p>
                    <p>{entry.toolPolicyId}</p>
                    <p>{entry.budget}</p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section aria-label={t('objectiveWorkbench.proposalsTitle')}>
            <h2>{t('objectiveWorkbench.proposalsTitle')}</h2>
            {selectedProposal ? (
              <p className="fmObjectiveWorkbenchProposalFocus">
                {t('objectiveWorkbench.activeProposalLine', {
                  proposalKind: humanize(selectedProposal.proposalKind)
                })}
              </p>
            ) : null}
            {visibleProposals.length === 0 ? (
              <p>{t('objectiveWorkbench.proposalsEmpty')}</p>
            ) : (
              <div className="fmObjectiveWorkbenchProposalList">
                {visibleProposals.map((proposal) => (
                  <article key={proposal.proposalId} className="fmObjectiveWorkbenchProposalCard">
                    <button
                      className="fmObjectiveWorkbenchProposalSelect"
                      type="button"
                      aria-pressed={activeProposalId === proposal.proposalId}
                      onClick={() => setActiveProposalId(proposal.proposalId)}
                    >
                      <strong>{humanize(proposal.proposalKind)}</strong>
                      <span>{humanize(proposal.status)} · {proposal.ownerRole}</span>
                    </button>
                    <p>{proposalSummary(proposal)}</p>
                    <p>{proposalSourceLabel(proposal)}</p>
                    <p>{proposal.toolPolicyId ?? t('objectiveWorkbench.none')}</p>
                    <p>{formatBudgetSummary(proposal.budget)}</p>
                    <div className="fmButtonRow">
                      {proposal.status === 'awaiting_operator' ? (
                        <>
                          <button
                            type="button"
                            disabled={pendingActionId === proposal.proposalId}
                            onClick={() => void handleProposalConfirmation(proposal, 'confirm')}
                          >
                            {t('objectiveWorkbench.confirmProposal')}
                          </button>
                          <button
                            type="button"
                            disabled={pendingActionId === proposal.proposalId}
                            onClick={() => void handleProposalConfirmation(proposal, 'block')}
                          >
                            {t('objectiveWorkbench.blockProposal')}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={pendingActionId === proposal.proposalId}
                            onClick={() => void handleProposalResponse(proposal, 'approve')}
                          >
                            {t('objectiveWorkbench.approveAsOwner')}
                          </button>
                          <button
                            type="button"
                            disabled={pendingActionId === proposal.proposalId}
                            onClick={() => void handleProposalResponse(proposal, 'challenge')}
                          >
                            {t('objectiveWorkbench.challengeAsGovernance')}
                          </button>
                          {proposal.allowVetoBy.includes('governance') ? (
                            <button
                              type="button"
                              disabled={pendingActionId === proposal.proposalId}
                              onClick={() => void handleProposalResponse(proposal, 'veto')}
                            >
                              {t('objectiveWorkbench.vetoAsGovernance')}
                            </button>
                          ) : null}
                        </>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </section>
  )
}
