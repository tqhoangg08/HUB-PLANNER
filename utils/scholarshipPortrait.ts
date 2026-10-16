export const portraitLimits = {bytes: 10 * 1024 * 1024, edge: 4096, pixels: 12_000_000};
const invalid = () => new Error('Ảnh không hợp lệ. Chọn ảnh JPG, PNG hoặc WebP tĩnh.');
export function portraitDimensions(bytes: Uint8Array, mime: string) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length));
  let width = 0, height = 0, type = '';
  if (bytes.length > portraitLimits.bytes || bytes.length < 12) throw invalid();
  if ([137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)) {
    type = 'image/png';
    if (bytes.length < 33 || view.getUint32(8) !== 13 || text(12,4) !== 'IHDR') throw invalid();
    width = view.getUint32(16); height = view.getUint32(20);
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset), name = text(offset + 4,4);
      if (offset + 12 + length > bytes.length || name === 'acTL') throw invalid();
      offset += 12 + length;
      if (name === 'IEND') break;
    }
  } else if (bytes[0] === 255 && bytes[1] === 216) {
    type = 'image/jpeg';
    let offset = 2;
    while (offset < bytes.length) {
      if (bytes[offset++] !== 255) throw invalid();
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) throw invalid();
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) throw invalid();
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
        if (length < 8) throw invalid();
        height = view.getUint16(offset + 3); width = view.getUint16(offset + 5); break;
      }
      offset += length;
    }
  } else if (text(0,4) === 'RIFF' && text(8,4) === 'WEBP') {
    type = 'image/webp';
    if (view.getUint32(4,true) + 8 !== bytes.length) throw invalid();
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const chunk = text(offset,4), length = view.getUint32(offset + 4,true), data = offset + 8;
      if (data + length > bytes.length || chunk === 'ANIM' || chunk === 'ANMF') throw invalid();
      if (chunk === 'VP8X') {
        if (length < 10 || (bytes[data] & 2)) throw invalid();
        width = 1 + bytes[data+4] + (bytes[data+5]<<8) + (bytes[data+6]<<16);
        height = 1 + bytes[data+7] + (bytes[data+8]<<8) + (bytes[data+9]<<16);
      } else if (chunk === 'VP8 ') {
        if (length < 10 || bytes[data+3] !== 0x9d || bytes[data+4] !== 1 || bytes[data+5] !== 0x2a) throw invalid();
        const frameWidth = view.getUint16(data+6,true) & 0x3fff, frameHeight = view.getUint16(data+8,true) & 0x3fff;
        if (width && (width !== frameWidth || height !== frameHeight)) throw invalid();
        width = frameWidth; height = frameHeight;
      } else if (chunk === 'VP8L') {
        if (length < 5 || bytes[data] !== 0x2f) throw invalid();
        const bits = view.getUint32(data+1,true);
        const frameWidth = (bits & 0x3fff) + 1, frameHeight = ((bits >>> 14) & 0x3fff) + 1;
        if (width && (width !== frameWidth || height !== frameHeight)) throw invalid();
        width = frameWidth; height = frameHeight;
      }
      offset = data + length + (length % 2);
    }
  }
  if (!type || (mime && mime !== type)) throw invalid();
  if (!width || !height || width > portraitLimits.edge || height > portraitLimits.edge || width * height > portraitLimits.pixels)
    throw new Error('Ảnh tối đa 4096px mỗi chiều và 12 triệu điểm ảnh. Vui lòng giảm kích thước ảnh.');
  return {width, height, type};
}

export async function loadScholarshipPortrait(file: File, signal: AbortSignal) {
  if (!file.size || file.size > portraitLimits.bytes) throw new Error('Ảnh cần có dung lượng từ 1 byte đến 10 MiB.');
  signal.throwIfAborted();
  const dimensions = portraitDimensions(new Uint8Array(await file.arrayBuffer()), file.type);
  signal.throwIfAborted();
  const url = URL.createObjectURL(file), image = new Image();
  const dispose = () => { image.onload = null; image.onerror = null; image.src = ''; URL.revokeObjectURL(url); };
  try {
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => { clearTimeout(timer); signal.removeEventListener('abort', cancel); image.onload = null; image.onerror = null; error ? reject(error) : resolve(); };
      const cancel = () => finish(new DOMException('Đã hủy xử lý ảnh.', 'AbortError'));
      const timer = setTimeout(() => finish(new Error('Đọc ảnh quá lâu. Vui lòng chọn ảnh khác.')), 10000);
      signal.addEventListener('abort', cancel, {once:true});
      image.onload = () => finish(); image.onerror = () => finish(new Error('Không thể giải mã ảnh. Vui lòng chọn ảnh khác.'));
      image.src = url;
      if (signal.aborted) cancel();
    });
    signal.throwIfAborted();
    const width = image.naturalWidth, height = image.naturalHeight;
    if (!width || !height || width > portraitLimits.edge || height > portraitLimits.edge || width * height > portraitLimits.pixels ||
      !((width === dimensions.width && height === dimensions.height) || (width === dimensions.height && height === dimensions.width))) throw invalid();
    return {image, url, dispose};
  } catch (error) { dispose(); throw error; }
}
