export function pdf(pages: readonly string[]): Buffer {
  const escape = (line: string): string => line.replace(/[()\\]/g, (char) => `\\${char}`);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${String(4 + index * 2)} 0 R`).join(' ')}] /Count ${String(pages.length)} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...pages.flatMap((text, index) => {
      const stream = `BT /F1 12 Tf 72 720 Td (${escape(text)}) Tj ET`;
      return [
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${String(5 + index * 2)} 0 R >>`,
        `<< /Length ${String(stream.length)} >>\nstream\n${stream}\nendstream`,
      ];
    }),
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => { offsets.push(out.length); out += `${String(index + 1)} 0 obj\n${body}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xref)}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
