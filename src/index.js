#!/usr/bin/env node

const processPath = require('./processPath')
const configureYargs = require('./configureYargs')
const path = require('path')
const readPdfPageContent = require('./src/readPdfPageContent')
const readImageContent = require('./src/readImageContent')



const main = async () => {
  try {
    const { argv, config } = await configureYargs()
    const [inputPath] = argv._

    if (!inputPath) {
      console.log('🔴 Please provide a file or folder path')
      process.exit(1)
    }

    await processPath({ ...config, inputPath })
  } catch (err) {
    console.log(err.message)
  }
}
async function extractText(fileBuffer, filePath) {
  const ext = path.extname(filePath).toLowerCase()

  if (ext === '.pdf') {
    return await readPdfPageContent({ pageBuffer: fileBuffer })
  } else if (['.jpg', '.jpeg', '.png'].includes(ext)) {
    return await readImageContent({ buffer: fileBuffer })
  } else {
    throw new Error(`Unsupported file type: ${ext}`)
  }
}
main()
