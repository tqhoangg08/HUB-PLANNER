export interface Specialization {
  name: string;
  // New cohorts do not have an authoritative total yet. Avoid a fake value
  // that could later be saved as their graduation-credit requirement.
  credits?: number;
}

export interface Major {
  name: string;
  code: string;
  specializations: Specialization[];
}

export interface Program {
  id: string;
  name: string;
  majors: Major[];
}

// Dữ liệu mặc định (Cho các khóa cũ/khác)
const DEFAULT_STANDARD_MAJORS: Major[] = [
      {
        name: 'Tài chính – Ngân hàng',
        code: '7340201',
        specializations: [
          { name: 'Tài chính', credits: 123 },
          { name: 'Ngân hàng', credits: 123 },
          { name: 'Tài chính và quản trị doanh nghiệp', credits: 123 },
          { name: 'Tài chính định lượng và quản trị rủi ro', credits: 123 },
        ]
      },
      {
        name: 'Công nghệ tài chính',
        code: '7340205',
        specializations: [{ name: 'Công nghệ tài chính', credits: 124 }]
      },
      {
        name: 'Kế toán',
        code: '7340301',
        specializations: [{ name: 'Kế toán', credits: 125 }]
      },
      {
        name: 'Quản trị kinh doanh',
        code: '7340101',
        specializations: [{ name: 'Quản trị kinh doanh', credits: 125 }]
      },
      {
        name: 'Marketing',
        code: '7340115',
        specializations: [{ name: 'Marketing', credits: 125 }]
      },
      {
        name: 'Logistics và quản lý chuỗi cung ứng',
        code: '7510605',
        specializations: [{ name: 'Logistics và quản lý chuỗi cung ứng', credits: 125 }]
      },
      {
        name: 'Hệ thống thông tin quản lý',
        code: '7340405',
        specializations: [{ name: 'Hệ thống thông tin quản lý', credits: 125 }]
      },
      {
        name: 'Khoa học dữ liệu',
        code: '7460108',
        specializations: [{ name: 'Khoa học dữ liệu', credits: 125 }]
      },
      {
        name: 'Kinh tế quốc tế',
        code: '7310106',
        specializations: [
            { name: 'Kinh tế quốc tế', credits: 122 },
            { name: 'Kinh tế và kinh doanh số', credits: 122 }
        ]
      },
      {
        name: 'Kinh doanh quốc tế',
        code: '7340120',
        specializations: [{ name: 'Kinh doanh quốc tế', credits: 122 }]
      },
      {
        name: 'Luật Kinh tế',
        code: '7380107',
        specializations: [{ name: 'Luật Kinh tế', credits: 121 }]
      },
      {
        name: 'Ngôn ngữ Anh',
        code: '7220201',
        specializations: [
            { name: 'Tiếng Anh thương mại', credits: 125 },
            { name: 'Song ngữ Anh - Trung', credits: 125 }
        ]
      },
      {
        name: 'Kiểm toán',
        code: '7340302',
        specializations: [{ name: 'Kiểm toán', credits: 125 }]
      },
      {
        name: 'Luật',
        code: '7380101',
        specializations: [{ name: 'Luật', credits: 121 }]
      },
      {
        name: 'Trí tuệ nhân tạo',
        code: '7480107',
        specializations: [{ name: 'Trí tuệ nhân tạo', credits: 125 }]
      },
      {
        name: 'Thương mại điện tử',
        code: '7340122',
        specializations: [{ name: 'Thương mại điện tử', credits: 125 }]
      }
];

const DEFAULT_TABP_MAJORS: Major[] = [
      {
        name: 'Tài chính – Ngân hàng (TABP)',
        code: '7340201_TABP',
        specializations: [{ name: 'Tài chính – Ngân hàng (TABP)', credits: 124 }]
      },
      {
        name: 'Quản trị kinh doanh (TABP)',
        code: '7340101_TABP',
        specializations: [{ name: 'Quản trị kinh doanh (TABP)', credits: 123 }]
      },
      {
        name: 'Kế toán (TABP)',
        code: '7340301_TABP',
        specializations: [{ name: 'Kế toán (TABP)', credits: 123 }]
      },
      {
        name: 'Kinh tế quốc tế (TABP)',
        code: '7310106_TABP',
        specializations: [{ name: 'Kinh tế quốc tế (TABP)', credits: 122 }]
      },
      {
        name: 'Hệ thống thông tin quản lý (TABP)',
        code: '7340405_TABP',
        specializations: [{ name: 'Hệ thống thông tin quản lý (TABP)', credits: 125 }]
      },
      {
        name: 'Luật kinh tế (TABP)',
        code: '7380107_TABP',
        specializations: [{ name: 'Luật kinh tế (TABP)', credits: 124 }]
      },
];

// Dữ liệu cho K38, K39 (Chính quy chuẩn)
const K38_K39_STANDARD_MAJORS: Major[] = [
    {
        name: 'Tài chính – Ngân hàng',
        code: '7340201',
        specializations: [
            { name: 'Tài chính', credits: 124 },
            { name: 'Ngân hàng', credits: 124 },
            { name: 'Công nghệ tài chính', credits: 124 },
            { name: 'Tài chính và quản trị doanh nghiệp', credits: 124 },
            { name: 'Tài chính định lượng và quản trị rủi ro', credits: 124 },
        ]
    },
    {
        name: 'Quản trị kinh doanh',
        code: '7340101',
        specializations: [
            { name: 'Quản trị kinh doanh', credits: 125 },
            { name: 'Digital marketing', credits: 125 },
            { name: 'Logistics và quản lý chuỗi cung ứng', credits: 125 }
        ]
    },
    {
        name: 'Hệ thống thông tin quản lý',
        code: '7340405',
        specializations: [
            { name: 'Hệ thống thông tin kinh doanh và chuyển đổi số', credits: 122 },
            { name: 'Quản trị thương mại điện tử', credits: 122 },
            { name: 'Khoa học dữ liệu trong kinh doanh', credits: 122 }
        ]
    },
    {
        name: 'Kế toán',
        code: '7340301',
        specializations: [
            { name: 'Kế toán kiểm toán', credits: 125 }
        ]
    },
    {
        name: 'Kinh tế quốc tế',
        code: '7310106',
        specializations: [
            { name: 'Kinh tế quốc tế', credits: 122 },
            { name: 'Kinh doanh quốc tế', credits: 122 },
            { name: 'Kinh tế và kinh doanh số', credits: 122 }
        ]
    },
    {
        name: 'Luật kinh tế',
        code: '7380107',
        specializations: [
            { name: 'Luật kinh tế', credits: 122 }
        ]
    },
    {
        name: 'Ngôn ngữ Anh',
        code: '7220201',
        specializations: [
            { name: 'Tiếng Anh thương mại', credits: 125 },
            { name: 'Song ngữ Anh - Trung', credits: 125 }
        ]
    }
];

// Dữ liệu cho K40 (Chính quy chuẩn)
const K40_STANDARD_MAJORS: Major[] = [
    {
        name: 'Tài chính – Ngân hàng',
        code: '7340201',
        specializations: [
            { name: 'Tài chính', credits: 123 },
            { name: 'Ngân hàng', credits: 123 },
            { name: 'Tài chính và quản trị doanh nghiệp', credits: 123 },
            { name: 'Tài chính định lượng và quản trị rủi ro', credits: 123 },
        ]
    },
    {
        name: 'Công nghệ tài chính',
        code: '7340205',
        specializations: [{ name: 'Công nghệ tài chính', credits: 124 }]
    },
    {
        name: 'Kế toán',
        code: '7340301',
        specializations: [
            { name: 'Kế toán Kiểm toán', credits: 125 },
            { name: 'Kiểm toán và quản lý rủi ro', credits: 125 }
        ]
    },
    {
        name: 'Quản trị kinh doanh',
        code: '7340101',
        specializations: [{ name: 'Quản trị kinh doanh', credits: 125 }]
    },
    {
        name: 'Marketing',
        code: '7340115',
        specializations: [{ name: 'Marketing', credits: 125 }]
    },
    {
        name: 'Logistics và quản lý chuỗi cung ứng',
        code: '7510605',
        specializations: [{ name: 'Logistics và quản lý chuỗi cung ứng', credits: 125 }]
    },
    {
        name: 'Hệ thống thông tin quản lý',
        code: '7340405',
        specializations: [
            { name: 'Hệ thống thông tin kinh doanh và chuyển đổi số', credits: 125 },
            { name: 'Quản trị thương mại điện tử', credits: 125 }
        ]
    },
    {
        name: 'Khoa học dữ liệu',
        code: '7460108',
        specializations: [{ name: 'Khoa học dữ liệu', credits: 125 }]
    },
    {
        name: 'Kinh tế quốc tế',
        code: '7310106',
        specializations: [
            { name: 'Kinh tế quốc tế', credits: 122 },
            { name: 'Kinh tế và kinh doanh số', credits: 122 }
        ]
    },
    {
        name: 'Kinh doanh quốc tế',
        code: '7340120',
        specializations: [{ name: 'Kinh doanh quốc tế', credits: 122 }]
    },
    {
        name: 'Luật Kinh tế',
        code: '7380107',
        specializations: [{ name: 'Luật Kinh tế', credits: 121 }]
    },
    {
        name: 'Ngôn ngữ Anh',
        code: '7220201',
        specializations: [
            { name: 'Tiếng Anh thương mại', credits: 125 },
            { name: 'Song ngữ Anh - Trung', credits: 125 }
        ]
    }
];

// Dữ liệu cho K10, K11 (CLC/TABP)
const K10_K11_CLC_MAJORS: Major[] = [
    {
        name: 'Tài chính – Ngân hàng (CLC)',
        code: '7340201_CLC',
        specializations: [{ name: 'Tài chính – Ngân hàng (CLC)', credits: 123 }]
    },
    {
        name: 'Quản trị kinh doanh (CLC)',
        code: '7340101_CLC',
        specializations: [{ name: 'Quản trị kinh doanh (CLC)', credits: 123 }]
    },
    {
        name: 'Kế toán (CLC)',
        code: '7340301_CLC',
        specializations: [{ name: 'Kế toán (CLC)', credits: 123 }]
    }
];

// Dữ liệu cho CLCK12 (TABP)
const K12_CLC_MAJORS: Major[] = [
    {
        name: 'Tài chính – Ngân hàng (TABP)',
        code: '7340201_TABP',
        specializations: [{ name: 'Tài chính – Ngân hàng (TABP)', credits: 124 }]
    },
    {
        name: 'Quản trị kinh doanh (TABP)',
        code: '7340101_TABP',
        specializations: [{ name: 'Quản trị kinh doanh (TABP)', credits: 123 }]
    },
    {
        name: 'Kế toán (TABP)',
        code: '7340301_TABP',
        specializations: [{ name: 'Kế toán (TABP)', credits: 123 }]
    },
    {
        name: 'Kinh tế quốc tế (TABP)',
        code: '7310106_TABP',
        specializations: [{ name: 'Kinh tế quốc tế (TABP)', credits: 122 }]
    },
    {
        name: 'Hệ thống thông tin quản lý (TABP)',
        code: '7340405_TABP',
        specializations: [{ name: 'Hệ thống thông tin quản lý (TABP)', credits: 125 }]
    }
];

const manualSpecialization = (name: string): Specialization => ({ name });
const manualMajor = (name: string, code: string, specializations: string[] = [name]): Major => ({
    name,
    code,
    specializations: specializations.map(manualSpecialization),
});

// Kept separate from the defaults so K42 never silently inherits historical
// credits while the official program total is still being confirmed.
const K42_STANDARD_MAJORS: Major[] = [
    manualMajor('Tài chính – Ngân hàng', '7340201', ['Tài chính', 'Ngân hàng số và chuỗi khối', 'Tài chính định lượng và quản trị rủi ro', 'Tài chính và quản trị doanh nghiệp']),
    manualMajor('Kế toán', '7340301'),
    manualMajor('Quản trị kinh doanh', '7340101'),
    manualMajor('Kiểm toán', '7340302'),
    manualMajor('Kinh tế quốc tế', '7310106', ['Kinh tế quốc tế', 'Kinh tế và kinh doanh số']),
    manualMajor('Marketing', '7340115'),
    manualMajor('Công nghệ tài chính', '7340205'),
    manualMajor('Kinh doanh quốc tế', '7340120'),
    manualMajor('Luật kinh tế', '7380107'),
    manualMajor('Hệ thống thông tin quản lý', '7340405'),
    manualMajor('Ngôn ngữ Anh', '7220201', ['Tiếng Anh thương mại', 'Song ngữ Anh - Trung']),
    manualMajor('Ngôn ngữ Trung Quốc', '7220204'),
    manualMajor('Khoa học dữ liệu', '7460108'),
    manualMajor('Logistics và quản lý chuỗi cung ứng', '7510605'),
    manualMajor('Thương mại điện tử', '7340122'),
    manualMajor('Luật', '7380101'),
    manualMajor('Trí tuệ nhân tạo', '7480107'),
    manualMajor('Công nghệ thông tin', '7480201'),
    manualMajor('Bảo hiểm', '7340204'),
    manualMajor('Quản trị khách sạn', '7810201'),
];
const CLCK14_TABP_MAJORS: Major[] = [
    manualMajor('Tài chính – Ngân hàng', '7340201'), manualMajor('Kế toán', '7340301'),
    manualMajor('Kinh doanh quốc tế', '7340120'), manualMajor('Quản trị kinh doanh', '7340101'),
    manualMajor('Hệ thống thông tin quản lý', '7340405'), manualMajor('Kinh tế quốc tế', '7310106'),
    manualMajor('Thương mại điện tử', '7340122'), manualMajor('Luật kinh tế', '7380107'),
];
const CTDBK3_SPECIAL_MAJORS: Major[] = [manualMajor('Ngôn ngữ Anh', '7220201')];
const ELITE_MAJORS: Major[] = [manualMajor('Tài chính – Ngân hàng', '7340201')];
const INTERNATIONAL_DUAL_DEGREE_MAJORS: Major[] = [
    manualMajor('Quản trị kinh doanh', '7340101', ['Quản trị kinh doanh', 'Quản trị chuỗi cung ứng', 'Marketing']),
    manualMajor('Tài chính – Ngân hàng', '7340201', ['Tài chính', 'Tài chính – Ngân hàng – Bảo hiểm']),
];

export const ACADEMIC_PROGRAMS: Program[] = [
  {
    id: 'standard',
    name: 'Đại học chính quy chuẩn',
    majors: DEFAULT_STANDARD_MAJORS
  },
  {
    id: 'tabp',
    name: 'ĐHCQ Tiếng Anh bán phần (TABP/CLC)',
    majors: DEFAULT_TABP_MAJORS
  },
  {
    id: 'special',
    name: 'ĐHCQ Chương trình đặc biệt',
    majors: [
       {
        name: 'Ngôn ngữ Anh (CTĐB)',
        code: '7340201_CTDB',
        specializations: [{ name: 'Ngôn ngữ Anh (CTĐB)', credits: 125 }]
      },
    ]
  },
  { id: 'elite', name: 'Chương trình tinh hoa', majors: ELITE_MAJORS },
  { id: 'international-dual-degree', name: 'ĐHCQ Quốc tế cấp song bằng', majors: INTERNATIONAL_DUAL_DEGREE_MAJORS }
];

export const ACADEMIC_COHORT_OPTIONS: Record<string, string[]> = {
  standard: ['K38', 'K39', 'K40', 'K41', 'K42'],
  tabp: ['CLCK10', 'CLCK11', 'CLCK12', 'CLCK13', 'CLCK14'],
  special: ['CTDBK1', 'CTDBK2', 'CTDBK3'],
  elite: ['K1', 'K2'],
  'international-dual-degree': ['K7', 'K8'],
};

const MANUAL_TOTAL_CREDITS_COHORTS = new Set([
    'standard/K42', 'tabp/CLCK14', 'special/CTDBK3', 'elite/K1', 'elite/K2',
    'international-dual-degree/K7', 'international-dual-degree/K8',
]);

export const isManualTotalCreditsCohort = (programId: string, cohort: string) =>
    MANUAL_TOTAL_CREDITS_COHORTS.has(`${programId}/${cohort.toUpperCase().trim()}`);

export const normalizeManualTotalCredits = (value: string | number | null | undefined): number => {
    const text = String(value ?? '').trim();
    if (!/^\d+$/.test(text)) return 0;
    const parsed = Number(text);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
};

export const resolveTotalCreditsRequired = ({
    programName,
    cohort,
    specializationName,
    storedCredits,
}: {
    programName?: string;
    cohort?: string;
    specializationName?: string;
    storedCredits?: number | null;
}): number => {
    const program = ACADEMIC_PROGRAMS.find(item => item.name === programName);
    if (program && isManualTotalCreditsCohort(program.id, cohort || '')) {
        return normalizeManualTotalCredits(storedCredits);
    }
    const stored = normalizeManualTotalCredits(storedCredits);
    if (stored) return stored;
    const specialization = program
        ? getMajors(program.id, cohort || '').flatMap(major => major.specializations)
            .find(item => item.name === specializationName)
        : undefined;
    return specialization?.credits || 125;
};

// Helper function to get majors based on Program AND Cohort
export const getMajors = (programId: string, cohort: string): Major[] => {
    const pId = programId;
    const c = cohort.toUpperCase().trim();

    // 1. Logic cho ĐH Chính quy chuẩn
    if (pId === 'standard') {
        if (c === 'K38' || c === 'K39') {
            return K38_K39_STANDARD_MAJORS;
        }
        if (c === 'K40') {
            return K40_STANDARD_MAJORS;
        }
        if (c === 'K42') return K42_STANDARD_MAJORS;
        return DEFAULT_STANDARD_MAJORS;
    }

    // 2. Logic cho CLC/TABP
    if (pId === 'tabp') {
        if (c === 'CLCK10' || c === 'CLCK11') {
            return K10_K11_CLC_MAJORS;
        }
        if (c === 'CLCK12') {
            return K12_CLC_MAJORS;
        }
        if (c === 'CLCK14') return CLCK14_TABP_MAJORS;
        return DEFAULT_TABP_MAJORS;
    }

    if (pId === 'special' && c === 'CTDBK3') return CTDBK3_SPECIAL_MAJORS;
    if (pId === 'elite') return c === 'K1' || c === 'K2' ? ELITE_MAJORS : [];
    if (pId === 'international-dual-degree') {
        return c === 'K7' || c === 'K8' ? INTERNATIONAL_DUAL_DEGREE_MAJORS : [];
    }

    // Default: Return the majors found in ACADEMIC_PROGRAMS structure
    const prog = ACADEMIC_PROGRAMS.find(p => p.id === pId);
    return prog ? prog.majors : [];
};
