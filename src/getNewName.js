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
          'Analyze the text and extract the House Waybill (HWB) or Master Air Waybill (MAWB).',
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
          '- Replace [Number] with the actual 6-digit HWB or 11-digit MAWB found in the text.',
          '- Strip dashes or spaces from the numbers.',
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
