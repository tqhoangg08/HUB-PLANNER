import { useCallback } from 'react';
import type { Semester, UserData } from '../types';
import { getNextTranscriptSemesterName } from '../features/study-data/model';
import { playClick } from '../utils/audio';

interface UseStudyActionsOptions {
    commitDataUpdate: (updater: (previousData: UserData) => UserData) => void;
}

export const useStudyActions = ({ commitDataUpdate }: UseStudyActionsOptions) => {
    const setSemesters = useCallback((semesters: Semester[]) => {
        commitDataUpdate(previous => ({ ...previous, semesters }));
    }, [commitDataUpdate]);

    const setTargetGPA = useCallback((targetGPA: number) => {
        commitDataUpdate(previous => ({ ...previous, targetGPA }));
    }, [commitDataUpdate]);

    const addSemester = useCallback(() => {
        playClick();
        commitDataUpdate(previous => {
            const semester: Semester = {
                id: Date.now().toString(),
                name: getNextTranscriptSemesterName(previous.semesters),
                subjects: [],
                trainingScore: null,
            };
            return {
                ...previous,
                semesters: [...previous.semesters, semester],
            };
        });
    }, [commitDataUpdate]);

    const updateSemester = useCallback((index: number, updatedSemester: Semester) => {
        commitDataUpdate(previous => {
            if (index < 0 || index >= previous.semesters.length) return previous;
            const semesters = [...previous.semesters];
            semesters[index] = updatedSemester;
            return { ...previous, semesters };
        });
    }, [commitDataUpdate]);

    const removeSemester = useCallback((index: number) => {
        playClick();
        if (!window.confirm('Bạn có chắc muốn xóa học kỳ này không?')) return;
        commitDataUpdate(previous => ({
            ...previous,
            semesters: previous.semesters.filter((_, semesterIndex) => semesterIndex !== index),
        }));
    }, [commitDataUpdate]);

    return {
        setSemesters,
        setTargetGPA,
        addSemester,
        updateSemester,
        removeSemester,
    };
};
