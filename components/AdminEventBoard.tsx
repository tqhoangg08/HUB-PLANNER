import React from 'react';

// DEPRECATED: This component has been replaced by In-place Management in EventsBoard.tsx
// All management features are now directly accessible on the main event list for authorized

interface AdminEventBoardProps {
    onBack: () => void;
    onGoToApp?: () => void;
}

export const AdminEventBoard: React.FC<AdminEventBoardProps> = ({ onGoToApp }) => {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-50 text-center p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Trang quản trị cũ đã bị loại bỏ</h1>
        <p className="text-gray-600 mb-6">Vui lòng sử dụng tính năng quản lý trực tiếp trên trang chủ.</p>
        {onGoToApp && (
            <button onClick={onGoToApp} className="bg-[#003375] text-white px-6 py-2 rounded-lg font-bold">
                Về trang chính
            </button>
        )}
    </div>
  );
};
