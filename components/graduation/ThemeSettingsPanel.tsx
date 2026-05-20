import React from 'react';
import { graduationTemplates } from './templates';
import { DesignElement, InvitationProject } from './types';

interface ThemeSettingsPanelProps {
  project: InvitationProject;
  onChange: (project: InvitationProject) => void;
}

export const ThemeSettingsPanel = ({ project, onChange }: ThemeSettingsPanelProps) => {
  const newId = (prefix: string) =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${prefix}-${Date.now()}`;

  const cloneElements = (elements: DesignElement[]) => elements.map((item) => ({ ...item, id: newId(item.id) }));

  const updateTheme = (patch: Partial<InvitationProject['themeConfig']>) => {
    onChange({ ...project, themeConfig: { ...project.themeConfig, ...patch } });
  };

  const applyTemplateLayout = (templateId: string) => {
    const template = graduationTemplates.find((item) => item.id === templateId);
    if (!template) return;

    onChange({
      ...project,
      templateId: template.id,
      layoutStyle: template.layoutStyle,
      themeConfig: { ...template.themeConfig },
      designElements: cloneElements(template.designElements),
    });
  };

  const applyEffectTheme = (theme: string) => {
    const effectMap: Record<string, DesignElement['effect'][]> = {
      elegantReveal: ['fadeInUp', 'fadeInUp', 'zoomIn'],
      sideStory: ['fadeInLeft', 'fadeInRight', 'fadeInUp'],
      popCeremony: ['zoomIn', 'flipIn', 'float'],
      floatingStickers: ['float'],
    };
    const effects = effectMap[theme] || ['fadeInUp'];

    onChange({
      ...project,
      themeConfig: { ...project.themeConfig, animationEnabled: true },
      designElements: (project.designElements || []).map((item, index) => ({
        ...item,
        effect: effects[index % effects.length],
      })),
    });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-black text-slate-950">Cài đặt giao diện</h3>
      <label className="block text-xs font-black text-slate-500">
        Đổi bố cục/template
        <select value={project.templateId} onChange={(e) => applyTemplateLayout(e.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm text-slate-900">
          {graduationTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
        </select>
        <span className="mt-2 block text-[11px] font-semibold leading-5 text-slate-400">
          Đổi bố cục sẽ áp dụng theme và bộ sticker/layer mẫu của template mới, nội dung chữ trong form vẫn được giữ.
        </span>
      </label>
      <div className="grid grid-cols-2 gap-3">
        {[
          ['primaryColor', 'Màu chủ đạo'],
          ['backgroundColor', 'Màu nền'],
          ['textColor', 'Màu chữ'],
        ].map(([key, label]) => (
          <label key={key} className="text-xs font-black text-slate-500">
            {label}
            <input type="color" value={(project.themeConfig as any)[key]} onChange={(e) => updateTheme({ [key]: e.target.value } as any)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white p-1" />
          </label>
        ))}
      </div>
      <label className="block text-xs font-black text-slate-500">
        Font heading
        <select value={project.themeConfig.headingFont} onChange={(e) => updateTheme({ headingFont: e.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm text-slate-900">
          {['Playfair Display', 'Cormorant Garamond', 'Lora', 'Libre Baskerville'].map((font) => <option key={font}>{font}</option>)}
        </select>
      </label>
      <label className="block text-xs font-black text-slate-500">
        Font body
        <select value={project.themeConfig.bodyFont} onChange={(e) => updateTheme({ bodyFont: e.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm text-slate-900">
          {['Inter', 'Roboto', 'Nunito', 'Be Vietnam Pro'].map((font) => <option key={font}>{font}</option>)}
        </select>
      </label>
      <label className="block text-xs font-black text-slate-500">
        Border radius: {project.themeConfig.borderRadius}px
        <input type="range" min={0} max={28} value={project.themeConfig.borderRadius} onChange={(e) => updateTheme({ borderRadius: Number(e.target.value) })} className="mt-2 w-full" />
      </label>
      <label className="block text-xs font-black text-slate-500">
        Kiểu section
        <select value={project.themeConfig.sectionStyle} onChange={(e) => updateTheme({ sectionStyle: e.target.value as any })} className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm text-slate-900">
          <option value="classic">classic</option>
          <option value="minimal">minimal</option>
          <option value="modern">modern</option>
        </select>
      </label>
      <label className="block text-xs font-black text-slate-500">
        Theme hiệu ứng cho ảnh/sticker/text
        <select onChange={(e) => applyEffectTheme(e.target.value)} defaultValue="" className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm text-slate-900">
          <option value="" disabled>Chọn bộ hiệu ứng</option>
          <option value="elegantReveal">Elegant reveal</option>
          <option value="sideStory">Slide trái/phải</option>
          <option value="popCeremony">Pop ceremony</option>
          <option value="floatingStickers">Sticker bay nhẹ</option>
        </select>
      </label>
      <label className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 text-sm font-bold text-slate-700">
        <input type="checkbox" checked={project.themeConfig.animationEnabled} onChange={(e) => updateTheme({ animationEnabled: e.target.checked })} />
        Bật animation nhẹ
      </label>
    </div>
  );
};
