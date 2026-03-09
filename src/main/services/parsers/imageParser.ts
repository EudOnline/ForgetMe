import fs from 'node:fs'
import ExifReader from 'exifreader'

export async function parseImage(filePath: string) {
  const buffer = fs.readFileSync(filePath)
  const tags = ExifReader.load(buffer)

  return {
    kind: 'image' as const,
    summary: {
      width: Number(tags['Image Width']?.value ?? 0),
      height: Number(tags['Image Height']?.value ?? 0),
      exifKeys: Object.keys(tags).slice(0, 20)
    }
  }
}
