import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useTranscriptTransfer } from '../../hooks/useTranscriptTransfer';
import { TranscriptImportPreviewModal } from '../../components/TranscriptImportPreviewModal';
import { parseHubTranscriptRows } from '../../utils/hubTranscriptParser';
import { twoPageTranscriptFixture } from '../fixtures/transcript-two-page';
import type { Semester, UserData } from '../../types';

const parsed = parseHubTranscriptRows(twoPageTranscriptFixture());
const integrity = {
    detectedSemesterCount: parsed.detectedSemesterCount, sourceReliable: parsed.reliable,
    semesters: parsed.semesters.map(s => ({ id: s.id, subjectCount: s.subjects.length, credits: s.subjects.reduce((sum, subject) => sum + subject.credits, 0) })),
};
(globalThis as any).__transcriptParsed = { ...parsed, integrity };
const App = () => {
    const [data, setData] = useState({ semesters: [{ ...parsed.semesters[0], id: 'old', subjects: [{ ...parsed.semesters[0].subjects[0], name: 'OLD SAVED COURSE' }] }] } as UserData);
    const [writes, setWrites] = useState(0);
    const [draftCalls, setDraftCalls] = useState(0);
    const controller = useTranscriptTransfer({ data, commitDataUpdate: updater => { setWrites(n => n + 1); setData(updater); } });
    const pending = controller.pendingTranscriptImport;
    const load = (draft = false) => controller.handleFileUpload({ target: { files: [new File(['synthetic'], 'fixture.pdf')] } } as any,
        draft ? (semesters: Semester[]) => { setDraftCalls(n => n + 1); setData(previous => ({ ...previous, semesters })); } : undefined);
    return <>
        <div style={{ position: 'fixed', top: 0, left: 0, zIndex: 20000, background: 'white', fontSize: 10 }}>
            <button onClick={() => load()}>Load saved</button>
            <button onClick={() => load(true)}>Load draft</button>
            <button onClick={() => controller.updatePendingSemesters(pending!.semesters.filter(s => s.subjects.length).slice(0, 1))}>Truncate semesters</button>
            <button onClick={() => controller.updatePendingSemesters(pending!.semesters.map((s, i) => i === 3 ? { ...s, subjects: s.subjects.slice(0, -1) } : s))}>Drop course</button>
            <button onClick={controller.confirmTranscriptImport}>Force confirm guard</button>
            <output data-testid="writes">{writes}</output><output data-testid="drafts">{draftCalls}</output>
            <output data-testid="saved">{data.semesters.reduce((sum, s) => sum + s.subjects.length, 0)}</output>
        </div>
        {pending && <TranscriptImportPreviewModal semesters={pending.semesters} integrity={pending.integrity} importError={pending.error}
            onChange={controller.updatePendingSemesters} onCancel={controller.cancelPendingImport} onConfirm={controller.confirmTranscriptImport} />}
    </>;
};
createRoot(document.getElementById('root')!).render(<App />);
