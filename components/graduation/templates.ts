import { DesignElement, GraduationTemplate, InvitationProject, InvitationSections, SectionKey } from './types';

export const DEFAULT_SECTION_ORDER: SectionKey[] = [
  'hero',
  'invitationCard',
  'eventInfo',
  'message',
  'graduateInfo',
  'gallery',
  'timeline',
  'map',
  'rsvp',
  'footer',
];

const newId = (prefix: string) =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.round(Math.random() * 1000)}`;

const sticker = (
  id: string,
  section: DesignElement['section'],
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
  effect: DesignElement['effect'] = 'float',
  zIndex = 10,
): DesignElement => ({
  id,
  type: 'sticker',
  section,
  label,
  value,
  x,
  y,
  width,
  height,
  rotation,
  opacity: 1,
  effect,
  zIndex,
});

const textLayer = (
  id: string,
  section: DesignElement['section'],
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation = 0,
  effect: DesignElement['effect'] = 'fadeInUp',
): DesignElement => ({
  id,
  type: 'text',
  section,
  label,
  value,
  x,
  y,
  width,
  height,
  rotation,
  opacity: 1,
  effect,
  zIndex: 12,
});

export const defaultSections = (): InvitationSections => ({
  hero: {
    enabled: true,
    imageUrl: 'https://images.unsplash.com/photo-1523580846011-d3a5bc25702b?auto=format&fit=crop&w=1200&q=85',
    eyebrow: 'Graduation Ceremony',
    title: 'Lễ Tốt Nghiệp',
    graduateName: 'Nguyễn Minh Anh',
    subtitle: 'Class of 2026 · Trường Đại học Ngân hàng TP.HCM · Quản trị kinh doanh',
  },
  invitationCard: {
    enabled: true,
    eyebrow: 'TRÂN TRỌNG KÍNH MỜI',
    title: 'Lễ Tốt Nghiệp',
    name: 'Nguyễn Minh Anh',
    date: '17.08.2026',
    images: [
      {
        id: 'card-photo-1',
        url: 'https://images.unsplash.com/photo-1565034946487-077786996e27?auto=format&fit=crop&w=900&q=85',
        alt: 'Graduation portrait',
      },
      {
        id: 'card-photo-2',
        url: 'https://images.unsplash.com/photo-1627556704302-624286467c65?auto=format&fit=crop&w=900&q=85',
        alt: 'Graduation cap',
      },
      {
        id: 'card-photo-3',
        url: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=900&q=85',
        alt: 'Graduation group',
      },
    ],
  },
  eventInfo: {
    enabled: true,
    title: 'Lễ Tốt Nghiệp',
    date: '17 tháng 8, 2026',
    time: '16:00',
    venue: 'Hội trường A',
    address: '56 Hoàng Diệu 2, Thủ Đức, TP. Hồ Chí Minh',
    mapUrl: 'https://www.google.com/maps/search/?api=1&query=56%20Hoang%20Dieu%202%20Thu%20Duc',
  },
  message: {
    enabled: true,
    title: 'The Graduation Story',
    name: 'Nguyễn Minh Anh',
    message:
      'Trân trọng kính mời bạn đến tham dự buổi lễ tốt nghiệp của Nguyễn Minh Anh. Sự hiện diện của bạn là niềm vui và là một phần đáng nhớ trong cột mốc đặc biệt này.',
    images: [
      {
        id: 'message-photo-1',
        url: 'https://images.unsplash.com/photo-1565034946487-077786996e27?auto=format&fit=crop&w=900&q=85',
        alt: 'Graduation invitation portrait',
      },
      {
        id: 'message-photo-2',
        url: 'https://images.unsplash.com/photo-1627556704302-624286467c65?auto=format&fit=crop&w=900&q=85',
        alt: 'Graduation invitation memory',
      },
    ],
  },
  graduateInfo: {
    enabled: true,
    fullName: 'Nguyễn Minh Anh',
    school: 'Trường Đại học Ngân hàng TP.HCM',
    major: 'Quản trị kinh doanh',
    className: 'QTKD K48',
    cohort: 'Class of 2026',
    achievement: 'Hoàn thành hành trình đại học với nhiều kỷ niệm đáng nhớ.',
  },
  gallery: {
    enabled: true,
    images: [
      {
        id: 'gallery-1',
        url: 'https://images.unsplash.com/photo-1565034946487-077786996e27?auto=format&fit=crop&w=900&q=85',
        alt: 'Graduation portrait',
      },
      {
        id: 'gallery-2',
        url: 'https://images.unsplash.com/photo-1627556704302-624286467c65?auto=format&fit=crop&w=900&q=85',
        alt: 'Campus memory',
      },
      {
        id: 'gallery-3',
        url: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=900&q=85',
        alt: 'Graduation day',
      },
    ],
  },
  timeline: {
    enabled: true,
    items: [
      { id: 'timeline-1', time: '15:30', title: 'Check-in' },
      { id: 'timeline-2', time: '16:00', title: 'Bắt đầu buổi lễ' },
      { id: 'timeline-3', time: '17:00', title: 'Nhận bằng & chụp ảnh' },
      { id: 'timeline-4', time: '18:00', title: 'Gặp mặt gia đình, bạn bè' },
    ],
  },
  map: {
    enabled: true,
    address: '56 Hoàng Diệu 2, Thủ Đức, TP. Hồ Chí Minh',
    embedUrl: '',
    mapUrl: 'https://www.google.com/maps/search/?api=1&query=56%20Hoang%20Dieu%202%20Thu%20Duc',
  },
  rsvp: {
    enabled: true,
    title: 'Xác nhận tham dự',
    description: 'Bạn phản hồi giúp Minh Anh để gia đình chuẩn bị chu đáo hơn nhé.',
  },
  footer: {
    enabled: true,
    thankYou: 'Cảm ơn bạn đã là một phần của cột mốc đặc biệt này.',
    contactInfo: 'Liên hệ: 0900 000 000',
    showBranding: true,
  },
});

const gardenHourElements = (): DesignElement[] => [
  textLayer('garden-save-date', 'hero', 'Save the date', 'Save the date', 96, 438, 228, 48, -3, 'fadeInUp'),
  sticker('garden-cap', 'hero', 'Graduation cap', '🎓', 308, 36, 54, 54, 8, 'float'),
  sticker('garden-star', 'eventInfo', 'Calendar star', '✦', 318, 184, 32, 32, -10, 'float'),
  sticker('garden-diploma', 'timeline', 'Diploma line art', '📜', 28, 128, 46, 46, -12, 'fadeInLeft'),
  sticker('garden-spark', 'gallery', 'Gallery spark', '✦', 306, 18, 42, 42, 12, 'float'),
];

export const graduationTemplates: GraduationTemplate[] = [
  {
    id: 'garden-hour',
    name: 'Garden Hour',
    description: 'Ảnh full màn hình, calendar và timeline overlay theo tinh thần e-invite tốt nghiệp editorial.',
    previewImage: 'https://images.unsplash.com/photo-1523580846011-d3a5bc25702b?auto=format&fit=crop&w=900&q=85',
    palette: ['#3F5943', '#F5F2EA', '#D9D0B8'],
    layoutStyle: 'garden',
    themeConfig: {
      primaryColor: '#3F5943',
      backgroundColor: '#F5F2EA',
      textColor: '#26382A',
      headingFont: 'Cormorant Garamond',
      bodyFont: 'Inter',
      borderRadius: 18,
      sectionStyle: 'classic',
      animationEnabled: true,
    },
    designElements: gardenHourElements(),
  },
];

export const createProjectFromTemplate = (templateData: GraduationTemplate, userId: string | null): InvitationProject => {
  const now = new Date().toISOString();
  const id = newId('invite');

  return {
    id,
    userId,
    title: 'Thiệp tốt nghiệp - Nguyễn Minh Anh',
    slug: '',
    templateId: templateData.id,
    status: 'draft',
    themeConfig: { ...templateData.themeConfig },
    layoutStyle: templateData.layoutStyle,
    sections: defaultSections(),
    sectionOrder: [...DEFAULT_SECTION_ORDER],
    designElements: templateData.designElements.map((item) => ({ ...item, id: newId(item.id) })),
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
  };
};

