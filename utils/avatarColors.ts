export const AVATAR_COLOR_OPTIONS = [
    '#1f2937',
    '#2563eb',
    '#16a34a',
    '#f97316',
    '#a855f7',
] as const;

const EXTRA_ALLOWED_AVATAR_COLORS = [
    '#003375',
    '#0052cc',
    '#0b7cff',
] as const;

export const DEFAULT_AVATAR_COLOR = '#0052cc';

const ALLOWED_AVATAR_COLORS = new Set<string>([
    ...AVATAR_COLOR_OPTIONS,
    ...EXTRA_ALLOWED_AVATAR_COLORS,
]);

const normalizeAvatarColor = (value?: string | null) => String(value || '').trim().toLowerCase();

const AVATAR_COLOR_CLASS_BY_VALUE: Record<string, string> = {
    '#1f2937': 'avatar-color-slate',
    '#2563eb': 'avatar-color-blue',
    '#16a34a': 'avatar-color-green',
    '#f97316': 'avatar-color-orange',
    '#a855f7': 'avatar-color-purple',
    '#003375': 'avatar-color-hub',
    '#0052cc': 'avatar-color-primary',
    '#0b7cff': 'avatar-color-bright',
};

export const isAllowedAvatarColor = (value?: string | null) => (
    ALLOWED_AVATAR_COLORS.has(normalizeAvatarColor(value))
);

export const isAvatarImageUrl = (value?: string | null) => {
    const avatar = String(value || '').trim();
    return Boolean(avatar && !avatar.startsWith('#'));
};

export const getSafeAvatarColor = (
    value?: string | null,
    fallback: string = DEFAULT_AVATAR_COLOR,
) => (isAllowedAvatarColor(value) ? normalizeAvatarColor(value) : fallback);

export const getAvatarColorClass = (
    value?: string | null,
    fallback: string = DEFAULT_AVATAR_COLOR,
) => AVATAR_COLOR_CLASS_BY_VALUE[getSafeAvatarColor(value, fallback)] || AVATAR_COLOR_CLASS_BY_VALUE[DEFAULT_AVATAR_COLOR];
