import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createEmptyPlanSchedules,
    getCourseRequestStudentCode,
    getPaginationPages,
    isStudentCourseEditLocked,
    normalizeAcademicProgramOptions,
    sortCourseRequestsNewestFirst,
    type CourseRequest,
} from '../features/schedule/scheduleBoardModel.ts';

const createCourseRequest = (
    overrides: Partial<CourseRequest> = {},
): CourseRequest => ({
    id: 'request-1',
    subject_name: 'Kinh tế học',
    course_code: 'ECO101',
    ...overrides,
});

test('schedule request pagination keeps the current page neighborhood and boundaries', () => {
    assert.deepEqual(getPaginationPages(6, 12), [1, 4, 5, 6, 7, 8, 12]);
    assert.deepEqual(getPaginationPages(1, 3), [1, 2, 3]);
});

test('schedule requests are sorted newest first and tolerate invalid dates', () => {
    const requests = [
        createCourseRequest({ id: 'old', created_at: '2026-06-01T00:00:00Z' }),
        createCourseRequest({ id: 'invalid', created_at: 'not-a-date' }),
        createCourseRequest({ id: 'new', created_at: '2026-07-01T00:00:00Z' }),
    ];

    assert.deepEqual(
        sortCourseRequestsNewestFirst(requests).map(request => request.id),
        ['new', 'old', 'invalid'],
    );
    assert.deepEqual(requests.map(request => request.id), ['old', 'invalid', 'new']);
});

test('student code prefers profile data, then email, then user id', () => {
    assert.equal(getCourseRequestStudentCode(createCourseRequest({
        user_id: 'user-id',
        user: { student_code: ' 030839230074 ', email: 'fallback@st.buh.edu.vn' },
    })), '030839230074');
    assert.equal(getCourseRequestStudentCode(createCourseRequest({
        user_id: 'user-id',
        user: { email: '030839230075@st.buh.edu.vn' },
    })), '030839230075');
    assert.equal(getCourseRequestStudentCode(createCourseRequest({ user_id: 'user-id' })), 'user-id');
});

test('academic program options are trimmed, unique, and keep the default first', () => {
    const options = normalizeAcademicProgramOptions([
        ' Tiên tiến ',
        'Chính quy chuẩn',
        '',
        'Tiên tiến',
        'Chất lượng cao',
    ]);

    assert.equal(options[0], 'Chính quy chuẩn');
    assert.equal(options.filter(value => value === 'Tiên tiến').length, 1);
    assert.equal(options.includes(''), false);
});

test('plan schedules start independent and semester edit locking is explicit', () => {
    const plans = createEmptyPlanSchedules();

    assert.notEqual(plans.A, plans.B);
    assert.notEqual(plans.B, plans.C);
    assert.deepEqual(plans, { A: [], B: [], C: [] });
    assert.equal(isStudentCourseEditLocked({ semester: 'HK1_2026_2027' }), true);
    assert.equal(isStudentCourseEditLocked({ semester: 'HK2_2026_2027' }), false);
    assert.equal(isStudentCourseEditLocked(null), false);
});
