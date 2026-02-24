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
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    const delay = ms => new Promise(res => setTimeout(res, ms));

    // 1. HÀM LẤY MSSV (ĐÃ NÂNG CẤP AI TÌM KIẾM)
    async function fetchMssvFromUrl(url) {
        try {
            const res = await axios.get(url, { headers });
            if (res.data.includes("Đăng nhập") || res.data.includes("Login")) return 'COOKIE_DEAD';
            
            const $ = cheerio.load(res.data);
            let mssv = null;
            
            // Quét mọi hàng trong mọi bảng
            $('table tr').each((i, row) => {
              const td2 = $(row).find('td:nth-child(2)').text().trim();
              // Nếu cột 2 là một dãy số dài từ 8 đến 15 chữ số (Chính xác là format MSSV HUB)
              if (/^\d{8,15}$/.test(td2)) {
                mssv = td2;
                return false; // Ngừng vòng lặp ngay khi tìm thấy bé đầu tiên
              }
            });
            return mssv;
        } catch (e) {
            return null;
        }
    }

    // 2. HÀM TÌM GIẢNG VIÊN (ĐÃ NÂNG CẤP CHỐNG BẪY HTML)
    async function getInstructorFromStudentSchedule(mssv, targetCourseCode) {
      try {
        const url = `https://online.hub.edu.vn/Print_aspx?NH=2025-2026&HK=HK02&StudentID=${mssv}`;
        const res = await axios.get(url, { headers });
        const $ = cheerio.load(res.data);
        
        let instructor = '';
        $('table tr').each((i, row) => {
          const stt = $(row).find('td:nth-child(1)').text().trim();
          
          // Chỉ xét những dòng có STT là số thứ tự (loại bỏ các hàng tiêu đề, layout)
          if (/^\d+$/.test(stt)) {
              const tdMaHP = $(row).find('td:nth-child(2)').text().trim();
              const baseCode = targetCourseCode.split('_')[0]; 
              const tailCode = targetCourseCode.split('_').pop();

              if (tdMaHP.includes(baseCode) && tdMaHP.includes(tailCode)) {
                instructor = $(row).find('td:nth-child(7)').text().trim();
                return false; // Ngừng vòng lặp
              }
          }
        });
        return instructor;
      } catch (error) {
        return '';
      }
    }

    // --- TIẾN HÀNH QUÉT ---
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
      
      // Chiến thuật 1: Thử link gốc
      let mssv = await fetchMssvFromUrl(`https://online.hub.edu.vn/Liststudentsinschedulestudyunit.aspx?ScheduleStudyUnitId=${encodeURIComponent(originalCode)}`);
      
      // Chiến thuật 2: Nếu link gốc không có, thử nhét thêm "_1_" vào giữa
      if (!mssv && originalCode.split('_').length === 3) {
          const parts = originalCode.split('_');
          const altCode = `${parts[0]}_${parts[1]}_1_${parts[2]}`;
          await delay(500); // Tránh bão Request
          mssv = await fetchMssvFromUrl(`https://online.hub.edu.vn/Liststudentsinschedulestudyunit.aspx?ScheduleStudyUnitId=${encodeURIComponent(altCode)}`);
      }

      await delay(1000); 

      if (mssv === 'COOKIE_DEAD') {
        return response.status(401).json({ error: "Cookie đã hết hạn, vui lòng đăng nhập lại HUB lấy Cookie mới." });
      }

      if (mssv) {
        const instructorName = await getInstructorFromStudentSchedule(mssv, course.course_code);
        await delay(1000); 

        // Ràng buộc cẩn thận: Tên GV phải có chữ, không rỗng
        if (instructorName && instructorName.length > 2) {
          const { error: updateError } = await supabase
            .from('course_schedules')
            .update({ instructor: instructorName })
            .eq('id', course.id);
          
          if (!updateError) {
            successCount++;
            resultsLog.push(`✅ [${course.course_code}]: ${instructorName}`);
          } else {
            resultsLog.push(`⚠️ Lỗi lưu DB [${course.course_code}]`);
          }
        } else {
          resultsLog.push(`⚠️ Không thấy GV [${course.course_code}]`);
        }
      } else {
        resultsLog.push(`⚠️ Không thấy SV [${course.course_code}] (URL sai hoặc lớp bị hủy)`);
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