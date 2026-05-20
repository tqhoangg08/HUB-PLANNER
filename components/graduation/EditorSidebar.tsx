import React from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff } from 'lucide-react';
import { InvitationProject, SectionKey } from './types';

const labels: Record<SectionKey, string> = {
  hero: 'Ảnh bìa / Hero',
  invitationCard: 'Trang thiệp chính',
  eventInfo: 'Thông tin lễ tốt nghiệp',
  message: 'Lời mời',
  graduateInfo: 'Thông tin tân cử nhân',
  gallery: 'Album ảnh',
  timeline: 'Timeline sự kiện',
  map: 'Địa điểm & bản đồ',
  rsvp: 'RSVP / xác nhận tham dự',
  footer: 'Footer',
};

interface EditorSidebarProps {
  project: InvitationProject;
  activeSection: SectionKey | 'overview' | 'theme' | 'elements' | 'publish';
  onSelect: (section: SectionKey | 'overview' | 'theme' | 'elements' | 'publish') => void;
  onToggle: (section: SectionKey) => void;
  onMove: (section: SectionKey, direction: -1 | 1) => void;
}

export const EditorSidebar = ({ project, activeSection, onSelect, onToggle, onMove }: EditorSidebarProps) => (
  <aside className="w-full border-r border-slate-200 bg-white p-4 lg:w-72">
    <div className="mb-4">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#003375]">Builder</p>
      <h2 className="mt-1 text-xl font-black text-slate-950">Graduation Invite</h2>
    </div>

    <nav className="space-y-2">
      {[
        ['overview', 'Tổng quan'],
        ['theme', 'Cài đặt giao diện'],
        ['elements', 'Sticker & layer'],
        ['publish', 'Xuất bản'],
      ].map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(key as 'overview' | 'theme' | 'elements' | 'publish')}
          className={`w-full rounded-2xl px-3 py-3 text-left text-sm font-black ${activeSection === key ? 'bg-[#003375] text-white' : 'text-slate-700 hover:bg-slate-50'}`}
        >
          {label}
        </button>
      ))}
    </nav>

    <div className="my-4 h-px bg-slate-200" />

    <div className="space-y-2">
      {project.sectionOrder.map((section, index) => (
        <div key={section} className={`rounded-2xl border p-2 ${activeSection === section ? 'border-[#003375] bg-blue-50' : 'border-slate-200 bg-white'}`}>
          <button type="button" onClick={() => onSelect(section)} className="w-full px-2 py-2 text-left text-sm font-black text-slate-800">
            {labels[section]}
          </button>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => onToggle(section)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" title="Bật/tắt section">
              {project.sections[section].enabled ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
            <button type="button" disabled={index === 0} onClick={() => onMove(section, -1)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30" title="Đưa lên">
              <ArrowUp size={16} />
            </button>
            <button type="button" disabled={index === project.sectionOrder.length - 1} onClick={() => onMove(section, 1)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30" title="Đưa xuống">
              <ArrowDown size={16} />
            </button>
          </div>
        </div>
      ))}
    </div>
  </aside>
);

