const changeCase = require('./changeCase')
const getModelResponse = require('./getModelResponse')

const LOGISTICS_ALLOWED_PATTERNS = [
  /^\[HWB\](PU|MultiModal|ShipperID|AlertManifest|DeliveryReceipt)$/,
  /^\[MAWB\]MAWB$/,
  /^IGNORE$/
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

  const inlineMatch = normalized.match(/\[HWB\](PU|MultiModal|ShipperID|AlertManifest|DeliveryReceipt)|\[MAWB\]MAWB|IGNORE/)
  return inlineMatch ? inlineMatch[0] : null
}

module.exports = async options => {
  const { _case, chars, content, language, videoPrompt, customPrompt, relativeFilePath, logisticsMode } = options

  try {
    const isLogisticsMode = logisticsMode || /\blogistics\b/i.test(customPrompt || '')

    const promptLines = isLogisticsMode
      ? [
          'Generate filename in logistics mode.',
          '',
          'Allowed outputs (exact, case-sensitive):',
          '[HWB]PU',
          '[HWB]MultiModal',
          '[HWB]ShipperID',
          '[HWB]AlertManifest',
          '[HWB]DeliveryReceipt',
          '[MAWB]MAWB',
          'IGNORE',
          '',
          'Rules:',
          '- Return exactly ONE of the allowed outputs.',
          '- Do not add punctuation, explanation, extension, or extra text.',
          '- Preserve exact casing and characters.',
          '',
          'Respond ONLY with the output token.'
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
