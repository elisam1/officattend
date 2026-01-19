// Utility to export data as PDF using jsPDF and autotable
export async function exportToPDF({ rows, headers, filename = 'data.pdf', title = '' }) {
  const jsPDFModule = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDFModule.jsPDF();
  if (title) {
    doc.setFontSize(16);
    doc.text(title, 14, 18);
  }
  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: title ? 24 : 10,
    styles: { fontSize: 10 },
    headStyles: { fillColor: [37, 99, 235] },
  });
  doc.save(filename);
}
