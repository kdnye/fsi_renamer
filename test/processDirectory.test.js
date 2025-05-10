const assert = require('node:assert')
const { describe, it } = require('node:test')
const fs = require('fs');
const path = require('path');

describe('processDirectory', () => {
  it('should process files and directories', async () => {
    const testDir = path.join(__dirname, 'testDir');
    const subDir = path.join(testDir, 'subDir');
    const testFile = path.join(testDir, 'testFile.txt');
    const subFile = path.join(subDir, 'subFile.txt');

    // Setup: Create test directory structure
    fs.mkdirSync(testDir, { recursive: true });
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(testFile, 'Test content');
    fs.writeFileSync(subFile, 'Subdirectory content');

    const options = {
      includeSubdirectories: true
    };

    const processedFiles = [];

    // Mock processFile to track processed files
    const originalProcessFile = require('../src/processFile');
    require.cache[require.resolve('../src/processFile')].exports = async ({ filePath }) => {
      processedFiles.push(filePath);
    };

    // Reload processDirectory to apply the mock
    delete require.cache[require.resolve('../src/processDirectory')];
    const processDirectory = require('../src/processDirectory');

    try {
      // Run processDirectory
      await processDirectory({ options, inputPath: testDir });

      // Assertions
      assert.strictEqual(processedFiles.length, 2, 'Should process two files');
      assert.ok(processedFiles.includes(testFile), 'Should process the root file');
      assert.ok(processedFiles.includes(subFile), 'Should process the subdirectory file');

      console.log('All tests passed!');
    } catch (err) {
      console.error('Test failed:', err);
    } finally {
      // Cleanup: Remove test directory structure
      fs.rmSync(testDir, { recursive: true, force: true });

      // Restore original processFile
      require.cache[require.resolve('../src/processFile')].exports = originalProcessFile;
    }
  })
})
