/**
 * BỘ NÃO XỬ LÝ THỜI KHÓA BIỂU HUB
 * Dựa trên Khung TGDT HK2 (2025 - 2026)
 */

// 1. CẤU HÌNH NGÀY BẮT ĐẦU VÀ LỄ TẾT
// Tuần 1 bắt đầu từ Thứ 2, ngày 02/02/2026
const HK_START_DATE = new Date('2026-02-02T00:00:00'); 

// Danh sách các tuần nghỉ (Tết Nguyên Đán nghỉ tuần 2, 3, 4)
const HOLIDAY_WEEKS = [2, 3, 4]; 

// 2. DỊCH CA HỌC SANG GIỜ THỰC TẾ
export function getShiftTime(shiftCode) {
  if (!shiftCode) return { text: "Chưa rõ", time: "" };
  
  const code = shiftCode.toUpperCase().trim();
  if (code === 'S') {
    return { text: "Sáng", time: "07:00 - 11:05 (Tiết 1-5)" };
  } else if (code === 'C') {
    return { text: "Chiều", time: "13:00 - 17:05 (Tiết 6-10)" };
  }
  return { text: code, time: "" };
}

// 3. TÁCH CHUỖI TUẦN THÀNH MẢNG (VD: "1, 5-12" => [1, 5, 6, 7, 8, 9, 10, 11, 12])
export function parseWeeks(weekString) {
  if (!weekString) return [];
  const weeks = new Set();
  // Xóa khoảng trắng, tách bằng dấu phẩy
  const parts = weekString.toString().replace(/\s/g, '').split(',');
  
  parts.forEach(part => {
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      if (start && end) {
        for (let i = start; i <= end; i++) weeks.add(i);
      }
    } else {
      const w = parseInt(part);
      if (!isNaN(w)) weeks.add(w);
    }
  });
  
  // Trả về mảng đã sắp xếp tăng dần và loại bỏ các tuần nghỉ Tết
  return Array.from(weeks)
    .sort((a, b) => a - b)
    .filter(w => !HOLIDAY_WEEKS.includes(w));
}

// 4. TÍNH RA NGÀY HỌC CHÍNH XÁC (DD/MM/YYYY)
/**
 * @param {string} weekString - Chuỗi tuần từ DB (VD: "1, 5-12")
 * @param {string} dayOfWeekString - Chuỗi thứ từ DB (VD: "5", "5 7", "2,4,6")
 * @returns {Array} Mảng các object chứa ngày học chính xác
 */
export function calculateExactDates(weekString, dayOfWeekString) {
  const weeks = parseWeeks(weekString);
  if (weeks.length === 0 || !dayOfWeekString) return [];

  // Xử lý cột thứ (vì có môn gộp "5 7" hoặc "2,4")
  const rawDays = dayOfWeekString.toString().replace(/,/g, ' ').split(/\s+/);
  const days = rawDays.map(Number).filter(d => !isNaN(d) && d >= 2 && d <= 8);

  let exactSchedule = [];

  weeks.forEach(week => {
    days.forEach(day => {
      // Công thức tính ngày: Ngày bắt đầu HK + (Số tuần - 1)*7 ngày + (Thứ - 2) ngày
      let date = new Date(HK_START_DATE);
      date.setDate(date.getDate() + (week - 1) * 7);
      date.setDate(date.getDate() + (day - 2));

      // Bỏ qua các ngày lễ đặc biệt
      // (VD: Giỗ Tổ 26/04, Lễ 30/04 - 01/05 nằm ở Tuần 12, 13)
      const dateString = date.toLocaleDateString('vi-VN'); // Format: DD/MM/YYYY
      const isGioto = (week === 12 && day === 8) || (week === 13 && day === 2); // CN tuần 12, T2 tuần 13
      const is30thang4 = (week === 13 && day >= 5 && day <= 8); // T5,6,7,CN tuần 13

      if (!isGioto && !is30thang4) {
        exactSchedule.push({
          week: week,
          dayName: day === 8 ? "Chủ nhật" : `Thứ ${day}`,
          dateStr: dateString,
          rawDate: date
        });
      }
    });
  });

  // Trả về danh sách ngày đã sắp xếp
  return exactSchedule.sort((a, b) => a.rawDate - b.rawDate);
}