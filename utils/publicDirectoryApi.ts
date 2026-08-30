import { fetchPublicWorker } from './publicWorkerApi';

export interface PublicProfileSummary {
  id: string;
  student_code: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at?: string | null;
  bio?: string | null;
  class_name: string | null;
  profile_tags: string[];
  public_profile_enabled?: boolean;
  show_profile_stats?: boolean;
  public_gpa?: number | null;
  public_completed_semesters?: number | null;
  public_credits?: number | null;
}

const readJson = async <T>(response: Response): Promise<T> => {
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || 'Không thể tải dữ liệu công khai.');
  return payload;
};

export const searchPublicProfiles = (query: string, limit = 80) =>
  fetchPublicWorker(`/api/public/v1/profiles/search?q=${encodeURIComponent(query)}&limit=${limit}`)
    .then(response => readJson<{ data: PublicProfileSummary[] }>(response))
    .then(payload => payload.data);

export const fetchPublicProfile = (studentCode: string) =>
  fetchPublicWorker(`/api/public/v1/profiles/${encodeURIComponent(studentCode)}`)
    .then(response => readJson<{ data: PublicProfileSummary }>(response))
    .then(payload => payload.data);

export const fetchPublicDonations = () =>
  fetchPublicWorker('/api/public/v1/donations')
    .then(response => readJson<{ data: Record<string, unknown>[] }>(response))
    .then(payload => payload.data);
