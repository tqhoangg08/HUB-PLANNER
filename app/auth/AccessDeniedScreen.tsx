import { AlertTriangle, LogOut, Shield } from 'lucide-react';
import { SCHOOL_EMAIL_DOMAIN } from '../../hooks/useSessionAccessControl';

interface AccessDeniedScreenProps {
    deniedEmail: string;
    onLogout: () => void;
}

export const AccessDeniedScreen = ({
    deniedEmail,
    onLogout,
}: AccessDeniedScreenProps) => (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#F8FAFC] animate-fadeIn">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 max-w-md text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <Shield className="text-red-500" size={32} />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Truy cập bị từ chối
            </h2>
            <p className="text-gray-500 mb-6 text-sm">
                Hệ thống phát hiện bạn đang sử dụng tài khoản email: <br />
                <strong className="text-gray-800">{deniedEmail}</strong>
            </p>
            <div className="bg-red-50 text-red-700 p-4 rounded-xl text-sm mb-8 text-left border border-red-100">
                <p className="font-bold flex items-center gap-2 mb-1">
                    <AlertTriangle size={16} /> Yêu cầu bắt buộc:
                </p>
                <p>
                    Vui lòng đăng nhập bằng email sinh viên trường ĐH Ngân hàng TP.HCM
                    có đuôi tên miền là <strong>@{SCHOOL_EMAIL_DOMAIN}</strong>
                </p>
            </div>
            <button
                onClick={onLogout}
                className="w-full bg-[#003375] text-white font-bold py-3 rounded-xl hover:bg-[#002855] transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
                <LogOut size={18} /> Đăng xuất & Thử lại
            </button>
        </div>
    </div>
);
