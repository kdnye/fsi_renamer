// run with node --test

const assert = require('node:assert')
const { describe, it } = require('node:test')
const isImage = require('../src/isImage.js')
const isVideo = require('../src/isVideo.js')

// Test suite for isImage
describe('isImage', () => {
  it('should return true for valid image extensions', () => {
    assert.strictEqual(isImage({ ext: '.jpg' }), true);
    assert.strictEqual(isImage({ ext: '.png' }), true);
  });

  it('should return false for non-image extensions', () => {
    assert.strictEqual(isImage({ ext: '.mp4' }), false);
    assert.strictEqual(isImage({ ext: '.pdf' }), false);
  });
});

// Test suite for isVideo
describe('isVideo', () => {
  it('should return true for valid video extensions', () => {
    assert.strictEqual(isVideo({ ext: '.mp4' }), true);
    assert.strictEqual(isVideo({ ext: '.avi' }), true);
  });

  it('should return false for non-video extensions', () => {
    assert.strictEqual(isVideo({ ext: '.jpg' }), false);
    assert.strictEqual(isVideo({ ext: '.pdf' }), false);
  });
});