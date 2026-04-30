import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { MobileDashboard } from './MobileDashboard';
import { MobileSchedule } from './MobileSchedule';
import { UserData, Semester } from '../types';

interface MobileLearningProps {
    data: UserData;
    onSetSemesters: (sems: Semester[]) => void;
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
    onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    viewUserId?: string;
}

export const MobileLearning: React.FC<MobileLearningProps> = (props) => {
    const location = useLocation();
    const [activeTab, setActiveTab] = useState<'schedule' | 'gpa'>('gpa');

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        if (params.get('tab') === 'gpa') {
            setActiveTab('gpa');
        } else if (params.get('tab') === 'schedule') {
            setActiveTab('schedule');
        }
    }, [location]);

    return (
        <div className="mobile-page mobile-learning-page flex flex-col h-full w-full bg-[#F8FAFC] animate-fadeIn">
            <div className="mobile-learning-tabs sticky top-0 z-40 bg-white pt-4 pb-2 px-4 shadow-sm shrink-0">
                <div className="grid grid-cols-2 gap-2 mb-3 rounded-2xl bg-gray-100 p-1 border border-gray-200">
                    <button
                        onClick={() => setActiveTab('gpa')}
                        className={`py-2 rounded-xl text-xs font-black transition-all ${activeTab === 'gpa' ? 'bg-white text-[#003375] shadow-sm' : 'text-gray-500'}`}
                    >
                        Điểm số & Lộ trình
                    </button>
                    <button
                        onClick={() => setActiveTab('schedule')}
                        className={`py-2 rounded-xl text-xs font-black transition-all ${activeTab === 'schedule' ? 'bg-white text-[#003375] shadow-sm' : 'text-gray-500'}`}
                    >
                        Lịch học & Thi
                    </button>
                </div>
            </div>

            <div className="mobile-learning-content flex-1 w-full overflow-y-auto overflow-x-hidden px-4 pt-8">
                {activeTab === 'gpa' ? (
                    <div className="animate-fadeIn pt-0 pb-8">
                        <MobileDashboard
                            data={props.data}
                            onSetSemesters={props.onSetSemesters}
                            isGuest={props.isGuest}
                            onRequireOnboarding={props.onRequireOnboarding}
                            onTargetChange={props.onTargetChange}
                            showSecurityNotice={props.showSecurityNotice}
                            onUpdateSemester={props.onUpdateSemester}
                            onRemoveSemester={props.onRemoveSemester}
                            onAddSemester={props.onAddSemester}
                            onExportPDF={props.onExportPDF}
                            onImportPDF={props.onImportPDF}
                            isImporting={props.isImporting}
                            fileInputRef={props.fileInputRef}
                            onFileUpload={props.onFileUpload}
                        />
                    </div>
                ) : (
                    <div className="animate-fadeIn pt-0 pb-10">
                        <MobileSchedule viewUserId={props.viewUserId} />
                    </div>
                )}
            </div>
        </div>
    );
};
