import React, { useEffect, useRef, useState } from 'react';
import { Award, BookOpen, CalendarPlus, ChevronDown, Clock, ExternalLink, GraduationCap, MapPin, MessageCircle, School, Sparkles, Star, UserRound } from 'lucide-react';
import { RSVPForm } from '../RSVPForm';
import { DesignElement, InvitationProject, SectionKey } from '../types';

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

type RevealDirection = 'up' | 'left' | 'right' | 'zoom';

const PAPER_TEXTURE_URL = '/graduation/background_1.jpg';
const FLORAL_ASSETS = {
  branchLeft: '/graduation/florals/hoa-1.png',
  branchLong: '/graduation/florals/hoa-2.png',
  branchFull: '/graduation/florals/hoa-3.png',
  goldLeaf: '/graduation/florals/hoa-4.png',
  garland: '/graduation/florals/hoa-5.png',
};

const paperTextureStyle: React.CSSProperties = {
  backgroundColor: '#F5F2EA',
  backgroundImage: `linear-gradient(rgba(245,242,234,.35), rgba(245,242,234,.35)), url(${PAPER_TEXTURE_URL})`,
  backgroundRepeat: 'repeat',
  backgroundSize: '420px auto',
  backgroundPosition: 'top center',
};

const hasText = (value?: string | null) => Boolean(String(value || '').trim());

const formatInviteDate = (value?: string) => {
  if (!value) return '26.11.2026';
  const numeric = value.match(/(\d{1,2})[^\d]+(\d{1,2})[^\d]+(\d{4})/);
  if (numeric) return `${numeric[1].padStart(2, '0')}.${numeric[2].padStart(2, '0')}.${numeric[3]}`;
  const vietnamese = value.match(/(\d{1,2})\s+th[aá]ng\s+(\d{1,2}),?\s+(\d{4})/i);
  if (vietnamese) return `${vietnamese[1].padStart(2, '0')}.${vietnamese[2].padStart(2, '0')}.${vietnamese[3]}`;
  return value;
};

const parseEventDate = (value?: string) => {
  const fallback = { day: 17, month: 8, year: 2026 };
  if (!value) return fallback;

  const numeric = value.match(/(\d{1,2})[^\d]+(\d{1,2})[^\d]+(\d{4})/);
  if (numeric) {
    return {
      day: Number(numeric[1]),
      month: Number(numeric[2]),
      year: Number(numeric[3]),
    };
  }

  const vietnamese = value.match(/(\d{1,2})\s+th[aá]ng\s+(\d{1,2}),?\s+(\d{4})/i);
  if (vietnamese) {
    return {
      day: Number(vietnamese[1]),
      month: Number(vietnamese[2]),
      year: Number(vietnamese[3]),
    };
  }

  return fallback;
};

const calendarFor = (value?: string) => {
  const parsed = parseEventDate(value);
  const safeMonth = Math.min(12, Math.max(1, parsed.month || 8));
  const safeYear = parsed.year || 2026;
  const daysInMonth = new Date(safeYear, safeMonth, 0).getDate();
  const safeDay = Math.min(daysInMonth, Math.max(1, parsed.day || 1));
  const firstDay = new Date(safeYear, safeMonth - 1, 1).getDay();
  const mondayOffset = firstDay === 0 ? 6 : firstDay - 1;

  return {
    day: safeDay,
    month: safeMonth,
    year: safeYear,
    days: Array.from({ length: daysInMonth }, (_, index) => index + 1),
    leadingBlanks: Array.from({ length: mondayOffset }, (_, index) => index),
  };
};

const Reveal = ({
  children,
  direction = 'up',
  delay = 0,
  className = '',
}: {
  children: React.ReactNode;
  direction?: RevealDirection;
  delay?: number;
  className?: string;
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.16, rootMargin: '0px 0px -8% 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`grad-reveal grad-reveal-${direction} ${visible ? 'is-visible' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
};

const styleFor = (project: InvitationProject) => {
  const layout = project.layoutStyle || 'editorial';

  if (layout === 'boldPoster') {
    return {
      layout,
      page: 'bg-[#111111] text-white',
      shell: 'mx-5 my-6 rounded-[28px] border border-white/10 bg-[#1C1C1C] p-5 text-white shadow-[0_18px_50px_rgba(0,0,0,.25)]',
      softShell: 'mx-5 my-6 rounded-[28px] border border-[#D6B25E]/25 bg-[#F7F0DF] p-5 text-slate-950 shadow-sm',
      eyebrow: 'text-[#D6B25E]',
      muted: 'text-white/68',
      card: 'rounded-2xl border border-white/10 bg-white/8',
      field: 'rounded-2xl bg-white/8 text-white',
      line: 'bg-[#D6B25E]',
      button: '#D6B25E',
      buttonText: '#111111',
      headingColor: 'text-white',
    };
  }

  if (layout === 'yearbook') {
    return {
      layout,
      page: 'bg-[#EAF4FF] text-slate-800',
      shell: 'mx-5 my-6 rounded-[26px] border border-blue-100 bg-white p-5 text-slate-900 shadow-[0_14px_38px_rgba(37,99,235,.10)]',
      softShell: 'mx-5 my-6 rounded-[26px] border border-blue-100 bg-[#F8FBFF] p-5 text-slate-900 shadow-sm',
      eyebrow: 'text-[#2563EB]',
      muted: 'text-slate-500',
      card: 'rounded-2xl border border-blue-100 bg-[#F8FBFF]',
      field: 'rounded-2xl bg-[#F1F7FF] text-slate-800',
      line: 'bg-[#2563EB]',
      button: '#2563EB',
      buttonText: '#FFFFFF',
      headingColor: 'text-slate-950',
    };
  }

  if (layout === 'garden') {
    return {
      layout,
      page: 'bg-[#3F5943] text-[#F5F2EA]',
      shell: 'mx-0 my-0 border-0 p-6 text-[#26382A] shadow-none',
      softShell: 'mx-0 my-0 border-0 p-6 text-[#26382A] shadow-none',
      eyebrow: 'text-[#3F5943]',
      muted: 'text-[#66745F]',
      card: 'rounded-2xl border border-[#D9D0B8]/35 bg-white/62 shadow-[0_12px_28px_rgba(63,89,67,.08)] backdrop-blur-[1px]',
      field: 'rounded-2xl bg-white/54 text-[#26382A] shadow-[0_10px_24px_rgba(63,89,67,.07)]',
      line: 'bg-[#3F5943]',
      button: '#3F5943',
      buttonText: '#F5F2EA',
      headingColor: 'text-[#3F5943]',
    };
  }

  if (layout === 'softFrame' || layout === 'editorial') {
    return {
      layout,
      page: 'bg-[#FAF7F0] text-[#5B5147]',
      shell: 'mx-5 my-7 rounded-[30px] border border-[#E6DCCB] bg-white p-6 text-[#5B5147] shadow-[0_10px_32px_rgba(91,81,71,.08)]',
      softShell: 'mx-5 my-7 rounded-[30px] border border-[#E8DDCC] bg-[#FFFDF8] p-6 text-[#5B5147] shadow-sm',
      eyebrow: 'text-[#B99A5B]',
      muted: 'text-[#7A6E63]',
      card: 'rounded-2xl border border-[#E7DDCF] bg-[#FAF7F0]',
      field: 'rounded-2xl bg-[#FAF7F0] text-[#5B5147]',
      line: 'bg-[#B99A5B]',
      button: '#B99A5B',
      buttonText: '#FFFFFF',
      headingColor: 'text-[#4A4038]',
    };
  }

  return {
    layout,
    page: 'bg-[#FFF8EC] text-slate-800',
    shell: 'mx-5 my-6 rounded-[28px] border border-[#E6D7B7] bg-[#FFFDF7] p-5 text-slate-900 shadow-[0_12px_40px_rgba(31,58,95,.10)]',
    softShell: 'mx-5 my-6 rounded-[28px] border border-[#E6D7B7] bg-[#FFF8EC] p-5 text-slate-900 shadow-sm',
    eyebrow: 'text-[#C9A45C]',
    muted: 'text-slate-500',
    card: 'rounded-2xl border border-[#EADDBE] bg-white/70',
    field: 'rounded-2xl bg-white/70 text-slate-800',
    line: 'bg-[#C9A45C]',
    button: '#223A5E',
    buttonText: '#FFFFFF',
    headingColor: 'text-[#1E293B]',
  };
};

const effectDirection: Record<DesignElement['effect'], RevealDirection> = {
  fadeInUp: 'up',
  fadeInLeft: 'left',
  fadeInRight: 'right',
  zoomIn: 'zoom',
  flipIn: 'zoom',
  float: 'zoom',
};

const DesignElementNode = ({
  element,
  mode,
  selected,
  onSelect,
  onChange,
}: {
  element: DesignElement;
  mode: 'editor' | 'public';
  selected: boolean;
  onSelect?: (id: string) => void;
  onChange?: (element: DesignElement) => void;
}) => {
  const dragRef = useRef<{ startX: number; startY: number; x: number; y: number } | null>(null);
  const canEdit = mode === 'editor';

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canEdit) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect?.(element.id);
    dragRef.current = { startX: event.clientX, startY: event.clientY, x: element.x, y: element.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || !canEdit) return;
    event.preventDefault();
    event.stopPropagation();
    const dx = event.clientX - dragRef.current.startX;
    const dy = event.clientY - dragRef.current.startY;
    onChange?.({
      ...element,
      x: Math.max(-140, Math.min(440, Math.round(dragRef.current.x + dx))),
      y: Math.max(-140, Math.min(1000, Math.round(dragRef.current.y + dy))),
    });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canEdit) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={(event) => {
        if (!canEdit) return;
        event.stopPropagation();
        onSelect?.(element.id);
      }}
      className={`grad-reveal grad-reveal-${effectDirection[element.effect]} is-visible absolute flex touch-none select-none items-center justify-center ${element.effect === 'float' ? 'grad-float' : ''} ${canEdit ? 'pointer-events-auto cursor-move' : 'pointer-events-none'} ${selected ? 'ring-2 ring-[#D9D0B8] ring-offset-2 ring-offset-[#F5F2EA]' : ''}`}
      style={{
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
        opacity: element.opacity,
        zIndex: element.zIndex,
        transform: `rotate(${element.rotation}deg)`,
        transformOrigin: 'center',
      }}
      title={element.label}
    >
      {element.type === 'image' ? (
        <img src={element.value} alt={element.label} className="h-full w-full rounded-2xl object-cover shadow-lg" draggable={false} />
      ) : element.type === 'text' ? (
        <div className="flex h-full w-full items-center justify-center whitespace-pre-wrap rounded-[22px] border border-white/45 bg-[#F5F2EA]/78 px-4 py-2 text-center font-black leading-tight text-[#3F5943] shadow-[0_14px_34px_rgba(31,42,34,.18)] backdrop-blur-md" style={{ fontSize: Math.max(12, Math.min(element.height, element.width) * 0.2) }}>
          {element.value}
        </div>
      ) : (
        <span className="flex h-full w-full items-center justify-center leading-none drop-shadow-sm" style={{ fontSize: Math.max(18, Math.min(element.width, element.height) * 0.72) }}>
          {element.value}
        </span>
      )}
    </div>
  );
};

const DesignElementLayer = ({
  project,
  sectionKey,
  mode,
  selectedElementId,
  onSelectDesignElement,
  onDesignElementChange,
}: {
  project: InvitationProject;
  sectionKey: SectionKey;
  mode: 'editor' | 'public';
  selectedElementId?: string | null;
  onSelectDesignElement?: (id: string) => void;
  onDesignElementChange?: (element: DesignElement) => void;
}) => {
  const elements = (project.designElements || []).filter((item) => item.section === sectionKey || item.section === 'global');
  if (!elements.length) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-visible">
      {elements.map((element) => (
        <DesignElementNode
          key={element.id}
          element={element}
          mode={mode}
          selected={selectedElementId === element.id}
          onSelect={onSelectDesignElement}
          onChange={onDesignElementChange}
        />
      ))}
    </div>
  );
};

const SectionShell = ({
  project,
  sectionKey,
  mode,
  children,
  variant = 'shell',
  direction = 'up',
  clickProps,
  selectedElementId,
  onSelectDesignElement,
  onDesignElementChange,
}: {
  project: InvitationProject;
  sectionKey: SectionKey;
  mode: 'editor' | 'public';
  children: React.ReactNode;
  variant?: 'shell' | 'soft';
  direction?: RevealDirection;
  clickProps?: React.HTMLAttributes<HTMLDivElement>;
  selectedElementId?: string | null;
  onSelectDesignElement?: (id: string) => void;
  onDesignElementChange?: (element: DesignElement) => void;
}) => {
  const s = styleFor(project);
  const sectionStyle = project.layoutStyle === 'garden' ? paperTextureStyle : undefined;
  return (
    <Reveal direction={direction}>
      <section className={`relative overflow-hidden ${variant === 'soft' ? s.softShell : s.shell}`} style={sectionStyle} {...clickProps}>
        <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-current opacity-[0.035]" />
        <DesignElementLayer project={project} sectionKey={sectionKey} mode={mode} selectedElementId={selectedElementId} onSelectDesignElement={onSelectDesignElement} onDesignElementChange={onDesignElementChange} />
        <div className="relative z-10">{children}</div>
      </section>
    </Reveal>
  );
};

const SectionTitle = ({ eyebrow, title, project }: { eyebrow?: string; title: string; project: InvitationProject }) => {
  const s = styleFor(project);
  return (
    <div>
      {eyebrow && <p className={`text-[11px] font-black uppercase tracking-[0.22em] ${s.eyebrow}`}>{eyebrow}</p>}
      <h2 className={`mt-2 text-3xl font-black leading-tight ${s.headingColor}`} style={{ fontFamily: project.themeConfig.headingFont }}>
        {title}
      </h2>
    </div>
  );
};

const InvitationDetailSection = ({
  project,
  mode,
  clickProps,
  onEdit,
  selectedElementId,
  onSelectDesignElement,
  onDesignElementChange,
}: {
  project: InvitationProject;
  mode: 'editor' | 'public';
  clickProps?: React.HTMLAttributes<HTMLDivElement>;
  onEdit?: (key: SectionKey) => void;
  selectedElementId?: string | null;
  onSelectDesignElement?: (id: string) => void;
  onDesignElementChange?: (element: DesignElement) => void;
}) => {
  const { sections, themeConfig } = project;
  const card = sections.invitationCard;
  const cardImages = card.images.filter((image) => hasText(image.url));
  const fallbackImage = sections.hero.imageUrl;
  const polaroids = [cardImages[0]?.url || fallbackImage, cardImages[1]?.url || fallbackImage, cardImages[2]?.url || fallbackImage];
  const graduateName = card.name || 'Nguyễn Minh Anh';
  const eventTitle = card.title || 'Lễ Tốt Nghiệp';
  const inviteDate = formatInviteDate(card.date);
  const editableClick = (key: SectionKey) =>
    mode === 'editor'
      ? {
          onClick: (event: React.MouseEvent) => {
            event.stopPropagation();
            onEdit?.(key);
          },
          role: 'button' as const,
          tabIndex: 0,
        }
      : {};

  return (
    <Reveal direction="up">
      <section className="relative min-h-[720px] overflow-hidden px-5 pb-12 pt-10 text-[#3E3528]" style={paperTextureStyle} {...clickProps}>
        <DesignElementLayer
          project={project}
          sectionKey="invitationCard"
          mode={mode}
          selectedElementId={selectedElementId}
          onSelectDesignElement={onSelectDesignElement}
          onDesignElementChange={onDesignElementChange}
        />

        <img src={FLORAL_ASSETS.goldLeaf} alt="" className="pointer-events-none absolute right-[-34px] top-8 z-0 w-32 rotate-[14deg] opacity-65 mix-blend-multiply" />
        <img src={FLORAL_ASSETS.branchLeft} alt="" className="pointer-events-none absolute bottom-[-28px] left-[-58px] z-20 w-60 -rotate-[8deg] opacity-90 mix-blend-multiply" />
        <img src={FLORAL_ASSETS.garland} alt="" className="pointer-events-none absolute bottom-[-42px] right-[-76px] z-20 w-64 rotate-[7deg] opacity-88 mix-blend-multiply" />

        <div className="relative z-10 mx-auto max-w-[390px]">
          <div className="relative mx-auto h-[190px] max-w-[350px]">
            {polaroids.map((url, index) => {
              const positions = [
                'left-0 top-12 h-[118px] w-[104px] -rotate-[8deg]',
                'left-1/2 top-0 h-[154px] w-[126px] -translate-x-1/2 rotate-[3deg]',
                'right-0 top-16 h-[112px] w-[100px] rotate-[8deg]',
              ];
              return (
                <Reveal key={`${url}-${index}`} direction={index === 1 ? 'up' : index === 0 ? 'left' : 'right'} delay={index * 90}>
                  <figure className={`absolute ${positions[index]} rounded-[3px] bg-[#FFFDF7] p-2 pb-7 shadow-[0_12px_28px_rgba(63,52,35,.16)]`}>
                    <button type="button" className="block h-full w-full cursor-pointer" {...editableClick('invitationCard')}>
                      <img src={url} alt={`Graduation memory ${index + 1}`} className="h-full w-full rounded-[2px] object-cover" />
                    </button>
                  </figure>
                </Reveal>
              );
            })}
            <img src={FLORAL_ASSETS.branchLong} alt="" className="pointer-events-none absolute -right-5 top-0 z-20 w-28 rotate-[18deg] opacity-75 mix-blend-multiply" />
          </div>

          <div className="relative mt-2 min-h-[430px]">
            <div className="absolute left-1/2 top-[52px] h-[245px] w-[335px] -translate-x-1/2 rounded-[22px] bg-[#E8DAC4] shadow-[0_20px_45px_rgba(76,62,43,.18)]">
              <div className="absolute inset-x-0 top-0 h-[128px] rounded-t-[22px] bg-[linear-gradient(155deg,#D8C3A4_0%,#F2E8D8_49%,#D6BE9B_50%,#E9DDC9_100%)]" />
              <div className="absolute inset-x-4 bottom-5 top-16 rounded-[18px] border border-white/50 bg-[#F5EDDF]/80" />
            </div>

            <div className="absolute left-1/2 top-0 z-10 w-[292px] -translate-x-1/2 rotate-[-1.4deg] rounded-[24px] border border-[#E7D8BF] bg-[#FFF9ED] px-7 py-9 text-center shadow-[0_20px_45px_rgba(65,52,34,.18)]">
              <div className="pointer-events-none absolute inset-0 rounded-[24px] bg-[radial-gradient(circle_at_20%_15%,rgba(255,255,255,.9),transparent_25%),linear-gradient(135deg,rgba(255,255,255,.58),transparent_42%,rgba(205,181,136,.12))]" />
              <div className="pointer-events-none absolute -left-1 top-10 h-24 w-2 rounded-full bg-[#F1E2C9]/70 blur-[1px]" />
              <div className="pointer-events-none absolute -right-1 bottom-8 h-28 w-2 rounded-full bg-[#E8D5B6]/55 blur-[1px]" />

              <div className="relative">
                <p className="cursor-pointer text-[10px] font-black uppercase tracking-[0.24em] text-[#A3844A]" {...editableClick('invitationCard')}>{card.eyebrow || 'Trân trọng kính mời'}</p>
                <h2 className="mt-5 cursor-pointer text-[34px] font-black leading-none text-[#5B4A34]" style={{ fontFamily: themeConfig.headingFont }} {...editableClick('invitationCard')}>
                  {eventTitle}
                </h2>
                <div className="mx-auto mt-5 h-px w-20 bg-[#C7A55B]/65" />
                <p className="mt-5 cursor-pointer text-[31px] font-black leading-tight text-[#3F5943]" style={{ fontFamily: themeConfig.headingFont }} {...editableClick('invitationCard')}>
                  {graduateName}
                </p>
                <p className="mt-4 cursor-pointer text-sm font-black tracking-[0.16em] text-[#8B713F]" {...editableClick('invitationCard')}>{inviteDate}</p>
              </div>
            </div>

            <div className="absolute bottom-[72px] left-1/2 z-20 flex h-[74px] w-[74px] -translate-x-1/2 rotate-[-7deg] items-center justify-center rounded-full bg-[radial-gradient(circle_at_34%_28%,#C66E5A,#8D2E2C_62%,#6C2020)] text-center text-[10px] font-black uppercase leading-tight tracking-[0.12em] text-[#F8E8D5] shadow-[0_12px_24px_rgba(93,33,28,.25)]">
              <span className="absolute inset-2 rounded-full border border-[#F1C2A8]/45" />
              <span className="relative">Class<br />2026</span>
            </div>
          </div>
        </div>
      </section>
    </Reveal>
  );
};

export const GardenHourTemplate = ({
  project,
  sectionKey,
  mode = 'editor',
  onEdit,
  onRsvpSubmitted,
  selectedElementId,
  onSelectDesignElement,
  onDesignElementChange,
}: SectionRendererProps) => {
  const { sections, themeConfig } = project;
  const s = styleFor(project);
  const editProps = mode === 'editor' ? { onClick: () => onEdit?.(sectionKey), role: 'button' as const, tabIndex: 0 } : {};

  if (!sections[sectionKey]?.enabled) return null;

  if (sectionKey === 'invitationCard') {
    return (
      <InvitationDetailSection
        project={project}
        mode={mode}
        clickProps={editProps}
        onEdit={onEdit}
        selectedElementId={selectedElementId}
        onSelectDesignElement={onSelectDesignElement}
        onDesignElementChange={onDesignElementChange}
      />
    );
  }

  if (sectionKey === 'hero') {
    const hero = sections.hero;
    const isPoster = s.layout === 'boldPoster';
    const isMinimal = s.layout === 'softFrame' || s.layout === 'editorial';
    const align = isMinimal ? 'items-center text-center' : 'items-start text-left';

    return (
      <section className={`relative min-h-[680px] overflow-hidden ${s.page}`} {...editProps}>
        {hero.imageUrl ? (
          <img src={hero.imageUrl} alt={hero.graduateName || 'Graduation'} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-200 to-slate-100" />
        )}
        <div className={`absolute inset-0 ${isPoster ? 'bg-gradient-to-br from-black/35 via-black/58 to-black/92' : isMinimal ? 'bg-gradient-to-b from-black/5 via-black/24 to-black/68' : 'bg-gradient-to-b from-[#1F3A5F]/15 via-black/20 to-black/72'}`} />
        {isPoster && <div className="absolute -left-3 top-24 -rotate-90 text-6xl font-black tracking-[0.18em] text-white/10">CLASS</div>}
        {isMinimal && <div className="absolute inset-6 rounded-[34px] border border-white/35" />}
        <DesignElementLayer project={project} sectionKey="hero" mode={mode} selectedElementId={selectedElementId} onSelectDesignElement={onSelectDesignElement} onDesignElementChange={onDesignElementChange} />

        <div className={`relative z-10 flex min-h-[680px] flex-col justify-end px-7 pb-12 text-white ${align}`}>
          {hasText(hero.eyebrow) && (
            <Reveal>
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-white/78">{hero.eyebrow}</p>
            </Reveal>
          )}
          {hasText(hero.title) && (
            <Reveal delay={110}>
              <h1 className={`${isPoster ? 'mt-4 text-7xl uppercase leading-[0.84]' : 'mt-4 text-5xl leading-[0.95]'} font-black`} style={{ fontFamily: themeConfig.headingFont }}>
                {hero.title}
              </h1>
            </Reveal>
          )}
          {hasText(hero.graduateName) && (
            <Reveal delay={210}>
              <h2 className="mt-6 text-4xl font-black leading-tight" style={{ fontFamily: themeConfig.headingFont }}>
                {hero.graduateName}
              </h2>
            </Reveal>
          )}
          {(hasText(hero.subtitle) || mode === 'editor') && (
            <Reveal delay={310}>
              {hasText(hero.subtitle) && <p className="mx-auto mt-4 max-w-[320px] text-sm font-semibold leading-6 text-white/84">{hero.subtitle}</p>}
              <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/35 bg-white/14 px-4 py-2 text-xs font-black text-white backdrop-blur">
                <ChevronDown size={15} /> Kéo xuống để mở thiệp
              </div>
            </Reveal>
          )}
        </div>
      </section>
    );
  }

  if (sectionKey === 'eventInfo') {
    const event = sections.eventInfo;
    const showMap = hasText(event.mapUrl);
    const hasAny = [event.title, event.date, event.time, event.venue, event.address].some(hasText);
    if (!hasAny && mode === 'public') return null;

    if (s.layout === 'garden') {
      const calendar = calendarFor(event.date);

      return (
          <SectionShell project={project} sectionKey="eventInfo" mode={mode} variant="soft" direction="up" clickProps={editProps} selectedElementId={selectedElementId} onSelectDesignElement={onSelectDesignElement} onDesignElementChange={onDesignElementChange}>
            <div className="text-center">
              <p className="text-3xl italic leading-none text-[#3F5943]" style={{ fontFamily: themeConfig.headingFont }}>Tháng {calendar.month}</p>
              <h2 className="mt-1 text-6xl font-black leading-none text-[#3F5943]" style={{ fontFamily: themeConfig.headingFont }}>{calendar.year}</h2>
              <p className="mt-3 text-xs font-black uppercase tracking-[0.22em] text-[#66745F]">{event.title || 'Graduation Ceremony'}</p>
            </div>
            <div className="mt-6 grid grid-cols-7 gap-1 text-center text-[11px] font-black uppercase tracking-[0.08em] text-[#66745F]">
              {['Mon', 'Tue', 'Wed', 'Thur', 'Fri', 'Sat', 'Sun'].map((day) => <span key={day}>{day}</span>)}
              {calendar.leadingBlanks.map((blank) => <span key={`blank-${blank}`} />)}
              {calendar.days.map((day) => (
                <span key={day} className={`flex h-8 items-center justify-center rounded-full text-sm font-bold ${day === calendar.day ? 'bg-[#3F5943] text-[#F5F2EA]' : 'text-[#53624F]'}`}>
                  {day}
                </span>
              ))}
            </div>
            <div className="mt-7 grid grid-cols-2 gap-3">
              {hasText(event.time) && <div className="rounded-2xl bg-white p-4 text-center text-[#26382A]"><Clock className="mx-auto text-[#3F5943]" size={18} /><p className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-[#66745F]">Giờ</p><p className="mt-1 text-lg font-black">{event.time}</p></div>}
              {hasText(event.venue) && <div className="rounded-2xl bg-white p-4 text-center text-[#26382A]"><MapPin className="mx-auto text-[#3F5943]" size={18} /><p className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-[#66745F]">Địa điểm</p><p className="mt-1 text-sm font-black leading-5">{event.venue}</p></div>}
            </div>
            {hasText(event.address) && <p className="mt-4 text-center text-sm font-semibold leading-6 text-[#66745F]">{event.address}</p>}
            <div className="mt-5 grid grid-cols-2 gap-3">
              {showMap && <a href={event.mapUrl} target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#3F5943] px-3 py-3 text-sm font-black text-[#F5F2EA]"><MapPin size={16} /> Xem bản đồ</a>}
              <a href={`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title || 'Lễ tốt nghiệp')}&details=${encodeURIComponent(event.address || '')}`} target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-[#3F5943]/20 bg-white px-3 py-3 text-sm font-black text-[#3F5943]"><CalendarPlus size={16} /> Thêm lịch</a>
            </div>
          </SectionShell>
      );
    }

    return (
      <SectionShell project={project} sectionKey="eventInfo" mode={mode} direction="up" clickProps={editProps} selectedElementId={selectedElementId} onSelectDesignElement={onSelectDesignElement} onDesignElementChange={onDesignElementChange}>
        <SectionTitle eyebrow="Save the date" title={event.title || 'Thông tin buổi lễ'} project={project} />
        <div className="mt-6 grid grid-cols-2 gap-3">
          {hasText(event.date) && (
            <Reveal direction="left" delay={70}>
              <div className={`${s.card} p-4`}>
                <CalendarPlus size={18} style={{ color: themeConfig.primaryColor }} />
                <p className="mt-3 text-[11px] font-black uppercase tracking-[0.16em] opacity-55">Ngày</p>
                <p className="mt-1 text-base font-black leading-snug">{event.date}</p>
              </div>
            </Reveal>
          )}
          {hasText(event.time) && (
            <Reveal direction="right" delay={120}>
              <div className={`${s.card} p-4`}>
                <Clock size={18} style={{ color: themeConfig.primaryColor }} />
                <p className="mt-3 text-[11px] font-black uppercase tracking-[0.16em] opacity-55">Giờ</p>
                <p className="mt-1 text-base font-black">{event.time}</p>
              </div>
            </Reveal>
          )}
        </div>
        {(hasText(event.venue) || hasText(event.address)) && (
          <Reveal delay={170}>
            <div className={`${s.card} mt-3 p-4`}>
              <MapPin size={18} style={{ color: themeConfig.primaryColor }} />
              {hasText(event.venue) && <p className="mt-3 text-lg font-black">{event.venue}</p>}
              {hasText(event.address) && <p className={`mt-2 text-sm leading-6 ${s.muted}`}>{event.address}</p>}
            </div>
          </Reveal>
        )}
        <div className="mt-5 grid grid-cols-2 gap-3">
          {showMap && (
            <a href={event.mapUrl} target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-black" style={{ backgroundColor: s.button, color: s.buttonText }}>
              <MapPin size={16} /> Xem bản đồ
            </a>
          )}
          <a href={`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title || 'Lễ tốt nghiệp')}&details=${encodeURIComponent(event.address || '')}`} target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-current/10 bg-white/70 px-3 py-3 text-sm font-black">
            <CalendarPlus size={16} /> Thêm lịch
          </a>
        </div>
      </SectionShell>
    );
  }

  if (sectionKey === 'message') {
    const message = sections.message;
    const messageImages = (message.images || []).filter((image) => hasText(image.url));
    const primaryImage = messageImages[0]?.url || sections.invitationCard?.images?.[0]?.url || sections.hero.imageUrl;
    const secondaryImage = messageImages[1]?.url || messageImages[0]?.url || sections.invitationCard?.images?.[1]?.url || sections.hero.imageUrl;
    if (!hasText(message.message) && mode === 'public') return null;

    if (s.layout === 'garden') {
      return (
        <section className="relative min-h-[760px] overflow-hidden px-5 py-10 text-[#5B4A34]" style={paperTextureStyle} {...editProps}>
          <DesignElementLayer project={project} sectionKey="message" mode={mode} selectedElementId={selectedElementId} onSelectDesignElement={onSelectDesignElement} onDesignElementChange={onDesignElementChange} />
          <img src={FLORAL_ASSETS.goldLeaf} alt="" className="pointer-events-none absolute right-[-30px] top-[210px] z-0 w-36 rotate-[16deg] opacity-55 mix-blend-multiply" />
          <img src={FLORAL_ASSETS.branchLeft} alt="" className="pointer-events-none absolute bottom-[-54px] left-[-78px] z-20 w-64 -rotate-[7deg] opacity-90 mix-blend-multiply" />
          <img src={FLORAL_ASSETS.garland} alt="" className="pointer-events-none absolute bottom-[112px] right-[-82px] z-10 w-56 rotate-[2deg] opacity-72 mix-blend-multiply" />

          <div className="relative z-10 mx-auto max-w-[390px]">
            <Reveal>
              <h2
                className="text-center text-[42px] italic leading-none text-[#A47A25] drop-shadow-[0_2px_0_rgba(255,255,255,.65)]"
                style={{ fontFamily: themeConfig.headingFont }}
                onClick={(event) => {
                  if (mode !== 'editor') return;
                  event.stopPropagation();
                  onEdit?.('message');
                }}
              >
                {message.title || 'The Graduation Story'}
              </h2>
            </Reveal>

            {hasText(message.message) && (
              <Reveal delay={90}>
                <p
                  className="mx-auto mt-8 max-w-[330px] text-center text-[13px] font-semibold italic leading-6 text-[#9A7229]"
                  onClick={(event) => {
                    if (mode !== 'editor') return;
                    event.stopPropagation();
                    onEdit?.('message');
                  }}
                >
                  {message.message}
                </p>
              </Reveal>
            )}

            <div className="relative mt-10 min-h-[420px]">
              <Reveal direction="left" delay={160}>
                <figure className="absolute left-2 top-10 z-10 w-[158px] -rotate-[13deg] bg-white p-3 pb-8 shadow-[0_18px_32px_rgba(76,62,43,.18)]">
                  <button
                    type="button"
                    className="block aspect-[4/5] w-full cursor-pointer overflow-hidden bg-[#EEE7DA]"
                    onClick={(event) => {
                      if (mode !== 'editor') return;
                      event.stopPropagation();
                      onEdit?.('message');
                    }}
                  >
                    <img src={primaryImage} alt="Invitation story" className="h-full w-full object-cover" />
                  </button>
                </figure>
              </Reveal>

              <Reveal direction="right" delay={220}>
                <div className="absolute right-1 top-0 z-20 max-w-[178px] text-center">
                  <p className="text-3xl italic leading-none text-[#A47A25]" style={{ fontFamily: themeConfig.headingFont }}>Tân cử nhân</p>
                  <p
                    className="mt-2 text-[28px] font-black uppercase leading-tight tracking-[0.04em] text-[#A47A25]"
                    onClick={(event) => {
                      if (mode !== 'editor') return;
                      event.stopPropagation();
                      onEdit?.('message');
                    }}
                  >
                    {message.name || sections.invitationCard?.name || sections.hero.graduateName}
                  </p>
                </div>
              </Reveal>

              <div className="absolute left-1/2 top-[172px] z-30 flex h-[76px] w-[76px] -translate-x-1/2 rotate-[-9deg] items-center justify-center rounded-full bg-[radial-gradient(circle_at_34%_28%,#C9B06B,#7B6A37_62%,#4F4322)] text-center text-[9px] font-black uppercase leading-tight tracking-[0.12em] text-[#FFF6DA] shadow-[0_12px_24px_rgba(79,67,34,.25)]">
                <span className="absolute inset-2 rounded-full border border-[#F7E7A7]/50" />
                <span className="relative">HUB<br />Planner</span>
              </div>

              <Reveal direction="right" delay={280}>
                <figure className="absolute bottom-0 right-5 z-10 w-[142px] rotate-[10deg] bg-white p-3 pb-7 shadow-[0_16px_30px_rgba(76,62,43,.16)]">
                  <button
                    type="button"
                    className="block aspect-[4/5] w-full cursor-pointer overflow-hidden bg-[#EEE7DA]"
                    onClick={(event) => {
                      if (mode !== 'editor') return;
                      event.stopPropagation();
                      onEdit?.('message');
                    }}
                  >
                    <img src={secondaryImage} alt="Invitation moment" className="h-full w-full object-cover" />
                  </button>
                </figure>
              </Reveal>
            </div>
          </div>
        </section>
      );
    }

    return (
      <SectionShell project={project} sectionKey="message" mode={mode} variant="soft" direction="right" clickProps={editProps} selectedElementId={selectedElementId} onSelectDesignElement={onSelectDesignElement} onDesignElementChange={onDesignElementChange}>
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: themeConfig.primaryColor, color: s.buttonText }}>
            <MessageCircle size={20} />
          </div>
          <div>
            <p className={`text-[11px] font-black uppercase tracking-[0.22em] ${s.eyebrow}`}>Lời mời</p>
            {hasText(message.message) && <p className="mt-3 text-[15px] font-semibold leading-8">{message.message}</p>}
          </div>
        </div>
      </SectionShell>
    );
  }

  if (sectionKey === 'graduateInfo') {
    const info = sections.graduateInfo;
    const rows = [
      ['Họ tên', info.fullName, UserRound],
      ['Trường', info.school, School],
      ['Khoa/ngành', info.major, BookOpen],
      ['Lớp', info.className, Star],
      ['Niên khóa', info.cohort, GraduationCap],
      ['Thành tích', info.achievement, Award],
    ].filter(([, value]) => hasText(String(value)));
    if (!rows.length && mode === 'public') return null;

    return (
      <SectionShell project={project} sectionKey="graduateInfo" mode={mode} direction="left" clickProps={editProps} selectedElementId={selectedElementId} onSelectDesignElement={onSelectDesignElement} onDesignElementChange={onDesignElementChange}>
        <SectionTitle eyebrow="Graduate profile" title="Thông tin tân cử nhân" project={project} />
        <div className="mt-5 space-y-3">
          {rows.map(([label, value, Icon], index) => {
            const RowIcon = Icon as typeof UserRound;
            return (
              <Reveal key={String(label)} direction={index % 2 ? 'right' : 'left'} delay={index * 55}>
                <div className={`${s.field} flex items-start gap-3 p-4`}>
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/70" style={{ color: themeConfig.primaryColor }}>
                    <RowIcon size={16} />
                  </div>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] opacity-55">{String(label)}</p>
                    <p className="mt-1 text-sm font-black leading-6">{String(value)}</p>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </SectionShell>
    );
  }

  if (sectionKey === 'gallery') {
    const images = sections.gallery.images.filter((image) => hasText(image.url));
    if (!images.length && mode === 'public') return null;
    const layout = s.layout;

    if (layout === 'garden') {
      return (
        <SectionShell project={project} sectionKey="gallery" mode={mode} direction="zoom" clickProps={editProps} selectedElementId={selectedElementId} onSelectDesignElement={onSelectDesignElement} onDesignElementChange={onDesignElementChange}>
          <div className="text-center">
            <h2 className="text-3xl font-black uppercase tracking-[0.04em] text-[#3F5943]" style={{ fontFamily: themeConfig.headingFont }}>Golden Hour</h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-[#66745F]">Những khoảnh khắc của hành trình đại học, từ ngày đầu đến giây phút nhận bằng.</p>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            {images.map((image, index) => (
              <Reveal key={image.id} direction={index % 2 ? 'right' : 'left'} delay={index * 70}>
                <img
                  src={image.url}
                  alt={image.alt || `Gallery ${index + 1}`}
                  className={`${index === 0 ? 'col-span-2 aspect-[16/10]' : 'aspect-[4/5]'} w-full rounded-[22px] border border-white/55 object-cover shadow-[0_14px_30px_rgba(63,89,67,.18)]`}
                />
              </Reveal>
            ))}
          </div>
        </SectionShell>
      );
    }

    return (
      <SectionShell project={project} sectionKey="gallery" mode={mode} variant={layout === 'boldPoster' ? 'soft' : 'shell'} direction="zoom" clickProps={editProps} selectedElementId={selectedElementId} onSelectDesignElement={onSelectDesignElement} onDesignElementChange={onDesignElementChange}>
        <div className="flex items-end justify-between gap-4">
          <SectionTitle eyebrow="Memories" title="Album kỷ yếu" project={project} />
          <span className="rounded-full px-3 py-1 text-xs font-black" style={{ backgroundColor: themeConfig.primaryColor, color: s.buttonText }}>{images.length} ảnh</span>
        </div>
        {images.length ? (
          <div className={`mt-6 ${layout === 'polaroid' ? 'space-y-5' : layout === 'yearbook' ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-2 gap-3'}`}>
            {images.map((image, index) => (
              <Reveal key={image.id} direction={index % 2 ? 'right' : 'left'} delay={index * 70}>
                {layout === 'polaroid' ? (
                  <figure className={`bg-white p-3 pb-8 shadow-xl ${index % 2 ? 'rotate-2' : '-rotate-2'}`}>
                    <img src={image.url} alt={image.alt || `Gallery ${index + 1}`} className="aspect-[4/5] w-full object-cover" />
                    <figcaption className="mt-3 text-center text-xs font-black text-slate-500">Memory {index + 1}</figcaption>
                  </figure>
                ) : (
                  <img
                    src={image.url}
                    alt={image.alt || `Gallery ${index + 1}`}
                    className={`${index === 0 && layout !== 'yearbook' ? 'col-span-2 aspect-[16/10]' : layout === 'yearbook' ? 'aspect-square' : 'aspect-[4/5]'} w-full rounded-2xl object-cover shadow-sm`}
                  />
                )}
              </Reveal>
            ))}
          </div>
        ) : (
          <div className={`${s.card} mt-6 flex h-52 items-center justify-center text-center text-sm font-bold ${s.muted}`}>Thêm ảnh kỷ yếu để hoàn thiện album.</div>
        )}
      </SectionShell>
    );
  }

  if (sectionKey === 'timeline') {
    const items = sections.timeline.items.filter((item) => hasText(item.time) || hasText(item.title));
    if (!items.length && mode === 'public') return null;

    if (s.layout === 'garden') {
      return (
        <section className="relative min-h-[540px] overflow-hidden px-8 py-10 text-[#26382A]" style={paperTextureStyle} {...editProps}>
          <DesignElementLayer project={project} sectionKey="timeline" mode={mode} selectedElementId={selectedElementId} onSelectDesignElement={onSelectDesignElement} onDesignElementChange={onDesignElementChange} />
          <div className="relative z-10">
            <h2 className="text-5xl italic leading-none text-[#3F5943]" style={{ fontFamily: themeConfig.headingFont }}>Timeline</h2>
            <div className="relative mt-8 pl-[92px]">
              <div className="absolute bottom-3 left-[32px] top-0 w-[3px] bg-[#3F5943]/72" />
              <div className="space-y-10">
                {items.map((item, index) => (
                  <Reveal key={item.id} direction="right" delay={index * 100}>
                    <div className="relative">
                      <span className="absolute -left-[71px] top-1 h-5 w-5 rounded-full border-4 border-[#F5F2EA] bg-[#3F5943] shadow-[0_6px_14px_rgba(63,89,67,.18)]" />
                      {hasText(item.time) && <p className="text-2xl font-black leading-none text-[#3F5943]">{item.time}</p>}
                      {hasText(item.title) && <p className="mt-2 text-base font-semibold leading-6 text-[#53624F]">{item.title}</p>}
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </section>
      );
    }

    return (
      <SectionShell project={project} sectionKey="timeline" mode={mode} direction="up" clickProps={editProps} selectedElementId={selectedElementId} onSelectDesignElement={onSelectDesignElement} onDesignElementChange={onDesignElementChange}>
        <SectionTitle eyebrow="Ceremony flow" title="Timeline sự kiện" project={project} />
        <div className="relative mt-6 space-y-0">
          <div className="absolute bottom-5 left-[21px] top-5 w-px opacity-35" style={{ backgroundColor: themeConfig.primaryColor }} />
          {items.map((item, index) => (
            <Reveal key={item.id} direction={index % 2 ? 'right' : 'left'} delay={index * 70}>
              <div className="relative flex gap-4 pb-5 last:pb-0">
                <div className="relative z-10 mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-4 border-white text-sm font-black shadow-sm" style={{ backgroundColor: themeConfig.primaryColor, color: s.buttonText }}>
                  {String(index + 1).padStart(2, '0')}
                </div>
                <div className={`${s.card} flex-1 p-4`}>
                  {hasText(item.time) && <p className={`text-xs font-black uppercase tracking-[0.18em] ${s.eyebrow}`}>{item.time}</p>}
                  {hasText(item.title) && <p className="mt-1 text-sm font-black leading-6">{item.title}</p>}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </SectionShell>
    );
  }

  if (sectionKey === 'map') {
    const map = sections.map;
    if (![map.address, map.embedUrl, map.mapUrl].some(hasText) && mode === 'public') return null;

    return (
      <SectionShell project={project} sectionKey="map" mode={mode} variant="soft" direction="up" clickProps={editProps} selectedElementId={selectedElementId} onSelectDesignElement={onSelectDesignElement} onDesignElementChange={onDesignElementChange}>
        <SectionTitle eyebrow="Location" title="Địa điểm" project={project} />
        {hasText(map.address) && <p className={`mt-3 text-sm font-semibold leading-6 ${s.muted}`}>{map.address}</p>}
        {hasText(map.embedUrl) ? (
          <iframe title="Graduation map" src={map.embedUrl} className="mt-5 h-56 w-full rounded-3xl border-0" loading="lazy" />
        ) : (
          <div className={`${s.card} mt-5 flex h-52 flex-col items-center justify-center p-5 text-center`}>
            <MapPin size={28} style={{ color: themeConfig.primaryColor }} />
            <p className="mt-3 text-sm font-black">Bản đồ sẽ hiển thị tại đây</p>
            <p className={`mt-1 text-xs font-semibold ${s.muted}`}>Nhập Google Maps embed URL để hiện bản đồ trực tiếp.</p>
          </div>
        )}
        {hasText(map.mapUrl) && (
          <a href={map.mapUrl} target="_blank" rel="noreferrer" className="mt-5 flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black" style={{ backgroundColor: s.button, color: s.buttonText }}>
            <ExternalLink size={16} /> Mở Google Maps
          </a>
        )}
      </SectionShell>
    );
  }

  if (sectionKey === 'rsvp') {
    return (
      <SectionShell project={project} sectionKey="rsvp" mode={mode} direction="zoom" clickProps={editProps} selectedElementId={selectedElementId} onSelectDesignElement={onSelectDesignElement} onDesignElementChange={onDesignElementChange}>
        <SectionTitle eyebrow="RSVP" title={sections.rsvp.title || 'Xác nhận tham dự'} project={project} />
        {hasText(sections.rsvp.description) && <p className={`mt-3 text-sm font-semibold leading-6 ${s.muted}`}>{sections.rsvp.description}</p>}
        {mode === 'public' ? (
          <div className="mt-6">
            <RSVPForm invitationId={project.id} primaryColor={themeConfig.primaryColor} onSubmitted={onRsvpSubmitted} />
          </div>
        ) : (
          <div className={`${s.card} mt-6 p-4 text-sm font-bold ${s.muted}`}>Form RSVP sẽ hiển thị ở trang public.</div>
        )}
      </SectionShell>
    );
  }

  const footer = sections.footer;
  if (![footer.thankYou, footer.contactInfo].some(hasText) && !footer.showBranding && mode === 'public') return null;

  return (
    <Reveal>
      <footer className="relative overflow-hidden px-7 py-12 text-center text-[#26382A]" style={paperTextureStyle} {...editProps}>
        <DesignElementLayer project={project} sectionKey="footer" mode={mode} selectedElementId={selectedElementId} onSelectDesignElement={onSelectDesignElement} onDesignElementChange={onDesignElementChange} />
        <Sparkles className="mx-auto opacity-70" size={24} style={{ color: themeConfig.primaryColor }} />
        {hasText(footer.thankYou) && <p className="mx-auto mt-4 max-w-xs text-2xl font-black leading-tight" style={{ fontFamily: themeConfig.headingFont }}>{footer.thankYou}</p>}
        {hasText(footer.contactInfo) && <p className={`mt-3 text-sm font-semibold ${s.muted}`}>{footer.contactInfo}</p>}
        {footer.showBranding && <p className="mt-8 text-[11px] font-black uppercase tracking-[0.22em] opacity-45">Made with HUB Planner</p>}
      </footer>
    </Reveal>
  );
};

