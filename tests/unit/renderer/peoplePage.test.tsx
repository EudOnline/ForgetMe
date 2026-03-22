import '@testing-library/jest-dom/vitest'
import { render, screen } from './testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PeoplePage } from '../../../src/renderer/pages/PeoplePage'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PeoplePage', () => {
  it('shows approved people and opens person detail navigation affordance', async () => {
    vi.stubGlobal('window', {
      archiveApi: {
        listCanonicalPeople: vi.fn().mockResolvedValue([
          { id: 'cp-1', primaryDisplayName: 'Alice Chen', evidenceCount: 4, normalizedName: 'alice chen', aliasCount: 2, firstSeenAt: null, lastSeenAt: null, status: 'approved' }
        ])
      }
    })

    render(<PeoplePage />)

    expect(await screen.findByText('Alice Chen')).toBeInTheDocument()
  })
})
