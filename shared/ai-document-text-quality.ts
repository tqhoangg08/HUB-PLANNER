/** Signals select a page for OCR; they never repair/guess Vietnamese words. */
export const normalizeDocumentText = (value: string) => value.normalize('NFC')
  .replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  .split('\n').map((line) => line.replace(/[\t \f]+/g, ' ').trimEnd()).join('\n')
  .replace(/\n{3,}/g, '\n\n').trim();

export const assessDocumentPageText = (value: string, scannedPage = false) => {
  const text = normalizeDocumentText(value);
  const chars = Array.from(text);
  const replacementCharacterCount = chars.filter((c) => c === '\uFFFD').length;
  const privateUseCharacterCount = chars.filter((c) => {
    const n = c.codePointAt(0) || 0;
    return (n >= 0xE000 && n <= 0xF8FF) || (n >= 0xF0000 && n <= 0xFFFFD) || (n >= 0x100000 && n <= 0x10FFFD);
  }).length;
  const visibleCharacterCount = chars.filter((c) => /[\p{L}\p{N}]/u.test(c)).length;
  // Mixed digits within words and lower/UPPER/lower syllables occur in the
  // actual damaged PDF layer, even though it contains no U+FFFD/PUA glyphs.
  const tokens = text.match(/[\p{L}\p{N}]+/gu) || [];
  const suspiciousWordCount = tokens.filter((word) => /\p{L}\d\p{L}|\p{Ll}\p{Lu}\p{Ll}/u.test(word)
    || (/\p{Ll}/u.test(word) && /\p{L}\d$/u.test(word))).length;
  const reasons: string[] = [];
  if (visibleCharacterCount < 2) reasons.push('empty_text_layer');
  if (replacementCharacterCount) reasons.push('replacement_character');
  if (privateUseCharacterCount) reasons.push('private_use_glyph');
  if (/Ã.|Æ.|áº|á»/u.test(text)) reasons.push('mojibake');
  if (text.length > 40 && visibleCharacterCount < 8) reasons.push('unusable_text_density');
  if (suspiciousWordCount >= 3 && suspiciousWordCount / Math.max(1, tokens.length) >= 0.015) reasons.push('damaged_word_mapping');
  // A full-page scan must be visually recognized, not accepted just because
  // an old OCR layer is long. No semantic correction of that layer is allowed.
  if (scannedPage) reasons.push('scan_with_unverified_text_layer');
  return { classification: reasons.length ? 'OCR_REQUIRED' as const : 'NATIVE_GOOD' as const,
    reasons, replacementCharacterCount, privateUseCharacterCount, visibleCharacterCount, suspiciousWordCount };
};

export type OcrWord = { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } };
/** A numeric re-read may raise confidence only when both reads agree exactly
 * on digits/order; different digits never replace the original reading. */
export const confirmedNumericConfidence = (original:OcrWord, reread:{text:string;confidence:number}) => {
  const canonical=(v:string)=>v.replace(/\s/g,'').replace(/[–—]/g,'-');
  if(!/^\+?\d+(?:[-–—]\d+)?$/.test(original.text)||reread.confidence<85
    ||canonical(original.text)!==canonical(reread.text))return original.confidence;
  return Math.max(original.confidence,reread.confidence);
};
/** Keep OCR reading order and wide column gaps, without inventing table cells. */
export const serializeOcrLines = (lines: readonly { words: readonly OcrWord[] }[]) => {
  let uncertainTokens = 0;
  const text = lines.map((line) => {
    let previous: OcrWord | undefined;
    return line.words.map((word) => {
      const gap = previous ? word.bbox.x0 - previous.bbox.x1 : 0;
      const height = word.bbox.y1 - word.bbox.y0;
      previous = word;
      const numeric = /\d/.test(word.text);
      const uncertain = word.confidence < (numeric ? 85 : 45);
      if (uncertain) uncertainTokens++;
      // No guessed decision number/date/score is admitted as evidence.
      const token = uncertain ? '[không đọc rõ]' : word.text.normalize('NFC');
      return `${gap > Math.max(25, height * 1.5) ? '    ' : gap > 0 ? ' ' : ''}${token}`;
    }).join('').trim();
  }).join('\n');
  return { text, uncertainTokens };
};
