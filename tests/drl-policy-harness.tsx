import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { DrlScoreGuideModal } from '../components/DrlScoreGuide';
import { EventDrlRulePicker } from '../components/EventDrlAssistant';
import { DRL_RULES_2026 } from '../utils/drlPolicy2026';

const Harness = () => {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState({ drl_rule_id:'', points:'10', criteria:'III' });
  const rules = DRL_RULES_2026.filter((rule) => rule.active && rule.event_suitable);
  return <main className="mx-auto max-w-3xl space-y-4 p-4"><button onClick={() => setOpen(true)}>Mở phụ lục</button>
    <DrlScoreGuideModal isOpen={open} onClose={() => setOpen(false)}/>
    <EventDrlRulePicker rules={rules} selectedRuleId={value.drl_rule_id} prediction={null}
      onSelect={(rule) => setValue((current) => ({ ...current, drl_rule_id:rule?.rule_id || '',
        points:rule ? String(rule.points) : '',criteria:rule?.section || '' }))}/>
    <output aria-label="Dữ liệu đã chọn" className="block break-all">{JSON.stringify(value)}</output>
  </main>;
};
createRoot(document.getElementById('root')!).render(<Harness/>);
