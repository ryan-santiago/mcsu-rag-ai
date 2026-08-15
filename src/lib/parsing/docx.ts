import "server-only";

import mammoth from "mammoth";

import { ParsingError } from "./errors";

/** Plain-text extraction — tables are flattened to their cell text in reading order, not preserved as structure. */
export async function extractTextFromDocx(bytes: Buffer): Promise<string> {
  try {
    const { value } = await mammoth.extractRawText({ buffer: bytes });
    return value;
  } catch (error) {
    throw new ParsingError(
      `Could not read this Word document — it may be corrupted. (${error instanceof Error ? error.message : "unknown error"})`,
    );
  }
}
