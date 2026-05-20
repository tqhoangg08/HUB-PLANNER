import { supabase } from '../../utils/supabase';
import { DEFAULT_SECTION_ORDER, defaultSections } from './templates';
import { InvitationProject, RsvpEntry, RsvpStatus } from './types';

const PROJECTS_KEY = 'graduation_invitation_projects_v1';
const RSVP_KEY = 'graduation_invitation_rsvps_v1';

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) || '') as T;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const toDbProject = (project: InvitationProject) => ({
  id: project.id,
  user_id: project.userId,
  title: project.title,
  slug: project.slug || null,
  template_id: project.templateId,
  status: project.status,
  theme_config: project.themeConfig,
  layout_style: project.layoutStyle,
  sections: project.sections,
  section_order: project.sectionOrder,
  design_elements: project.designElements,
  created_at: project.createdAt,
  updated_at: project.updatedAt,
  published_at: project.publishedAt,
});

const normalizeProject = (project: InvitationProject): InvitationProject => {
  const defaults = defaultSections();
  const source = project.sections || defaults;
  const sections = Object.fromEntries(
    Object.entries(defaults).map(([key, value]) => [key, { ...value, ...((source as any)[key] || {}) }]),
  ) as InvitationProject['sections'];
  const sectionOrder = [
    ...((project.sectionOrder || []).filter((key) => DEFAULT_SECTION_ORDER.includes(key)) as InvitationProject['sectionOrder']),
    ...DEFAULT_SECTION_ORDER.filter((key) => !(project.sectionOrder || []).includes(key)),
  ];

  return {
    ...project,
    layoutStyle: project.layoutStyle || 'garden',
    sections,
    sectionOrder,
    designElements: project.designElements || [],
  };
};

const fromDbProject = (row: any): InvitationProject => normalizeProject({
  id: row.id,
  userId: row.user_id ?? null,
  title: row.title,
  slug: row.slug || '',
  templateId: row.template_id,
  status: row.status,
  themeConfig: row.theme_config,
  layoutStyle: row.layout_style || row.theme_config?.sectionStyle || 'garden',
  sections: row.sections,
  sectionOrder: row.section_order || [],
  designElements: row.design_elements || [],
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  publishedAt: row.published_at,
});

const toDbRsvp = (entry: RsvpEntry) => ({
  id: entry.id,
  invitation_id: entry.invitationId,
  name: entry.name,
  phone_or_email: entry.phoneOrEmail,
  status: entry.status,
  guest_count: entry.guestCount,
  message: entry.message,
  created_at: entry.createdAt,
});

const fromDbRsvp = (row: any): RsvpEntry => ({
  id: row.id,
  invitationId: row.invitation_id,
  name: row.name,
  phoneOrEmail: row.phone_or_email,
  status: row.status,
  guestCount: row.guest_count,
  message: row.message || '',
  createdAt: row.created_at,
});

const localProjects = () => readJson<InvitationProject[]>(PROJECTS_KEY, []);
const localRsvps = () => readJson<RsvpEntry[]>(RSVP_KEY, []);

export const saveInvitationProject = async (project: InvitationProject): Promise<InvitationProject> => {
  const nextProject = { ...project, updatedAt: new Date().toISOString() };

  try {
    const { data, error } = await supabase
      .from('graduation_invitation_projects')
      .upsert(toDbProject(nextProject))
      .select('*')
      .single();

    if (error) throw error;
    return fromDbProject(data);
  } catch (error) {
    console.warn('Falling back to local invitation storage:', error);
    const projects = localProjects();
    const next = [nextProject, ...projects.filter((item) => item.id !== nextProject.id)];
    writeJson(PROJECTS_KEY, next);
    return nextProject;
  }
};

export const getInvitationProject = async (id: string): Promise<InvitationProject | null> => {
  try {
    const { data, error } = await supabase
      .from('graduation_invitation_projects')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data ? fromDbProject(data) : null;
  } catch {
    const project = localProjects().find((item) => item.id === id);
    return project ? normalizeProject(project) : null;
  }
};

export const getPublishedInvitationBySlug = async (slug: string): Promise<InvitationProject | null> => {
  try {
    const { data, error } = await supabase
      .from('graduation_invitation_projects')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle();

    if (error) throw error;
    return data ? fromDbProject(data) : null;
  } catch {
    const project = localProjects().find((item) => item.slug === slug && item.status === 'published');
    return project ? normalizeProject(project) : null;
  }
};

const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56);

export const publishInvitationProject = async (project: InvitationProject): Promise<InvitationProject> => {
  const name = project.sections.graduateInfo.fullName || project.sections.hero.graduateName || project.title;
  const suffix = project.id.replace(/-/g, '').slice(0, 6);
  const now = new Date().toISOString();

  return saveInvitationProject({
    ...project,
    slug: project.slug || `${slugify(name || 'graduation')}-${suffix}`,
    status: 'published',
    publishedAt: project.publishedAt || now,
    updatedAt: now,
  });
};

export const createRsvp = async (
  invitationId: string,
  payload: {
    name: string;
    phoneOrEmail: string;
    status: RsvpStatus;
    guestCount: number;
    message: string;
  },
): Promise<RsvpEntry> => {
  const entry: RsvpEntry = {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `rsvp-${Date.now()}`,
    invitationId,
    ...payload,
    createdAt: new Date().toISOString(),
  };

  try {
    const { error } = await supabase
      .from('graduation_invitation_rsvps')
      .insert(toDbRsvp(entry));

    if (error) throw error;
    return entry;
  } catch (error) {
    console.warn('Falling back to local RSVP storage:', error);
    writeJson(RSVP_KEY, [entry, ...localRsvps()]);
    return entry;
  }
};

export const listRsvps = async (invitationId: string): Promise<RsvpEntry[]> => {
  try {
    const { data, error } = await supabase
      .from('graduation_invitation_rsvps')
      .select('*')
      .eq('invitation_id', invitationId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(fromDbRsvp);
  } catch {
    return localRsvps()
      .filter((item) => item.invitationId === invitationId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
};
