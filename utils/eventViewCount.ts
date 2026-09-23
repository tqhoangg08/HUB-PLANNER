export const formatEventViewCount = (value: number): string => {
  const count = Number.isSafeInteger(value) && value >= 0 ? value : 0;
  if (count < 1_000) return `${count.toLocaleString('vi-VN')} lượt xem`;
  return `${(count / 1_000).toFixed(1).replace(/\.0$/, '')}K lượt xem`;
};
