export interface Specialization {
  name: string;
  credits: number;
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
  }
];

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
        return DEFAULT_TABP_MAJORS;
    }

    // Default: Return the majors found in ACADEMIC_PROGRAMS structure
    const prog = ACADEMIC_PROGRAMS.find(p => p.id === pId);
    return prog ? prog.majors : [];
};
