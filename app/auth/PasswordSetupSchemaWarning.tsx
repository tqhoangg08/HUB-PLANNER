import { AlertTriangle } from 'lucide-react';

interface PasswordSetupSchemaWarningProps {
    open: boolean;
}

export const PasswordSetupSchemaWarning = ({
    open,
}: PasswordSetupSchemaWarningProps) => {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/65 p-4">
            <div className="w-full max-w-md rounded-[24px] border border-amber-200 bg-white p-6 shadow-2xl sm:p-8">
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                    <AlertTriangle size={28} />
                </div>
                <h2 className="text-2xl font-black tracking-normal text-slate-950">
                    Cần cập nhật Database
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                    Hệ thống cần cột{' '}
                    <strong className="font-black text-slate-900">
                        profiles.password_set_at
                    </strong>{' '}
                    để nhận biết tài khoản nào chưa có mật khẩu riêng và bắt buộc cập nhật
                    mật khẩu. Vui lòng chạy migration{' '}
                    <strong className="font-black text-slate-900">
                        20260501090000_add_password_setup_tracking.sql
                    </strong>{' '}
                    trước khi cho sinh viên dùng tiếp.
                </p>
            </div>
        </div>
    );
};
