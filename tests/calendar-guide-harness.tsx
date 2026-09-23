import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CalendarExportDialog } from '../components/CalendarExportDialog';
import { CalendarImportGuideHost } from '../components/CalendarImportGuideHost';

const semester = 'HK1_2026_2027';
const courses = [{
  id: 'test-course', course_code: 'ACC101', subject_name: 'Kế toán căn bản',
  semester, weeks: '1', day_of_week: '2', shift: 'S', room: 'A101', instructor: 'Nguyễn Văn A',
}];

const Harness = () => {
  const [mounted, setMounted] = useState(true);
  const [open, setOpen] = useState(true);
  return <>
    <button type="button" onClick={() => setMounted(false)}>Unmount export</button>
    {mounted && <CalendarExportDialog open={open} semester={semester} courses={courses} onClose={() => setOpen(false)} />}
    <CalendarImportGuideHost />
  </>;
};

createRoot(document.getElementById('root')!).render(<Harness />);
