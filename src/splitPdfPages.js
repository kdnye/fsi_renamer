module.exports = async ({ pdfBuffer }) => {
  const { PDFDocument } = require('pdf-lib')

  const sourcePdf = await PDFDocument.load(pdfBuffer)
  const pageCount = sourcePdf.getPageCount()
  const pages = []

  for (let index = 0; index < pageCount; index++) {
    const outputPdf = await PDFDocument.create()
    const [page] = await outputPdf.copyPages(sourcePdf, [index])
    outputPdf.addPage(page)

    const pageBuffer = Buffer.from(await outputPdf.save())
    pages.push({ pageNumber: index + 1, pageBuffer })
  }

  return pages
}
