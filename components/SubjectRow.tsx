import React, { memo, useState, useEffect, useRef, useCallback } from 'react';
import { Trash2 } from 'lucide-react';
import { GradeStatus, Subject } from '../types';
import { calculateSubjectAverage, getGradeDetails, getSubjectStatus } from '../utils/calculations';

const SCORE_FIELDS: Array<keyof Subject> = ['scoreCC', 'scoreProcess', 'scoreMid', 'scoreFinal'];

interface ScoreInputProps {
  value: number | null;
  onChange: (val: number | null) => void;
}

// Component nhập điểm đã được tối ưu
const ScoreInput = ({ value, onChange }: ScoreInputProps) => {
  // Chỉ khởi tạo state 1 lần, sau đó sync thủ công khi cần thiết
  const [localValue, setLocalValue] = useState<string>(value?.toString() ?? '');
  const prevValueRef = useRef<number | null>(value ?? null);
  const debounceRef = useRef<number | null>(null);
  const lastSentRef = useRef<number | null>(value ?? null);

  // Sync khi props value thay đổi từ bên ngoài (ví dụ: import PDF, reset)
  useEffect(() => {
    if (value !== prevValueRef.current) {
      prevValueRef.current = value ?? null;
      lastSentRef.current = value ?? null;
      setLocalValue(value?.toString() ?? '');
    }
  }, [value]);

  const commitValue = useCallback((rawValue: string) => {
    if (rawValue.trim() === '') {
      if (lastSentRef.current !== null) {
        lastSentRef.current = null;
        onChange(null);
      }
      return;
    }

    const parsed = parseFloat(rawValue);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 10 && parsed !== lastSentRef.current) {
      lastSentRef.current = parsed;
      onChange(parsed);
    }
  }, [onChange]);

  useEffect(() => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      commitValue(localValue);
    }, 250);

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [commitValue, localValue]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setLocalValue(newVal);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      pattern="^\\d*(\\.\\d*)?$"
      className="w-full bg-white border border-gray-300 text-gray-900 text-sm rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent p-1 text-center font-medium transition-all hover:border-blue-300"
      placeholder="-"
      value={localValue}
      onChange={handleChange}
      onBlur={() => commitValue(localValue)}
    />
  );
};

interface SubjectRowProps {
  subject: Subject;
  index: number;
  onFieldChange: (subjectId: string, field: keyof Subject, value: any) => void;
  onToggleNonGPA: (subjectId: string, isNonGPA: boolean) => void;
  onRemove: (subjectId: string) => void;
}

export const SubjectRow = memo(({ subject, index, onFieldChange, onToggleNonGPA, onRemove }: SubjectRowProps) => {
  const avg10 = calculateSubjectAverage(subject);
  const { scale4: avg4, letter } = avg10 !== null ? getGradeDetails(avg10) : { scale4: null, letter: '-' };
  const status = getSubjectStatus(avg10);
  const [localName, setLocalName] = useState(subject.name);
  const [localCredits, setLocalCredits] = useState(subject.credits.toString());
  const nameRef = useRef(subject.name);
  const creditsRef = useRef(subject.credits);
  const nameDebounceRef = useRef<number | null>(null);
  const creditsDebounceRef = useRef<number | null>(null);

  let statusClass = 'text-gray-400';
  let statusText = '-';
  let rowClass = 'hover:bg-blue-50/30';

  if (status === GradeStatus.FAIL) {
    statusClass = 'bg-red-100 text-[#990000] font-bold';
    statusText = 'Rớt';
    rowClass = 'bg-red-50/50 hover:bg-red-100/50';
  } else if (status === GradeStatus.IMPROVE) {
    statusClass = 'bg-yellow-100 text-yellow-700';
    statusText = 'Đạt';
  } else if (status === GradeStatus.PASS) {
    statusClass = 'bg-green-100 text-green-700 font-bold';
    statusText = 'Đạt';
  }

  useEffect(() => {
    if (subject.name !== nameRef.current) {
      nameRef.current = subject.name;
      setLocalName(subject.name);
    }
  }, [subject.name]);

  useEffect(() => {
    if (subject.credits !== creditsRef.current) {
      creditsRef.current = subject.credits;
      setLocalCredits(subject.credits.toString());
    }
  }, [subject.credits]);

  const commitName = useCallback((value: string) => {
    if (value !== nameRef.current) {
      nameRef.current = value;
      onFieldChange(subject.id, 'name', value);
    }
  }, [onFieldChange, subject.id]);

  const commitCredits = useCallback((value: string) => {
    const parsed = parseInt(value, 10);
    const normalized = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    if (normalized !== creditsRef.current) {
      creditsRef.current = normalized;
      onFieldChange(subject.id, 'credits', normalized);
    }
  }, [onFieldChange, subject.id]);

  useEffect(() => {
    if (nameDebounceRef.current) {
      window.clearTimeout(nameDebounceRef.current);
    }
    nameDebounceRef.current = window.setTimeout(() => {
      commitName(localName);
    }, 300);

    return () => {
      if (nameDebounceRef.current) {
        window.clearTimeout(nameDebounceRef.current);
      }
    };
  }, [commitName, localName]);

  useEffect(() => {
    if (creditsDebounceRef.current) {
      window.clearTimeout(creditsDebounceRef.current);
    }
    creditsDebounceRef.current = window.setTimeout(() => {
      commitCredits(localCredits);
    }, 300);

    return () => {
      if (creditsDebounceRef.current) {
        window.clearTimeout(creditsDebounceRef.current);
      }
    };
  }, [commitCredits, localCredits]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalName(e.target.value);
  };
  
  const handleCreditChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalCredits(e.target.value);
  };

  return (
    <tr className={`${rowClass} transition-colors duration-150 group`}>
      <td className="px-3 py-2 text-center text-gray-500">{index + 1}</td>

      {SCORE_FIELDS.map((key) => (
        <td key={key} className="px-1 py-2">
          <ScoreInput
            value={subject[key] as number | null}
            onChange={(val) => onFieldChange(subject.id, key, val)}
          />
        </td>
      ))}

      <td className="px-3 py-2">
        <input
          type="text"
          className="w-full bg-transparent border-b border-transparent focus:border-blue-500 focus:outline-none p-1 font-medium text-gray-800 transition-colors group-hover:text-[#003375]"
          value={localName}
          onChange={handleNameChange}
          onBlur={() => commitName(localName)}
        />
        <div className="flex items-center gap-2 mt-1">
          <label className="text-[10px] text-gray-500 flex items-center gap-1 cursor-pointer select-none hover:text-[#003375] transition-colors">
            <input
              type="checkbox"
              checked={subject.isNonGPA}
              onChange={(e) => onToggleNonGPA(subject.id, e.target.checked)}
              className="rounded text-[#003375] focus:ring-[#003375] w-3 h-3 mr-1"
            />
            Không tính GPA
          </label>
        </div>
      </td>

      <td className="px-1 py-2">
        <input
          type="text"
          inputMode="numeric"
          pattern="\\d*"
          className="w-full bg-white border border-gray-300 rounded p-1 text-center font-semibold text-gray-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 hover:border-blue-300"
          value={localCredits}
          onChange={handleCreditChange}
          onBlur={() => commitCredits(localCredits)}
        />
      </td>

      <td className="px-2 py-2 text-center font-bold text-[#990000]">
        {avg10 !== null ? avg10.toFixed(1) : '-'}
      </td>

      <td className="px-2 py-2 text-center font-bold text-gray-700">
        {letter}
      </td>

      <td className="px-2 py-2 text-center font-bold text-[#003375]">
        {avg4 !== null ? avg4.toFixed(1) : '-'}
      </td>

      <td className="px-3 py-2 text-center">
        <span className={`px-2 py-1 rounded text-xs block w-full text-center shadow-sm ${statusClass}`}>
          {statusText}
        </span>
      </td>

      <td className="px-2 py-2 text-center">
        <button
          onClick={() => onRemove(subject.id)}
          className="text-gray-300 hover:text-red-500 transition-all hover:scale-110 p-1 active:scale-90"
          title="Xóa môn"
        >
          <Trash2 size={16} />
        </button>
      </td>
    </tr>
  );
}, (prevProps, nextProps) => {
    // Tối ưu Memo: Chỉ render lại nếu dữ liệu thực sự thay đổi
    return prevProps.subject === nextProps.subject && prevProps.index === nextProps.index;
});

SubjectRow.displayName = 'SubjectRow';
