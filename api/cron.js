import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY 
);

export default async function handler(request, response) {
  try {
    const res = await fetch('https://online.hub.edu.vn/');
    const html = await res.text();
    const $ = cheerio.load(html);
    const announcements = [];

    $('a.titlenews').each((index, element) => {
      const title = $(element).text().trim();
      let rawLink = $(element).attr('href');
      
      // 1. Xử lý Ngày tháng
      let dateText = $(element).parent().find('.lillenews').text().trim(); 
      dateText = dateText.replace('[Ngày đăng:', '').replace(']', '').trim();

      let isoDate = new Date().toISOString().split('T')[0]; 
      const parts = dateText.split('/'); 
      if (parts.length === 3) {
          isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }

      // 2. Xử lý Link (Fix lỗi javascript:__doPostBack)
      let finalLink = rawLink;
      if (rawLink) {
          if (rawLink.startsWith('javascript:')) {
              // Tạo link giả để làm khóa chính (Primary Key) không bị trùng
              finalLink = `https://online.hub.edu.vn/#id=${Buffer.from(title).toString('base64')}`; 
          } else if (!rawLink.startsWith('http')) {
              finalLink = `https://online.hub.edu.vn/${rawLink}`;
          }
      }

      if (title && finalLink) {
        announcements.push({
          title,
          link: finalLink, 
          date: isoDate,
          is_new: true
        });
      }
    });

    if (announcements.length > 0) {
      // 3. Fix lỗi Upsert: Cho phép cập nhật nếu trùng link
      const { error } = await supabase
        .from('school_announcements')
        .upsert(announcements, { 
            onConflict: 'link', 
            ignoreDuplicates: false // <--- QUAN TRỌNG: Phải là false để update
        });
        
      if (error) throw error;
    }

    return response.status(200).json({ 
        success: true, 
        message: `Đã cập nhật ${announcements.length} tin mới`,
        data: announcements // Trả về data để bạn kiểm tra xem cào được gì
    });

  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}