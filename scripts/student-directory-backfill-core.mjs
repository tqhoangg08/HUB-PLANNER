const nonblank = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;

/** Directory fields that users may customize are filled only when empty. */
export const fillEditableDirectoryField = (target, field, directoryValue) => {
  const value = nonblank(directoryValue);
  if (!value) return 'missing_source';
  if (nonblank(target[field])) return 'preserved';
  target[field] = value;
  return 'filled';
};
