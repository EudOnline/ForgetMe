import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function readSharedSource(filePath: string) {
  return fs.readFileSync(path.resolve(filePath), 'utf8')
}

describe('objective-only runtime contracts', () => {
  it('removes legacy run-centric runtime types from shared contracts', () => {
    const source = readSharedSource('src/shared/archiveContracts.ts')

    expect(source).not.toMatch('export type AgentRunStatus')
    expect(source).not.toMatch('export type AgentRunExecutionOrigin')
    expect(source).not.toMatch('export type AgentRunRecord')
    expect(source).not.toMatch('export type AgentMessageRecord =')
    expect(source).not.toMatch('export type AgentRunDetail')
    expect(source).not.toMatch('export type AgentTriggerKind')
    expect(source).not.toMatch('export type AgentSuggestionStatus')
    expect(source).not.toMatch('export type AgentSuggestionPriority')
    expect(source).not.toMatch('export type AgentAutonomyMode')
    expect(source).not.toMatch('export type AgentRuntimeSettingsRecord')
    expect(source).not.toMatch('export type AgentSuggestionRecord')
    expect(source).not.toMatch('export type ListAgentRunsInput')
    expect(source).not.toMatch('export type GetAgentRunInput')
    expect(source).not.toMatch('export type ListAgentSuggestionsInput')
    expect(source).not.toMatch('export type DismissAgentSuggestionInput')
    expect(source).not.toMatch('export type RunAgentSuggestionInput')
    expect(source).not.toMatch('export type GetAgentRuntimeSettingsInput')
    expect(source).not.toMatch('export type UpdateAgentRuntimeSettingsInput')
  })

  it('keeps only objective-native runtime roles and initiators', () => {
    const source = readSharedSource('src/shared/archiveContracts.ts')

    expect(source).not.toMatch("'orchestrator'")
    expect(source).not.toMatch('orchestrator.plan_next_action')
    expect(source).not.toMatch("'proposal_followup'")
  })

  it('removes legacy run-centric ipc schemas', () => {
    expect(fs.existsSync(path.resolve('src/shared/ipcSchemas.ts'))).toBe(false)

    const source = readSharedSource('src/shared/schemas/objective.ts')

    expect(source).not.toMatch('runAgentTaskInputSchema')
    expect(source).not.toMatch('previewAgentTaskInputSchema')
    expect(source).not.toMatch('listAgentRunsInputSchema')
    expect(source).not.toMatch('getAgentRunInputSchema')
    expect(source).not.toMatch('listAgentSuggestionsInputSchema')
    expect(source).not.toMatch('refreshAgentSuggestionsInputSchema')
    expect(source).not.toMatch('dismissAgentSuggestionInputSchema')
    expect(source).not.toMatch('runAgentSuggestionInputSchema')
    expect(source).not.toMatch('getAgentRuntimeSettingsInputSchema')
    expect(source).not.toMatch('updateAgentRuntimeSettingsInputSchema')
  })
})
