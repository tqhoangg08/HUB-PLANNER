import {
  BetterAuthIdentityError,
  requireBetterAuthSession,
  type BetterAuthIdentity,
  type BetterAuthIdentityEnv,
} from './better-auth-identity.ts';

export interface StudentDirectoryEnv extends BetterAuthIdentityEnv {
  DB?: D1Database;
}

export interface StudentDirectoryRow {
  student_code: string;
  full_name: string | null;
  gender: string | null;
  general_class: string | null;
  major_class: string | null;
  major: string | null;
  specialization: string | null;
  training_program: string | null;
  cohort: string | null;
}

export class StudentDirectoryError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'StudentDirectoryError';
    this.status = status;
  }
}

const STUDENT_EMAIL = /^(\d{12})@st\.buh\.edu\.vn$/i;
export const studentCodeFromVerifiedEmail = (email: string, verified: boolean) =>
  verified ? STUDENT_EMAIL.exec(email)?.[1] || null : null;

/** The existing Auth service, not a client claim, supplies the verified bit. */
export const readVerifiedStudentCode = async (
  request: Request,
  env: StudentDirectoryEnv,
  identity: BetterAuthIdentity,
): Promise<string | null> => {
  if (!STUDENT_EMAIL.test(identity.email)) return null;
  if (!env.AUTH_SERVICE) throw new StudentDirectoryError(503, 'Dịch vụ xác thực tạm thời chưa sẵn sàng.');
  const cookie = request.headers.get('Cookie') || '';
  if (!cookie || cookie.length > 16_384) throw new BetterAuthIdentityError(401, 'UNAUTHENTICATED');
  let response: Response;
  try {
    response = await env.AUTH_SERVICE.fetch(new Request(
      'https://hotrosinhvienhub.id.vn/api/auth/get-session', {
        method: 'GET',
        headers: { Cookie: cookie, Accept: 'application/json' },
        redirect: 'manual',
        signal: AbortSignal.timeout(5_000),
      },
    ));
  } catch {
    throw new StudentDirectoryError(503, 'Dịch vụ xác thực tạm thời chưa sẵn sàng.');
  }
  if (!response.ok) throw new StudentDirectoryError(503, 'Dịch vụ xác thực tạm thời chưa sẵn sàng.');
  const length = Number(response.headers.get('content-length') || '0');
  if (length > 16_384) throw new StudentDirectoryError(503, 'Phản hồi xác thực không hợp lệ.');
  let payload: unknown;
  try {
    const text = await response.text();
    if (text.length > 16_384) throw new Error('oversize');
    payload = JSON.parse(text);
  } catch {
    throw new StudentDirectoryError(503, 'Phản hồi xác thực không hợp lệ.');
  }
  const user = payload && typeof payload === 'object' && 'user' in payload
    ? (payload as { user?: unknown }).user : null;
  if (!user || typeof user !== 'object') return null;
  const verified = user as { id?: unknown; email?: unknown; emailVerified?: unknown };
  if (verified.id !== identity.userId || typeof verified.email !== 'string' ||
      verified.email.toLowerCase() !== identity.email.toLowerCase()) {
    throw new StudentDirectoryError(503, 'Thông tin xác thực không khớp.');
  }
  return studentCodeFromVerifiedEmail(identity.email, verified.emailVerified === true);
};

export const readOwnStudentDirectory = async (
  request: Request,
  env: StudentDirectoryEnv,
  identity?: BetterAuthIdentity,
): Promise<StudentDirectoryRow | null> => {
  const owner = identity || await requireBetterAuthSession(request, env);
  const code = await readVerifiedStudentCode(request, env, owner);
  if (!code) return null;
  if (!env.DB) throw new StudentDirectoryError(503, 'Dữ liệu sinh viên tạm thời chưa sẵn sàng.');
  return env.DB.prepare(`SELECT student_code, full_name, gender, general_class,
    major_class, major, specialization, training_program, cohort
    FROM student_directory WHERE student_code=? LIMIT 1`).bind(code).first<StudentDirectoryRow>();
};

export const handleOwnStudentDirectory = async (request: Request, env: StudentDirectoryEnv) => {
  if (request.method !== 'GET') throw new StudentDirectoryError(405, 'Phương thức không được hỗ trợ.');
  if (new URL(request.url).search) throw new StudentDirectoryError(400, 'Không hỗ trợ tham số tìm kiếm.');
  const row = await readOwnStudentDirectory(request, env);
  return row ? { matched: true, studentCode: row.student_code, fullName: row.full_name,
    gender: row.gender, generalClass: row.general_class, majorClass: row.major_class,
    major: row.major, specialization: row.specialization,
    trainingProgram: row.training_program, cohort: row.cohort }
    : { matched: false };
};
