const path = require('path')
const { v4: uuidv4 } = require('uuid')
const fs = require('fs').promises
const readImageContent = require('./readImageContent')

const isImage = require('./isImage')
const isVideo = require('./isVideo')
const saveFile = require('./saveFile')
const getNewName = require('./getNewName')
const extractFrames = require('./extractFrames')
const readFileContent = require('./readFileContent')
const deleteDirectory = require('./deleteDirectory')
const splitPdfPages = require('./splitPdfPages')
const readPdfPageContent = require('./readPdfPageContent')
const isProcessableFile = require('./isProcessableFile')

const IGNORE_CLASSIFICATION = 'ignore'
const isIgnoredClassification = value => value && value.trim().toLowerCase() === IGNORE_CLASSIFICATION
const isLikelyLogisticsMode = ({ logisticsMode, customPrompt }) => logisticsMode || /\blogistics\b/i.test(customPrompt || '')
const getReviewName = sourceName => `SCANNED_REVIEW_${path.parse(sourceName).name}`

const savePdfBuffer = async ({ dir, ext, newName, pageBuffer }) => {
  let newFileName = `${newName}${ext}`
  let newPath = path.join(dir, newFileName)
  let counter = 1

  while (true) {
    try {
      await fs.writeFile(newPath, pageBuffer, { flag: 'wx' })
      return newFileName
    } catch (err) {
      if (err.code !== 'EEXIST') throw err

      newFileName = `${newName}${counter}${ext}`
      newPath = path.join(dir, newFileName)
      counter++
    }
  }
}

module.exports = async options => {
  let framesOutputDir

  try {
    const { frames, filePath, inputPath, blobName } = options

    const fileName = path.basename(filePath)
    const sourceBlobName = blobName || fileName
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
      let unprocessedPagesCount = 0
      const logisticsModeEnabled = isLikelyLogisticsMode(options)

      for (const page of pdfPages) {
        const pageRelativeFilePath = `${relativeFilePath} (page ${page.pageNumber})`

        const { text: content, hasExtractableText, parseError, ocrError } = await readPdfPageContent({ pageBuffer: page.pageBuffer })

        if (parseError) {
          console.log(`🟡 PDF parse warning: ${parseError} (${pageRelativeFilePath})`)
        }

        if (ocrError) {
          console.log(`🟡 OCR warning: ${ocrError} (${pageRelativeFilePath})`)
        }

        if (logisticsModeEnabled && !hasExtractableText) {
          const reviewName = getReviewName(sourceBlobName)
          const newFileName = await savePdfBuffer({
            dir: path.dirname(filePath),
            ext,
            newName: reviewName,
            pageBuffer: page.pageBuffer
          })
          const relativeNewFilePath = path.join(path.dirname(relativeFilePath), newFileName)
          console.log(`🟡 No extractable text (possible scanned PDF): ${pageRelativeFilePath} -> ${relativeNewFilePath}`)
          savedPagesCount++
          continue
        }

        if (!content) {
          console.log(`🔴 No text content: ${pageRelativeFilePath}`)
          unprocessedPagesCount++
          continue
        }

        const classificationToken = await getNewName({ ...options, content, images: [], relativeFilePath: pageRelativeFilePath })

        if (!classificationToken) {
          unprocessedPagesCount++
          continue
        }

        if (isIgnoredClassification(classificationToken)) {
          const reviewName = getReviewName(sourceBlobName)
          const newFileName = await savePdfBuffer({
            dir: path.dirname(filePath),
            ext,
            newName: reviewName,
            pageBuffer: page.pageBuffer
          })
          const relativeNewFilePath = path.join(path.dirname(relativeFilePath), newFileName)
          console.log(`🟡 Classified as non-logistics (IGNORE): ${pageRelativeFilePath} -> ${relativeNewFilePath}`)
          savedPagesCount++
          continue
        }

        const newName = classificationToken

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

      if (unprocessedPagesCount) {
        console.log(`🟡 Kept original PDF because ${unprocessedPagesCount} page(s) could not be confidently processed: ${relativeFilePath}`)
        return
      }

      await fs.unlink(filePath)
      return
    }

    let content
    let videoPrompt
    let images = []

    if (isImage({ ext })) {
      console.log(`🟡 Extracting text from image via OCR: ${relativeFilePath}`)
      const fileBuffer = await fs.readFile(filePath)
      const ocrResult = await readImageContent({ buffer: fileBuffer })

      if (ocrResult.ocrError) {
        console.log(`🔴 Image OCR Failure: ${ocrResult.ocrError} (${relativeFilePath})`)
        return
      }
      if (!ocrResult.hasExtractableText) {
        const reviewName = getReviewName(sourceBlobName)
        const newFileName = await saveFile({ ext, newName: reviewName, filePath })
        const relativeNewFilePath = path.join(path.dirname(relativeFilePath), newFileName)
        console.log(`🟡 No extractable image text; marked for review: ${relativeFilePath} -> ${relativeNewFilePath}`)
        return
      }
      
      // Map the extracted OCR text to the payload expected by LLaMA 3
      content = ocrResult.text
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
      const reviewName = getReviewName(sourceBlobName)
      const newFileName = await saveFile({ ext, newName: reviewName, filePath })
      const relativeNewFilePath = path.join(path.dirname(relativeFilePath), newFileName)
      console.log(`🟡 Classified as non-logistics (IGNORE): ${relativeFilePath} -> ${relativeNewFilePath}`)
      return
    }

    const newFileName = await saveFile({ ext, newName, filePath })
    const relativeNewFilePath = path.join(path.dirname(relativeFilePath), newFileName)
    console.log(`🟢 Renamed: ${relativeFilePath} to ${relativeNewFilePath}`)
  } catch (err) {
    console.log(err.message)
  } finally {
    if (framesOutputDir) {
      deleteDirectory({ folderPath: framesOutputDir })
    }
  }
}
