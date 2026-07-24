import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { MobileDashboardNative } from './MobileDashboard';
import { MobileSchedule } from './MobileSchedule';
import { UserData, Semester, Subject, GradeStatus } from '../types';
import {
    analyzeTrend,
    calculateRequiredGPA,
    calculateCumulativeStats,
    calculateSemesterStats,
    calculateSubjectAverage,
    getGradeDetails,
    getSubjectStatus,
} from '../utils/calculations';
import { SubjectRankingModal } from './SubjectRankingModal';
import { SemesterLookbackModal } from './SemesterLookbackModal';
import { useSemesterLookback } from '../hooks/useSemesterLookback';
import { playClick } from '../utils/audio';
import { FEATURE_FORECAST_TOOLS } from '../utils/featureFlags';
import { showConfirm } from '../utils/appNotifications';

interface MobileLearningProps {
    data: UserData;
    onSetSemesters: (sems: Semester[]) => void;
    onSaveSemesters?: (sems: Semester[]) => Promise<void>;
    isGuest: boolean;
    onRequireOnboarding: () => void;
    onTargetChange: (target: number) => void;
    showSecurityNotice: boolean;
    onUpdateSemester: (index: number, sem: Semester) => void;
    onRemoveSemester: (index: number) => void;
    onAddSemester: () => void;
    onExportPDF: () => void;
    onImportPDF: () => void;
    isImporting: boolean;
    fileInputRef: React.RefObject<HTMLInputElement>;
    onFileUpload: (
        e: React.ChangeEvent<HTMLInputElement>,
        onImportedSemesters?: (semesters: Semester[]) => void,
    ) => void;
    viewUserId?: string;
    isManagementUser?: boolean;
}

const FailedSubjectsNativeModal = ({ subjects, onClose }: { subjects: Subject[]; onClose: () => void }) => (
    <div className="fixed inset-0 z-[100000] flex items-end justify-center bg-black/35 px-4 pb-4">
        <div className="w-full max-w-[430px] rounded-[24px] bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                    <h2 className="text-lg font-black text-[#0D1B3E]">Môn cần chú ý</h2>
                    <p className="text-xs font-semibold text-[#7B8AB0]">Các môn có nguy cơ không đạt hoặc cần cải thiện.</p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500"
                    aria-label="Đóng"
                >
                    <X size={18} />
                </button>
            </div>

            {subjects.length > 0 ? (
                <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
                    {subjects.map((subject) => {
                        const avg = calculateSubjectAverage(subject);
                        return (
                            <div key={subject.id} className="rounded-2xl border border-red-100 bg-red-50/60 p-3">
                                <div className="text-sm font-black text-[#0D1B3E]">{subject.name || 'Môn chưa đặt tên'}</div>
                                <div className="mt-1 text-xs font-semibold text-red-700">
                                    Điểm TB: {avg === null ? 'Chưa có' : avg.toFixed(1)} · {subject.credits || 0} tín chỉ
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="rounded-2xl bg-emerald-50 p-5 text-center text-sm font-bold text-emerald-700">
                    Chưa có môn nào cần chú ý.
                </div>
            )}
        </div>
    </div>
);

export const MobileLearning: React.FC<MobileLearningProps> = (props) => {
    const location = useLocation();
    const [activeTab, setActiveTab] = useState<'schedule' | 'gpa'>('gpa');
    const [showRankingModal, setShowRankingModal] = useState(false);
    const [showFailedModal, setShowFailedModal] = useState(false);
    const [showTargetModal, setShowTargetModal] = useState(false);
    const [isTranscriptEditing, setIsTranscriptEditing] = useState(false);
    const [draftSemesters, setDraftSemesters] = useState<Semester[] | null>(null);
    const [isSavingTranscript, setIsSavingTranscript] = useState(false);
    const [transcriptSaveError, setTranscriptSaveError] = useState<string | null>(null);
    const [pendingTab, setPendingTab] = useState<'schedule' | 'gpa' | null>(null);

    const activeData = useMemo(
        () => isTranscriptEditing && draftSemesters ? { ...props.data, semesters: draftSemesters } : props.data,
        [draftSemesters, isTranscriptEditing, props.data]
    );

    const semesterLookback = useSemesterLookback(
        activeData,
        !props.isGuest
    );

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        if (params.get('tab') === 'gpa') {
            setActiveTab('gpa');
        } else if (params.get('tab') === 'schedule') {
            setActiveTab('schedule');
        }
    }, [location]);

    const validDataSemesters = useMemo(
        () => activeData.semesters.filter(s => /^Học kỳ (1|2) Năm học \d{4}-\d{4}$/.test(s.name)),
        [activeData.semesters]
    );

    const transcriptSemesters = useMemo(
        () => activeData.semesters
            .map((semester, originalIndex) => ({ semester, originalIndex }))
            .filter(record => !/^Học kỳ Hè Năm học \d{4}-\d{4}$/.test(record.semester.name)),
        [activeData.semesters]
    );

    const stats = useMemo(() => calculateCumulativeStats(validDataSemesters), [validDataSemesters]);

    const trendData = useMemo(() => validDataSemesters.map(sem => {
        const semStats = calculateSemesterStats(sem.subjects);
        const yearPart = sem.name.match(/(\d{4})/);
        const hkPart = sem.name.match(/Học kỳ (1|2)/);
        const shortName = yearPart && hkPart ? `HK${hkPart[1]}/${yearPart[1].slice(2)}` : sem.name;

        return {
            name: shortName,
            gpa4: semStats.hasData ? semStats.gpa4 : null,
            gpa10: semStats.hasData ? semStats.gpa10 : null,
        };
    }).filter(item => item.gpa4 !== null), [validDataSemesters]);

    const trendAnalysis = useMemo(() => analyzeTrend(validDataSemesters), [validDataSemesters]);
    const totalCreditsRequired = activeData.totalCreditsRequired || 125;
    const targetGPA = activeData.targetGPA || 3.2;
    const requiredAnalysis = useMemo(() => calculateRequiredGPA(
        stats.rawGPA4,
        stats.passedCredits,
        totalCreditsRequired,
        targetGPA,
        stats.totalCredits
    ), [stats.rawGPA4, stats.passedCredits, stats.totalCredits, totalCreditsRequired, targetGPA]);

    const validSubjects = useMemo(() => validDataSemesters.flatMap(s => s.subjects)
        .filter(s => !s.isNonGPA)
        .map(s => {
            const avg = calculateSubjectAverage(s);
            const { letter, scale4 } = avg !== null ? getGradeDetails(avg) : { letter: '?', scale4: 0 };
            return { ...s, avg: avg || 0, letter, scale4, semName: s.name };
        })
        .filter((s): s is typeof s & { avg: number } => s.avg !== null)
        .sort((a, b) => b.avg - a.avg), [validDataSemesters]);

    const failedSubjects = useMemo(() => validDataSemesters.flatMap(s => s.subjects).filter(subject => {
        const avg = calculateSubjectAverage(subject);
        return getSubjectStatus(avg) === GradeStatus.FAIL && !subject.isNonGPA;
    }), [validDataSemesters]);

    const isLocked = Boolean(props.isGuest && !activeData.hasOnboarded);

    const cloneSemesters = (semesters: Semester[]) => JSON.parse(JSON.stringify(semesters || [])) as Semester[];

    const nextSemesterName = (semesters: Semester[]) => {
        const parsed = semesters
            .map(semester => {
                const match = semester.name.match(/Học kỳ (1|2) Năm học (\d{4})-\d{4}/);
                return match ? { term: Number(match[1]), year: Number(match[2]) } : null;
            })
            .filter((item): item is { term: number; year: number } => Boolean(item));
        if (parsed.length === 0) return 'Học kỳ 1 Năm học 2025-2026';
        const latest = parsed.reduce((best, item) => (item.year * 2 + item.term > best.year * 2 + best.term ? item : best));
        const nextTerm = latest.term === 1 ? 2 : 1;
        const nextYear = latest.term === 1 ? latest.year : latest.year + 1;
        return `Học kỳ ${nextTerm} Năm học ${nextYear}-${nextYear + 1}`;
    };

    const handleStartTranscriptEdit = () => {
        playClick();
        setTranscriptSaveError(null);
        setDraftSemesters(cloneSemesters(props.data.semesters));
        setIsTranscriptEditing(true);
    };

    const handleImportTranscriptPdf = async () => {
        if (isTranscriptEditing) {
            props.onImportPDF();
            return;
        }

        const shouldEnableEditing = await showConfirm({
            title: 'Cần bật chế độ sửa bảng điểm',
            message: 'Nhập điểm từ PDF sẽ thay thế nội dung trong bản nháp. Bạn có muốn bật chế độ "Sửa điểm" và tiếp tục nhập PDF không?',
            confirmText: 'Bật sửa và nhập PDF',
            cancelText: 'Chưa nhập',
            variant: 'question',
        });
        if (!shouldEnableEditing) return;

        handleStartTranscriptEdit();
        props.onImportPDF();
    };

    const handleImportedTranscriptSemesters = (semesters: Semester[]) => {
        setTranscriptSaveError(null);
        setDraftSemesters(cloneSemesters(semesters));
        setIsTranscriptEditing(true);
    };

    const handleCancelTranscriptEdit = () => {
        playClick();
        setDraftSemesters(null);
        setIsTranscriptEditing(false);
    };

    const handleUpdateDraftSemester = (index: number, semester: Semester) => {
        setDraftSemesters(prev => {
            const source = prev || cloneSemesters(props.data.semesters);
            const next = [...source];
            if (index < 0 || index >= next.length) return source;
            next[index] = semester;
            return next;
        });
    };

    const handleRemoveDraftSemester = (index: number) => {
        setDraftSemesters(prev => (prev || cloneSemesters(props.data.semesters)).filter((_, itemIndex) => itemIndex !== index));
    };

    const handleAddDraftSemester = () => {
        setDraftSemesters(prev => {
            const source = prev || cloneSemesters(props.data.semesters);
            return [...source, { id: Date.now().toString(), name: nextSemesterName(source), subjects: [], trainingScore: null }];
        });
    };

    const handleSaveTranscriptEdit = async () => {
        if (!draftSemesters || isSavingTranscript) return;
        playClick();
        setIsSavingTranscript(true);
        try {
            if (props.onSaveSemesters) await props.onSaveSemesters(draftSemesters);
            else props.onSetSemesters(draftSemesters);
            setTranscriptSaveError(null);
            setDraftSemesters(null);
            setIsTranscriptEditing(false);
        } catch (error: any) {
            setTranscriptSaveError(error?.message || 'Không thể lưu bảng điểm. Vui lòng thử lại.');
        } finally {
            setIsSavingTranscript(false);
        }
    };

    const handleTabChange = (tab: 'schedule' | 'gpa') => {
        if (isTranscriptEditing && tab !== activeTab) {
            setPendingTab(tab);
            return;
        }
        setActiveTab(tab);
    };

    const confirmPendingTab = () => {
        if (!pendingTab) return;
        setDraftSemesters(null);
        setIsTranscriptEditing(false);
        setActiveTab(pendingTab);
        setPendingTab(null);
    };

    useEffect(() => {
        if (!isTranscriptEditing) return;
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isTranscriptEditing]);

    return (
        <>
            <input
                type="file"
                accept=".pdf"
                ref={props.fileInputRef}
                className="hidden"
                onChange={(event) => props.onFileUpload(event, handleImportedTranscriptSemesters)}
            />
            {transcriptSaveError && (
                <div className="fixed left-4 right-4 top-4 z-[100001] rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 shadow-xl">
                    {transcriptSaveError}
                </div>
            )}

            <MobileDashboardNative
                stats={{
                    gpa4: stats.gpa4,
                    gpa10: stats.gpa10,
                    passedCredits: stats.passedCredits,
                }}
                totalCreditsRequired={activeData.totalCreditsRequired || 125}
                isLocked={isLocked}
                trendData={trendData}
                semesters={transcriptSemesters}
                trendAnalysis={trendAnalysis}
                activeTab={activeTab}
                onTabChange={handleTabChange}
                scheduleContent={<MobileSchedule viewUserId={props.viewUserId} managementOnly={props.isManagementUser} />}
                isManagementUser={props.isManagementUser}
                onOpenRanking={() => {
                    playClick();
                    setShowRankingModal(true);
                }}
                onOpenTargetForecast={FEATURE_FORECAST_TOOLS ? () => {
                    playClick();
                    setShowTargetModal(true);
                } : undefined}
                onRequireOnboarding={props.onRequireOnboarding}
                onOpenLookback={() => {
                    playClick();
                    semesterLookback.open();
                }}
                onOpenFailed={() => {
                    playClick();
                    setShowFailedModal(true);
                }}
                onExportPDF={props.onExportPDF}
                onImportPDF={handleImportTranscriptPdf}
                onAddSemester={handleAddDraftSemester}
                onUpdateSemester={handleUpdateDraftSemester}
                onRemoveSemester={handleRemoveDraftSemester}
                isTranscriptEditing={isTranscriptEditing}
                isSavingTranscript={isSavingTranscript}
                onStartTranscriptEdit={handleStartTranscriptEdit}
                onSaveTranscriptEdit={handleSaveTranscriptEdit}
                onCancelTranscriptEdit={handleCancelTranscriptEdit}
                isImporting={props.isImporting}
            />
            {pendingTab && (
                <div className="fixed inset-0 z-[100000] flex items-end justify-center bg-black/40 px-4 pb-5">
                    <div className="w-full max-w-[430px] rounded-[24px] bg-white p-5 shadow-2xl">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                            <X size={22} />
                        </div>
                        <h2 className="text-lg font-black text-[#0D1B3E]">Bảng điểm chưa được lưu</h2>
                        <p className="mt-2 text-sm font-semibold leading-6 text-[#7B8AB0]">
                            Bạn đang sửa bảng điểm. Nếu chuyển chức năng bây giờ, các thay đổi chưa lưu sẽ bị bỏ.
                        </p>
                        <div className="mt-5 grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setPendingTab(null)}
                                className="h-11 rounded-2xl bg-slate-100 text-sm font-black text-slate-700"
                            >
                                Ở lại sửa
                            </button>
                            <button
                                type="button"
                                onClick={confirmPendingTab}
                                className="h-11 rounded-2xl bg-[#1A56FF] text-sm font-black text-white"
                            >
                                Rời đi
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <SemesterLookbackModal
                isOpen={semesterLookback.isOpen}
                data={semesterLookback.lookback}
                loading={semesterLookback.loading}
                onClose={semesterLookback.close}
            />
            {FEATURE_FORECAST_TOOLS && showTargetModal && (
                <div className="fixed inset-0 z-[100000] flex items-end justify-center bg-black/35 px-3 pb-[calc(92px+env(safe-area-inset-bottom))] animate-fadeIn" onClick={() => setShowTargetModal(false)}>
                    <div className="w-full max-w-[430px] rounded-[24px] bg-white p-5 pb-6 shadow-2xl animate-slideUp" onClick={(event) => event.stopPropagation()}>
                        <div className="-mt-1 mb-3 flex justify-center">
                            <div className="h-1.5 w-12 rounded-full bg-[#D1D7E3]" />
                        </div>
                        <div className="mb-4 flex items-start justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-black text-[#0D1B3E]">Dự báo mục tiêu</h2>
                                <p className="text-xs font-semibold text-[#7B8AB0]">Ước tính điểm cần đạt để chạm GPA mục tiêu.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowTargetModal(false)}
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500"
                                aria-label="Đóng"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            <div className="rounded-2xl bg-[#F8FAFD] p-3">
                                <div className="text-[10px] font-black uppercase text-[#7B8AB0]">Hiện tại</div>
                                <div className="mt-2 text-xl font-black text-[#0D1B3E]">{stats.gpa4.toFixed(2)}</div>
                            </div>
                            <div className="rounded-2xl bg-[#EEF2FF] p-4">
                                <div className="text-[10px] font-black uppercase text-[#7B8AB0]">Mục tiêu</div>
                                <div className="mt-2 text-xl font-black text-[#1A56FF]">{targetGPA.toFixed(2)}</div>
                            </div>
                            <div className="rounded-2xl bg-[#EDFAF3] p-4">
                                <div className="text-[10px] font-black uppercase text-[#7B8AB0]">Cần mỗi TC</div>
                                <div className="mt-2 text-xl font-black text-[#00A56F]">
                                    {requiredAnalysis?.isTargetAchieved
                                        ? 'Đã đạt'
                                        : requiredAnalysis?.isPossible
                                            ? requiredAnalysis.requiredGPA.toFixed(2)
                                            : 'Không thể'}
                                </div>
                            </div>
                        </div>

                        <label className="mt-4 block text-[11px] font-black uppercase tracking-wide text-[#7B8AB0]">Chỉnh GPA mục tiêu</label>
                        <input
                            type="range"
                            min="2"
                            max="4"
                            step="0.01"
                            value={targetGPA}
                            onChange={(event) => props.onTargetChange(parseFloat(event.target.value) || 0)}
                            className="mt-3 w-full accent-[#1A56FF]"
                        />
                        <div className="mt-3 flex items-center gap-3">
                            <input
                                type="number"
                                min="0"
                                max="4"
                                step="0.01"
                                value={targetGPA}
                                onChange={(event) => props.onTargetChange(parseFloat(event.target.value) || 0)}
                                className="h-11 w-28 rounded-xl border border-[#E5EAF4] bg-[#F8FAFD] px-3 text-sm font-black text-[#0D1B3E] outline-none"
                            />
                            <p className="text-xs font-semibold leading-relaxed text-[#7B8AB0]">
                                {requiredAnalysis?.isTargetAchieved
                                    ? 'Bạn đã đạt GPA mục tiêu với dữ liệu hiện tại.'
                                    : requiredAnalysis?.isPossible
                                        ? 'Dự báo dựa trên GPA hiện tại, tín chỉ đã tích lũy và tổng tín chỉ mục tiêu.'
                                        : 'Mục tiêu này không khả thi với dữ liệu hiện tại.'}
                            </p>
                        </div>
                    </div>
                </div>
            )}
            {showRankingModal && <SubjectRankingModal subjects={validSubjects} onClose={() => setShowRankingModal(false)} />}
            {showFailedModal && <FailedSubjectsNativeModal subjects={failedSubjects} onClose={() => setShowFailedModal(false)} />}
        </>
    );
};
