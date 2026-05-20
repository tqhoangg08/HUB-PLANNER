import React, { useEffect, useState } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { getPublishedInvitationBySlug } from './invitationService';
import { MobilePreview } from './MobilePreview';
import { InvitationProject } from './types';

export const PublicInvitationPage = () => {
  const { slug } = useParams();
  const [project, setProject] = useState<InvitationProject | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    if (!slug) return;

    setLoading(true);
    getPublishedInvitationBySlug(slug)
      .then((loaded) => mounted && setProject(loaded))
      .finally(() => mounted && setLoading(false));

    return () => {
      mounted = false;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-slate-950 text-white">
        <Loader2 className="animate-spin" size={36} />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <ShieldAlert className="text-slate-300" size={48} />
        <h1 className="mt-4 text-2xl font-black text-slate-900">Không tìm thấy thiệp mời</h1>
        <p className="mt-2 text-sm text-slate-500">Link có thể chưa được xuất bản hoặc đã bị đổi.</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[radial-gradient(circle_at_top,#EAF2FF,transparent_32%),#EEF2F7] md:px-6 md:py-8">
      <div className="mx-auto min-h-[100dvh] w-full max-w-[430px] overflow-hidden bg-white shadow-2xl md:min-h-0 md:rounded-[34px] md:border-[10px] md:border-slate-950">
        <MobilePreview project={project} mode="public" />
      </div>
    </div>
  );
};
