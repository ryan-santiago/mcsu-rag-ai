import "server-only";

import { extractText as extractPdfText, getDocumentProxy } from "unpdf";

import { ParsingError } from "./errors";

/** Plain-text extraction only — page layout and embedded tables are not preserved, see the parsing milestone's plan. */
export async function extractTextFromPdf(bytes: Buffer): Promise<string> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractPdfText(pdf, { mergePages: true });
    return text;
  } catch (error) {
    throw new ParsingError(
      `Could not read this PDF — it may be corrupted or password-protected. (${error instanceof Error ? error.message : "unknown error"})`,
    );
  }
}
