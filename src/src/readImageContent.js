const Tesseract = require('tesseract.js')

const MIN_TEXT_LENGTH = 20

module.exports = async ({ filePath, buffer }) => {
  try {
    // Tesseract can process buffers directly
    const { data } = await Tesseract.recognize(buffer, 'eng')
    const text = (data.text || '').trim()

    return {
      text,
      hasExtractableText: text.length >= MIN_TEXT_LENGTH,
      ocrError: null
    }
  } catch (err) {
    console.log(`🔴 Image OCR Failure: ${err.message}`)
    return {
      text: '',
      hasExtractableText: false,
      ocrError: err.message
    }
  }
}
