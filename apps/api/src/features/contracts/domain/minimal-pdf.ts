/**
 * EF-610 — minimal deterministic text-based PDF writer (in-repo, zero
 * dependencies).
 *
 * Contract of this module:
 * - Pure function of its inputs: identical inputs produce byte-identical PDF
 *   documents (no clock, no randomness, no locale formatting).
 * - PDF 1.4, A4 pages, Helvetica core font, uncompressed content streams, a
 *   classic xref table with exact byte offsets.
 * - Non-WinAnsi characters (the contract body is Arabic) are rendered as
 *   lossless deterministic `U+XXXX` escapes. Readable Arabic glyph rendering
 *   with an embedded font is EF-630's explicit scope ("PDF Arabic font
 *   embedding"); this generator keeps EF-610 dependency-free and
 *   deterministic while remaining a valid, hash-stable PDF artifact.
 *
 * The document is therefore an operational record: metadata, provenance,
 * hashes, the ordered signer plan, the disclaimer, and the full contract
 * content in the escape encoding above.
 */

export class ContractPdfError extends Error {
  readonly code = "CONTRACT_PDF_ERROR" as const;
  constructor(message: string) {
    super(message);
    this.name = "ContractPdfError";
  }
}

export const PDF_PAGE_WIDTH = 595; // A4 in points (rounded)
export const PDF_PAGE_HEIGHT = 842;
const MARGIN = 56;
const LINE_HEIGHT = 14;
const FONT_SIZE = 10;
const CHARS_PER_LINE = 78;
const MAX_PAGES = 60;

/** Deterministic greedy word wrap; overlong words are hard-broken. */
export function wrapPdfLine(text: string): readonly string[] {
  const words = text.split(/ +/);
  const lines: string[] = [];
  let current = "";
  const push = (): void => {
    lines.push(current);
    current = "";
  };
  for (const word of words) {
    let rest = word;
    if (
      current.length > 0 &&
      current.length + 1 + rest.length <= CHARS_PER_LINE
    ) {
      current += ` ${rest}`;
      continue;
    }
    if (current.length > 0) push();
    while (rest.length > CHARS_PER_LINE) {
      lines.push(rest.slice(0, CHARS_PER_LINE));
      rest = rest.slice(CHARS_PER_LINE);
    }
    current = rest;
  }
  if (current.length > 0 || lines.length === 0) push();
  return lines;
}

/**
 * WinAnsi-safe escaping. Printable ASCII passes through (`\`, `(`, `)`
 * escaped); every other code point becomes the deterministic lossless marker
 * `U+XXXX` (uppercase hex). Deliberately NOT the Arabic rendering path —
 * that is EF-630 with a real embedded font.
 */
export function escapePdfText(text: string): string {
  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0x5c) out += "\\\\";
    else if (code === 0x28) out += "\\(";
    else if (code === 0x29) out += "\\)";
    else if (code >= 0x20 && code <= 0x7e) out += char;
    else out += `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
  }
  return out;
}

export type ContractPdfInput = Readonly<{
  /** Rendered contract title (line 1 of the document). */
  title: string;
  /** Rendered contract body (Arabic; emitted as lossless U+XXXX escapes). */
  body: string;
  meta: Readonly<{
    contractId: string;
    templateKey: string;
    templateVersion: number;
    dealId: string;
    contentSha256: string;
    capturedAt: string;
    signers: readonly { order: number; role: string; reference: string }[];
  }>;
  /** Fixed operational e-sign disclaimer shown on every document. */
  disclaimer: string;
}>;

interface PdfPage {
  readonly contentLines: readonly string[];
}

function buildPages(input: ContractPdfInput): readonly PdfPage[] {
  const linesPerPage = Math.floor(
    (PDF_PAGE_HEIGHT - 2 * MARGIN - LINE_HEIGHT) / LINE_HEIGHT,
  );
  const documentLines: string[] = [];
  documentLines.push(...wrapPdfLine(escapePdfText(input.title)));
  documentLines.push("");
  documentLines.push("--- CONTRACT RECORD (operational simple e-sign) ---");
  documentLines.push(`Contract: ${escapePdfText(input.meta.contractId)}`);
  documentLines.push(
    `Template: ${escapePdfText(`${input.meta.templateKey} v${input.meta.templateVersion}`)}`,
  );
  documentLines.push(`Deal: ${escapePdfText(input.meta.dealId)}`);
  documentLines.push(
    `Snapshot captured at: ${escapePdfText(input.meta.capturedAt)}`,
  );
  documentLines.push(
    `Content SHA-256: ${escapePdfText(input.meta.contentSha256)}`,
  );
  documentLines.push("Ordered signers:");
  for (const signer of input.meta.signers)
    documentLines.push(
      `  ${signer.order}. [${escapePdfText(signer.role)}] ${escapePdfText(signer.reference)}`,
    );
  documentLines.push(`Disclaimer: ${escapePdfText(input.disclaimer)}`);
  documentLines.push("");
  documentLines.push(
    "--- CONTENT (non-Latin text as lossless U+XXXX escapes; Arabic font embedding is EF-630) ---",
  );
  for (const line of input.body.split("\n"))
    documentLines.push(escapePdfText(line));
  const pages: PdfPage[] = [];
  for (let offset = 0; offset < documentLines.length; offset += linesPerPage) {
    if (pages.length >= MAX_PAGES)
      throw new ContractPdfError("contract document exceeds the page limit");
    pages.push({
      contentLines: documentLines.slice(offset, offset + linesPerPage),
    });
  }
  return pages;
}

function pageContentStream(page: PdfPage): string {
  const parts: string[] = [
    `BT /F1 ${FONT_SIZE} Tf ${MARGIN} ${PDF_PAGE_HEIGHT - MARGIN} Td ${LINE_HEIGHT} TL`,
  ];
  for (const line of page.contentLines) parts.push(`(${line}) Tj T*`);
  parts.push("ET");
  return parts.join("\n");
}

const PDF_HEADER = "%PDF-1.4";

interface PdfObject {
  readonly id: number;
  readonly body: string;
}

/**
 * Builds the complete PDF document. Byte offsets for the xref table are the
 * exact latin1 byte lengths of the header and every preceding object.
 */
export function renderContractPdf(input: ContractPdfInput): Uint8Array {
  if (input.meta.signers.length === 0)
    throw new ContractPdfError("a contract document requires ordered signers");
  const pages = buildPages(input);

  const pageIds = pages.map((_, index) => 4 + index * 2);
  const objects: PdfObject[] = [
    {
      id: 1,
      body: `<< /Type /Catalog /Pages 2 0 R >>`,
    },
    {
      id: 2,
      body: `<< /Type /Pages /Kids [${pageIds
        .map((id) => `${id} 0 R`)
        .join(" ")}] /Count ${pageIds.length} >>`,
    },
    {
      id: 3,
      body: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`,
    },
  ];
  pages.forEach((page, index) => {
    const contentId = pageIds[index] + 1;
    const stream = pageContentStream(page);
    objects.push({
      id: pageIds[index],
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`,
    });
    objects.push({
      id: contentId,
      body: `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    });
  });

  const chunks: string[] = [`${PDF_HEADER}\n`];
  const offsets: number[] = [];
  let offset = PDF_HEADER.length + 1;
  for (const object of objects) {
    offsets[object.id] = offset;
    const serialized = `${object.id} 0 obj\n${object.body}\nendobj\n`;
    chunks.push(serialized);
    offset += Buffer.byteLength(serialized, "latin1");
  }

  const xrefOffset = offset;
  const objectCount = objects.length + 1;
  chunks.push(`xref\n0 ${objectCount}\n0000000000 65535 f \n`);
  for (let id = 1; id < objectCount; id += 1) {
    const objectOffset = offsets[id];
    if (objectOffset === undefined)
      throw new ContractPdfError(`pdf object ${id} was never emitted`);
    chunks.push(`${objectOffset.toString().padStart(10, "0")} 00000 n \n`);
  }
  chunks.push(
    `trailer\n<< /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );
  return new Uint8Array(Buffer.from(chunks.join(""), "latin1"));
}
