const pdf = require('pdf-parse')

module.exports = async ({ pageBuffer }) => {
  const pdfData = await pdf(pageBuffer)
  return pdfData.text.trim()
}
