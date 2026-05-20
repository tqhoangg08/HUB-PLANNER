import React, { useEffect, useState } from 'react';
import { ExternalLink, Loader2, Save, Send, Smartphone } from 'lucide-react';
import { EditorSidebar } from './EditorSidebar';
import { MobilePreview } from './MobilePreview';
import { SectionEditor } from './SectionEditors';
import { ThemeSettingsPanel } from './ThemeSettingsPanel';
import { DesignElementsEditor } from './DesignElementsEditor';
import { listRsvps, publishInvitationProject, saveInvitationProject } from './invitationService';
import { DesignElement, InvitationProject, RsvpEntry, SectionKey } from './types';

interface InvitationEditorProps {
  initialProject: InvitationProject;
  onProjectChange: (project: InvitationProject) => void;
}

export const InvitationEditor = ({ initialProject, onProjectChange }: InvitationEditorProps) => {
  const [project, setProject] = useState(initialProject);
  const [activeSection, setActiveSection] = useState<SectionKey | 'overview' | 'theme' | 'elements' | 'publish'>('overview');
  const [selectedElementId, setSelectedElementId] = useState<string | null>(initialProject.designElements?.[0]?.id || null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [rsvps, setRsvps] = useState<RsvpEntry[]>([]);
  const publicUrl = project.slug ? `${window.location.origin}/graduation-invite/${project.slug}` : '';

  useEffect(() => {
    setProject(initialProject);
  }, [initialProject.id]);

  useEffect(() => {
    listRsvps(project.id).then(setRsvps).catch(() => setRsvps([]));
  }, [project.id, project.status]);

  const updateProject = (nextProject: InvitationProject) => {
    setProject(nextProject);
    onProjectChange(nextProject);
  };

  const updateDesignElement = (element: DesignElement) => {
    updateProject({
      ...project,
      designElements: (project.designElements || []).map((item) => (item.id === element.id ? element : item)),
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await saveInvitationProject(project);
      updateProject(saved);
      setToast('Đã lưu bản nháp.');
    } catch {
      setToast('Chưa lưu được bản nháp.');
    } finally {
      setSaving(false);
      window.setTimeout(() => setToast(''), 2200);
    }
  };

  const publish = async () => {
    setSaving(true);
    try {
      const saved = await publishInvitationProject(project);
      updateProject(saved);
      setActiveSection('publish');
      setToast('Đã xuất bản thiệp.');
    } catch {
      setToast('Chưa xuất bản được thiệp.');
    } finally {
      setSaving(false);
      window.setTimeout(() => setToast(''), 2200);
    }
  };

  const toggleSection = (section: SectionKey) => {
    updateProject({
      ...project,
      sections: {
        ...project.sections,
        [section]: {
          ...project.sections[section],
          enabled: !project.sections[section].enabled,
        },
      },
    });
  };

  const moveSection = (section: SectionKey, direction: -1 | 1) => {
    const index = project.sectionOrder.indexOf(section);
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= project.sectionOrder.length) return;
    const next = [...project.sectionOrder];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    updateProject({ ...project, sectionOrder: next });
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-slate-100 text-slate-900 lg:flex-row">
      <EditorSidebar
        project={project}
        activeSection={activeSection}
        onSelect={setActiveSection}
        onToggle={toggleSection}
        onMove={moveSection}
      />

      <main className="flex min-h-[720px] flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Editor</p>
            <h1 className="text-xl font-black text-slate-950">{project.title}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {publicUrl && (
              <a href={publicUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800">
                <ExternalLink size={16} /> Public link
              </a>
            )}
            <button type="button" onClick={() => window.open(publicUrl || window.location.href, '_blank')} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800">
              <Smartphone size={16} /> Preview
            </button>
            <button type="button" onClick={save} disabled={saving} className="flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white disabled:opacity-60">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Draft
            </button>
            <button type="button" onClick={publish} disabled={saving} className="flex items-center gap-2 rounded-2xl bg-[#003375] px-4 py-3 text-sm font-black text-white disabled:opacity-60">
              <Send size={16} /> Publish
            </button>
          </div>
        </header>

        <div className="grid flex-1 grid-cols-1 lg:grid-cols-[1fr_360px]">
          <div className="flex items-start justify-center overflow-auto p-5 lg:p-8">
            <div className="h-[780px] w-full max-w-[420px]">
              <MobilePreview
                project={project}
                onEdit={setActiveSection}
                selectedElementId={selectedElementId}
                onSelectDesignElement={(id) => {
                  setSelectedElementId(id);
                  setActiveSection('elements');
                }}
                onDesignElementChange={updateDesignElement}
              />
            </div>
          </div>

          <aside className="border-l border-slate-200 bg-white p-5">
            {activeSection === 'theme' ? (
              <ThemeSettingsPanel project={project} onChange={updateProject} />
            ) : activeSection === 'elements' ? (
              <DesignElementsEditor
                project={project}
                selectedElementId={selectedElementId}
                onSelect={setSelectedElementId}
                onChange={updateProject}
              />
            ) : (
              <SectionEditor project={project} activeSection={activeSection} onChange={updateProject} />
            )}

            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-black text-slate-900">Danh sách RSVP</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">{rsvps.length} phản hồi đã lưu cho thiệp này.</p>
              <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                {rsvps.map((entry) => (
                  <div key={entry.id} className="rounded-xl bg-white p-3 text-xs shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <b className="text-slate-900">{entry.name}</b>
                      <span className="font-black text-[#003375]">{entry.status}</span>
                    </div>
                    <p className="mt-1 text-slate-500">{entry.phoneOrEmail || 'Không có liên hệ'} · {entry.guestCount} người đi cùng</p>
                    {entry.message && <p className="mt-1 text-slate-600">{entry.message}</p>}
                  </div>
                ))}
                {!rsvps.length && <p className="text-xs font-semibold text-slate-500">Chưa có RSVP.</p>}
              </div>
            </div>
          </aside>
        </div>
      </main>

      {toast && (
        <div className="fixed bottom-5 right-5 z-[10000] rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
};
