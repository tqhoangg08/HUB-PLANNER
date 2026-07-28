import assert from 'node:assert/strict';
import test from 'node:test';
import type { Semester, Subject } from '../types.ts';
import {
    countTranscriptSubjects,
    reconstructTranscriptSemesters,
} from '../features/transcript-import/model.ts';

const createSubject = (id: string): Subject => ({
    id,
    name: `Subject ${id}`,
    credits: 3,
    scoreCC: null,
    scoreProcess: null,
    scoreMid: null,
    scoreFinal: null,
    isNonGPA: false,
});

const createSemester = (id: string, subjectIds: string[] = []): Semester => ({
    id,
    name: id,
    subjects: subjectIds.map(createSubject),
    trainingScore: null,
});

test('counts all imported subjects across semesters', () => {
    assert.equal(countTranscriptSubjects([
        createSemester('semester-1', ['a', 'b']),
        createSemester('semester-2', ['c']),
    ]), 3);
});

test('reconstructs four academic years while preserving imported semesters', () => {
    const semesterOne = createSemester('imported_2025_2026_hk1', ['a']);
    const summerSemester = createSemester('imported_2025_2026_hè', ['b']);
    const outsideRange = createSemester('imported_2024_2025_hk2', ['c']);

    const result = reconstructTranscriptSemesters(
        [semesterOne, summerSemester, outsideRange],
        [{ start: 2025, end: 2026 }],
        2030,
    );

    assert.equal(result.length, 10);
    assert.equal(result[0], semesterOne);
    assert.equal(result[1].id, 'generated_2025_hk2');
    assert.equal(result[2], summerSemester);
    assert.equal(result.at(-1), outsideRange);
    assert.equal(new Set(result.map(semester => semester.id)).size, result.length);
});

test('uses the supplied fallback year when the parser finds no year range', () => {
    const result = reconstructTranscriptSemesters([], [], 2030);

    assert.equal(result.length, 8);
    assert.equal(result[0].id, 'generated_2030_hk1');
    assert.equal(result[7].id, 'generated_2033_hk2');
});
