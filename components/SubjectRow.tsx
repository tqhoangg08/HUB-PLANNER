import React, { memo, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { GradeStatus, Subject } from '../types';
import { calculateSubjectAverage, getGradeDetails, getSubjectStatus } from '../utils/calculations';

const SCORE_FIELDS: Array<keyof Subject> = ['scoreCC', 'scoreProcess', 'scoreMid', 'scoreFinal'];

interface ScoreInputProps {
  value: number | null;
  onChange: (val: number | null) => void;
}

const ScoreInput = ({ value, onChange }: ScoreInputProps) => {
  const [localValue, setLocalValue] = useState<string>(value?.toString() ?? '');

  useEffect(() => {
    const parsedLocal = localValue === '' ? null : parseFloat(localValue);
    if (value !== parsedLocal) {
      setLocalValue(value?.toString() ?? '');
    }
  }, [localValue, value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    if (newVal === '') {
      setLocalValue('');
      onChange(null);
      return;
    }
    const parsed = parseFloat(newVal);
    if (isNaN(parsed) || parsed < 0 || parsed > 10) return;

    setLocalValue(newVal);
    onChange(parsed);
  };

  return (
    <input
      type="number"
      min="0"
      max="10"
      step="0.1"
      className="w-full bg-white border border-gray-300 text-gray-900 text-sm rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent p-1 text-center font-medium transition-all hover:border-blue-300"
      placeholder="-"
      value={localValue}
      onChange={handleChange}
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
          value={subject.name}
          onChange={(e) => onFieldChange(subject.id, 'name', e.target.value)}
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
          type="number"
          className="w-full bg-white border border-gray-300 rounded p-1 text-center font-semibold text-gray-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 hover:border-blue-300"
          value={subject.credits}
          onChange={(e) => onFieldChange(subject.id, 'credits', parseInt(e.target.value) || 0)}
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
});

SubjectRow.displayName = 'SubjectRow';
