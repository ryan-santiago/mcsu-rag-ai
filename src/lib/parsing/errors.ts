import "server-only";

/** Thrown for a mime type this pipeline doesn't know how to extract text from (images, etc.) — user-facing message. */
export class UnsupportedFileTypeError extends Error {
  constructor(mimeType: string) {
    super(`"${mimeType}" isn't supported for text extraction yet.`);
    this.name = "UnsupportedFileTypeError";
  }
}

/** Thrown when a supported file type fails to parse (corrupted file, password-protected, etc.) — user-facing message. */
export class ParsingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParsingError";
  }
}
