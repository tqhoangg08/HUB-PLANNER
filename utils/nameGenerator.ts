// Danh sách tính từ
const adjectives = [
    "Vui Vẻ", "Ngốc Nghếch", "Dễ Thương", "Lạnh Lùng", "Thông Thái", 
    "Nhanh Nhẹn", "Chăm Chỉ", "Tò Mò", "Hài Hước", "Mạnh Mẽ",
    "Nhút Nhát", "Thân Thiện", "Bí Ẩn", "Tinh Nghịch", "Đáng Yêu",
    "Ngủ Nướng", "Ham Ăn", "Sôi Nổi", "Trầm Tính", "Mộng Mơ"
  ];
  
  // Danh sách con vật/đồ vật
  const nouns = [
    "Mèo Mướp", "Cún Con", "Thỏ Trắng", "Gấu Trúc", "Chim Cánh Cụt",
    "Sư Tử", "Hổ Béo", "Vịt Con", "Gà Chip", "Sóc Nâu",
    "Cáo Nhỏ", "Cú Mèo", "Rùa Con", "Cá Heo", "Hươu Cao Cổ",
    "Gấu Bắc Cực", "Koala", "Chuột Hamster", "Mèo Máy", "Khủng Long"
  ];
  
  // Màu sắc đại diện (cho Avatar)
  const colors = [
    "bg-red-100 text-red-600",
    "bg-orange-100 text-orange-600",
    "bg-amber-100 text-amber-600",
    "bg-green-100 text-green-600",
    "bg-emerald-100 text-emerald-600",
    "bg-teal-100 text-teal-600",
    "bg-cyan-100 text-cyan-600",
    "bg-blue-100 text-blue-600",
    "bg-indigo-100 text-indigo-600",
    "bg-violet-100 text-violet-600",
    "bg-purple-100 text-purple-600",
    "bg-fuchsia-100 text-fuchsia-600",
    "bg-pink-100 text-pink-600",
    "bg-rose-100 text-rose-600"
  ];
  
  export const generateRandomName = () => {
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    return `${noun} ${adj}`;
  };
  
  export const getRandomColorClass = () => {
    return colors[Math.floor(Math.random() * colors.length)];
  };