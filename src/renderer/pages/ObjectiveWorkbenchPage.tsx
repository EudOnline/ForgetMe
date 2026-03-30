import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type {
  AgentObjectiveDetail,
  AgentObjectiveRecord,
  AgentProposalRecord,
  AgentRole,
  AgentThreadDetail,
  CreateAgentObjectiveInput
} from '../../shared/archiveContracts'
import { getArchiveApi } from '../archiveApi'
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
  const archiveApi = useMemo(() => getArchiveApi(), [])
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

  const refreshObjectives = async (preferredObjectiveId?: string | null) => {
    setIsLoading(true)
    setErrorMessage(null)

    try {
      const nextObjectives = await archiveApi.listAgentObjectives()
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
  }

  const loadObjectiveDetail = async (objectiveId: string) => {
    try {
      const detail = await archiveApi.getAgentObjective({ objectiveId })
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
  }

  const loadThreadDetail = async (threadId: string) => {
    try {
      const detail = await archiveApi.getAgentThread({ threadId })
      setThreadDetail(detail)
    } catch (error) {
      setThreadDetail(null)
      setErrorMessage(t('objectiveWorkbench.loadFailed', {
        message: asErrorMessage(error)
      }))
    }
  }

  useEffect(() => {
    void refreshObjectives()
  }, [])

  useEffect(() => {
    if (!selectedObjectiveId) {
      setObjectiveDetail(null)
      return
    }

    void loadObjectiveDetail(selectedObjectiveId)
  }, [selectedObjectiveId])

  useEffect(() => {
    if (!selectedThreadId) {
      setThreadDetail(null)
      return
    }

    void loadThreadDetail(selectedThreadId)
  }, [selectedThreadId])

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

  const handleCreateObjective = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!titleInput.trim() || !promptInput.trim()) {
      return
    }

    setIsCreating(true)
    setErrorMessage(null)
    setStatusMessage(null)

    try {
      const created = await archiveApi.createAgentObjective({
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
      await archiveApi.respondToAgentProposal({
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
      await archiveApi.confirmAgentProposal({
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
                      <span>{message.kind}</span>
                      <strong>{message.fromParticipantId}</strong>
                      <p>{message.body}</p>
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
