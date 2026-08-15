import "server-only";

/** TXT/CSV need no real parsing — decoded as UTF-8 as-is. */
export function extractTextFromPlainText(bytes: Buffer): string {
  return bytes.toString("utf8");
}
