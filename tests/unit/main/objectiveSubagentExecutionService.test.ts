import { describe, expect, it } from 'vitest'
import {
  calculateThreadDelegationDepth,
  exceedsThreadDelegationDepthLimit
} from '../../../src/main/services/objectiveSubagentExecutionService'

type ThreadNode = {
  threadKind: 'main' | 'subthread'
  parentThreadId: string | null
}

function buildLookup(nodes: Record<string, ThreadNode>) {
  return (threadId: string) => nodes[threadId] ?? null
}

describe('objective subagent execution service delegation depth', () => {
  it('computes delegation depth from thread hierarchy without runtime orchestration', () => {
    const lookup = buildLookup({
      'thread-main': {
        threadKind: 'main',
        parentThreadId: null
      },
      'thread-parent': {
        threadKind: 'subthread',
        parentThreadId: 'thread-main'
      },
      'thread-child': {
        threadKind: 'subthread',
        parentThreadId: 'thread-parent'
      }
    })

    expect(calculateThreadDelegationDepth({
      threadId: 'thread-main',
      lookupThread: lookup
    })).toBe(1)
    expect(calculateThreadDelegationDepth({
      threadId: 'thread-parent',
      lookupThread: lookup
    })).toBe(2)
    expect(calculateThreadDelegationDepth({
      threadId: 'thread-child',
      lookupThread: lookup
    })).toBe(3)
  })

  it('shows third-level nested execution exceeds a depth-2 limit', () => {
    const lookup = buildLookup({
      'thread-main': {
        threadKind: 'main',
        parentThreadId: null
      },
      'thread-parent': {
        threadKind: 'subthread',
        parentThreadId: 'thread-main'
      },
      'thread-child': {
        threadKind: 'subthread',
        parentThreadId: 'thread-parent'
      }
    })

    const childDepth = calculateThreadDelegationDepth({
      threadId: 'thread-child',
      lookupThread: lookup
    })

    expect(childDepth).toBeGreaterThan(2)
  })

  it('applies delegation depth limits explicitly for depth-1 and depth-2 profiles', () => {
    expect(exceedsThreadDelegationDepthLimit({
      executionDepth: 1,
      maxDelegationDepth: 1
    })).toBe(false)

    expect(exceedsThreadDelegationDepthLimit({
      executionDepth: 2,
      maxDelegationDepth: 1
    })).toBe(true)

    expect(exceedsThreadDelegationDepthLimit({
      executionDepth: 2,
      maxDelegationDepth: 2
    })).toBe(false)

    expect(exceedsThreadDelegationDepthLimit({
      executionDepth: 3,
      maxDelegationDepth: 2
    })).toBe(true)
  })
})
