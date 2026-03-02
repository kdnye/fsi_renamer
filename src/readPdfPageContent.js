const pdf = require('pdf-parse')

const MIN_TEXT_LENGTH = 20

module.exports = async ({ pageBuffer }) => {
  try {
    const pdfData = await pdf(pageBuffer)
    const text = (pdfData.text || '').trim()

    return {
      text,
      hasExtractableText: text.length >= MIN_TEXT_LENGTH
    }
  } catch (err) {
    return {
      text: '',
      hasExtractableText: false,
      parseError: err.message
    }
  }
}
