const path = require('path')
const fs = require('fs').promises
const cliProgress = require('cli-progress');

const processFile = require('./processFile')

const visitedDirectories = new Set();

const processDirectory = async ({ options, inputPath, progressBar, totalFiles }) => {
  try {
    if (visitedDirectories.has(inputPath)) {
      console.log(`Skipping already visited directory: ${inputPath}`);
      return;
    }

    visitedDirectories.add(inputPath);
    console.log(`Processing directory: ${inputPath}`);

    const files = await fs.readdir(inputPath);

    if (files.length > 0) {
      totalFiles.count += files.length;
      progressBar.setTotal(totalFiles.count);
    }

    for (const file of files) {
      const filePath = path.join(inputPath, file);
      const fileStats = await fs.stat(filePath);
      if (fileStats.isFile()) {
        await processFile({ ...options, filePath });
        progressBar.increment();
      } else if (fileStats.isDirectory() && options.includeSubdirectories) {
        await processDirectory({ options, inputPath: filePath, progressBar, totalFiles });
      }
    }
  } catch (err) {
    console.error(err.message);
  }
};

module.exports = async ({ options, inputPath }) => {
  const totalFiles = { count: 0 };
  const progressBar = new cliProgress.SingleBar({
    format: 'Processing |{bar}| {percentage}% || {value}/{total} Files || ETA: {eta_formatted} || ',
  });

  progressBar.start(0, 0);

  await processDirectory({ options, inputPath, progressBar, totalFiles });

  progressBar.stop();
};
