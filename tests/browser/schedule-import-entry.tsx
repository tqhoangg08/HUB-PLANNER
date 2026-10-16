import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ScheduleImportPreviewModal } from '../../components/ScheduleImportPreviewModal';
import { buildScheduleImportPreview, replaceUserScheduleFromPreview } from '../../utils/scheduleImportPreview';
import { parseHubScheduleLayout } from '../../utils/hubScheduleParser';
import layout from '../fixtures/hub-schedule-11.layout.json';

const semester = 'HK1_2026_2027';
const initial = await buildScheduleImportPreview(parseHubScheduleLayout(layout).courses, semester);
function PreviewHarness() {
  const [rows, setRows] = useState(initial);
  const [saved, setSaved] = useState(0);
  return <>
    <p role="status">Đã lưu {saved} môn</p>
    <ScheduleImportPreviewModal rows={rows} semester={semester} onChange={setRows} onCancel={() => {}} onConfirm={async () => setSaved(await replaceUserScheduleFromPreview(semester, rows))} />
  </>;
}
createRoot(document.getElementById('root')!).render(<PreviewHarness />);
