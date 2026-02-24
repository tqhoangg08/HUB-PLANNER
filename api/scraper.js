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

    // --- HÀM 1: LẤY MSSV ---
    async function fetchMssvFromUrl(url) {
        try {
            const res = await axios.get(url, { headers, validateStatus: () => true });
            
            if (res.data.includes("Đăng nhập") || res.data.includes("Object moved")) {
                return 'COOKIE_DEAD';
            }
            
            const $ = cheerio.load(res.data);
            let mssv = null;

            $('table tr').each((i, row) => {
                const tds = $(row).children('td');
                if (tds.length >= 2) {
                    const text = $(tds[1]).text().trim();
                    if (/^030\d{9}$/.test(text)) {
                        mssv = text;
                        return false; 
                    }
                }
            });
            
            return mssv; 
        } catch (e) {
            return null;
        }
    }

    // --- HÀM 2: LẤY TÊN GIẢNG VIÊN ---
    async function getInstructorFromStudentSchedule(mssv, targetCourseCode) {
      try {
        const url = `https://online.hub.edu.vn/Print_.aspx?NH=2025-2026&HK=HK02&StudentID=${mssv}`;
        const res = await axios.get(url, { headers, validateStatus: () => true });
        const $ = cheerio.load(res.data);
        
        let instructor = '';
        const baseCode = targetCourseCode.split('_')[0]; 
        const tailCode = targetCourseCode.split('_').pop();

        $('table tr').each((i, row) => {
            const tds = $(row).children('td');
            
            if (tds.length >= 7) {
                const tdMaHP = $(tds[1]).text().trim();

                if (tdMaHP.includes(baseCode) && tdMaHP.includes(tailCode)) {
                    let teacherName = $(tds[6]).text().trim(); 

                    if (teacherName && !teacherName.includes("()") && !teacherName.includes("Thứ")) {
                        instructor = teacherName;
                    }
                    return false; 
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

    // Vẫn tìm các môn trống
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

      if (originalCode.split('_').length === 3) {
          const parts = originalCode.split('_');
          urlsToTry.push(`https://online.hub.edu.vn/Liststudentinschedulestudyunit.aspx?SchduleStudyUnitId=${parts[0]}_${parts[1]}_1_${parts[2]}`);
          urlsToTry.push(`https://online.hub.edu.vn/Liststudentinschedulestudyunit.aspx?SchduleStudyUnitId=${parts[0]}_${parts[1]}_2_${parts[2]}`);
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
          // TRƯỜNG HỢP 1: TÌM THẤY GIẢNG VIÊN
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
          // TRƯỜNG HỢP 2: CÓ SINH VIÊN NHƯNG CỘT GIẢNG VIÊN TRỐNG (Trường chưa xếp GV)
          // -> Cập nhật chữ "Chưa xếp GV" để lần sau Bot né ra
          await supabase
            .from('course_schedules')
            .update({ instructor: 'Chưa xếp GV' })
            .eq('id', course.id);
          resultsLog.push(`⚠️ Chưa xếp GV [${course.course_code}] -> Đã đánh dấu bỏ qua.`);
        }
      } else {
        // TRƯỜNG HỢP 3: KHÔNG TÌM THẤY BẤT KỲ SINH VIÊN NÀO (Lớp Hủy)
        // -> Cập nhật chữ "Lớp Hủy" để lần sau Bot né ra
        await supabase
            .from('course_schedules')
            .update({ instructor: 'Lớp Hủy/Trống' })
            .eq('id', course.id);
        resultsLog.push(`👻 Lớp rỗng/Hủy [${course.course_code}] -> Đã đánh dấu bỏ qua.`);
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