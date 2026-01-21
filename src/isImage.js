module.exports = ({ ext }) => {
  const imageTypes = ['.jpg', '.jpeg', '.png', '.bmp', '.tif', '.tiff', '.webp']
  return imageTypes.includes(ext)
}
