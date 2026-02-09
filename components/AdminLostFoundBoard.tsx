import React from 'react';

// DEPRECATED: This component has been replaced by In-place Management in LostFoundBoard.tsx

interface AdminLostFoundBoardProps {
    userRole: 'admin' | 'editor' | null;
}

export const AdminLostFoundBoard: React.FC<AdminLostFoundBoardProps> = () => {
    return (
        <div className="p-4 text-center text-gray-500">
            Component này đã ngừng hoạt động. Vui lòng sử dụng trang Tìm đồ chính.
        </div>
    );
};
