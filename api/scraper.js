import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';
import axios from 'axios';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Chỉ hỗ trợ phương thức POST' });
  }

  try {
    const { cookie } = request.body;

    if (!cookie) {
      return response.status(400).json({ error: 'Thiếu tham số cookie' });
    }

    const headers = {
      'Cookie': cookie,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
    };

    const delay = ms => new Promise(res => setTimeout(res, ms));

    // --- CHIẾN THUẬT 1: QUÉT MSSV BẰNG REGEX XUYÊN HTML ---
    async function fetchMssvFromUrl(url) {
        try {
            const res = await axios.get(url, { headers, validateStatus: () => true });
            
            // Check cookie chết (ASP.NET thường văng ra trang Login hoặc Object moved)
            if (res.data.includes("Đăng nhập") || res.data.includes("Object moved")) {
                return 'COOKIE_DEAD';
            }
            
            // Dùng Cheerio gỡ hết tag HTML, chỉ lấy text thuần túy
            const $ = cheerio.load(res.data);
            const plainText = $('body').text().replace(/\s+/g, ' '); // Xóa khoảng trắng thừa

            // ĐÁNH HƠI MSSV: Tìm 1 chuỗi bắt đầu bằng '0', dài 10-12 số, đứng độc lập
            // (Ví dụ: 030839230012)
            const mssvMatch = plainText.match(/\b0\d{9,12}\b/);
            
            if (mssvMatch) {
                return mssvMatch[0]; // Trả về MSSV đầu tiên tìm thấy
            }
            
            return null; // Không thấy số nào giống MSSV
        } catch (e) {
            console.error("Lỗi get URL:", e.message);
            return null;
        }
    }

    // --- CHIẾN THUẬT 2: QUÉT TÊN GIẢNG VIÊN ---
    async function getInstructorFromStudentSchedule(mssv, targetCourseCode) {
      try {
        const url = `https://online.hub.edu.vn/Print_aspx?NH=2025-2026&HK=HK02&StudentID=${mssv}`;
        const res = await axios.get(url, { headers, validateStatus: () => true });
        const $ = cheerio.load(res.data);
        
        let instructor = '';
        const baseCode = targetCourseCode.split('_')[0]; 
        const tailCode = targetCourseCode.split('_').pop();

        // Tìm trong tất cả các thẻ <tr>
        $('table tr').each((i, row) => {
            const rowText = $(row).text();
            
            // Nếu dòng này có chứa mã môn (VD: DAT715 và D01)
            if (rowText.includes(baseCode) && rowText.includes(tailCode)) {
                // Lấy cột thứ 7 (chứa tên GV)
                let cell7 = $(row).find('td:nth-child(7)').text().trim();
                
                // Backup: Nếu cột 7 rỗng, thử quét lùi lại vì đôi khi HTML bị gộp cột
                if (!cell7 || cell7.length < 3) {
                     cell7 = $(row).find('td:nth-child(6)').text().trim(); // Thử cột 6
                }
                
                if (cell7 && cell7.length > 3) {
                    instructor = cell7;
                    return false; // Dừng vòng lặp
                }
            }
        });
        return instructor;
      } catch (error) {
        return '';
      }
    }

    // =======================================================
    // CHƯƠNG TRÌNH CHÍNH
    // =======================================================
    console.log("🚀 Bắt đầu quá trình cào dữ liệu Giảng Viên...");

    const { data: courses, error } = await supabase
      .from('course_schedules')
      .select('id, course_code')
      .eq('semester', 'HK2_2025_2026')
      .or('instructor.eq.,instructor.is.null') 
      .limit(10); 

    if (error || !courses || courses.length === 0) {
      return response.status(200).json({ message: "Không có môn học nào cần cập nhật giảng viên." });
    }

    let successCount = 0;
    let resultsLog = [];

    for (let i = 0; i < courses.length; i++) {
      const course = courses[i];
      let originalCode = course.course_code;
      let mssv = null;
      
      // Tạo danh sách các URL có thể xảy ra để đi rà quét
      let urlsToTry = [
          `https://online.hub.edu.vn/Liststudentsinschedulestudyunit.aspx?ScheduleStudyUnitId=${encodeURIComponent(originalCode)}`
      ];

      // Nếu mã có 3 khúc (VD: DAT715_252_D01), chế thêm các mã dự phòng
      if (originalCode.split('_').length === 3) {
          const parts = originalCode.split('_');
          urlsToTry.push(`https://online.hub.edu.vn/Liststudentsinschedulestudyunit.aspx?ScheduleStudyUnitId=${parts[0]}_${parts[1]}_1_${parts[2]}`);
          urlsToTry.push(`https://online.hub.edu.vn/Liststudentsinschedulestudyunit.aspx?ScheduleStudyUnitId=${parts[0]}_${parts[1]}_2_${parts[2]}`);
      }

      // Vòng lặp rà từng URL cho đến khi vớt được MSSV
      for (let url of urlsToTry) {
          mssv = await fetchMssvFromUrl(url);
          if (mssv === 'COOKIE_DEAD') break; // Chết cookie thì dừng luôn
          if (mssv) break; // Thấy MSSV rồi thì thoát vòng lặp URL
          await delay(500); // Nghỉ nhịp trước khi thử URL tiếp theo
      }

      await delay(500); 

      if (mssv === 'COOKIE_DEAD') {
        return response.status(401).json({ error: "Cookie đã chết hoặc bị văng session. Hãy F5 trang web HUB lấy Cookie mới!" });
      }

      if (mssv) {
        const instructorName = await getInstructorFromStudentSchedule(mssv, course.course_code);
        await delay(500); 

        if (instructorName && instructorName.length > 3) {
          const { error: updateError } = await supabase
            .from('course_schedules')
            .update({ instructor: instructorName })
            .eq('id', course.id);
          
          if (!updateError) {
            successCount++;
            resultsLog.push(`✅ [${course.course_code}]: ${instructorName} (Lấy từ SV: ${mssv})`);
          } else {
            resultsLog.push(`⚠️ Lỗi lưu DB [${course.course_code}]`);
          }
        } else {
          resultsLog.push(`⚠️ Không tìm ra cột Tên GV [${course.course_code}]`);
        }
      } else {
        resultsLog.push(`⚠️ Link web báo trống [${course.course_code}] (Trường chưa gắn danh sách)`);
      }
    }
    
    return response.status(200).json({ 
        success: true, 
        message: `Đã chạy xong mẻ quét. Cập nhật thành công ${successCount}/${courses.length} môn.`,
        logs: resultsLog
    });

  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}