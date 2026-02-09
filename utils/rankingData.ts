
// --- UTILITIES FOR RANKING & ID MAPPING ---

/**
 * Maps a display name (e.g., "Năm học 2024-2025 - Học kỳ 1") 
 * to a Database Semester ID (e.g., "HK1_2024_2025").
 */
export const mapSemesterToId = (name: string): string | null => {
    if (!name) return null;
    
    const normalized = name.trim().toLowerCase();

    // Regex to match "2024-2025" and "Học kỳ 1" / "HK1" / "HK 1"
    // Captures: Group 1 = Year1, Group 2 = Year2, Group 3 = Semester Number
    const match = normalized.match(/(\d{4})[-_](\d{4}).*(?:học kỳ|hk)\s*(\d)/i);

    if (match) {
        const y1 = match[1];
        const y2 = match[2];
        const hk = match[3];
        return `HK${hk}_${y1}_${y2}`;
    }

    return null;
};

/**
 * Returns a user-friendly name for the DB ID
 * e.g., "HK1_2024_2025" -> "Học kỳ 1, Năm học 2024-2025"
 */
export const mapIdToDisplay = (id: string): string => {
    const parts = id.split('_'); // [HK1, 2024, 2025]
    if (parts.length === 3) {
        return `Học kỳ ${parts[0].replace('HK', '')}, Năm học ${parts[1]}-${parts[2]}`;
    }
    return id;
};
