import { CURRENT_DRL_YEAR, DRL_POLICY_VERSION, LEGACY_DRL_POLICY, policyForAcademicYear } from '../../../utils/drlPolicy.ts';
import type { EventDrlRule } from './event-drl-prediction.ts';
import { DRL_RULES_2026 } from '../../../utils/drlPolicy2026.ts';

export const resolveDrlContext = (input: { drl_policy_version?: unknown; drl_academic_year?: unknown }) => {
  const academicYear = String(input.drl_academic_year || CURRENT_DRL_YEAR);
  const policyVersion = policyForAcademicYear(academicYear);
  if (input.drl_policy_version && input.drl_policy_version !== policyVersion) {
    throw new Error('Phiên bản quy chế không khớp năm học.');
  }
  return { policyVersion, academicYear };
};
export const loadDrlPolicyRules = async (db: D1Database, policyVersion: string) => {
  if (![DRL_POLICY_VERSION, LEGACY_DRL_POLICY].includes(policyVersion)) throw new Error('Quy chế không hợp lệ.');
  const policy = await db.prepare('SELECT active FROM drl_policy_versions WHERE policy_version=?').bind(policyVersion).first<{ active: number }>();
  if (!policy || policy.active !== 1) throw new Error('Quy chế chưa sẵn sàng hoặc đã ngừng áp dụng.');
  const predicate = policyVersion === LEGACY_DRL_POLICY
    ? 'NOT EXISTS (SELECT 1 FROM drl_policy_versions p WHERE p.policy_version=r.source_version)'
    : 'r.source_version=?';
  const query = db.prepare(`SELECT r.rule_id,r.section,r.rule_group,r.content,r.condition_text,r.points,r.unit,
    r.active,r.event_suitable,r.source_version FROM drl_rules r WHERE ${predicate} ORDER BY r.rule_id`);
  const result = await (policyVersion === LEGACY_DRL_POLICY ? query : query.bind(policyVersion)).all<EventDrlRule & {
    active: number; event_suitable: number; source_version: string;
  }>();
  const rules = result.results || [];
  if (policyVersion === DRL_POLICY_VERSION) {
    const sourceFields = ['section','rule_group','content','condition_text','points','unit','event_suitable'] as const;
    if (rules.length !== DRL_RULES_2026.length || rules.some((rule) => {
      const source = DRL_RULES_2026.find((entry) => entry.rule_id === rule.rule_id);
      return !source || sourceFields.some((field) => source[field] !== rule[field]);
    })) throw new Error('Danh mục quy chế khác nguồn đã kiểm chứng; cần rà soát dữ liệu.');
  }
  return rules.map((rule) => ({ ...rule, policy_version: policyVersion }));
};
export const drlRulesFingerprint = async (rules: Awaited<ReturnType<typeof loadDrlPolicyRules>>) => {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(rules)));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};
