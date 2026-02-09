// src/utils/dateUtils.js

// 1. Hàm định dạng ngày: DD/MM/YYYY (Chấp nhận cả YYYY-MM-DD và DD/MM/YYYY)
export const formatDate = (dateString) => {
  if (!dateString) return '';
  const str = String(dateString).trim();

  // TRƯỜNG HỢP 1: Dữ liệu từ Database (Ví dụ: 2026-02-05 hoặc 2026-02-05T09:00...)
  if (str.includes('-')) {
    const parts = str.split('-'); // Tách thành [2026, 02, 05...]
    if (parts.length >= 3) {
       const year = parts[0];
       const month = parts[1];
       const day = parts[2].substring(0, 2); // Lấy 2 ký tự đầu để bỏ phần giờ (T...)
       return `${day}/${month}/${year}`; 
    }
  }

  // TRƯỜNG HỢP 2: Dữ liệu thô từ web trường (Ví dụ: 05/02/2026)
  // Nếu đã có dấu gạch chéo, ta GIỮ NGUYÊN, không cho máy tính tự sửa
  if (str.includes('/')) {
    return str;
  }

  // TRƯỜNG HỢP 3: Các dạng lạ khác -> Dùng thư viện chuẩn
  try {
    const date = new Date(str);
    if (isNaN(date.getTime())) return str;
    
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(date);
  } catch (error) {
    return str;
  }
};

// 2. Hàm định dạng giờ
export const formatTime = (dateString) => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    return '';
  }
};

// 3. Hàm tính thời gian tương đối
export const timeAgo = (dateString) => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'Vừa xong';
    
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} phút trước`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} giờ trước`;
    
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} ngày trước`;
    
    return formatDate(dateString);
  } catch (error) {
    return '';
  }
};