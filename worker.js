const { PubSub } = require('@google-cloud/pubsub')
const { Storage } = require('@google-cloud/storage')
const fs = require('fs').promises
const os = require('os')
const path = require('path')
const { v4: uuidv4 } = require('uuid')

const processFile = require('./src/processFile')

// Configuration
const PROJECT_ID = process.env.GCP_PROJECT_ID || 'quote-tool-483716'
const SUBSCRIPTION_NAME = process.env.PUBSUB_SUBSCRIPTION || 'local-renamer-sub'
const BUCKET_NAME = process.env.GCS_BUCKET_NAME
const LOCAL_OLLAMA_URL = 'http://127.0.0.1:11434'

if (!BUCKET_NAME) {
  throw new Error('🔴 Missing GCS_BUCKET_NAME. Set the bucket name before starting worker.js')
}

const pubSubClient = new PubSub({ projectId: PROJECT_ID })
const storage = new Storage({ projectId: PROJECT_ID })

const renamerOptions = {
  provider: 'ollama',
  model: 'llava',
  baseURL: LOCAL_OLLAMA_URL,
  logisticsMode: true
}

const isAlreadyProcessed = fileName => {
  return fileName.startsWith('[HWB]') || fileName.startsWith('[MAWB]') || fileName.startsWith('SCANNED_REVIEW')
}

const uploadProcessedFiles = async ({ tempDir, originalBlobName, originalFileName }) => {
  if (!BUCKET_NAME) {
    throw new Error('🔴 Missing GCS_BUCKET_NAME. Cannot upload processed files to Cloud Storage.')
  }

  const tempEntries = await fs.readdir(tempDir, { withFileTypes: true })
  const producedFiles = tempEntries
    .filter(entry => entry.isFile())
    .map(entry => entry.name)

  if (!producedFiles.length) return { uploads: 0 }

  const originalBlobDir = path.posix.dirname(originalBlobName)
  const hasOriginalFile = producedFiles.includes(originalFileName)
  const renamedFiles = producedFiles.filter(fileName => fileName !== originalFileName)
  const filesToUpload = renamedFiles.length ? renamedFiles : [originalFileName]

  await Promise.all(
    filesToUpload.map(async fileName => {
      const localPath = path.join(tempDir, fileName)
      const destination = originalBlobDir === '.' ? fileName : path.posix.join(originalBlobDir, fileName)
      await storage.bucket(BUCKET_NAME).upload(localPath, { destination })
      console.log(`☁️ Uploaded: gs://${BUCKET_NAME}/${destination}`)
    })
  )

  if (renamedFiles.length || !hasOriginalFile) {
    await storage.bucket(BUCKET_NAME).file(originalBlobName).delete({ ignoreNotFound: true })
    console.log(`🗑️ Deleted original blob: gs://${BUCKET_NAME}/${originalBlobName}`)
  }

  return { uploads: filesToUpload.length }
}

async function handleMessage (message) {
  const requestId = uuidv4()
  const tempDir = path.join(os.tmpdir(), `fsi-renamer-${requestId}`)

  await fs.mkdir(tempDir, { recursive: true })

  try {
    if (!BUCKET_NAME) {
      throw new Error('🔴 Missing GCS_BUCKET_NAME. Cannot process Cloud Storage events.')
    }

    const eventData = JSON.parse(message.data.toString())
    const blobName = eventData.name

    if (!blobName) {
      throw new Error('Pub/Sub event does not include "name"')
    }

    const fileName = path.basename(blobName)

    if (isAlreadyProcessed(fileName)) {
      console.log(`⏭️ Skipping already processed file: ${fileName}`)
      message.ack()
      return
    }

    const tempLocalPath = path.join(tempDir, fileName)
    console.log(`📥 Downloading gs://${BUCKET_NAME}/${blobName} -> ${tempLocalPath}`)

    await storage.bucket(BUCKET_NAME).file(blobName).download({ destination: tempLocalPath })

    await processFile({
      ...renamerOptions,
      blobName,
      inputPath: tempDir,
      filePath: tempLocalPath
    })

    const result = await uploadProcessedFiles({
      tempDir,
      originalBlobName: blobName,
      originalFileName: fileName
    })

    if (!result.uploads) {
      console.log(`🟡 No output files produced for ${fileName}; original blob left unchanged.`)
    }

    message.ack()
    console.log(`✅ Acknowledged message for: ${fileName}`)
  } catch (error) {
    console.error('🔴 Error processing message:', error)
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true })
  }
}

async function listenForUploads () {
  const subscription = pubSubClient.subscription(SUBSCRIPTION_NAME, {
    flowControl: {
      maxMessages: 1
    }
  })

  console.log(`🎧 Listening for uploads on ${SUBSCRIPTION_NAME}...`)

  subscription.on('message', message => {
    handleMessage(message).catch(err => {
      console.error('🔴 Unhandled worker error:', err)
    })
  })

  subscription.on('error', error => {
    console.error('🔴 Pub/Sub Subscription Error:', error)
  })
}

listenForUploads()
