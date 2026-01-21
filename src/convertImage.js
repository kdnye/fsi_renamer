const sharp = require('sharp')
const path = require('path')
const fs = require('fs').promises
const { v4: uuidv4 } = require('uuid')

module.exports = async ({ imagePath }) => {
  try {
    const ext = path.extname(imagePath).toLowerCase()

    // Only convert WebP images, others are already supported by Ollama
    if (ext !== '.webp') {
      return imagePath
    }

    // Create temp directory if it doesn't exist
    const tempDir = '/tmp/ai-renamer-images'
    await fs.mkdir(tempDir, { recursive: true })

    // Generate unique filename for converted image
    const baseName = path.basename(imagePath, ext)
    const convertedPath = path.join(tempDir, `${baseName}_${uuidv4()}.png`)

    // Convert WebP to PNG using sharp
    await sharp(imagePath)
      .png()
      .toFile(convertedPath)

    return convertedPath
  } catch (err) {
    throw new Error(`Error converting image ${imagePath}: ${err.message}`)
  }
}