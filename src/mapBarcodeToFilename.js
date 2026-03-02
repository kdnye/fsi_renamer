module.exports = ({ barcodePayload }) => {
  if (!barcodePayload) return null

  const sanitized = barcodePayload
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')

  if (!sanitized) return null

  return sanitized.toUpperCase()
}
