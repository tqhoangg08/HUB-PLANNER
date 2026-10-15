import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { DrlScoreGuideModal } from '../components/DrlScoreGuide';
import { EventDrlRulePicker } from '../components/EventDrlAssistant';
import { DRL_RULES_2026, DRL_POLICY_VERSION } from '../utils/drlPolicy2026';

const Harness = () => {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState({ drl_rule_id:'OLD_SAVED', drl_policy_version:'', drl_academic_year:'', points:'10', criteria:'III' });
  const rules = DRL_RULES_2026.map((rule) => ({ ...rule, policy_version:DRL_POLICY_VERSION }));
  return <main className="mx-auto max-w-3xl space-y-4 p-4"><button onClick={() => setOpen(true)}>Mở phụ lục</button>
    <DrlScoreGuideModal isOpen={open} onClose={() => setOpen(false)}/>
    <EventDrlRulePicker rules={rules} selectedRuleId={value.drl_rule_id} academicYear={value.drl_academic_year} policyVersion={value.drl_policy_version || undefined} prediction={null} catalogState="ready"
      onContextChange={(context) => setValue((current) => ({ ...current, ...context, drl_rule_id:'',points:'',criteria:'' }))}
      onSelect={(rule) => setValue((current) => ({ ...current, drl_rule_id:rule?.rule_id || '', drl_policy_version:rule?.policy_version || '',
        drl_academic_year:rule?.academic_year || '', points:rule ? String(rule.points) : '',criteria:rule?.section || '' }))}/>
    <output aria-label="Dữ liệu đã chọn" className="block break-all">{JSON.stringify(value)}</output>
  </main>;
};
createRoot(document.getElementById('root')!).render(<Harness/>);
