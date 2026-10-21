/** Minimal RFC 4180 CSV reader/writer. Excel-friendly output: UTF-8 BOM, ';' delimiter, CRLF. */
export const CSV_BOM = "\uFEFF";

/** Neutralises spreadsheet formulas (=, @, tab, CR, and +/- that are not plain numbers/phones). */
export function safeCell(value: string): string {
  if (!value) return value;
  if (/^[=@\t\r]/.test(value)) return "'" + value;
  if (/^[+-]/.test(value) && !/^[+-]?[\d\s().,-]+$/.test(value)) return "'" + value;
  return value;
}

export function toCsv(rows: (string | number | boolean | null | undefined)[][], delimiter = ";"): string {
  const cell = (v: string | number | boolean | null | undefined) => {
    const text = v === null || v === undefined ? "" : typeof v === "boolean" ? (v ? "1" : "0") : String(v);
    return /[";,\r\n\t]/.test(text) || text !== text.trim() ? '"' + text.replace(/"/g, '""') + '"' : text;
  };
  return CSV_BOM + rows.map(row => row.map(cell).join(delimiter)).join("\r\n") + "\r\n";
}

function detectDelimiter(text: string) {
  let inQuotes = false; const counts: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch === "\n") break;
    else if (!inQuotes && ch in counts) counts[ch]++;
  }
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] : ";");
}

/** Returns non-empty rows. Throws on an unterminated quote. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(text);
  const rows: string[][] = []; let row: string[] = [], field = "", inQuotes = false, touched = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += ch;
    } else if (ch === '"' && field === "") { inQuotes = true; touched = true; }
    else if (ch === delimiter) { row.push(field); field = ""; touched = true; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (touched || row.some(v => v !== "") || row.length > 1) rows.push(row);
      row = []; touched = false;
    } else { field += ch; touched = true; }
  }
  if (inQuotes) throw new Error("Незакрытая кавычка в CSV");
  if (touched || field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== ""));
}
