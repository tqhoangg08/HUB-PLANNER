import { GardenHourTemplate } from './templates/GardenHourTemplate';
import { DesignElement, InvitationProject, SectionKey } from './types';

interface SectionRendererProps {
  project: InvitationProject;
  sectionKey: SectionKey;
  mode?: 'editor' | 'public';
  onEdit?: (key: SectionKey) => void;
  onRsvpSubmitted?: () => void;
  selectedElementId?: string | null;
  onSelectDesignElement?: (id: string) => void;
  onDesignElementChange?: (element: DesignElement) => void;
}

export const SectionRenderer = (props: SectionRendererProps) => {
  return <GardenHourTemplate {...props} />;
};
