import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { AppPaths } from './appPaths'
import { freezeOriginal } from './vaultService'

export async function createImportBatch(input: {
  appPaths: AppPaths
  sourcePaths: string[]
  sourceLabel: string
}) {
  const batchId = crypto.randomUUID()
  const files = await Promise.all(
    input.sourcePaths.map((sourcePath) => freezeOriginal(input.appPaths, batchId, sourcePath))
  )
  const manifestPath = path.join(input.appPaths.importReportsDir, `${batchId}.json`)

  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        batchId,
        sourceLabel: input.sourceLabel,
        createdAt: new Date().toISOString(),
        files
      },
      null,
      2
    )
  )

  return {
    batchId,
    manifestPath,
    files
  }
}
