// Utilities for mapping between UI semester labels and benchmark_rankings IDs.

export const normalizeSemesterId = (value?: string | null): string | null => {
    if (!value) return null;

    const normalized = value.trim();

    const prefixMatch = normalized.match(/^HK(\d)_(\d{4})_(\d{4})$/i);
    if (prefixMatch) {
        return `${prefixMatch[2]}-${prefixMatch[3]}_HK${prefixMatch[1]}`;
    }

    const suffixMatch = normalized.match(/^(\d{4})-(\d{4})_HK(\d)$/i);
    if (suffixMatch) {
        return `${suffixMatch[1]}-${suffixMatch[2]}_HK${suffixMatch[3]}`;
    }

    const cleanLabelMatch = normalized.match(/Học kỳ\s*(\d)\s*Năm học\s*(\d{4})-(\d{4})/i);
    if (cleanLabelMatch) {
        return `${cleanLabelMatch[2]}-${cleanLabelMatch[3]}_HK${cleanLabelMatch[1]}`;
    }

    const asciiLabelMatch = normalized.match(/(?:hoc ky|hk)\s*(\d).*?(\d{4})[-_](\d{4})/i);
    if (asciiLabelMatch) {
        return `${asciiLabelMatch[2]}-${asciiLabelMatch[3]}_HK${asciiLabelMatch[1]}`;
    }

    const yearFirstMatch = normalized.match(/(\d{4})[-_](\d{4}).*?(?:học kỳ|hoc ky|hk)\s*(\d)/i);
    if (yearFirstMatch) {
        return `${yearFirstMatch[1]}-${yearFirstMatch[2]}_HK${yearFirstMatch[3]}`;
    }

    return null;
};

export const mapSemesterToId = (name: string): string | null => normalizeSemesterId(name);

export const mapIdToDisplay = (id: string): string => {
    const canonical = normalizeSemesterId(id);
    if (!canonical) return id;

    const match = canonical.match(/^(\d{4})-(\d{4})_HK(\d)$/i);
    if (!match) return id;

    return `Học kỳ ${match[3]}, Năm học ${match[1]}-${match[2]}`;
};
