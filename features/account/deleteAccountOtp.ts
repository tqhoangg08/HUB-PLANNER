export const DELETE_ACCOUNT_OTP_LENGTH = 6;

export const createEmptyDeleteAccountOtp = () => (
    Array.from({ length: DELETE_ACCOUNT_OTP_LENGTH }, () => '')
);

export const updateDeleteAccountOtpDigit = (
    previousDigits: readonly string[],
    index: number,
    value: string,
) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    return Array.from(
        { length: DELETE_ACCOUNT_OTP_LENGTH },
        (_, currentIndex) => (
            currentIndex === index
                ? digit
                : previousDigits[currentIndex] || ''
        ),
    );
};

export const parseDeleteAccountOtp = (value: string) => {
    const digits = value
        .replace(/\D/g, '')
        .slice(0, DELETE_ACCOUNT_OTP_LENGTH)
        .split('');
    return Array.from(
        { length: DELETE_ACCOUNT_OTP_LENGTH },
        (_, index) => digits[index] || '',
    );
};
