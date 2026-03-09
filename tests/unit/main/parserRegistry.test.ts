import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFrozenFile } from '../../../src/main/services/parserRegistry'

describe('parseFrozenFile', () => {
  it('extracts lightweight metadata for supported file types', async () => {
    const chat = await parseFrozenFile(path.resolve('tests/fixtures/imports/sample-chat.json'))
    const image = await parseFrozenFile(path.resolve('tests/fixtures/imports/sample-image.jpg'))
    const doc = await parseFrozenFile(path.resolve('tests/fixtures/imports/sample-doc.pdf'))
    const docx = await parseFrozenFile(path.resolve('tests/fixtures/imports/sample-doc.docx'))

    expect(chat.kind).toBe('chat')
    expect(chat.summary.messageCount).toBeGreaterThan(0)
    expect(image.kind).toBe('image')
    expect(image.summary).toHaveProperty('width')
    expect(doc.kind).toBe('document')
    expect(doc.summary).toHaveProperty('pageCount')
    expect(docx.kind).toBe('document')
    expect(docx.summary.previewText).toContain('ForgetMe')
  })
})
