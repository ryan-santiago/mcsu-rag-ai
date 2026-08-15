import "server-only";

/** ~4 characters/token is a reasonable heuristic for English prose — avoids pulling in a real tokenizer for this. */
const CHARS_PER_TOKEN = 4;
const TARGET_CHUNK_TOKENS = 650;
const OVERLAP_RATIO = 0.15;

const TARGET_CHUNK_CHARS = TARGET_CHUNK_TOKENS * CHARS_PER_TOKEN;
const OVERLAP_CHARS = Math.round(TARGET_CHUNK_CHARS * OVERLAP_RATIO);

export type Chunk = {
  content: string;
  tokenCount: number;
};

/**
 * A simple paragraph-aware recursive splitter: groups paragraphs up to
 * `TARGET_CHUNK_CHARS`, then falls back to splitting an overlong paragraph on
 * sentence boundaries, then hard character boundaries as a last resort — so
 * one huge unbroken block of text can never produce a single unembeddable
 * chunk. Overlap is carried forward from the tail of the previous chunk so a
 * sentence split across a chunk boundary still has context on both sides.
 */
export function chunkText(text: string): Chunk[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;

    if (candidate.length <= TARGET_CHUNK_CHARS) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = tailFor(current);
    }

    if (paragraph.length <= TARGET_CHUNK_CHARS) {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    } else {
      // A single paragraph longer than one chunk on its own — split it directly.
      for (const piece of splitOverlong(paragraph)) {
        if (current && (current + piece).length > TARGET_CHUNK_CHARS) {
          chunks.push(current);
          current = tailFor(current);
        }
        current = current ? `${current} ${piece}` : piece;
      }
    }
  }

  if (current.trim()) chunks.push(current);

  return chunks.map((content) => ({
    content,
    tokenCount: Math.ceil(content.length / CHARS_PER_TOKEN),
  }));
}

/** The overlap carried into the next chunk — the tail end of this one, snapped to a sentence boundary where possible. */
function tailFor(chunk: string): string {
  const tail = chunk.slice(-OVERLAP_CHARS);
  const sentenceStart = tail.search(/[.!?]\s+\S/);
  return sentenceStart >= 0 ? tail.slice(sentenceStart + 2) : tail;
}

/** Splits an overlong paragraph on sentence boundaries, then hard character boundaries if a single sentence is still too long. */
function splitOverlong(paragraph: string): string[] {
  const sentences = paragraph.split(/(?<=[.!?])\s+/);
  const pieces: string[] = [];

  for (const sentence of sentences) {
    if (sentence.length <= TARGET_CHUNK_CHARS) {
      pieces.push(sentence);
      continue;
    }
    for (let i = 0; i < sentence.length; i += TARGET_CHUNK_CHARS) {
      pieces.push(sentence.slice(i, i + TARGET_CHUNK_CHARS));
    }
  }

  return pieces;
}
