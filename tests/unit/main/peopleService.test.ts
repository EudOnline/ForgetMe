import { describe, expect, it } from 'vitest'
import { collectPeopleAnchors } from '../../../src/main/services/peopleService'

describe('collectPeopleAnchors', () => {
  it('turns chat participants into stable people anchors', () => {
    const anchors = collectPeopleAnchors({
      parsedFiles: [
        {
          fileId: 'file-1',
          kind: 'chat',
          summary: { participants: ['Alice', 'Bob'], messageCount: 4 }
        }
      ]
    })

    expect(anchors.map((anchor) => anchor.displayName)).toEqual(['Alice', 'Bob'])
  })
})
