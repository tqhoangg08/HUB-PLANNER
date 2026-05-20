export type InvitationStatus = 'draft' | 'published';
export type RsvpStatus = 'attending' | 'maybe' | 'declined';
export type SectionKey =
  | 'hero'
  | 'invitationCard'
  | 'eventInfo'
  | 'message'
  | 'graduateInfo'
  | 'gallery'
  | 'timeline'
  | 'map'
  | 'rsvp'
  | 'footer';

export interface ThemeConfig {
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  headingFont: string;
  bodyFont: string;
  borderRadius: number;
  sectionStyle: 'classic' | 'minimal' | 'modern';
  animationEnabled: boolean;
}

export type InvitationLayoutStyle =
  | 'editorial'
  | 'polaroid'
  | 'ceremony'
  | 'yearbook'
  | 'boldPoster'
  | 'softFrame'
  | 'garden';

export type DesignElementType = 'sticker' | 'image' | 'text';
export type DesignElementEffect = 'fadeInUp' | 'fadeInLeft' | 'fadeInRight' | 'zoomIn' | 'flipIn' | 'float';
export type DesignElementSection = SectionKey | 'global';

export interface DesignElement {
  id: string;
  type: DesignElementType;
  section: DesignElementSection;
  label: string;
  value: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  effect: DesignElementEffect;
  zIndex: number;
}

export interface HeroSection {
  enabled: boolean;
  imageUrl: string;
  eyebrow: string;
  title: string;
  graduateName: string;
  subtitle: string;
}

export interface EventInfoSection {
  enabled: boolean;
  title: string;
  date: string;
  time: string;
  venue: string;
  address: string;
  mapUrl: string;
}

export interface InvitationCardSection {
  enabled: boolean;
  eyebrow: string;
  title: string;
  name: string;
  date: string;
  images: GalleryImage[];
}

export interface MessageSection {
  enabled: boolean;
  title: string;
  name: string;
  message: string;
  images: GalleryImage[];
}

export interface GraduateInfoSection {
  enabled: boolean;
  fullName: string;
  school: string;
  major: string;
  className: string;
  cohort: string;
  achievement: string;
}

export interface GalleryImage {
  id: string;
  url: string;
  alt: string;
}

export interface GallerySection {
  enabled: boolean;
  images: GalleryImage[];
}

export interface TimelineItem {
  id: string;
  time: string;
  title: string;
}

export interface TimelineSection {
  enabled: boolean;
  items: TimelineItem[];
}

export interface MapSection {
  enabled: boolean;
  address: string;
  embedUrl: string;
  mapUrl: string;
}

export interface RsvpSection {
  enabled: boolean;
  title: string;
  description: string;
}

export interface FooterSection {
  enabled: boolean;
  thankYou: string;
  contactInfo: string;
  showBranding: boolean;
}

export interface InvitationSections {
  hero: HeroSection;
  invitationCard: InvitationCardSection;
  eventInfo: EventInfoSection;
  message: MessageSection;
  graduateInfo: GraduateInfoSection;
  gallery: GallerySection;
  timeline: TimelineSection;
  map: MapSection;
  rsvp: RsvpSection;
  footer: FooterSection;
}

export interface InvitationProject {
  id: string;
  userId: string | null;
  title: string;
  slug: string;
  templateId: string;
  status: InvitationStatus;
  themeConfig: ThemeConfig;
  layoutStyle: InvitationLayoutStyle;
  sections: InvitationSections;
  sectionOrder: SectionKey[];
  designElements: DesignElement[];
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export interface GraduationTemplate {
  id: string;
  name: string;
  description: string;
  previewImage: string;
  palette: string[];
  layoutStyle: InvitationLayoutStyle;
  themeConfig: ThemeConfig;
  designElements: DesignElement[];
}

export interface RsvpEntry {
  id: string;
  invitationId: string;
  name: string;
  phoneOrEmail: string;
  status: RsvpStatus;
  guestCount: number;
  message: string;
  createdAt: string;
}
