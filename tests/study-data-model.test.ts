import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createInitialSemester,
    getNextTranscriptSemesterName,
    hasCompleteRequiredStudyProfile,
    hasMeaningfulStudyData,
    INITIAL_STUDY_DATA,
    normalizeLoadedUserData,
    resolveStudyDataSaveScope,
} from '../features/study-data/model.ts';

test('initial study data contains one valid empty semester', () => {
    const semester = createInitialSemester();

    assert.equal(INITIAL_STUDY_DATA.semesters.length, 1);
    assert.equal(semester.name, 'Học kỳ 1 Năm học 2025-2026');
    assert.deepEqual(semester.subjects, []);
    assert.equal(semester.trainingScore, null);
});

test('meaningful and complete data are evaluated independently', () => {
    assert.equal(hasMeaningfulStudyData(null), false);
    assert.equal(hasMeaningfulStudyData(INITIAL_STUDY_DATA), false);
    assert.equal(hasMeaningfulStudyData({
        semesters: [{
            ...createInitialSemester(),
            subjects: [{ id: 'subject-1', name: 'Kinh tế học', credits: 3 }],
        }],
    }), true);

    assert.equal(hasCompleteRequiredStudyProfile({
        studentName: 'Nguyễn Văn A',
        programName: 'Chính quy',
        cohort: 'K40',
        majorName: 'Tài chính',
        specializationName: 'Tài chính doanh nghiệp',
    }), true);
    assert.equal(hasCompleteRequiredStudyProfile({
        studentName: 'Nguyễn Văn A',
        programName: 'Chính quy',
    }), false);
});

test('normalization repairs compact and duplicate semester names', () => {
    const normalized = normalizeLoadedUserData({
        semesters: [
            {
                ...createInitialSemester(),
                id: 'semester-1',
                name: 'Học kỳ 1 2025-2026',
            },
            {
                ...createInitialSemester(),
                id: 'semester-2',
                name: 'Học kỳ 1 Năm học 2025-2026',
                subjects: [{ id: 'subject-2', name: 'Luật kinh tế', credits: 2 }],
            },
        ],
    });

    assert.deepEqual(
        normalized.semesters.map(semester => semester.name),
        ['Học kỳ 1 Năm học 2025-2026', 'Học kỳ 2 Năm học 2025-2026'],
    );
    assert.equal(normalized.hasOnboarded, true);
});

test('next semester progresses from term two into the next academic year', () => {
    const next = getNextTranscriptSemesterName([
        {
            ...createInitialSemester(),
            name: 'Học kỳ 2 Năm học 2025-2026',
        },
    ]);

    assert.equal(next, 'Học kỳ 1 Năm học 2026-2027');
});

test('grade saves keep self ownership independent of application role', () => {
    for (const role of ['user', 'auditor', 'admin'] as const) {
        assert.equal(resolveStudyDataSaveScope({
            authenticated: true,
            role,
            viewingAnotherUser: false,
        }), 'self');
    }
});

test('auditor cannot turn staff visibility into cross-user grade write authority', () => {
    assert.equal(resolveStudyDataSaveScope({
        authenticated: true,
        role: 'auditor',
        viewingAnotherUser: true,
    }), 'denied');
    assert.equal(resolveStudyDataSaveScope({
        authenticated: false,
        role: 'user',
        viewingAnotherUser: false,
    }), 'denied');
    assert.equal(resolveStudyDataSaveScope({
        authenticated: true,
        role: 'admin',
        viewingAnotherUser: true,
    }), 'admin_managed');
});
