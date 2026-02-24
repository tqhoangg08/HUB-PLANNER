import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';
import axios from 'axios';

// Kết nối Supabase bằng biến môi trường (Bảo mật Key)
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

    // Hàm lấy 1 MSSV
    async function getOneStudentFromCourse(courseCodeRaw) {
      try {
        const encodedCode = encodeURIComponent(courseCodeRaw);
        const url = `https://online.hub.edu.vn/Liststudentsinschedulestudyunit.aspx?ScheduleStudyUnitId=${encodedCode}`;
        
        const res = await axios.get(url, { headers });
        const $ = cheerio.load(res.data);
        
        let mssv = '';
        $('table tr').each((i, row) => {
          if (i === 1) { 
            mssv = $(row).find('td:nth-child(2)').text().trim();
          }
        });
        return mssv;
      } catch (error) {
        console.error(`Lỗi lấy DSSV cho mã ${courseCodeRaw}: ${error.message}`);
        return null;
      }
    }

    // Hàm tìm Giảng viên
    async function getInstructorFromStudentSchedule(mssv, targetCourseCode) {
      try {
        const url = `https://online.hub.edu.vn/Print_aspx?NH=2025-2026&HK=HK02&StudentID=${mssv}`;
        const res = await axios.get(url, { headers });
        const $ = cheerio.load(res.data);
        
        let instructor = '';
        $('table tr').each((i, row) => {
          const tdMaHP = $(row).find('td:nth-child(2)').text().trim();
          
          const baseCode = targetCourseCode.split('_')[0]; 
          const tailCode = targetCourseCode.split('_').pop();

          if (tdMaHP.includes(baseCode) && tdMaHP.includes(tailCode)) {
            instructor = $(row).find('td:nth-child(6)').text().trim();
          }
        });
        return instructor;
      } catch (error) {
        console.error(`Lỗi xem TKB của MSSV ${mssv}: ${error.message}`);
        return '';
      }
    }

    // --- TIẾN HÀNH QUÉT ---
    console.log("🚀 Bắt đầu quá trình cào dữ liệu Giảng Viên...");

    // Quét 10 môn mỗi mẻ để tránh Timeout
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
      let searchCode = course.course_code;
      
      if (searchCode.split('_').length === 3) {
        const parts = searchCode.split('_');
        searchCode = `${parts[0]}_${parts[1]}_1_${parts[2]}`; 
      }

      const mssv = await getOneStudentFromCourse(searchCode);
      await delay(1000); 

      if (mssv) {
        const instructorName = await getInstructorFromStudentSchedule(mssv, course.course_code);
        await delay(1000); 

        if (instructorName) {
          const { error: updateError } = await supabase
            .from('course_schedules')
            .update({ instructor: instructorName })
            .eq('id', course.id);
          
          if (!updateError) {
            successCount++;
            resultsLog.push(`✅ ${course.course_code}: ${instructorName}`);
          } else {
            resultsLog.push(`⚠️ Lỗi DB: ${course.course_code}`);
          }
        } else {
          resultsLog.push(`⚠️ Không thấy GV: ${course.course_code}`);
        }
      } else {
        resultsLog.push(`⚠️ Không thấy SV: ${course.course_code}`);
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