import type { DecisionJournalEntry } from '../../shared/archiveContracts'
import { useI18n } from '../i18n'

type Translator = (key: string, params?: Record<string, string | number | boolean | null | undefined>) => string

function readString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function readPositiveNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function formatDecision(entry: DecisionJournalEntry, t: Translator) {
  if (entry.decisionLabel) {
    return entry.decisionLabel
  }

  if (entry.targetType === 'decision_batch' && entry.decisionType === 'approve_safe_review_group') {
    return t('undoHistory.safeBatchApprove')
  }

  return entry.decisionType
}

function formatTarget(entry: DecisionJournalEntry, t: Translator, language: 'en' | 'zh-CN') {
  if (entry.targetLabel) {
    return entry.targetLabel
  }

  if (entry.targetType !== 'decision_batch') {
    return entry.targetType
  }

  const personName = readString(entry.operationPayload.canonicalPersonName)
  const fieldKey = readString(entry.operationPayload.fieldKey)
  const itemCount = readPositiveNumber(entry.operationPayload.itemCount)
  const itemCountLabel = itemCount
    ? language === 'zh-CN'
      ? t('undoHistory.itemsCount', { count: itemCount })
      : `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`
    : null
  const summaryParts = [
    personName,
    fieldKey,
    itemCountLabel
  ].filter((value): value is string => Boolean(value))

  if (summaryParts.length > 0) {
    return summaryParts.join(' · ')
  }

  return t('undoHistory.decisionBatch')
}

function formatUndoLabel(entry: DecisionJournalEntry, t: Translator) {
  return entry.targetType === 'decision_batch' ? t('undoHistory.undoBatch') : t('undoHistory.undo')
}

export function UndoHistoryTable(props: {
  entries: DecisionJournalEntry[]
  onUndo?: (journalId: string) => void
  onReplay?: (entry: DecisionJournalEntry) => void
}) {
  const { language, t } = useI18n()

  if (props.entries.length === 0) {
    return <p>{t('undoHistory.none')}</p>
  }

  return (
    <table>
      <thead>
        <tr>
          <th>{t('undoHistory.decision')}</th>
          <th>{t('undoHistory.target')}</th>
          <th>{t('undoHistory.replay')}</th>
          <th>{t('undoHistory.undo')}</th>
        </tr>
      </thead>
      <tbody>
        {props.entries.map((entry) => (
          <tr key={entry.id}>
            <td>{formatDecision(entry, t)}</td>
            <td>{formatTarget(entry, t, language)}</td>
            <td>
              <button type="button" onClick={() => props.onReplay?.(entry)}>{t('undoHistory.replay')}</button>
            </td>
            <td>
              {entry.undoneAt ? t('undoHistory.undone') : (
                <button type="button" onClick={() => props.onUndo?.(entry.id)}>{formatUndoLabel(entry, t)}</button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
