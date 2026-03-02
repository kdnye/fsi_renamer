const fs = require('fs').promises
const os = require('os')
const path = require('path')
const pdf = require('pdf-parse')
const { v4: uuidv4 } = require('uuid')

const MIN_TEXT_LENGTH = 20

const tryOcr = async ({ pageBuffer }) => {
  let fromPath
  let Tesseract

  try {
    ;({ fromPath } = require('pdf2pic'))
    Tesseract = require('tesseract.js')
  } catch (err) {
    return {
      text: '',
      ocrError: `OCR dependencies unavailable: ${err.message}`
    }
  }

  const fileId = uuidv4()
  const tempPdfPath = path.join(os.tmpdir(), `${fileId}.pdf`)
  const tempImagePath = path.join(os.tmpdir(), `${fileId}.1.png`)

  try {
    await fs.writeFile(tempPdfPath, pageBuffer)

    const convert = fromPath(tempPdfPath, {
      density: 300,
      savePath: os.tmpdir(),
      saveFilename: fileId,
      format: 'png',
      width: 2550,
      height: 3300
    })

    const imageOutput = await convert(1, { responseType: 'base64' })

    if (!imageOutput || !imageOutput.base64) {
      throw new Error('Image rasterization returned empty data')
    }

    const base64URI = `data:image/png;base64,${imageOutput.base64}`
    const { data } = await Tesseract.recognize(base64URI, 'eng')

    return { text: (data.text || '').trim() }
  } catch (err) {
    return { text: '', ocrError: err.message }
  } finally {
    await fs.unlink(tempPdfPath).catch(() => {})
    await fs.unlink(tempImagePath).catch(() => {})
  }
}

module.exports = async ({ pageBuffer }) => {
  try {
    const pdfData = await pdf(pageBuffer)
    let text = (pdfData.text || '').trim()
    let ocrError

    if (text.length < MIN_TEXT_LENGTH) {
      console.log('🟡 Scanned document detected. Executing local OCR (File Mode)...')
      const ocrResult = await tryOcr({ pageBuffer })
      ocrError = ocrResult.ocrError

      if (ocrResult.text) {
        text = ocrResult.text
      }
    }

    return {
      text,
      hasExtractableText: text.length >= MIN_TEXT_LENGTH,
      ocrError
    }
  } catch (err) {
    return {
      text: '',
      hasExtractableText: false,
      parseError: err.message
    }
  }
}
