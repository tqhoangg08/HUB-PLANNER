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
      
      // Xử lý ngày tháng
      let dateText = $(element).parent().find('.lillenews').text().trim(); 
      dateText = dateText.replace('[Ngày đăng:', '').replace(']', '').trim();
      let isoDate = new Date().toISOString().split('T')[0]; 
      const parts = dateText.split('/'); 
      if (parts.length === 3) {
          isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }

      // Xử lý Link (Tạo ID duy nhất)
      let finalLink = rawLink;
      if (rawLink) {
          if (rawLink.startsWith('javascript:')) {
              // Tạo ID giả định danh dựa trên Base64 của tiêu đề
              finalLink = `https://online.hub.edu.vn/#id=${Buffer.from(title).toString('base64')}`; 
          } else if (!rawLink.startsWith('http')) {
              finalLink = `https://online.hub.edu.vn/${rawLink}`;
          }
      }

      if (title && finalLink) {
        scrapedData.push({
          title,
          link: finalLink, 
          date: isoDate,
          // Chưa vội gán is_new: true ở đây
        });
      }
    });

    if (scrapedData.length === 0) {
        return response.status(200).json({ message: "Không tìm thấy tin nào." });
    }

    // 2. Lấy danh sách link đã tồn tại trong Database để đối chiếu
    // Chỉ cần lấy cột 'link' của những tin đang có trong danh sách cào được
    const linksToCheck = scrapedData.map(item => item.link);
    
    const { data: existingRecords, error: fetchError } = await supabase
        .from('school_announcements')
        .select('link')
        .in('link', linksToCheck);

    if (fetchError) throw fetchError;

    // Tạo một Set chứa các link đã tồn tại để tra cứu cho nhanh
    const existingLinksSet = new Set(existingRecords.map(r => r.link));

    // 3. Phân loại và chuẩn bị dữ liệu Upsert
    const recordsToUpsert = scrapedData.map(item => {
        const isAlreadyExist = existingLinksSet.has(item.link);
        
        return {
            ...item,
            // Nếu link CHƯA có trong DB -> Tin mới (true)
            // Nếu link ĐÃ có trong DB -> Tin cũ (false)
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

    // Đếm số lượng tin thực sự mới
    const newItemsCount = recordsToUpsert.filter(i => i.is_new).length;

    return response.status(200).json({ 
        success: true, 
        message: `Đã xử lý ${recordsToUpsert.length} tin. Trong đó có ${newItemsCount} tin mới hoàn toàn.`,
        data: recordsToUpsert 
    });

  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}