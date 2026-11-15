import assert from 'node:assert/strict';
import test from 'node:test';
import type { Semester, Subject } from '../types.ts';
import {
    countTranscriptSubjects,
    reconstructTranscriptSemesters,
    applyTranscriptImport,
    getTranscriptImportIssue,
} from '../features/transcript-import/model.ts';
import { parseHubTranscriptRows } from '../utils/hubTranscriptParser.ts';
import { twoPageTranscriptFixture } from './fixtures/transcript-two-page.ts';

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

test('source completeness rejects truncated imports before either write path can touch old data', () => {
    const parsed = parseHubTranscriptRows(twoPageTranscriptFixture());
    const integrity = {
        detectedSemesterCount: parsed.detectedSemesterCount,
        sourceReliable: parsed.reliable,
        semesters: parsed.semesters.map(semester => ({ id: semester.id, subjectCount: semester.subjects.length, credits: semester.subjects.reduce((sum, subject) => sum + subject.credits, 0) })),
    };
    const existing = [createSemester('old-data', ['saved'])];
    for (const incomplete of [
        parsed.semesters.slice(0, 1), // The historical AI failure: 1 semester / 11 courses.
        parsed.semesters.slice(0, 4),
        parsed.semesters.map((s, i) => i === 3 ? { ...s, subjects: s.subjects.slice(0, -1) } : s),
        [...parsed.semesters.slice(0, 4), parsed.semesters[0]], // Equal number of terms is insufficient.
    ]) {
        let persisted = existing;
        let draftCalls = 0;
        assert.ok(applyTranscriptImport(incomplete, integrity, semesters => { persisted = semesters; }));
        assert.ok(applyTranscriptImport(incomplete, integrity, () => { draftCalls++; }));
        assert.equal(persisted, existing);
        assert.equal(draftCalls, 0);
        assert.match(getTranscriptImportIssue(incomplete, integrity)!, /5 học kỳ \/ 42 môn/);
        // Generated empty semesters must not hide missing source semesters.
        assert.ok(getTranscriptImportIssue(reconstructTranscriptSemesters(incomplete, parsed.yearRanges), integrity));
    }
    let imported: Semester[] = [];
    assert.equal(applyTranscriptImport(parsed.semesters, integrity, semesters => { imported = semesters; }), null);
    assert.equal(imported, parsed.semesters);
});

test('missing or untrusted source evidence cannot authorize an overwrite', () => {
    const semesters = [createSemester('one', ['a'])];
    let calls = 0;
    assert.ok(applyTranscriptImport(semesters, undefined, () => { calls++; }));
    assert.ok(applyTranscriptImport(semesters, { detectedSemesterCount: 1, semesters: [{ id: 'one', subjectCount: 1, credits: 3 }], sourceReliable: false }, () => { calls++; }));
    assert.equal(calls, 0);
});
