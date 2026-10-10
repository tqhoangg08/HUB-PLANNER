/** Only the server-owned Word extraction envelope, not arbitrary comments or
 * security vocabulary. Original evidence remains unchanged for validation. */
export const stripWordExtractionEnvelope = (text: string) => text
  .replace(/<!--\s*word_unit=\d+\s+uncertain_tokens=\d+\s*-->/g, '')
  .replace(/<!--\s*word_unit:\s*\d+\s*-->/g, '')
  .replace(/<!--\s*extraction:\s*(?:native|native_text)(?:;\s*confidence:\s*\d+(?:\.\d+)?)?;\s*uncertain_tokens:\s*\d+\s*-->/g, '')
  .replace(/^\s*(?:>\s*)?## Đoạn Word \d+\s*$/gm, '')
  .trim();
