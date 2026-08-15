import "server-only";

import ExcelJS from "exceljs";

import { ParsingError } from "./errors";

/**
 * Spreadsheets are already row/column data — there's no simpler "plain text"
 * baseline to fall back to the way there is for PDF/DOCX prose, so this does
 * slightly more than naive flattening: each row becomes one line, with the
 * header row's labels prefixed onto each cell so a chunk boundary landing
 * mid-sheet doesn't lose which column is which.
 */
export async function extractTextFromXlsx(bytes: Buffer): Promise<string> {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);

    const sheets: string[] = [];

    workbook.eachSheet((worksheet) => {
      let header: string[] | null = null;
      const lines: string[] = [];

      worksheet.eachRow({ includeEmpty: false }, (row) => {
        const cells = (row.values as unknown[]).slice(1).map(cellToString);

        if (!header) {
          header = cells;
          lines.push(cells.join(" | "));
          return;
        }

        lines.push(cells.map((cell, index) => (header?.[index] ? `${header[index]}: ${cell}` : cell)).join(" | "));
      });

      if (lines.length > 0) {
        sheets.push(`Sheet: ${worksheet.name}\n${lines.join("\n")}`);
      }
    });

    return sheets.join("\n\n");
  } catch (error) {
    throw new ParsingError(
      `Could not read this spreadsheet — it may be corrupted. (${error instanceof Error ? error.message : "unknown error"})`,
    );
  }
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("text" in value) return String((value as { text: unknown }).text);
    if ("result" in value) return String((value as { result: unknown }).result);
    if (value instanceof Date) return value.toISOString();
  }
  return String(value);
}
