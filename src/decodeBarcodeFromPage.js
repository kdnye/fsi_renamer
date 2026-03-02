const pdf = require('pdf-parse')

const BARCODE_PATTERN = /\b(\d{6,}(?:[-\s]?[A-Za-z0-9]{1,6})?)\b/g

const findBarcodeCandidates = text => {
  if (!text) return []

  const matches = text.match(BARCODE_PATTERN)
  if (!matches) return []

  return matches
    .map(item => item.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
}

module.exports = async ({ pageBuffer }) => {
  try {
    const pdfData = await pdf(pageBuffer)
    const candidates = findBarcodeCandidates(pdfData.text)
    return candidates[0] || null
  } catch (err) {
    return null
  }
}
