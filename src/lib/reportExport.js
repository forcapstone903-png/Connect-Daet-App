import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'

// tables: [{ name, headers: string[], rows: unknown[][] }]

export async function createWorkbookBuffer(tables, { creator = 'Connect Daet', createdAt = new Date() } = {}) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = creator
  workbook.created = createdAt
  workbook.modified = createdAt

  for (const table of tables) {
    const worksheet = workbook.addWorksheet(table.name.slice(0, 31))
    worksheet.addRow(table.headers)
    for (const row of table.rows) worksheet.addRow(row)
    worksheet.views = [{ state: 'frozen', ySplit: 1 }]
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } }
    if (table.rows.length) {
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: table.rows.length + 1, column: table.headers.length },
      }
    }
    worksheet.columns = table.headers.map((header, index) => {
      const longestCell = Math.max(
        header.length,
        ...table.rows.map((row) => String(row[index] ?? '').length),
      )
      return { width: Math.min(Math.max(longestCell + 2, 12), 48) }
    })
  }

  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export function createPdfBuffer({ title, subtitle = '', tables }) {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: 'A4', margin: 44 })
    const chunks = []
    document.on('data', (chunk) => chunks.push(chunk))
    document.on('error', reject)
    document.on('end', () => resolve(Buffer.concat(chunks)))

    document.fontSize(20).fillColor('#0f172a').text(title)
    if (subtitle) document.moveDown(0.35).fontSize(9).fillColor('#475569').text(subtitle)

    for (const table of tables) {
      document.moveDown(0.9).fontSize(13).fillColor('#1d4ed8').text(table.name)
      document.moveDown(0.25).fontSize(8).fillColor('#1e293b')
      if (!table.rows.length) document.text('No records.', { lineGap: 2 })
      for (const row of table.rows) {
        const line = row.map((value, index) => `${table.headers[index]}: ${value ?? '-'}`).join('  |  ')
        document.text(line, { lineGap: 2 })
      }
    }

    document.end()
  })
}
