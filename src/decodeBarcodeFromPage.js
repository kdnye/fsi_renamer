const pdf = require('pdf-parse')

const CODE_PATTERN = /\b\d[\d\s-]{4,}[A-Za-z0-9]{0,6}\b/g

const normalizeCode = value => value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()

const getKeywordBoost = ({ text, index, keywords }) => {
  const windowStart = Math.max(0, index - 60)
  const windowEnd = Math.min(text.length, index + 60)
  const nearbyText = text.slice(windowStart, windowEnd).toLowerCase()
  return keywords.some(keyword => nearbyText.includes(keyword)) ? 10 : 0
}

const extractCandidates = text => {
  if (!text) return []

  const matches = [...text.matchAll(CODE_PATTERN)]

  return matches
    .map(match => {
      const normalized = normalizeCode(match[0])
      if (!normalized || normalized.length < 6 || !/\d/.test(normalized)) return null

      return {
        raw: match[0],
        code: normalized,
        index: match.index || 0
      }
    })
    .filter(Boolean)
}

const pickIdentifier = ({ candidates, text, type }) => {
  const filtered = candidates.filter(candidate => {
    const isDigitsOnly = /^\d+$/.test(candidate.code)

    if (type === 'mawb') return isDigitsOnly && candidate.code.length >= 11 && candidate.code.length <= 14
    return candidate.code.length >= 6 && candidate.code.length <= 12
  })

  if (!filtered.length) return null

  const keywords = type === 'mawb'
    ? ['mawb', 'master waybill', 'master air waybill', 'awb']
    : ['hwb', 'house waybill', 'house air waybill']

  const scored = filtered.map(candidate => {
    const lengthScore = type === 'mawb'
      ? candidate.code.length
      : 20 - candidate.code.length

    const keywordBoost = getKeywordBoost({ text, index: candidate.index, keywords })

    return {
      ...candidate,
      score: lengthScore + keywordBoost
    }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored[0].code
}

const decodeFromText = text => {
  const candidates = extractCandidates(text)
  if (!candidates.length) return null

  const mawb = pickIdentifier({ candidates, text, type: 'mawb' })
  const hwb = pickIdentifier({
    candidates: candidates.filter(candidate => candidate.code !== mawb),
    text,
    type: 'hwb'
  })

  return {
    hwb,
    mawb,
    bestGuess: mawb || hwb || candidates[0].code
  }
}

module.exports = async ({ pageBuffer, pageText }) => {
  try {
    if (pageText) return decodeFromText(pageText)

    const pdfData = await pdf(pageBuffer)
    return decodeFromText(pdfData.text)
  } catch (err) {
    return null
  }
}
