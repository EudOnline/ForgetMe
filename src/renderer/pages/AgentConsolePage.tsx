import { useEffect, useMemo, useState } from 'react'
import type {
  AgentRole,
  AgentRunDetail,
  AgentRunRecord,
  AgentTaskKind,
  MemoryWorkspaceScope,
  RunAgentTaskInput
} from '../../shared/archiveContracts'
import { getArchiveApi } from '../archiveApi'
import { useI18n } from '../i18n'

type AgentConsolePageProps = {
  onOpenReviewQueue?: () => void
  onOpenMemoryWorkspace?: (scope: MemoryWorkspaceScope) => void
}

type AgentConsoleRunMeta = {
  assignedRoles?: AgentRole[]
  latestAssistantResponse?: string
}

type AgentConsoleRunResult = {
  runId: string
  status: string
  assignedRoles?: AgentRole[]
}

type PendingSubmission = {
  input: RunAgentTaskInput
}

const destructiveTaskKinds = new Set<AgentTaskKind>([
  'review.apply_safe_group',
  'review.apply_item_decision'
])

function inferTaskKind(role: AgentRole, prompt: string): AgentTaskKind | undefined {
  const normalizedPrompt = prompt.toLowerCase()

  switch (role) {
    case 'orchestrator':
      return undefined
    case 'ingestion':
      if (/\b(job-[a-z0-9-]+)\b/i.test(prompt) || /rerun/.test(normalizedPrompt)) {
        return 'ingestion.rerun_enrichment'
      }
      if (/\b(file-[a-z0-9-]+)\b/i.test(prompt) || /evidence/.test(normalizedPrompt)) {
        return 'ingestion.summarize_document_evidence'
      }
      return 'ingestion.import_batch'
    case 'review':
      if ((/approve|apply/.test(normalizedPrompt)) && /\bgroup-[a-z0-9-]+\b/i.test(prompt)) {
        return 'review.apply_safe_group'
      }
      if (/approve|reject/.test(normalizedPrompt) && /\bitem\b/.test(normalizedPrompt)) {
        return 'review.apply_item_decision'
      }
      if (/suggest/.test(normalizedPrompt) || /safe group/.test(normalizedPrompt)) {
        return 'review.suggest_safe_group_action'
      }
      return 'review.summarize_queue'
    case 'workspace':
      if (/publish/.test(normalizedPrompt) || /\breview-[a-z0-9-]+\b/i.test(prompt)) {
        return 'workspace.publish_draft'
      }
      if (/compare/.test(normalizedPrompt)) {
        return 'workspace.compare'
      }
      return 'workspace.ask_memory'
    case 'governance':
      if (/record feedback:/.test(normalizedPrompt)) {
        return 'governance.record_feedback'
      }
      if (/propose policy update:/.test(normalizedPrompt)) {
        return 'governance.propose_policy_update'
      }
      return 'governance.summarize_failures'
  }
}

function buildTaskInput(
  prompt: string,
  role: AgentRole,
  confirmationToken?: string
): RunAgentTaskInput {
  const trimmedPrompt = prompt.trim()
  if (role === 'orchestrator') {
    return confirmationToken
      ? { prompt: trimmedPrompt, role, confirmationToken }
      : { prompt: trimmedPrompt, role }
  }

  const taskKind = inferTaskKind(role, trimmedPrompt)
  return {
    prompt: trimmedPrompt,
    role,
    ...(taskKind ? { taskKind } : {}),
    ...(confirmationToken ? { confirmationToken } : {})
  } as RunAgentTaskInput
}

function getLatestAssistantResponse(detail: AgentRunDetail | null) {
  if (!detail) {
    return null
  }

  return [...detail.messages].reverse().find((message) => message.sender === 'agent')?.content ?? null
}

function summarizePrompt(prompt: string) {
  const trimmed = prompt.trim()
  if (trimmed.length <= 72) {
    return trimmed
  }

  return `${trimmed.slice(0, 69)}...`
}

function inferDisplayRoles(detail: AgentRunDetail | null, runMeta: AgentConsoleRunMeta | undefined) {
  if (runMeta?.assignedRoles?.length) {
    return runMeta.assignedRoles
  }

  if (!detail) {
    return []
  }

  return [detail.role]
}

export function AgentConsolePage(props: AgentConsolePageProps) {
  const { t } = useI18n()
  const archiveApi = useMemo(() => getArchiveApi(), [])
  const [prompt, setPrompt] = useState('')
  const [role, setRole] = useState<AgentRole>('orchestrator')
  const [runs, setRuns] = useState<AgentRunRecord[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [selectedRunDetail, setSelectedRunDetail] = useState<AgentRunDetail | null>(null)
  const [runMetaById, setRunMetaById] = useState<Record<string, AgentConsoleRunMeta>>({})
  const [pendingSubmission, setPendingSubmission] = useState<PendingSubmission | null>(null)
  const [confirmationToken, setConfirmationToken] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const refreshRuns = async (preferredRunId?: string) => {
    const nextRuns = await archiveApi.listAgentRuns()
    setRuns(nextRuns)
    setSelectedRunId((current) => preferredRunId ?? current ?? nextRuns[0]?.runId ?? null)
  }

  useEffect(() => {
    void refreshRuns()
  }, [archiveApi])

  useEffect(() => {
    if (!selectedRunId) {
      setSelectedRunDetail(null)
      return
    }

    let cancelled = false
    void archiveApi.getAgentRun({ runId: selectedRunId }).then((detail) => {
      if (cancelled) {
        return
      }

      setSelectedRunDetail(detail)
      const latestAssistantResponse = getLatestAssistantResponse(detail)
      if (!detail || !latestAssistantResponse) {
        return
      }

      setRunMetaById((current) => ({
        ...current,
        [detail.runId]: {
          ...current[detail.runId],
          latestAssistantResponse
        }
      }))
    }).catch((error: unknown) => {
      if (!cancelled) {
        setErrorMessage(error instanceof Error ? error.message : String(error))
      }
    })

    return () => {
      cancelled = true
    }
  }, [archiveApi, selectedRunId])

  const executeTask = async (input: RunAgentTaskInput) => {
    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const result = await archiveApi.runAgentTask(input) as AgentConsoleRunResult
      if (result.assignedRoles?.length) {
        setRunMetaById((current) => ({
          ...current,
          [result.runId]: {
            ...current[result.runId],
            assignedRoles: result.assignedRoles
          }
        }))
      }
      await refreshRuns(result.runId)
      setPendingSubmission(null)
      setConfirmationToken('')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmit = async () => {
    const nextInput = buildTaskInput(prompt, role)
    if ('taskKind' in nextInput && nextInput.taskKind && destructiveTaskKinds.has(nextInput.taskKind) && !('confirmationToken' in nextInput)) {
      setPendingSubmission({ input: nextInput })
      setErrorMessage(null)
      return
    }

    await executeTask(nextInput)
  }

  const handleConfirmRun = async () => {
    if (!pendingSubmission || confirmationToken.trim().length === 0) {
      return
    }

    await executeTask({
      ...pendingSubmission.input,
      confirmationToken: confirmationToken.trim()
    } as RunAgentTaskInput)
  }

  const selectedRunMeta = selectedRunId ? runMetaById[selectedRunId] : undefined
  const latestAssistantResponse = selectedRunMeta?.latestAssistantResponse ?? getLatestAssistantResponse(selectedRunDetail)
  const displayRoles = inferDisplayRoles(selectedRunDetail, selectedRunMeta)
  const openReviewVisible = selectedRunDetail?.taskKind?.startsWith('review.') || displayRoles.includes('review')
  const openWorkspaceVisible = selectedRunDetail?.taskKind?.startsWith('workspace.') || displayRoles.includes('workspace')

  return (
    <section className="fmAgentConsole">
      <header className="fmAgentConsoleHeader">
        <h1>{t('agentConsole.title')}</h1>
        <p>{t('agentConsole.description')}</p>
      </header>

      <div className="fmAgentConsoleLayout">
        <aside className="fmAgentHistory" aria-label={t('agentConsole.historyTitle')}>
          <h2>{t('agentConsole.historyTitle')}</h2>
          {runs.length === 0 ? (
            <p>{t('agentConsole.historyEmpty')}</p>
          ) : (
            <ul className="fmAgentHistoryList">
              {runs.map((run) => {
                const runMeta = runMetaById[run.runId]
                return (
                  <li key={run.runId}>
                    <button
                      className="fmAgentRunItem"
                      type="button"
                      onClick={() => setSelectedRunId(run.runId)}
                      aria-pressed={selectedRunId === run.runId}
                    >
                      <span className="fmAgentRunPrompt">{summarizePrompt(run.prompt)}</span>
                      <span className="fmAgentRunMeta">{t('agentConsole.statusLine', { status: run.status })}</span>
                      {runMeta?.assignedRoles?.length ? (
                        <span className="fmAgentRunMeta">{t('agentConsole.assignedRolesLine', { roles: runMeta.assignedRoles.join(', ') })}</span>
                      ) : null}
                      {runMeta?.latestAssistantResponse ? (
                        <span className="fmAgentRunMeta">{runMeta.latestAssistantResponse}</span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </aside>

        <div className="fmAgentMain">
          <section className="fmAgentCard">
            <div className="fmAgentComposer">
              <label className="fmAgentField">
                <span>{t('agentConsole.promptLabel')}</span>
                <textarea
                  aria-label={t('agentConsole.promptLabel')}
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder={t('agentConsole.promptPlaceholder')}
                  rows={4}
                />
              </label>

              <label className="fmAgentField">
                <span>{t('agentConsole.roleLabel')}</span>
                <select
                  aria-label={t('agentConsole.roleLabel')}
                  value={role}
                  onChange={(event) => setRole(event.target.value as AgentRole)}
                >
                  <option value="orchestrator">orchestrator</option>
                  <option value="review">review</option>
                  <option value="workspace">workspace</option>
                  <option value="ingestion">ingestion</option>
                  <option value="governance">governance</option>
                </select>
              </label>

              <button type="button" onClick={() => void handleSubmit()} disabled={isSubmitting || prompt.trim().length === 0}>
                {t('agentConsole.runButton')}
              </button>
            </div>

            {pendingSubmission ? (
              <div className="fmAgentConfirm" role="status">
                <p>{t('agentConsole.confirmationRequired')}</p>
                <label className="fmAgentField">
                  <span>{t('agentConsole.confirmationTokenLabel')}</span>
                  <input
                    aria-label={t('agentConsole.confirmationTokenLabel')}
                    value={confirmationToken}
                    onChange={(event) => setConfirmationToken(event.target.value)}
                  />
                </label>
                <div className="fmAgentActionRow">
                  <button type="button" onClick={() => void handleConfirmRun()} disabled={isSubmitting || confirmationToken.trim().length === 0}>
                    {t('agentConsole.confirmButton')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingSubmission(null)
                      setConfirmationToken('')
                    }}
                    disabled={isSubmitting}
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            ) : null}

            {errorMessage ? <div role="alert">{errorMessage}</div> : null}
          </section>

          <section className="fmAgentCard">
            <h2>{t('agentConsole.detailTitle')}</h2>
            {selectedRunDetail ? (
              <div className="fmAgentDetail">
                <p>{t('agentConsole.statusLine', { status: selectedRunDetail.status })}</p>
                <p>{t('agentConsole.assignedRolesLine', { roles: displayRoles.join(', ') || t('common.none') })}</p>

                {(openReviewVisible || openWorkspaceVisible) ? (
                  <div className="fmAgentActionRow">
                    {openReviewVisible ? (
                      <button type="button" onClick={() => props.onOpenReviewQueue?.()}>
                        {t('agentConsole.openReviewQueue')}
                      </button>
                    ) : null}
                    {openWorkspaceVisible ? (
                      <button type="button" onClick={() => props.onOpenMemoryWorkspace?.({ kind: 'global' })}>
                        {t('agentConsole.openMemoryWorkspace')}
                      </button>
                    ) : null}
                  </div>
                ) : null}

                <h3>{t('agentConsole.latestAssistantResponseTitle')}</h3>
                <p>{latestAssistantResponse ?? t('agentConsole.latestAssistantResponseEmpty')}</p>
              </div>
            ) : (
              <p>{t('agentConsole.detailEmpty')}</p>
            )}
          </section>
        </div>
      </div>
    </section>
  )
}
