const Tesseract = require('tesseract.js')
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
const isProcessableFile = require('./isProcessableFile')

const IGNORE_CLASSIFICATION = 'ignore'
const SCANNED_REVIEW_NAME = 'SCANNED_REVIEW'
const isIgnoredClassification = value => value && value.trim().toLowerCase() === IGNORE_CLASSIFICATION
const isLikelyLogisticsMode = ({ logisticsMode, customPrompt }) => logisticsMode || /\blogistics\b/i.test(customPrompt || '')
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
          const newFileName = await savePdfBuffer({
            dir: path.dirname(filePath),
            ext,
            newName: SCANNED_REVIEW_NAME,
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
          console.log(`🟡 Skipped page: classified as IGNORE (${pageRelativeFilePath})`)
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
      try {
        const { data } = await Tesseract.recognize(filePath, 'eng')
        content = data.text.trim()
        
        // Discard images that are just photos (no document text)
        if (content.length < 20) {
           console.log(`🟡 Ignored: Image lacks sufficient text to be a document (${relativeFilePath})`)
           return 
        }
      } catch (err) {
        console.log(`🔴 Image OCR Failure: ${err.message}`)
        return
      }
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
      deleteDirectory({ folderPath: framesOutputDir })
    }
  }
}
