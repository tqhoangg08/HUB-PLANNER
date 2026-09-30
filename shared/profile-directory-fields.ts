export const PROFILE_GENDERS = ['Nam', 'Nữ'] as const;
export type ProfileGender = typeof PROFILE_GENDERS[number];

export const genderForSelect = (value: unknown): ProfileGender | '' =>
  value === 'Nam' || value === 'Nữ' ? value : '';

export const isValidProfileGender = (value: unknown): boolean =>
  value == null || value === '' || value === 'Nam' || value === 'Nữ';

export const MANUAL_CLASS_OPTION = 'Không tìm thấy, tự nhập';

const searchKey = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/gu, '')
  .replace(/đ/giu, 'd').toLocaleLowerCase('vi').trim();

export const filterDirectoryClasses = (classes: string[], query: string, limit = 100): string[] => {
  const needle = searchKey(query);
  return classes.filter((className) => searchKey(className).includes(needle)).slice(0, limit);
};
