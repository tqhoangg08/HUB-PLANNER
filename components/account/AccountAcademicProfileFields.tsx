import React from 'react';
import type { Major, Program, Specialization } from '../../utils/programs';

interface AccountAcademicProfileFieldsProps {
    studentName: string;
    selectedProgram: Program | null;
    selectedCohort: string;
    selectedMajor: Major | null;
    selectedSpecialization: Specialization | null;
    programs: Program[];
    cohortOptions: string[];
    majorOptions: Major[];
    onStudentNameChange: (value: string) => void;
    onProgramChange: (programId: string) => void;
    onCohortChange: (cohort: string) => void;
    onMajorChange: (majorCode: string) => void;
    onSpecializationChange: (specializationName: string) => void;
}

export const AccountAcademicProfileFields: React.FC<AccountAcademicProfileFieldsProps> = ({
    studentName,
    selectedProgram,
    selectedCohort,
    selectedMajor,
    selectedSpecialization,
    programs,
    cohortOptions,
    majorOptions,
    onStudentNameChange,
    onProgramChange,
    onCohortChange,
    onMajorChange,
    onSpecializationChange,
}) => (
    <div>
        <h4 className="mb-3 border-b border-gray-100 pb-1 text-xs font-black uppercase tracking-wider text-[#003375]">
            3. Thông tin lộ trình
        </h4>
        <div className="space-y-4">
            <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500">Tên sinh viên (Tùy chọn)</label>
                <input
                    type="text"
                    value={studentName}
                    onChange={event => onStudentNameChange(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-shadow focus:border-[#003375] focus:ring-1 focus:ring-[#003375]"
                    placeholder="Ví dụ: Nguyễn Văn A..."
                />
            </div>

            <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500">
                    Chương trình đào tạo <span className="text-red-500">*</span>
                </label>
                <select
                    value={selectedProgram?.id || ''}
                    onChange={event => onProgramChange(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#003375]"
                >
                    <option value="" disabled>Chọn chương trình</option>
                    {programs.map(program => (
                        <option key={program.id} value={program.id}>{program.name}</option>
                    ))}
                </select>
            </div>

            <div className="flex gap-3">
                <div className="flex-1 space-y-1.5">
                    <label className="text-xs font-bold text-gray-500">
                        Khóa <span className="text-red-500">*</span>
                    </label>
                    <select
                        value={selectedCohort}
                        onChange={event => onCohortChange(event.target.value)}
                        disabled={!selectedProgram}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#003375] disabled:bg-gray-100 disabled:text-gray-400"
                    >
                        <option value="" disabled>Chọn khóa</option>
                        {cohortOptions.map(cohort => (
                            <option key={cohort} value={cohort}>{cohort}</option>
                        ))}
                    </select>
                </div>

                <div className="flex-[2] space-y-1.5">
                    <label className="text-xs font-bold text-gray-500">
                        Ngành học <span className="text-red-500">*</span>
                    </label>
                    <select
                        value={selectedMajor?.code || ''}
                        onChange={event => onMajorChange(event.target.value)}
                        disabled={!selectedCohort}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#003375] disabled:bg-gray-100 disabled:text-gray-400"
                    >
                        <option value="" disabled>Chọn ngành</option>
                        {majorOptions.map(major => (
                            <option key={major.code} value={major.code}>{major.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {selectedMajor && selectedMajor.specializations.length > 1 && (
                <div className="animate-fadeIn space-y-1.5">
                    <label className="text-xs font-bold text-gray-500">
                        Chuyên ngành <span className="text-red-500">*</span>
                    </label>
                    <select
                        value={selectedSpecialization?.name || ''}
                        onChange={event => onSpecializationChange(event.target.value)}
                        className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm outline-none ring-2 ring-blue-50 focus:ring-1 focus:ring-[#003375]"
                    >
                        <option value="" disabled>Chọn chuyên ngành</option>
                        {selectedMajor.specializations.map(specialization => (
                            <option key={specialization.name} value={specialization.name}>
                                {specialization.name} ({specialization.credits} TC)
                            </option>
                        ))}
                    </select>
                </div>
            )}
        </div>
    </div>
);
