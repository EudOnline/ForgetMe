export const APP_NAME = 'ForgetMe'
export const SUPPORTED_IMPORT_KINDS = ['chat', 'image', 'document'] as const

export type ImportKind = (typeof SUPPORTED_IMPORT_KINDS)[number]
