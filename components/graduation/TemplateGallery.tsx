import React, { useState } from 'react';
import { ArrowRight, Eye, Palette } from 'lucide-react';
import { GraduationTemplate } from './types';

interface TemplateGalleryProps {
  templates: GraduationTemplate[];
  onSelect: (template: GraduationTemplate) => void;
}

const MiniPhonePreview = ({ template }: { template: GraduationTemplate }) => {
  const [primary, bg, accent] = template.palette;
  return (
    <div className="mx-auto w-[188px] rounded-[28px] border-[8px] border-slate-950 bg-white shadow-2xl">
      <div className="h-[310px] overflow-hidden rounded-[19px]" style={{ backgroundColor: template.themeConfig.backgroundColor }}>
        <div className="relative h-36">
          <img src={template.previewImage} alt={template.name} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-black/24 to-black/68" />
          <div className="absolute bottom-4 left-4 right-4 text-white">
            <p className="text-[7px] font-black uppercase tracking-[0.18em] opacity-80">Graduation</p>
            <p className="mt-1 text-lg font-black leading-none" style={{ fontFamily: template.themeConfig.headingFont }}>Minh Anh</p>
          </div>
          <div className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/85 text-lg shadow-sm">🎓</div>
        </div>
        <div className="space-y-3 p-3">
          <div className="rounded-2xl p-3" style={{ backgroundColor: '#FFFFFF' }}>
            <div className="mb-2 h-2 w-16 rounded-full" style={{ backgroundColor: accent || primary }} />
            <div className="grid grid-cols-2 gap-2">
              <div className="h-10 rounded-xl" style={{ backgroundColor: bg }} />
              <div className="h-10 rounded-xl" style={{ backgroundColor: bg }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2 h-14 rounded-xl bg-slate-200" />
            <div className="aspect-square rounded-xl bg-slate-300" />
            <div className="aspect-square rounded-xl bg-slate-100" />
          </div>
        </div>
      </div>
    </div>
  );
};

export const TemplateGallery = ({ templates, onSelect }: TemplateGalleryProps) => {
  const [previewId, setPreviewId] = useState(templates[0]?.id || '');
  const previewTemplate = templates.find((template) => template.id === previewId) || templates[0];

  return (
    <div className="min-h-[100dvh] bg-[radial-gradient(circle_at_top_left,#EAF2FF,transparent_34%),#F8FAFC] px-4 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[#003375]">Graduation Invite Website Builder</p>
            <h1 className="mt-3 max-w-3xl text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
              Chọn mẫu website thiệp tốt nghiệp
            </h1>
            <p className="mt-4 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
              Hiện chỉ giữ lại Garden Hour để build lại hệ template từ đầu. Mỗi template sẽ có renderer riêng để dễ mở rộng sau này.
            </p>
          </div>
          <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-black text-[#003375] shadow-sm">
            Link ẩn: /graduation-invites
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="grid max-w-[480px] gap-5">
            {templates.map((template) => {
              const active = previewTemplate?.id === template.id;
              return (
                <article
                  key={template.id}
                  className={`group overflow-hidden rounded-[28px] border bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-xl ${active ? 'border-[#003375] ring-4 ring-blue-100' : 'border-slate-200'}`}
                >
                  <div className="rounded-[24px] bg-slate-100 py-5">
                    <MiniPhonePreview template={template} />
                  </div>
                  <div className="space-y-4 pt-5">
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="text-xl font-black text-slate-950">{template.name}</h2>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                          {template.layoutStyle}
                        </span>
                      </div>
                      <p className="mt-2 min-h-12 text-sm font-semibold leading-6 text-slate-600">{template.description}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                        <Palette size={15} /> Palette
                      </span>
                      <div className="flex gap-1.5">
                        {template.palette.map((color) => (
                          <span key={color} className="h-6 w-6 rounded-full border border-slate-200" style={{ backgroundColor: color }} title={color} />
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewId(template.id)}
                        className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                      >
                        <Eye size={16} /> Xem trước
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelect(template)}
                        className="flex items-center justify-center gap-2 rounded-2xl bg-[#003375] px-3 py-3 text-sm font-black text-white transition hover:bg-[#00285c]"
                      >
                        Dùng mẫu <ArrowRight size={16} />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {previewTemplate && (
            <aside className="sticky top-6 hidden h-fit rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm lg:block">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Live mood preview</p>
              <h3 className="mt-2 text-2xl font-black text-slate-950">{previewTemplate.name}</h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{previewTemplate.description}</p>
              <div className="mt-6 rounded-[28px] bg-slate-100 py-6">
                <MiniPhonePreview template={previewTemplate} />
              </div>
              <button
                type="button"
                onClick={() => onSelect(previewTemplate)}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#003375] px-4 py-3 text-sm font-black text-white"
              >
                Dùng mẫu này <ArrowRight size={17} />
              </button>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
};
