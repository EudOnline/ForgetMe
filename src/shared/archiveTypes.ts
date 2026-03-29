export const APP_NAME = 'ForgetMe'
export const SUPPORTED_IMPORT_KINDS = ['chat', 'image', 'document'] as const
export const SUPPORTED_IMPORT_FILTER_LABEL = 'Supported imports'
export const SUPPORTED_IMPORT_EXTENSIONS = ['.json', '.txt', '.jpg', '.jpeg', '.png', '.heic', '.pdf', '.docx'] as const
export const SUPPORTED_IMAGE_IMPORT_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.heic'] as const
export const SUPPORTED_DOCUMENT_IMPORT_EXTENSIONS = ['.pdf', '.docx', '.txt'] as const

export type ImportKind = (typeof SUPPORTED_IMPORT_KINDS)[number]
type SupportedImportExtension = (typeof SUPPORTED_IMPORT_EXTENSIONS)[number]
type SupportedImportFilterExtension = SupportedImportExtension extends `.${infer S}` ? S : never

export const SUPPORTED_IMPORT_FILTER_EXTENSIONS = SUPPORTED_IMPORT_EXTENSIONS.map(
  (extension) => extension.slice(1) as SupportedImportFilterExtension
)

const SUPPORTED_IMPORT_EXTENSION_SET = new Set<string>(SUPPORTED_IMPORT_EXTENSIONS)

export function isSupportedImportExtension(extension: string): extension is SupportedImportExtension {
  return SUPPORTED_IMPORT_EXTENSION_SET.has(extension.toLowerCase())
}
