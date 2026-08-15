import "server-only";

import { extractTextFromDocx } from "./docx";
import { UnsupportedFileTypeError } from "./errors";
import { extractTextFromPdf } from "./pdf";
import { extractTextFromPlainText } from "./text";
import { extractTextFromXlsx } from "./xlsx";

export { ParsingError, UnsupportedFileTypeError } from "./errors";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Dispatches text extraction by mime type. Plain text only this milestone —
 * table structure inside PDF/DOCX/XLSX is not preserved (XLSX gets
 * row-labelled text as the one exception, see `xlsx.ts`), per the embedding
 * milestone's plan. Anything not listed here (images, legacy `.doc`/`.xls`,
 * `.ppt`/`.pptx`) throws `UnsupportedFileTypeError` rather than guessing.
 */
export async function extractText(mimeType: string, bytes: Buffer): Promise<string> {
  switch (mimeType) {
    case "application/pdf":
      return extractTextFromPdf(bytes);
    case DOCX_MIME:
      return extractTextFromDocx(bytes);
    case XLSX_MIME:
      return extractTextFromXlsx(bytes);
    case "text/plain":
    case "text/csv":
      return extractTextFromPlainText(bytes);
    default:
      throw new UnsupportedFileTypeError(mimeType);
  }
}
