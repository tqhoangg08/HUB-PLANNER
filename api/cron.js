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
      let link = $(element).attr('href');
      
      if (link && !link.startsWith('http')) {
        link = `https://online.hub.edu.vn/${link}`;
      }

      // Lấy text ngày: [Ngày đăng:05/02/2026]
      let dateText = $(element).parent().find('.lillenews').text().trim(); 
      // Xóa chữ thừa -> còn "05/02/2026"
      dateText = dateText.replace('[Ngày đăng:', '').replace(']', '').trim();

      // 👇 QUAN TRỌNG: Chuyển đổi sang YYYY-MM-DD để sắp xếp được
      let isoDate = new Date().toISOString().split('T')[0]; // Mặc định hôm nay
      const parts = dateText.split('/'); // Tách [05, 02, 2026]
      if (parts.length === 3) {
          // Xếp lại thành: 2026-02-05
          isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }

      if (title && link) {
        announcements.push({
          title,
          link,
          date: isoDate, // Lưu ngày chuẩn ISO
          is_new: true
        });
      }
    });

    if (announcements.length > 0) {
      const { error } = await supabase
        .from('school_announcements')
        .upsert(announcements, { onConflict: 'link', ignoreDuplicates: true });
        
      if (error) throw error;
    }

    return response.status(200).json({ success: true, count: announcements.length });

  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}