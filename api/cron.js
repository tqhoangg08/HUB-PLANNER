import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY 
);

export default async function handler(request, response) {
  try {
    // 1. Cào dữ liệu từ web trường
    const res = await fetch('https://online.hub.edu.vn/');
    const html = await res.text();
    const $ = cheerio.load(html);
    const scrapedData = [];

    $('a.titlenews').each((index, element) => {
      const title = $(element).text().trim();
      let rawLink = $(element).attr('href');
      
      // Xử lý ngày tháng (Ngày cào được)
      let dateText = $(element).parent().find('.lillenews').text().trim(); 
      dateText = dateText.replace('[Ngày đăng:', '').replace(']', '').trim();
      
      // Mặc định là hôm nay, nếu parse được thì dùng ngày web trường
      let isoDate = new Date().toISOString().split('T')[0]; 
      const parts = dateText.split('/'); 
      if (parts.length === 3) {
          isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }

      // Xử lý Link (Tạo ID duy nhất)
      let finalLink = rawLink;
      if (rawLink) {
          if (rawLink.startsWith('javascript:')) {
              // Tạo ID giả định danh
              finalLink = `https://online.hub.edu.vn/#id=${Buffer.from(title).toString('base64')}`; 
          } else if (!rawLink.startsWith('http')) {
              finalLink = `https://online.hub.edu.vn/${rawLink}`;
          }
      }

      if (title && finalLink) {
        scrapedData.push({
          title,
          link: finalLink, 
          date: isoDate, // Đây là ngày cào được
          // is_new tính sau
        });
      }
    });

    if (scrapedData.length === 0) {
        return response.status(200).json({ message: "Không tìm thấy tin nào." });
    }

    // 2. Lấy danh sách link VÀ DATE đã tồn tại trong Database
    const linksToCheck = scrapedData.map(item => item.link);
    
    // 👇 SỬA Ở ĐÂY: Lấy thêm cột 'date' để bảo lưu ngày cũ
    const { data: existingRecords, error: fetchError } = await supabase
        .from('school_announcements')
        .select('link, date') 
        .in('link', linksToCheck);

    if (fetchError) throw fetchError;

    // Tạo Map để tra cứu nhanh: Link -> Record cũ
    const existingMap = new Map();
    existingRecords.forEach(record => {
        existingMap.set(record.link, record);
    });

    // 3. Phân loại và chuẩn bị dữ liệu Upsert
    const recordsToUpsert = scrapedData.map(item => {
        const existingRecord = existingMap.get(item.link);
        const isAlreadyExist = !!existingRecord;
        
        return {
            ...item,
            // 👇 QUAN TRỌNG: 
            // Nếu đã có trong DB -> Dùng ngày cũ (existingRecord.date) để không bị nhảy ngày
            // Nếu chưa có -> Dùng ngày mới cào được (item.date)
            date: isAlreadyExist ? existingRecord.date : item.date,
            
            // Logic tin mới/cũ giữ nguyên
            is_new: !isAlreadyExist 
        };
    });

    // 4. Thực hiện Upsert
    if (recordsToUpsert.length > 0) {
      const { error } = await supabase
        .from('school_announcements')
        .upsert(recordsToUpsert, { 
            onConflict: 'link', 
            ignoreDuplicates: false 
        });
        
      if (error) throw error;
    }

    const newItemsCount = recordsToUpsert.filter(i => i.is_new).length;

    return response.status(200).json({ 
        success: true, 
        message: `Đã xử lý ${recordsToUpsert.length} tin. ${newItemsCount} tin mới. Giữ nguyên ngày tháng tin cũ.`,
        data: recordsToUpsert 
    });

  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}