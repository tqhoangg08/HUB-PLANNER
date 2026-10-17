const scoreLabels: Record<string, string> = {
  gpa: 'Điểm TB HB',
  academicRank: 'Xếp loại HT',
  trainingScore: 'Điểm RL',
  trainingRank: 'Xếp loại RL',
  credits: 'Số TC',
  amountVnd: 'Thành tiền',
  selectionScore: 'Điểm xét học bổng',
};

const vndFormatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 20 });

// Only use scores already filtered by the server's field approval checks.
export function personalAwardDetails(scores: Record<string, number | string | null> | null | undefined) {
  return Object.entries(scores ?? {}).flatMap(([key, value]) => {
    if (!Object.hasOwn(scoreLabels, key) || value == null) return [];
    if (typeof value !== 'string' && typeof value !== 'number') return [];
    if (typeof value === 'number' && !Number.isFinite(value)) return [];
    const text = String(value).trim();
    if (!text) return [];
    let formatted = text;
    if (key === 'amountVnd' && /^-?\d+(?:\.\d+)?$/.test(text) && Number.isFinite(Number(text))) {
      formatted = `${vndFormatter.format(Number(text))}đ`;
    }
    return [{ key, label: scoreLabels[key], value: formatted }];
  });
}
