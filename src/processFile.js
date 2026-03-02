const path = require('path')
const { v4: uuidv4 } = require('uuid')
const fs = require('fs').promises

const isImage = require('./isImage')
const isVideo = require('./isVideo')
const saveFile = require('./saveFile')
const getNewName = require('./getNewName')
const extractFrames = require('./extractFrames')
const readFileContent = require('./readFileContent')
const deleteDirectory = require('./deleteDirectory')
const splitPdfPages = require('./splitPdfPages')
const readPdfPageContent = require('./readPdfPageContent')
const decodeBarcodeFromPage = require('./decodeBarcodeFromPage')
const mapBarcodeToFilename = require('./mapBarcodeToFilename')
const isProcessableFile = require('./isProcessableFile')

const isIgnoredClassification = value => value && value.trim().toLowerCase() === 'ignore'

const savePdfBuffer = async ({ dir, ext, newName, pageBuffer }) => {
  let newFileName = `${newName}${ext}`
  let newPath = path.join(dir, newFileName)
  let counter = 1

  while (true) {
    try {
      await fs.access(newPath)
      newFileName = `${newName}${counter}${ext}`
      newPath = path.join(dir, newFileName)
      counter++
    } catch (err) {
      break
    }
  }

  await fs.writeFile(newPath, pageBuffer)
  return newFileName
}

module.exports = async options => {
  let framesOutputDir

  try {
    const { frames, filePath, inputPath } = options

    const fileName = path.basename(filePath)
    const ext = path.extname(filePath).toLowerCase()
    const relativeFilePath = path.relative(inputPath, filePath)

    if (fileName === '.DS_Store') return

    if (!isProcessableFile({ filePath })) {
      console.log(`🟡 Unsupported file: ${relativeFilePath}`)
      return
    }

    if (ext === '.pdf') {
      const pdfBuffer = await fs.readFile(filePath)
      const pdfPages = await splitPdfPages({ pdfBuffer })

      if (!pdfPages.length) {
        console.log(`🔴 No pages found: ${relativeFilePath}`)
        return
      }

      let savedPagesCount = 0
      for (const page of pdfPages) {
        const pageRelativeFilePath = `${relativeFilePath} (page ${page.pageNumber})`

        const barcodePayload = await decodeBarcodeFromPage({ pageBuffer: page.pageBuffer })
        const barcodeMappedName = mapBarcodeToFilename({ barcodePayload })

        let newName = barcodeMappedName

        if (newName) {
          console.log(`🟢 Barcode matched: ${pageRelativeFilePath} -> ${newName}`)
        } else {
          const content = await readPdfPageContent({ pageBuffer: page.pageBuffer })

          if (!content) {
            console.log(`🔴 No text content: ${pageRelativeFilePath}`)
            continue
          }

          newName = await getNewName({ ...options, content, images: [], relativeFilePath: pageRelativeFilePath })
        }

        if (!newName) continue

        if (isIgnoredClassification(newName)) {
          console.log(`🟡 Skipped page: classified as IGNORE (${pageRelativeFilePath})`)
          continue
        }

        const newFileName = await savePdfBuffer({
          dir: path.dirname(filePath),
          ext,
          newName,
          pageBuffer: page.pageBuffer
        })
        const relativeNewFilePath = path.join(path.dirname(relativeFilePath), newFileName)
        console.log(`🟢 Split & renamed: ${pageRelativeFilePath} to ${relativeNewFilePath}`)
        savedPagesCount++
      }

      if (!savedPagesCount) {
        console.log(`🔴 No pages were renamed: ${relativeFilePath}`)
        return
      }

      await fs.unlink(filePath)
      return
    }

    let content
    let videoPrompt
    let images = []
    if (isImage({ ext })) {
      images.push(filePath)
    } else if (isVideo({ ext })) {
      framesOutputDir = `/tmp/ai-renamer/${uuidv4()}`
      const _extractedFrames = await extractFrames({
        frames,
        framesOutputDir,
        inputFile: filePath
      })
      images = _extractedFrames.images
      videoPrompt = _extractedFrames.videoPrompt
    } else {
      content = await readFileContent({ filePath })
      if (!content) {
        console.log(`🔴 No text content: ${relativeFilePath}`)
        return
      }
    }

    const newName = await getNewName({ ...options, images, content, videoPrompt, relativeFilePath })
    if (!newName) return

    if (isIgnoredClassification(newName)) {
      console.log(`🟡 Skipped file: classified as IGNORE (${relativeFilePath})`)
      return
    }

    const newFileName = await saveFile({ ext, newName, filePath })
    const relativeNewFilePath = path.join(path.dirname(relativeFilePath), newFileName)
    console.log(`🟢 Renamed: ${relativeFilePath} to ${relativeNewFilePath}`)
  } catch (err) {
    console.log(err.message)
  } finally {
    if (framesOutputDir) {
      await deleteDirectory({ folderPath: framesOutputDir })
    }
  }
}
