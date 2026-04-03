import { z } from 'zod'
import { batchIdSchema } from './common'

export { batchIdSchema }

export const createImportBatchInputSchema = z.object({
  sourcePaths: z.array(z.string()).min(1),
  sourceLabel: z.string().min(1)
})

export const importPreflightInputSchema = z.object({
  sourcePaths: z.array(z.string()).min(1)
})
