/** Test-only formatting cleanup. Accents, words, digits and negation remain
 * significant: accent folding would hide actual Vietnamese OCR failures. */
export const normalizeAcceptanceText = (text:unknown) => String(text??'').normalize('NFC')
  .replace(/^\s*>\s?/gm,'').replace(/\s+/gu,' ').trim().toLowerCase();
