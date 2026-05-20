import React from 'react';
import { Plus, Trash2, Upload } from 'lucide-react';
import { uploadImage } from './upload';
import { GalleryImage, InvitationProject, SectionKey, TimelineItem } from './types';

interface SectionEditorProps {
  project: InvitationProject;
  activeSection: SectionKey | 'overview' | 'publish';
  onChange: (project: InvitationProject) => void;
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block text-xs font-black uppercase tracking-[0.12em] text-slate-500">
    {label}
    <div className="mt-2">{children}</div>
  </label>
);

const inputClass = 'w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-[#003375]';
const textareaClass = `${inputClass} min-h-28 resize-none leading-6`;

const nextId = (prefix: string) =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${prefix}-${Date.now()}`;

export const HeroSectionEditor = ({ project, onChange }: Omit<SectionEditorProps, 'activeSection'>) => {
  const hero = project.sections.hero;
  const update = (patch: Partial<typeof hero>) => onChange({ ...project, sections: { ...project.sections, hero: { ...hero, ...patch } } });
  const handleFile = async (file?: File) => {
    if (!file) return;
    update({ imageUrl: await uploadImage(file) });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-black text-slate-950">Ảnh bìa / Hero</h3>
      <Field label="Ảnh bìa URL"><input value={hero.imageUrl} onChange={(e) => update({ imageUrl: e.target.value })} className={inputClass} /></Field>
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm font-black text-slate-600">
        <Upload size={16} /> Tải ảnh lên / thay ảnh
        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
      </label>
      <Field label="Eyebrow"><input value={hero.eyebrow} onChange={(e) => update({ eyebrow: e.target.value })} className={inputClass} /></Field>
      <Field label="Tiêu đề"><input value={hero.title} onChange={(e) => update({ title: e.target.value })} className={inputClass} /></Field>
      <Field label="Tên sinh viên"><input value={hero.graduateName} onChange={(e) => update({ graduateName: e.target.value })} className={inputClass} /></Field>
      <Field label="Dòng phụ"><textarea value={hero.subtitle} onChange={(e) => update({ subtitle: e.target.value })} className={textareaClass} /></Field>
    </div>
  );
};

export const EventInfoEditor = ({ project, onChange }: Omit<SectionEditorProps, 'activeSection'>) => {
  const event = project.sections.eventInfo;
  const update = (patch: Partial<typeof event>) => onChange({ ...project, sections: { ...project.sections, eventInfo: { ...event, ...patch } } });

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-black text-slate-950">Thông tin lễ tốt nghiệp</h3>
      <Field label="Tên buổi lễ"><input value={event.title} onChange={(e) => update({ title: e.target.value })} className={inputClass} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ngày"><input value={event.date} onChange={(e) => update({ date: e.target.value })} className={inputClass} /></Field>
        <Field label="Giờ"><input value={event.time} onChange={(e) => update({ time: e.target.value })} className={inputClass} /></Field>
      </div>
      <Field label="Địa điểm"><input value={event.venue} onChange={(e) => update({ venue: e.target.value })} className={inputClass} /></Field>
      <Field label="Địa chỉ chi tiết"><textarea value={event.address} onChange={(e) => update({ address: e.target.value })} className={textareaClass} /></Field>
      <Field label="Google Maps link"><input value={event.mapUrl} onChange={(e) => update({ mapUrl: e.target.value })} className={inputClass} /></Field>
    </div>
  );
};

export const InvitationCardEditor = ({ project, onChange }: Omit<SectionEditorProps, 'activeSection'>) => {
  const card = project.sections.invitationCard;
  const update = (patch: Partial<typeof card>) => onChange({ ...project, sections: { ...project.sections, invitationCard: { ...card, ...patch } } });
  const setImages = (images: GalleryImage[]) => update({ images });
  const replaceFile = async (index: number, file?: File) => {
    if (!file) return;
    const url = await uploadImage(file);
    setImages(card.images.map((image, imageIndex) => imageIndex === index ? { ...image, url, alt: file.name } : image));
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-black text-slate-950">Trang thiệp chính</h3>
      <p className="rounded-2xl bg-amber-50 p-4 text-sm font-semibold leading-6 text-slate-700">
        Phần này dùng dữ liệu riêng, không liên quan Hero, thông tin lễ hay Album ảnh bên dưới.
      </p>
      <Field label="Dòng nhỏ phía trên"><input value={card.eyebrow} onChange={(e) => update({ eyebrow: e.target.value })} className={inputClass} /></Field>
      <Field label="Tiêu đề trên thiệp"><input value={card.title} onChange={(e) => update({ title: e.target.value })} className={inputClass} /></Field>
      <Field label="Tên hiển thị"><input value={card.name} onChange={(e) => update({ name: e.target.value })} className={inputClass} /></Field>
      <Field label="Ngày trên thiệp"><input value={card.date} onChange={(e) => update({ date: e.target.value })} className={inputClass} /></Field>

      <div className="space-y-3">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">3 ảnh polaroid riêng</p>
        {card.images.map((image, index) => (
          <div key={image.id} className="rounded-2xl border border-slate-200 p-3">
            <div className="flex gap-3">
              <img src={image.url} alt={image.alt} className="h-20 w-16 rounded-xl object-cover" />
              <div className="min-w-0 flex-1 space-y-2">
                <input value={image.url} onChange={(e) => setImages(card.images.map((item) => item.id === image.id ? { ...item, url: e.target.value } : item))} className={inputClass} />
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs font-black text-slate-600">
                  <Upload size={14} /> Thay ảnh {index + 1}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => replaceFile(index, e.target.files?.[0])} />
                </label>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const GalleryEditor = ({ project, onChange }: Omit<SectionEditorProps, 'activeSection'>) => {
  const gallery = project.sections.gallery;
  const setImages = (images: GalleryImage[]) => onChange({ ...project, sections: { ...project.sections, gallery: { ...gallery, images } } });
  const addFiles = async (files?: FileList | null) => {
    if (!files?.length) return;
    const uploaded = await Promise.all(Array.from(files).map(async (file) => ({
      id: nextId('gallery'),
      url: await uploadImage(file),
      alt: file.name,
    })));
    setImages([...gallery.images, ...uploaded]);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-black text-slate-950">Album ảnh</h3>
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm font-black text-slate-600">
        <Upload size={16} /> Thêm ảnh album
        <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => addFiles(e.target.files)} />
      </label>
      <div className="space-y-3">
        {gallery.images.map((image, index) => (
          <div key={image.id} className="flex gap-3 rounded-2xl border border-slate-200 p-2">
            <img src={image.url} alt={image.alt} className="h-20 w-16 rounded-xl object-cover" />
            <div className="min-w-0 flex-1 space-y-2">
              <input value={image.url} onChange={(e) => setImages(gallery.images.map((item) => item.id === image.id ? { ...item, url: e.target.value } : item))} className={inputClass} />
              <div className="flex gap-2">
                <button type="button" disabled={index === 0} onClick={() => {
                  const next = [...gallery.images];
                  [next[index - 1], next[index]] = [next[index], next[index - 1]];
                  setImages(next);
                }} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black disabled:opacity-30">Lên</button>
                <button type="button" disabled={index === gallery.images.length - 1} onClick={() => {
                  const next = [...gallery.images];
                  [next[index], next[index + 1]] = [next[index + 1], next[index]];
                  setImages(next);
                }} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black disabled:opacity-30">Xuống</button>
                <button type="button" onClick={() => setImages(gallery.images.filter((item) => item.id !== image.id))} className="ml-auto rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-600"><Trash2 size={14} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const TimelineEditor = ({ project, onChange }: Omit<SectionEditorProps, 'activeSection'>) => {
  const timeline = project.sections.timeline;
  const setItems = (items: TimelineItem[]) => onChange({ ...project, sections: { ...project.sections, timeline: { ...timeline, items } } });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-black text-slate-950">Timeline sự kiện</h3>
        <button type="button" onClick={() => setItems([...timeline.items, { id: nextId('timeline'), time: '11:00', title: 'Hoạt động mới' }])} className="rounded-xl bg-[#003375] p-2 text-white"><Plus size={16} /></button>
      </div>
      {timeline.items.map((item) => (
        <div key={item.id} className="grid grid-cols-[88px_1fr_auto] gap-2">
          <input value={item.time} onChange={(e) => setItems(timeline.items.map((row) => row.id === item.id ? { ...row, time: e.target.value } : row))} className={inputClass} />
          <input value={item.title} onChange={(e) => setItems(timeline.items.map((row) => row.id === item.id ? { ...row, title: e.target.value } : row))} className={inputClass} />
          <button type="button" onClick={() => setItems(timeline.items.filter((row) => row.id !== item.id))} className="rounded-2xl bg-red-50 px-3 text-red-600"><Trash2 size={16} /></button>
        </div>
      ))}
    </div>
  );
};

export const SectionEditor = ({ project, activeSection, onChange }: SectionEditorProps) => {
  if (activeSection === 'hero') return <HeroSectionEditor project={project} onChange={onChange} />;
  if (activeSection === 'invitationCard') return <InvitationCardEditor project={project} onChange={onChange} />;
  if (activeSection === 'eventInfo') return <EventInfoEditor project={project} onChange={onChange} />;
  if (activeSection === 'gallery') return <GalleryEditor project={project} onChange={onChange} />;
  if (activeSection === 'timeline') return <TimelineEditor project={project} onChange={onChange} />;

  if (activeSection === 'overview') {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-black text-slate-950">Tổng quan</h3>
        <Field label="Tên project">
          <input value={project.title} onChange={(e) => onChange({ ...project, title: e.target.value })} className={inputClass} />
        </Field>
        <p className="rounded-2xl bg-blue-50 p-4 text-sm font-semibold leading-6 text-slate-700">
          Click vào text hoặc ảnh trong preview để mở đúng panel chỉnh sửa. Sidebar bên trái cho phép bật/tắt và đổi thứ tự section.
        </p>
      </div>
    );
  }

  if (activeSection === 'message') {
    const message = project.sections.message;
    const update = (patch: Partial<typeof message>) => onChange({ ...project, sections: { ...project.sections, message: { ...message, ...patch } } });
    const images = message.images || [];
    const setImages = (nextImages: GalleryImage[]) => update({ images: nextImages });
    const replaceFile = async (index: number, file?: File) => {
      if (!file) return;
      const url = await uploadImage(file);
      setImages(images.map((image, imageIndex) => imageIndex === index ? { ...image, url, alt: file.name } : image));
    };

    return (
      <div className="space-y-4">
        <h3 className="text-lg font-black text-slate-950">Lời mời</h3>
        <Field label="Tiêu đề section">
          <input value={message.title || ''} onChange={(e) => update({ title: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Tên hiển thị">
          <input value={message.name || ''} onChange={(e) => update({ name: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Nội dung">
          <textarea value={message.message} onChange={(e) => update({ message: e.target.value })} className={textareaClass} />
        </Field>
        <div className="space-y-3">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Ảnh riêng của lời mời</p>
          {images.map((image, index) => (
            <div key={image.id} className="rounded-2xl border border-slate-200 p-3">
              <div className="flex gap-3">
                <img src={image.url} alt={image.alt} className="h-20 w-16 rounded-xl object-cover" />
                <div className="min-w-0 flex-1 space-y-2">
                  <input value={image.url} onChange={(e) => setImages(images.map((item) => item.id === image.id ? { ...item, url: e.target.value } : item))} className={inputClass} />
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs font-black text-slate-600">
                    <Upload size={14} /> Thay ảnh {index + 1}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => replaceFile(index, e.target.files?.[0])} />
                  </label>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (activeSection === 'graduateInfo') {
    const info = project.sections.graduateInfo;
    const update = (patch: Partial<typeof info>) => onChange({ ...project, sections: { ...project.sections, graduateInfo: { ...info, ...patch } } });
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-black text-slate-950">Thông tin tân cử nhân</h3>
        {[
          ['fullName', 'Họ tên'],
          ['school', 'Trường'],
          ['major', 'Khoa/ngành'],
          ['className', 'Lớp'],
          ['cohort', 'Niên khóa'],
          ['achievement', 'Thành tích nổi bật'],
        ].map(([key, label]) => (
          <Field key={key} label={label}><input value={(info as any)[key]} onChange={(e) => update({ [key]: e.target.value } as any)} className={inputClass} /></Field>
        ))}
      </div>
    );
  }

  if (activeSection === 'map') {
    const map = project.sections.map;
    const update = (patch: Partial<typeof map>) => onChange({ ...project, sections: { ...project.sections, map: { ...map, ...patch } } });
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-black text-slate-950">Địa điểm & bản đồ</h3>
        <Field label="Địa chỉ"><textarea value={map.address} onChange={(e) => update({ address: e.target.value })} className={textareaClass} /></Field>
        <Field label="Google Maps embed URL"><input value={map.embedUrl} onChange={(e) => update({ embedUrl: e.target.value })} className={inputClass} /></Field>
        <Field label="Google Maps link"><input value={map.mapUrl} onChange={(e) => update({ mapUrl: e.target.value })} className={inputClass} /></Field>
      </div>
    );
  }

  if (activeSection === 'rsvp') {
    const rsvp = project.sections.rsvp;
    const update = (patch: Partial<typeof rsvp>) => onChange({ ...project, sections: { ...project.sections, rsvp: { ...rsvp, ...patch } } });
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-black text-slate-950">RSVP</h3>
        <Field label="Tiêu đề"><input value={rsvp.title} onChange={(e) => update({ title: e.target.value })} className={inputClass} /></Field>
        <Field label="Mô tả"><textarea value={rsvp.description} onChange={(e) => update({ description: e.target.value })} className={textareaClass} /></Field>
      </div>
    );
  }

  const footer = project.sections.footer;
  const updateFooter = (patch: Partial<typeof footer>) => onChange({ ...project, sections: { ...project.sections, footer: { ...footer, ...patch } } });
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-black text-slate-950">{activeSection === 'publish' ? 'Xuất bản' : 'Footer'}</h3>
      <Field label="Lời cảm ơn"><textarea value={footer.thankYou} onChange={(e) => updateFooter({ thankYou: e.target.value })} className={textareaClass} /></Field>
      <Field label="Contact info"><input value={footer.contactInfo} onChange={(e) => updateFooter({ contactInfo: e.target.value })} className={inputClass} /></Field>
      <label className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 text-sm font-bold text-slate-700">
        <input type="checkbox" checked={footer.showBranding} onChange={(e) => updateFooter({ showBranding: e.target.checked })} />
        Hiện branding
      </label>
    </div>
  );
};

