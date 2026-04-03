import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoPath = (...segments: string[]) => path.join(process.cwd(), ...segments)

describe('AppShell', () => {
  it('mounts the renderer through AppShell instead of the legacy App component', () => {
    const rendererEntry = fs.readFileSync(repoPath('src/renderer/main.tsx'), 'utf8')

    expect(fs.existsSync(repoPath('src/renderer/app-shell/AppShell.tsx'))).toBe(true)
    expect(rendererEntry).toContain("from './app-shell/AppShell'")
    expect(rendererEntry).not.toContain("from './App'")
  })

  it('defines reducer-driven route state and route intents', async () => {
    const appReducerPath = repoPath('src/renderer/app-shell/appReducer.ts')
    const navigationPath = repoPath('src/renderer/app-shell/navigation.ts')
    const routeStatePath = repoPath('src/renderer/app-shell/routeState.ts')

    expect(fs.existsSync(appReducerPath)).toBe(true)
    expect(fs.existsSync(navigationPath)).toBe(true)
    expect(fs.existsSync(routeStatePath)).toBe(true)

    const { createInitialAppShellState, reduceAppShellState } = await import(pathToFileURL(appReducerPath).href)
    const {
      openPeople,
      openPersonDetail,
      openMemoryWorkspace,
      openReviewQueue,
      openReviewWorkbench
    } = await import(pathToFileURL(navigationPath).href)

    const initialState = createInitialAppShellState()
    expect(initialState.route).toEqual({ kind: 'import' })

    const peopleState = reduceAppShellState(initialState, openPeople())
    expect(peopleState.route).toEqual({ kind: 'people' })

    const personState = reduceAppShellState(peopleState, openPersonDetail('cp-1'))
    expect(personState.route).toEqual({ kind: 'person-detail', canonicalPersonId: 'cp-1' })

    const workspaceState = reduceAppShellState(personState, openMemoryWorkspace({ kind: 'global' }))
    expect(workspaceState.route).toEqual({ kind: 'memory-workspace', scope: { kind: 'global' } })

    const reviewState = reduceAppShellState(
      workspaceState,
      openReviewQueue({
        initialJournalQuery: 'cp-1',
        initialSelectedJournalId: 'journal-1'
      })
    )
    expect(reviewState.route).toEqual({
      kind: 'review-queue',
      initialJournalQuery: 'cp-1',
      initialSelectedJournalId: 'journal-1'
    })

    const workbenchState = reduceAppShellState(reviewState, openReviewWorkbench('queue-1'))
    expect(workbenchState.route).toEqual({
      kind: 'review-workbench',
      initialQueueItemId: 'queue-1'
    })
  })

  it('uses a reducer-driven shell instead of page-local setPage orchestration', () => {
    expect(fs.existsSync(repoPath('src/renderer/app-shell/AppShell.tsx'))).toBe(true)

    const appShellSource = fs.readFileSync(repoPath('src/renderer/app-shell/AppShell.tsx'), 'utf8')

    expect(appShellSource).toContain('useReducer')
    expect(appShellSource).toContain('reduceAppShellState')
    expect(appShellSource).not.toContain('setPage(')
  })
})
