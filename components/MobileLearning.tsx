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
            {/* THANH TAB TRƯỢT */}
            <div className="mobile-learning-tabs bg-white px-4 py-3 border-b border-gray-200 sticky top-0 z-40 shadow-sm shrink-0">
                <div className="flex bg-gray-100 p-1 rounded-xl relative">
                    <div 
                        className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white rounded-lg shadow-sm transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${activeTab === 'gpa' ? 'translate-x-0' : 'translate-x-[calc(100%+4px)]'}`}
                    ></div>
                    
                    <button
                        onClick={() => setActiveTab('gpa')}
                        className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors z-10 ${activeTab === 'gpa' ? 'text-[#003375]' : 'text-gray-500'}`}
                    >
                        Điểm số & Lộ trình
                    </button>
                    <button
                        onClick={() => setActiveTab('schedule')}
                        className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors z-10 ${activeTab === 'schedule' ? 'text-[#003375]' : 'text-gray-500'}`}
                    >
                        Lịch học & Thi
                    </button>
                </div>
            </div>

            {/* NỘI DUNG HIỂN THỊ Ở DƯỚI */}
            <div className="flex-1 w-full overflow-y-auto overflow-x-hidden px-4">
                {activeTab === 'gpa' ? (
                    <div className="animate-fadeIn pt-3 pb-8">
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
                    <div className="animate-fadeIn pb-10">
                        <MobileSchedule viewUserId={props.viewUserId} />
                    </div>
                )}
            </div>
        </div>
    );
};
