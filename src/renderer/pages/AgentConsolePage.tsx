import { useEffect, useMemo, useState } from 'react'
import type {
  AgentAutonomyMode,
  AgentExecutionPreview,
  AgentMemoryRecord,
  AgentPolicyVersionRecord,
  AgentRole,
  AgentRunDetail,
  AgentRunExecutionOrigin,
  AgentRunRecord,
  AgentRuntimeSettingsRecord,
  AgentSuggestionRecord,
  AgentTaskKind,
  ImportPreflightResult,
  MemoryWorkspaceScope,
  RunAgentTaskInput,
  RunAgentTaskResult
} from '../../shared/archiveContracts'
import { getArchiveApi } from '../archiveApi'
import { AgentRunTimeline } from '../components/AgentRunTimeline'
import { useI18n } from '../i18n'

type AgentConsolePageProps = {
  onOpenReviewQueue?: () => void
  onOpenMemoryWorkspace?: (scope: MemoryWorkspaceScope) => void
}

type PendingSubmission =
  | {
    kind: 'task'
    input: RunAgentTaskInput
  }
  | {
    kind: 'suggestion'
    suggestionId: string
    input: RunAgentTaskInput
  }

const destructiveTaskKinds = new Set<AgentTaskKind>([
  'review.apply_safe_group',
  'review.apply_item_decision'
])

function asErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

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

function summarizeIngestionPreflight(
  result: ImportPreflightResult,
  t: (key: string, values?: Record<string, string | number>) => string
) {
  return t('agentConsole.ingestionPreflightSummary', {
    supportedCount: result.summary.supportedCount,
    unsupportedCount: result.summary.unsupportedCount
  })
}

function summarizePrompt(prompt: string) {
  const trimmed = prompt.trim()
  if (trimmed.length <= 72) {
    return trimmed
  }

  return `${trimmed.slice(0, 69)}...`
}

function requiresConfirmation(input: RunAgentTaskInput) {
  return 'taskKind' in input && Boolean(input.taskKind && destructiveTaskKinds.has(input.taskKind))
}

function proactiveTriggerLabelKey(triggerKind: AgentSuggestionRecord['triggerKind']) {
  switch (triggerKind) {
    case 'governance.failed_runs_detected':
      return 'agentConsole.proactiveTrigger.governance.failed_runs_detected'
    case 'review.safe_group_available':
      return 'agentConsole.proactiveTrigger.review.safe_group_available'
    case 'ingestion.failed_enrichment_job':
      return 'agentConsole.proactiveTrigger.ingestion.failed_enrichment_job'
  }
}

function autonomyModeLabelKey(mode: AgentAutonomyMode) {
  switch (mode) {
    case 'manual_only':
      return 'agentConsole.autonomyMode.manual_only'
    case 'suggest_safe_auto_run':
      return 'agentConsole.autonomyMode.suggest_safe_auto_run'
  }
}

function priorityLabelKey(priority: AgentSuggestionRecord['priority']) {
  switch (priority) {
    case 'low':
      return 'agentConsole.priority.low'
    case 'medium':
      return 'agentConsole.priority.medium'
    case 'high':
      return 'agentConsole.priority.high'
    case 'critical':
      return 'agentConsole.priority.critical'
  }
}

function executionOriginLabelKey(origin: AgentRunExecutionOrigin) {
  switch (origin) {
    case 'operator_manual':
      return 'agentConsole.executionOrigin.operator_manual'
    case 'operator_suggestion':
      return 'agentConsole.executionOrigin.operator_suggestion'
    case 'auto_runner':
      return 'agentConsole.executionOrigin.auto_runner'
  }
}

function inferDisplayRoles(run: Pick<AgentRunRecord, 'role' | 'assignedRoles'> | AgentRunDetail | null) {
  if (!run) {
    return []
  }

  if (run.assignedRoles.length) {
    return run.assignedRoles
  }

  return [run.role]
}

function getComparisonRole(run: Pick<AgentRunRecord, 'role' | 'targetRole'>) {
  return run.targetRole ?? run.role
}

function findPreviousComparableRun(
  runs: AgentRunRecord[],
  selectedRun: AgentRunDetail | null
) {
  if (!selectedRun) {
    return null
  }

  const selectedIndex = runs.findIndex((run) => run.runId === selectedRun.runId)
  const comparisonRole = getComparisonRole(selectedRun)
  const candidateRuns = selectedIndex >= 0 ? runs.slice(selectedIndex + 1) : runs

  return candidateRuns.find((run) => getComparisonRole(run) === comparisonRole) ?? null
}

export function AgentConsolePage(props: AgentConsolePageProps) {
  const { t } = useI18n()
  const archiveApi = useMemo(() => getArchiveApi(), [])
  const [prompt, setPrompt] = useState('')
  const [role, setRole] = useState<AgentRole>('orchestrator')
  const [runs, setRuns] = useState<AgentRunRecord[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [selectedRunDetail, setSelectedRunDetail] = useState<AgentRunDetail | null>(null)
  const [pendingSubmission, setPendingSubmission] = useState<PendingSubmission | null>(null)
  const [confirmationToken, setConfirmationToken] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [ingestionPreflightSummary, setIngestionPreflightSummary] = useState<string | null>(null)
  const [ingestionResultMessage, setIngestionResultMessage] = useState<string | null>(null)
  const [operationalMemories, setOperationalMemories] = useState<AgentMemoryRecord[]>([])
  const [policyVersions, setPolicyVersions] = useState<AgentPolicyVersionRecord[]>([])
  const [operationalStateError, setOperationalStateError] = useState<string | null>(null)
  const [isOperationalStateLoading, setIsOperationalStateLoading] = useState(false)
  const [executionPreview, setExecutionPreview] = useState<AgentExecutionPreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<AgentSuggestionRecord[]>([])
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false)
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null)
  const [suggestionsStatusMessage, setSuggestionsStatusMessage] = useState<string | null>(null)
  const [activeSuggestionId, setActiveSuggestionId] = useState<string | null>(null)
  const [runtimeSettings, setRuntimeSettings] = useState<AgentRuntimeSettingsRecord | null>(null)
  const [isRuntimeSettingsLoading, setIsRuntimeSettingsLoading] = useState(false)
  const [runtimeSettingsError, setRuntimeSettingsError] = useState<string | null>(null)
  const [runtimeSettingsStatusMessage, setRuntimeSettingsStatusMessage] = useState<string | null>(null)

  const refreshRuns = async (preferredRunId?: string) => {
    const nextRuns = await archiveApi.listAgentRuns()
    setRuns(nextRuns)
    setSelectedRunId((current) => preferredRunId ?? current ?? nextRuns[0]?.runId ?? null)
  }

  const loadSuggestions = async () => {
    setIsSuggestionsLoading(true)
    setSuggestionsError(null)

    try {
      const nextSuggestions = await archiveApi.listAgentSuggestions({
        status: 'suggested'
      })
      setSuggestions(nextSuggestions)
      return nextSuggestions
    } catch (error) {
      setSuggestions([])
      setSuggestionsError(t('agentConsole.proactiveInboxLoadFailed', {
        message: asErrorMessage(error)
      }))
      return []
    } finally {
      setIsSuggestionsLoading(false)
    }
  }

  const loadRuntimeSettings = async () => {
    setIsRuntimeSettingsLoading(true)
    setRuntimeSettingsError(null)

    try {
      const nextSettings = await archiveApi.getAgentRuntimeSettings()
      setRuntimeSettings(nextSettings)
      return nextSettings
    } catch (error) {
      setRuntimeSettings(null)
      setRuntimeSettingsError(t('agentConsole.autonomyModeLoadFailed', {
        message: asErrorMessage(error)
      }))
      return null
    } finally {
      setIsRuntimeSettingsLoading(false)
    }
  }

  useEffect(() => {
    void refreshRuns()
  }, [archiveApi])

  useEffect(() => {
    void loadSuggestions()
  }, [archiveApi])

  useEffect(() => {
    void loadRuntimeSettings()
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
    }).catch((error: unknown) => {
      if (!cancelled) {
        setErrorMessage(error instanceof Error ? error.message : String(error))
      }
    })

    return () => {
      cancelled = true
    }
  }, [archiveApi, selectedRunId])

  useEffect(() => {
    if (role !== 'ingestion') {
      setIngestionPreflightSummary(null)
      setIngestionResultMessage(null)
    }
  }, [role])

  useEffect(() => {
    const trimmedPrompt = prompt.trim()
    if (trimmedPrompt.length === 0) {
      setExecutionPreview(null)
      setPreviewError(null)
      setIsPreviewLoading(false)
      return
    }

    let cancelled = false
    const previewInput = buildTaskInput(trimmedPrompt, role)
    setIsPreviewLoading(true)
    setPreviewError(null)

    archiveApi.previewAgentTask(previewInput).then((nextPreview) => {
      if (cancelled) {
        return
      }

      setExecutionPreview(nextPreview)
    }).catch((error: unknown) => {
      if (cancelled) {
        return
      }

      setExecutionPreview(null)
      setPreviewError(asErrorMessage(error))
    }).finally(() => {
      if (!cancelled) {
        setIsPreviewLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [archiveApi, prompt, role])

  const operationalStateRole = selectedRunDetail?.targetRole ?? selectedRunDetail?.role ?? role

  useEffect(() => {
    let cancelled = false
    setIsOperationalStateLoading(true)
    setOperationalStateError(null)

    Promise.all([
      archiveApi.listAgentMemories({ role: operationalStateRole }),
      archiveApi.listAgentPolicyVersions({ role: operationalStateRole })
    ]).then(([nextMemories, nextPolicyVersions]) => {
      if (cancelled) {
        return
      }

      setOperationalMemories(nextMemories)
      setPolicyVersions(nextPolicyVersions)
    }).catch((error: unknown) => {
      if (cancelled) {
        return
      }

      setOperationalMemories([])
      setPolicyVersions([])
      setOperationalStateError(asErrorMessage(error))
    }).finally(() => {
      if (!cancelled) {
        setIsOperationalStateLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [archiveApi, operationalStateRole])

  const executeTask = async (input: RunAgentTaskInput) => {
    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const result = await archiveApi.runAgentTask(input) as RunAgentTaskResult
      await refreshRuns(result.runId)
      setPendingSubmission(null)
      setConfirmationToken('')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  const executeSuggestion = async (suggestionId: string, confirmationTokenValue?: string) => {
    setIsSubmitting(true)
    setActiveSuggestionId(suggestionId)
    setSuggestionsError(null)
    setSuggestionsStatusMessage(null)

    try {
      const result = await archiveApi.runAgentSuggestion(
        confirmationTokenValue
          ? { suggestionId, confirmationToken: confirmationTokenValue }
          : { suggestionId }
      )

      await loadSuggestions()

      if (!result) {
        setSuggestionsError(t('agentConsole.proactiveInboxMissingSuggestion'))
        return
      }

      await refreshRuns(result.runId)
      setPendingSubmission(null)
      setConfirmationToken('')

      if (result.status === 'completed') {
        setSuggestionsStatusMessage(t('agentConsole.proactiveInboxRunCompleted'))
      } else {
        setSuggestionsError(t('agentConsole.proactiveInboxRunFailed', {
          message: result.latestAssistantResponse ?? result.status
        }))
      }
    } catch (error) {
      setSuggestionsError(t('agentConsole.proactiveInboxRunFailed', {
        message: asErrorMessage(error)
      }))
    } finally {
      setIsSubmitting(false)
      setActiveSuggestionId(null)
    }
  }

  const handleRefreshSuggestions = async () => {
    setSuggestionsError(null)
    setSuggestionsStatusMessage(null)
    setIsSuggestionsLoading(true)

    try {
      await archiveApi.refreshAgentSuggestions()
      await loadSuggestions()
      setSuggestionsStatusMessage(t('agentConsole.proactiveInboxRefreshed'))
    } catch (error) {
      setSuggestionsError(t('agentConsole.proactiveInboxRefreshFailed', {
        message: asErrorMessage(error)
      }))
    } finally {
      setIsSuggestionsLoading(false)
    }
  }

  const handleAutonomyModeChange = async (autonomyMode: AgentAutonomyMode) => {
    setIsRuntimeSettingsLoading(true)
    setRuntimeSettingsError(null)
    setRuntimeSettingsStatusMessage(null)

    try {
      const nextSettings = await archiveApi.updateAgentRuntimeSettings({ autonomyMode })
      setRuntimeSettings(nextSettings)
      await archiveApi.refreshAgentSuggestions()
      await loadSuggestions()
      await refreshRuns()
      setRuntimeSettingsStatusMessage(t('agentConsole.autonomyModeUpdated', {
        mode: t(autonomyModeLabelKey(nextSettings.autonomyMode))
      }))
    } catch (error) {
      setRuntimeSettingsError(t('agentConsole.autonomyModeUpdateFailed', {
        message: asErrorMessage(error)
      }))
    } finally {
      setIsRuntimeSettingsLoading(false)
    }
  }

  const handleDismissSuggestion = async (suggestionId: string) => {
    setIsSubmitting(true)
    setActiveSuggestionId(suggestionId)
    setSuggestionsError(null)
    setSuggestionsStatusMessage(null)

    try {
      await archiveApi.dismissAgentSuggestion({ suggestionId })
      await loadSuggestions()
      setPendingSubmission((current) => {
        if (current?.kind === 'suggestion' && current.suggestionId === suggestionId) {
          return null
        }

        return current
      })
      setConfirmationToken('')
      setSuggestionsStatusMessage(t('agentConsole.proactiveInboxDismissed'))
    } catch (error) {
      setSuggestionsError(t('agentConsole.proactiveInboxDismissFailed', {
        message: asErrorMessage(error)
      }))
    } finally {
      setIsSubmitting(false)
      setActiveSuggestionId(null)
    }
  }

  const handleRunSuggestion = async (suggestion: AgentSuggestionRecord) => {
    if (requiresConfirmation(suggestion.taskInput)) {
      setPendingSubmission({
        kind: 'suggestion',
        suggestionId: suggestion.suggestionId,
        input: suggestion.taskInput
      })
      setConfirmationToken('')
      setSuggestionsError(null)
      setSuggestionsStatusMessage(null)
      return
    }

    await executeSuggestion(suggestion.suggestionId)
  }

  const handleSubmit = async () => {
    const nextInput = buildTaskInput(prompt, role)
    if (nextInput.role === 'ingestion' && nextInput.taskKind === 'ingestion.import_batch') {
      setIsSubmitting(true)
      setErrorMessage(null)
      setIngestionPreflightSummary(null)
      setIngestionResultMessage(null)

      try {
        const sourcePaths = await archiveApi.selectImportFiles()
        if (sourcePaths.length === 0) {
          return
        }

        const preflightResult = await archiveApi.preflightImportBatch({ sourcePaths })
        setIngestionPreflightSummary(summarizeIngestionPreflight(preflightResult, t))

        const supportedSourcePaths = preflightResult.items
          .filter((item) => item.isSupported)
          .map((item) => item.sourcePath)

        if (supportedSourcePaths.length === 0) {
          setErrorMessage(t('agentConsole.ingestionNoSupportedFiles'))
          return
        }

        const createdBatch = await archiveApi.createImportBatch({
          sourcePaths: supportedSourcePaths,
          sourceLabel: t('agentConsole.ingestionSourceLabel')
        })
        const importedCount = createdBatch.summary?.frozenCount ?? supportedSourcePaths.length
        setIngestionResultMessage(t('agentConsole.ingestionCompleted', {
          batchId: createdBatch.batchId,
          count: importedCount
        }))
        return
      } catch (error) {
        setErrorMessage(t('agentConsole.ingestionImportFailed', {
          message: asErrorMessage(error)
        }))
        return
      } finally {
        setIsSubmitting(false)
      }
    }

    if (requiresConfirmation(nextInput) && !('confirmationToken' in nextInput)) {
      setPendingSubmission({
        kind: 'task',
        input: nextInput
      })
      setErrorMessage(null)
      return
    }

    await executeTask(nextInput)
  }

  const handleConfirmRun = async () => {
    if (!pendingSubmission || confirmationToken.trim().length === 0) {
      return
    }

    if (pendingSubmission.kind === 'suggestion') {
      await executeSuggestion(pendingSubmission.suggestionId, confirmationToken.trim())
      return
    }

    await executeTask({
      ...pendingSubmission.input,
      confirmationToken: confirmationToken.trim()
    } as RunAgentTaskInput)
  }

  const latestAssistantResponse = selectedRunDetail?.latestAssistantResponse ?? null
  const displayRoles = inferDisplayRoles(selectedRunDetail)
  const comparisonRun = findPreviousComparableRun(runs, selectedRunDetail)
  const comparisonRole = selectedRunDetail ? getComparisonRole(selectedRunDetail) : null
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
                const runRoles = inferDisplayRoles(run)
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
                      <span className="fmAgentRunMeta">{t('agentConsole.executionOriginLine', {
                        origin: t(executionOriginLabelKey(run.executionOrigin))
                      })}</span>
                      {runRoles.length ? (
                        <span className="fmAgentRunMeta">{t('agentConsole.assignedRolesLine', { roles: runRoles.join(', ') })}</span>
                      ) : null}
                      {run.latestAssistantResponse ? (
                        <span className="fmAgentRunMeta">{run.latestAssistantResponse}</span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </aside>

        <div className="fmAgentMain">
          <section className="fmAgentCard" aria-label={t('agentConsole.proactiveInboxTitle')}>
            <div className="fmAgentActionRow">
              <h2>{t('agentConsole.proactiveInboxTitle')}</h2>
              <button
                type="button"
                onClick={() => void handleRefreshSuggestions()}
                disabled={isSubmitting || isSuggestionsLoading}
              >
                {t('agentConsole.proactiveInboxRefresh')}
              </button>
            </div>

            <label className="fmAgentField">
              <span>{t('agentConsole.autonomyModeTitle')}</span>
              <select
                aria-label={t('agentConsole.autonomyModeTitle')}
                value={runtimeSettings?.autonomyMode ?? 'manual_only'}
                onChange={(event) => void handleAutonomyModeChange(event.target.value as AgentAutonomyMode)}
                disabled={isSubmitting || isSuggestionsLoading || isRuntimeSettingsLoading}
              >
                <option value="manual_only">{t('agentConsole.autonomyMode.manual_only')}</option>
                <option value="suggest_safe_auto_run">{t('agentConsole.autonomyMode.suggest_safe_auto_run')}</option>
              </select>
            </label>

            {runtimeSettingsStatusMessage ? <div role="status">{runtimeSettingsStatusMessage}</div> : null}
            {runtimeSettingsError ? <div role="alert">{runtimeSettingsError}</div> : null}
            {suggestionsStatusMessage ? <div role="status">{suggestionsStatusMessage}</div> : null}
            {suggestionsError ? <div role="alert">{suggestionsError}</div> : null}

            {isSuggestionsLoading ? (
              <p>{t('common.loading')}</p>
            ) : suggestions.length === 0 ? (
              <p>{t('agentConsole.proactiveInboxEmpty')}</p>
            ) : (
              <ul className="fmAgentOperationalList">
                {suggestions.map((suggestion) => {
                  const isActive = activeSuggestionId === suggestion.suggestionId

                  return (
                    <li key={suggestion.suggestionId}>
                      <strong>{t(proactiveTriggerLabelKey(suggestion.triggerKind))}</strong>
                      <p>{suggestion.taskInput.prompt}</p>
                      <p>{t('agentConsole.targetRoleLine', { role: suggestion.role })}</p>
                      <p>{t('agentConsole.previewTaskKindLine', { taskKind: suggestion.taskKind })}</p>
                      <p>{t('agentConsole.priorityLine', {
                        priority: t(priorityLabelKey(suggestion.priority))
                      })}</p>
                      <p>{t('agentConsole.rationaleLine', {
                        rationale: suggestion.rationale || t('common.none')
                      })}</p>
                      <p>{t('agentConsole.autoRunEligibilityLine', {
                        value: suggestion.autoRunnable ? t('common.yes') : t('common.no')
                      })}</p>
                      {suggestion.followUpOfSuggestionId ? (
                        <p>{t('agentConsole.followUpLine', {
                          suggestionId: suggestion.followUpOfSuggestionId
                        })}</p>
                      ) : null}
                      <div className="fmAgentActionRow">
                        <button
                          type="button"
                          onClick={() => void handleRunSuggestion(suggestion)}
                          disabled={isSubmitting || isSuggestionsLoading || isActive}
                        >
                          {t('agentConsole.proactiveInboxRun')}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDismissSuggestion(suggestion.suggestionId)}
                          disabled={isSubmitting || isSuggestionsLoading || isActive}
                        >
                          {t('agentConsole.proactiveInboxDismiss')}
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

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
                {pendingSubmission.kind === 'suggestion' ? (
                  <p>{summarizePrompt(pendingSubmission.input.prompt)}</p>
                ) : null}
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

            {(prompt.trim().length > 0 || isPreviewLoading || previewError) ? (
              <div className="fmAgentPreview" role="status">
                <h2>{t('agentConsole.executionPreviewTitle')}</h2>
                {isPreviewLoading ? (
                  <p>{t('common.loading')}</p>
                ) : previewError ? (
                  <p>{t('agentConsole.executionPreviewFailed', { message: previewError })}</p>
                ) : executionPreview ? (
                  <>
                    <p>{t('agentConsole.previewTaskKindLine', { taskKind: executionPreview.taskKind })}</p>
                    <p>{t('agentConsole.targetRoleLine', { role: executionPreview.targetRole })}</p>
                    <p>{t('agentConsole.assignedRolesLine', { roles: executionPreview.assignedRoles.join(', ') || t('common.none') })}</p>
                    <p>{executionPreview.requiresConfirmation
                      ? t('agentConsole.previewRequiresConfirmation')
                      : t('agentConsole.previewNoConfirmation')}</p>
                  </>
                ) : null}
              </div>
            ) : null}

            {ingestionPreflightSummary ? <div role="status">{ingestionPreflightSummary}</div> : null}
            {ingestionResultMessage ? <div role="status">{ingestionResultMessage}</div> : null}
            {errorMessage ? <div role="alert">{errorMessage}</div> : null}
          </section>

          <section className="fmAgentCard">
            <h2>{t('agentConsole.detailTitle')}</h2>
            {selectedRunDetail ? (
              <div className="fmAgentDetail">
                <p>{t('agentConsole.statusLine', { status: selectedRunDetail.status })}</p>
                <p>{t('agentConsole.executionOriginLine', {
                  origin: t(executionOriginLabelKey(selectedRunDetail.executionOrigin))
                })}</p>
                <p>{t('agentConsole.assignedRolesLine', { roles: displayRoles.join(', ') || t('common.none') })}</p>
                <p>{t('agentConsole.targetRoleLine', { role: selectedRunDetail.targetRole ?? selectedRunDetail.role })}</p>

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

                {comparisonRun && comparisonRole ? (
                  <div className="fmAgentCompare">
                    <h3>{t('agentConsole.comparedWithPreviousRun', { role: comparisonRole })}</h3>
                    <p>{t('agentConsole.statusLine', { status: comparisonRun.status })}</p>
                    <p>{t('agentConsole.assignedRolesLine', { roles: inferDisplayRoles(comparisonRun).join(', ') || t('common.none') })}</p>
                    <p>{comparisonRun.latestAssistantResponse ?? t('agentConsole.latestAssistantResponseEmpty')}</p>
                  </div>
                ) : null}

                <div className="fmAgentOperationalState">
                  <h3>{t('agentConsole.operationalMemoryTitle')}</h3>
                  {isOperationalStateLoading ? (
                    <p>{t('common.loading')}</p>
                  ) : operationalStateError ? (
                    <p>{t('agentConsole.operationalStateLoadFailed', { message: operationalStateError })}</p>
                  ) : operationalMemories.length === 0 ? (
                    <p>{t('agentConsole.operationalMemoryEmpty', { role: operationalStateRole })}</p>
                  ) : (
                    <ul className="fmAgentOperationalList">
                      {operationalMemories.map((memory) => (
                        <li key={memory.memoryId}>
                          <strong>{memory.memoryKey}</strong>
                          <p>{memory.memoryValue}</p>
                        </li>
                      ))}
                    </ul>
                  )}

                  <h3>{t('agentConsole.policyHistoryTitle')}</h3>
                  {isOperationalStateLoading ? (
                    <p>{t('common.loading')}</p>
                  ) : operationalStateError ? (
                    <p>{t('agentConsole.operationalStateLoadFailed', { message: operationalStateError })}</p>
                  ) : policyVersions.length === 0 ? (
                    <p>{t('agentConsole.policyHistoryEmpty', { role: operationalStateRole })}</p>
                  ) : (
                    <ul className="fmAgentOperationalList">
                      {policyVersions.map((policyVersion) => (
                        <li key={policyVersion.policyVersionId}>
                          <strong>{policyVersion.policyKey}</strong>
                          <p>{policyVersion.policyBody}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <AgentRunTimeline
                  title={t('agentConsole.messageTimelineTitle')}
                  emptyLabel={t('agentConsole.messageTimelineEmpty')}
                  messages={selectedRunDetail.messages}
                />
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
