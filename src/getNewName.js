const changeCase = require('./changeCase')
const getModelResponse = require('./getModelResponse')

const LOGISTICS_ALLOWED_PATTERNS = [
  /^(\d{6,11}(PU|MultiModal|ShipperID|AlertManifest|DeliveryReceipt|MAWB))$/,
  /^IGNORE$/i
]

const normalizeWhitespace = text => text.replace(/\s+/g, ' ').trim()

const validateLogisticsOutput = text => {
  const normalized = normalizeWhitespace(text)
  const isValid = LOGISTICS_ALLOWED_PATTERNS.some(pattern => pattern.test(normalized))
  return isValid ? normalized : null
}

const extractLogisticsFallback = text => {
  const normalized = normalizeWhitespace(text)

  const exactMatch = validateLogisticsOutput(normalized)
  if (exactMatch) return exactMatch

  const inlineMatch = normalized.match(/\b\d{6,11}(PU|MultiModal|ShipperID|AlertManifest|DeliveryReceipt|MAWB)\b|\bIGNORE\b/i)
  return inlineMatch ? inlineMatch[0] : null
}

module.exports = async options => {
  const { _case, chars, content, language, videoPrompt, customPrompt, relativeFilePath, logisticsMode } = options

  try {
    const isLogisticsMode = logisticsMode || /\blogistics\b/i.test(customPrompt || '')

    const promptLines = isLogisticsMode
      ? [
          'You are a logistics document classifier.',
          'Analyze noisy OCR text and aggressively recover the most likely House Waybill (HWB) or Master Air Waybill (MAWB) number.',
          '',
          'Output ONLY the final filename based on these exact rules:',
          '- If text indicates a Pickup Order, output: [Number]PU',
          '- If text indicates a Multimodal Waybill, output: [Number]MultiModal',
          '- If text indicates Shipper ID Verification, output: [Number]ShipperID',
          '- If text indicates an Alert Manifest, output: [Number]AlertManifest',
          '- If text indicates a Delivery Receipt, output: [Number]DeliveryReceipt',
          '- If it is an airline document with a MAWB, output: [MAWB Number]MAWB',
          '- If it is a TSA Certificate or should not be saved, output: IGNORE',
          '',
          'Rules:',
          '- Prioritize finding any valid 6-digit HWB or 11-digit MAWB even if OCR quality is poor, fragmented, or contains noise.',
          '- Reconstruct likely identifiers when digits are split by spaces, dashes, punctuation, or line breaks.',
          '- Treat confusing OCR characters as likely digit substitutions when reasonable (e.g., O->0, I/l->1, S->5, B->8).',
          '- Replace [Number] with the recovered 6-digit HWB or 11-digit MAWB.',
          '- Strip spaces, dashes, and separators from the recovered number.',
          '- If multiple candidates exist, choose the most plausible by context labels like HWB, HAWB, MAWB, AWB, air waybill, waybill, or shipment number.',
          '- Do not add file extensions or any other words.',
          '',
          'Respond ONLY with the final filename.'
        ]
      : [
          'Generate filename:',
          '',
          `Use ${_case}`,
          `Max ${chars} characters`,
          `${language} only`,
          'No file extension',
          'No special chars',
          'Only key elements',
          'One word if possible',
          'Noun-verb format',
          '',
          'Respond ONLY with filename.'
        ]

    if (videoPrompt) {
      promptLines.unshift(videoPrompt, '')
    }

    if (content) {
      promptLines.push('', 'Content:', content)
    }

    if (customPrompt) {
      promptLines.push('', 'Custom instructions:', customPrompt)
    }

    const prompt = promptLines.join('\n')

    const modelResult = await getModelResponse({ ...options, prompt })

    if (isLogisticsMode) {
      const validated = validateLogisticsOutput(modelResult)
      if (validated) return validated

      const retryPrompt = `${prompt}\n\nYour previous output was invalid. Return exactly one allowed token and nothing else.`
      const retryResult = await getModelResponse({ ...options, prompt: retryPrompt })
      const validatedRetry = validateLogisticsOutput(retryResult)
      if (validatedRetry) return validatedRetry

      const fallback = extractLogisticsFallback(`${modelResult}\n${retryResult}`)
      if (fallback) return fallback

      return 'IGNORE'
    }

    const text = normalizeWhitespace(modelResult)
    const filename = await changeCase({ text, _case })
    return filename
  } catch (err) {
    console.log(`🔴 Model error: ${err.message} (${relativeFilePath})`)
  }
}
