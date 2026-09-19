import { privateApiRequest } from './privateApi';

export type InternalRole = 'user' | 'admin' | 'auditor';
export type InternalPurpose = 'test' | 'demo' | 'qa' | 'internal';
export type InternalAccount = { username: string; display_name: string; role: InternalRole; purpose: InternalPurpose; status: 'active' | 'disabled'; expires_at: string | null; updated_at: string };
const endpoint = '/api/admin/internal-accounts';

export const listInternalAccounts = async (cursor: string | null) => (await privateApiRequest(`${endpoint}?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)).json() as Promise<{ data: InternalAccount[]; next_cursor: string | null; has_more: boolean }>;
export const mutateInternalAccount = async (body: Record<string, unknown>) => (await privateApiRequest(endpoint, { method: 'POST', headers: { 'Idempotency-Key': String(body.operationId || '') }, body: JSON.stringify(body) })).json() as Promise<{ success: boolean; deleted?: boolean; sessions_revoked?: boolean; unchanged?: boolean }>;
export const readInternalAccountAudit = async (username: string) => (await privateApiRequest(`${endpoint}?history=${encodeURIComponent(username)}`)).json() as Promise<{ data: Array<{ action: string; created_at: string }> }>;
