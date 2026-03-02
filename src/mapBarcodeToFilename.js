const sanitize = value => (value || '')
  .trim()
  .replace(/\s+/g, '')
  .replace(/[^a-zA-Z0-9]/g, '')
  .toUpperCase()

const mapTokenToFilename = ({ classificationToken, identifiers }) => {
  if (!classificationToken) return null

  if (classificationToken === '[MAWB]MAWB') {
    return identifiers.mawb ? `${identifiers.mawb}MAWB` : null
  }

  const hwbMatch = classificationToken.match(/^\[HWB\](.+)$/)
  if (hwbMatch) {
    return identifiers.hwb ? `${identifiers.hwb}${hwbMatch[1]}` : null
  }

  return null
}

module.exports = ({ classificationToken, barcodePayload, identifiers = {} }) => {
  const resolvedIdentifiers = {
    hwb: sanitize(identifiers.hwb || barcodePayload),
    mawb: sanitize(identifiers.mawb)
  }

  if (classificationToken) {
    const mapped = mapTokenToFilename({ classificationToken, identifiers: resolvedIdentifiers })
    if (mapped) return mapped
  }

  const fallbackPayload = sanitize(barcodePayload)
  return fallbackPayload || null
}
