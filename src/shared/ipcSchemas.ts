import { z } from 'zod'

export const createImportBatchInputSchema = z.object({
  sourcePaths: z.array(z.string()).min(1),
  sourceLabel: z.string().min(1)
})

export const batchIdSchema = z.object({
  batchId: z.string().min(1)
})
