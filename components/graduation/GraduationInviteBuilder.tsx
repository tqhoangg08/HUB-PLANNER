import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { InvitationEditor } from './InvitationEditor';
import { TemplateGallery } from './TemplateGallery';
import { getInvitationProject, saveInvitationProject } from './invitationService';
import { createProjectFromTemplate, graduationTemplates } from './templates';
import { InvitationProject } from './types';

interface GraduationInviteBuilderProps {
  userId?: string | null;
}

export const GraduationInviteBuilder = ({ userId = null }: GraduationInviteBuilderProps) => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<InvitationProject | null>(null);
  const [loading, setLoading] = useState(Boolean(projectId));
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    if (!projectId) {
      setProject(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    getInvitationProject(projectId)
      .then((loaded) => {
        if (!mounted) return;
        if (!loaded) setError('Không tìm thấy project thiệp.');
        const gardenHour = graduationTemplates[0];
        setProject(
          loaded && loaded.templateId === gardenHour.id
            ? loaded
            : loaded
              ? {
                  ...loaded,
                  templateId: gardenHour.id,
                  layoutStyle: gardenHour.layoutStyle,
                  themeConfig: { ...gardenHour.themeConfig },
                  designElements: gardenHour.designElements.map((item) => ({ ...item, id: `${item.id}-${loaded.id}` })),
                }
              : null,
        );
      })
      .catch(() => mounted && setError('Không tải được project thiệp.'))
      .finally(() => mounted && setLoading(false));

    return () => {
      mounted = false;
    };
  }, [projectId]);

  const selectTemplate = async (template: (typeof graduationTemplates)[number]) => {
    setLoading(true);
    setError('');
    try {
      const created = await saveInvitationProject(createProjectFromTemplate(template, userId || null));
      setProject(created);
      navigate(`/graduation-invites/${created.id}`, { replace: true });
    } catch {
      setError('Không tạo được thiệp từ template.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 text-[#003375]">
        <Loader2 className="animate-spin" size={36} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <h1 className="text-2xl font-black text-slate-900">{error}</h1>
        <button type="button" onClick={() => navigate('/graduation-invites')} className="mt-4 rounded-2xl bg-[#003375] px-5 py-3 text-sm font-black text-white">
          Quay lại chọn mẫu
        </button>
      </div>
    );
  }

  if (!project) {
    return <TemplateGallery templates={graduationTemplates} onSelect={selectTemplate} />;
  }

  return <InvitationEditor initialProject={project} onProjectChange={setProject} />;
};
