import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { AppPaths } from './appPaths'

export type FrozenOriginalRecord = {
  fileId: string
  sourcePath: string
  fileName: string
  extension: string
  fileSize: number
  sha256: string
  duplicateClass: 'unique'
  frozenAbsolutePath: string
}

function sha256File(sourcePath: string) {
  const buffer = fs.readFileSync(sourcePath)
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

export async function freezeOriginal(appPaths: AppPaths, batchId: string, sourcePath: string): Promise<FrozenOriginalRecord> {
  const sha256 = sha256File(sourcePath)
  const extension = path.extname(sourcePath)
  const destinationDir = path.join(appPaths.vaultOriginalsDir, sha256.slice(0, 2))
  const frozenAbsolutePath = path.join(destinationDir, `${sha256}${extension}`)
  const stat = fs.statSync(sourcePath)

  fs.mkdirSync(destinationDir, { recursive: true })
  fs.copyFileSync(sourcePath, frozenAbsolutePath)

  return {
    fileId: crypto.randomUUID(),
    sourcePath,
    fileName: path.basename(sourcePath),
    extension,
    fileSize: stat.size,
    sha256,
    duplicateClass: 'unique',
    frozenAbsolutePath
  }
}
