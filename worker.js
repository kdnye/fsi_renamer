const { PubSub } = require('@google-cloud/pubsub');
const path = require('path');
const processFile = require('./src/processFile');

// Configuration
const PROJECT_ID = 'your-gcp-project-id'; // Replace with your GCP project ID
const SUBSCRIPTION_NAME = 'local-renamer-sub';
const MOUNT_PATH = '/driver_paperwork';

const pubSubClient = new PubSub({ projectId: PROJECT_ID });

// Setup the ai-renamer options just like the CLI would
const renamerOptions = {
  provider: 'ollama',
  model: 'llava', // or llama3.2-vision
  logisticsMode: true, // Forces the specific logistics workflow mentioned in your readme
  inputPath: MOUNT_PATH, // Base path for relative path calculations
  // add any other config defaults here (e.g., baseURL, frames)
};

async function listenForUploads() {
  const subscription = pubSubClient.subscription(SUBSCRIPTION_NAME);

  console.log(`🎧 Listening for uploads on ${SUBSCRIPTION_NAME}...`);

  subscription.on('message', async (message) => {
    try {
      const eventData = JSON.parse(message.data.toString());
      const blobName = eventData.name; // e.g., "Paperwork/David_Alexander/2026-03-05/file.png"
      
      // Construct the absolute path to the file on the local mount
      const absoluteFilePath = path.join(MOUNT_PATH, blobName);

      // --- INFINITE LOOP PREVENTION ---
      // When ai-renamer renames the file, GCS fires a NEW event for the new filename.
      // We must ignore files that have already been classified/renamed.
      // Adjust this regex based on your actual generated filenames (e.g., ignores files starting with [HWB], [MAWB], or SCANNED_REVIEW)
      const fileName = path.basename(blobName);
      if (fileName.startsWith('[HWB]') || fileName.startsWith('[MAWB]') || fileName.startsWith('SCANNED_REVIEW')) {
        console.log(`⏭️  Skipping already processed file: ${fileName}`);
        message.ack();
        return;
      }

      console.log(`\n📥 Received new file: ${absoluteFilePath}`);

      // Feed the file directly into your existing ai-renamer logic
      await processFile({
        ...renamerOptions,
        filePath: absoluteFilePath
      });

      // Acknowledge the message so it is removed from the queue
      message.ack();
      console.log(`✅ Acknowledged and finished with: ${fileName}`);

    } catch (error) {
      console.error(`🔴 Error processing message:`, error);
      // Do not ack the message; it will be redelivered
    }
  });

  subscription.on('error', (error) => {
    console.error('🔴 Pub/Sub Subscription Error:', error);
  });
}

listenForUploads();
