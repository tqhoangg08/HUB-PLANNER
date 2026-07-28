import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createEmptyDeleteAccountOtp,
    parseDeleteAccountOtp,
    updateDeleteAccountOtpDigit,
} from '../features/account/deleteAccountOtp.ts';

test('rapid sequential OTP input preserves every digit', () => {
    const result = ['1', '2', '3', '4', '5', '6'].reduce(
        (digits, value, index) => updateDeleteAccountOtpDigit(digits, index, value),
        createEmptyDeleteAccountOtp(),
    );

    assert.equal(result.join(''), '123456');
});

test('editing one OTP cell does not shift or overwrite the others', () => {
    const initial = parseDeleteAccountOtp('123456');
    const edited = updateDeleteAccountOtpDigit(initial, 3, '9');
    const cleared = updateDeleteAccountOtpDigit(edited, 1, '');

    assert.deepEqual(edited, ['1', '2', '3', '9', '5', '6']);
    assert.deepEqual(cleared, ['1', '', '3', '9', '5', '6']);
});

test('pasted OTP keeps only the first six numeric characters', () => {
    assert.deepEqual(
        parseDeleteAccountOtp('12a34-5678'),
        ['1', '2', '3', '4', '5', '6'],
    );
});
