const { PDFDocument } = require('pdf-lib')

module.exports = async ({ pdfBuffer }) => {
  const sourcePdf = await PDFDocument.load(pdfBuffer)
  const pageCount = sourcePdf.getPageCount()

  const pagePromises = Array.from({ length: pageCount }, async (_, index) => {
    const outputPdf = await PDFDocument.create()
    const [page] = await outputPdf.copyPages(sourcePdf, [index])
    outputPdf.addPage(page)

    const pageBuffer = Buffer.from(await outputPdf.save())
    return { pageNumber: index + 1, pageBuffer }
  })

  return Promise.all(pagePromises)
}
