const pdf = require('pdf-parse')

module.exports = async ({ pageBuffer }) => {
  try {
    const pdfData = await pdf(pageBuffer)
    return (pdfData.text || '').trim()
  } catch (err) {
    return ''
  }
}
