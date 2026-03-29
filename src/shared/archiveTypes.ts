export const APP_NAME = 'ForgetMe'
export const SUPPORTED_IMPORT_KINDS = ['chat', 'image', 'document'] as const
export const SUPPORTED_IMPORT_FILTER_LABEL = 'Supported imports'
export const SUPPORTED_IMPORT_EXTENSIONS = ['.json', '.txt', '.jpg', '.jpeg', '.png', '.heic', '.pdf', '.docx'] as const
export const SUPPORTED_IMPORT_FILTER_EXTENSIONS = ['json', 'txt', 'jpg', 'jpeg', 'png', 'heic', 'pdf', 'docx'] as const
export const SUPPORTED_IMAGE_IMPORT_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.heic'] as const
export const SUPPORTED_DOCUMENT_IMPORT_EXTENSIONS = ['.pdf', '.docx', '.txt'] as const

export type ImportKind = (typeof SUPPORTED_IMPORT_KINDS)[number]
