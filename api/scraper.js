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
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'vi,fr-FR;q=0.9,fr;q=0.8,en-US;q=0.7,en;q=0.6',
      'Connection': 'keep-alive',
      'Referer': 'https://online.hub.edu.vn/'
    };

    const delay = ms => new Promise(res => setTimeout(res, ms));

    // --- HÀM 1: LẤY MSSV (ĐÃ SỬA CHÍNH XÁC URL CỦA TRƯỜNG) ---
    async function fetchMssvFromUrl(url) {
        try {
            const res = await axios.get(url, { headers, validateStatus: () => true });
            
            // Check nếu server trả về trang đăng nhập
            if (res.data.includes("Đăng nhập") || res.data.includes("Object moved") || res.status === 302) {
                return 'COOKIE_DEAD';
            }
            
            const $ = cheerio.load(res.data);
            let mssv = null;

            $('td').each((i, el) => {
                const text = $(el).text().trim();
                // Quét mã sinh viên HUB bắt đầu bằng 030 và có 12 số
                if (/^030\d{9}$/.test(text)) {
                    mssv = text;
                    return false; 
                }
            });
            
            return mssv; 
        } catch (e) {
            return null;
        }
    }

    // --- HÀM 2: LẤY TÊN GIẢNG VIÊN (ĐÃ SỬA CHÍNH XÁC URL) ---
    async function getInstructorFromStudentSchedule(mssv, targetCourseCode) {
      try {
        // Đã sửa thành Print_.aspx theo đúng format
        const url = `https://online.hub.edu.vn/Print_.aspx?NH=2025-2026&HK=HK02&StudentID=${mssv}`;
        const res = await axios.get(url, { headers, validateStatus: () => true });
        const $ = cheerio.load(res.data);
        
        let instructor = '';
        const baseCode = targetCourseCode.split('_')[0]; 
        const tailCode = targetCourseCode.split('_').pop();

        $('tr').each((i, row) => {
            const rowText = $(row).text();
            
            if (rowText.includes(baseCode) && rowText.includes(tailCode)) {
                const tds = $(row).find('td');
                
                let cell7 = $(tds[6]).text().trim(); 
                let cell6 = $(tds[5]).text().trim(); 

                if (cell7 && cell7.length > 3 && !cell7.includes("Thứ") && !cell7.includes("Phòng")) {
                    instructor = cell7;
                } else if (cell6 && cell6.length > 3 && !cell6.includes("Thứ") && !cell6.includes("Phòng")) {
                    instructor = cell6;
                }
                return false; 
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
      let urlsToTry = [];

      // SỬA LẠI ĐÚNG CHÍNH TẢ DO IT TRƯỜNG VIẾT SAI:
      // - Liststudent (không có s)
      // - SchduleStudyUnitId (không có e)
      if (originalCode.split('_').length === 3) {
          const parts = originalCode.split('_');
          // Ưu tiên đợt 1
          urlsToTry.push(`https://online.hub.edu.vn/Liststudentinschedulestudyunit.aspx?SchduleStudyUnitId=${parts[0]}_${parts[1]}_1_${parts[2]}`);
          // Thử đợt 2
          urlsToTry.push(`https://online.hub.edu.vn/Liststudentinschedulestudyunit.aspx?SchduleStudyUnitId=${parts[0]}_${parts[1]}_2_${parts[2]}`);
          // Thử mã gốc
          urlsToTry.push(`https://online.hub.edu.vn/Liststudentinschedulestudyunit.aspx?SchduleStudyUnitId=${encodeURIComponent(originalCode)}`);
      } else {
          urlsToTry.push(`https://online.hub.edu.vn/Liststudentinschedulestudyunit.aspx?SchduleStudyUnitId=${encodeURIComponent(originalCode)}`);
      }

      for (let url of urlsToTry) {
          mssv = await fetchMssvFromUrl(url);
          if (mssv === 'COOKIE_DEAD') break; 
          if (mssv) break; 
          await delay(600); 
      }

      await delay(500); 

      if (mssv === 'COOKIE_DEAD') {
        return response.status(401).json({ error: "Cookie đã chết. Hãy F5 trang web HUB lấy Cookie mới!" });
      }

      if (mssv) {
        const instructorName = await getInstructorFromStudentSchedule(mssv, course.course_code);
        await delay(800); 

        if (instructorName && instructorName.length > 3) {
          const { error: updateError } = await supabase
            .from('course_schedules')
            .update({ instructor: instructorName })
            .eq('id', course.id);
          
          if (!updateError) {
            successCount++;
            resultsLog.push(`✅ [${course.course_code}] -> GV: ${instructorName}`);
          } else {
            resultsLog.push(`⚠️ Lỗi lưu DB [${course.course_code}]`);
          }
        } else {
          resultsLog.push(`⚠️ Có SV (${mssv}) nhưng TRỐNG TÊN GV [${course.course_code}]`);
        }
      } else {
        resultsLog.push(`👻 Lớp rỗng/Hủy [${course.course_code}]`);
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