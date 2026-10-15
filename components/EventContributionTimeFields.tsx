import React, { useId } from 'react';

type TimeValues = {
  category: string; close_on_full: boolean;
  deadline: string; deadline_time: string; event_date: string; event_time: string;
};
type TimeKey = 'deadline' | 'deadline_time' | 'event_date' | 'event_time';

export const EventContributionTimeFields = ({ value, onChange }: {
  value: TimeValues; onChange: (key: TimeKey, value: string) => void;
}) => {
  const id = useId();
  const minigame = (value.category || '').toLowerCase().includes('minigame');
  const fields: { key: TimeKey; label: string; type: 'date' | 'time'; deadline?: boolean }[] = minigame ? [
    { key:'event_date', label:'Ngày bắt đầu', type:'date' },
    { key:'event_time', label:'Giờ bắt đầu', type:'time' },
    { key:'deadline', label:'Ngày kết thúc', type:'date', deadline:true },
    { key:'deadline_time', label:'Giờ kết thúc', type:'time', deadline:true },
  ] : [
    { key:'deadline', label:'Ngày đóng ĐK', type:'date', deadline:true },
    { key:'deadline_time', label:'Giờ đóng ĐK', type:'time', deadline:true },
    { key:'event_date', label:'Ngày diễn ra', type:'date' },
    { key:'event_time', label:'Giờ diễn ra', type:'time' },
  ];
  return <div role="group" aria-label="Thời gian sự kiện" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
    {fields.map((field) => <div key={field.key} className="min-w-0">
      <label htmlFor={`${id}-${field.key}`} className={`mb-1 block font-bold ${field.deadline && value.close_on_full ? 'text-gray-400' : 'text-gray-700'}`}>{field.label}</label>
      <input id={`${id}-${field.key}`} type={field.type} value={value[field.key] || ''}
        disabled={Boolean(field.deadline && value.close_on_full)} onChange={(event) => onChange(field.key,event.target.value)}
        className="w-full min-w-0 rounded-lg border border-gray-300 bg-white p-2.5 outline-none focus:ring-2 focus:ring-[#003375] disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"/>
    </div>)}
  </div>;
};
