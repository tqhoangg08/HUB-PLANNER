import React, { useEffect, useMemo, useState } from 'react';
import { filterDirectoryClasses, MANUAL_CLASS_OPTION } from '../shared/profile-directory-fields';

interface StudentClassPickerProps {
  id: string;
  value: string;
  classes: string[];
  onChange: (value: string) => void;
  inputClassName: string;
  invalid?: boolean;
  placeholder?: string;
}

/** Shared searchable selector for onboarding and account settings. */
export const StudentClassPicker: React.FC<StudentClassPickerProps> = ({
  id, value, classes, onChange, inputClassName, invalid, placeholder = 'Tìm lớp của bạn',
}) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState(false);
  const matches = useMemo(() => filterDirectoryClasses(classes, query), [classes, query]);

  // An already saved custom class remains editable when it is not in the directory.
  useEffect(() => {
    if (value && classes.length && !classes.includes(value)) setManual(true);
  }, [classes, value]);

  const selectClass = (className: string) => {
    onChange(className);
    setQuery('');
    setOpen(false);
  };

  if (manual) return (
    <div className="space-y-2" data-class-entry="manual">
      <input id={id} type="text" value={value} className={inputClassName} required
        onChange={(event) => onChange(event.target.value)}
        placeholder="Nhập lớp của bạn" aria-invalid={invalid} />
      <button type="button" className="text-xs font-semibold text-[#1769e0] hover:underline"
        onClick={() => { onChange(''); setQuery(''); setManual(false); setOpen(true); }}>
        Chọn từ danh sách
      </button>
    </div>
  );

  return (
    <div className="relative" onBlur={(event) => {
      if (!event.relatedTarget || !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <input id={id} role="combobox" aria-autocomplete="list" aria-controls={`${id}-options`}
        aria-expanded={open} aria-invalid={invalid} autoComplete="off"
        required
        className={inputClassName} placeholder={placeholder}
        value={open ? query : value}
        onFocus={() => { setQuery(''); setOpen(true); }}
        onChange={(event) => { setQuery(event.target.value); onChange(''); setOpen(true); }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
          if (event.key === 'Enter' && open) {
            event.preventDefault();
            if (matches.length) selectClass(matches[0]);
            else { setManual(true); onChange(query.trim()); setOpen(false); }
          }
        }} />
      {open && <div id={`${id}-options`} role="listbox"
        className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
        {matches.map((className) => (
          <button key={className} type="button" role="option" aria-selected={value === className}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-blue-50 focus:bg-blue-50"
            onClick={() => selectClass(className)}>{className}</button>
        ))}
        <button type="button" role="option" aria-selected={false}
          className="block w-full rounded-lg border-t border-slate-100 px-3 py-2 text-left text-sm font-semibold text-[#1769e0] hover:bg-blue-50 focus:bg-blue-50"
          onClick={() => { setManual(true); onChange(query.trim()); setOpen(false); }}>
          {MANUAL_CLASS_OPTION}
        </button>
      </div>}
    </div>
  );
};
