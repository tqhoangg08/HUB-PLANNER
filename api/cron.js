import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';
import logger from './logger.js'; // ---> ĐÃ THÊM: Import công cụ log Axiom

const supabase = createClient(
  process.env.VITE_SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY 
);

export default async function handler(request, response) {
  // ---> THÊM MỚI: BẢO MẬT BẰNG MẬT KHẨU <---
  const clientIp = request.headers['x-forwarded-for'] || request.socket?.remoteAddress || 'Unknown IP';
  
  // Hỗ trợ lấy secret từ query URL (GET) hoặc body (POST) hoặc Headers
  const secret = request.query?.secret || request.body?.secret || request.headers['x-secret-key'];

  if (secret !== process.env.MY_SECRET_SCRAPER_KEY) {
    // Ghi log cảnh báo lên Axiom nếu sai mật khẩu
    logger.warn('Truy cập trái phép API Cron Thông báo!', {
      meta: { action: 'UNAUTHORIZED_CRON_ACCESS', ip: clientIp, url: request.url }
    });
    return response.status(403).json({ error: 'Cấm truy cập: Sai mật khẩu bảo mật!' });
  }
  // ---------------------------------------------

  try {
    // Ghi log bắt đầu chạy
    logger.info('Bắt đầu cào Thông báo trường', {
        meta: { action: 'START_CRON_SCRAPING', ip: clientIp }
    });

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
    
    // Lấy thêm cột 'date' để bảo lưu ngày cũ
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
            // Nếu đã có trong DB -> Dùng ngày cũ (existingRecord.date) để không bị nhảy ngày
            // Nếu chưa có -> Dùng ngày mới cào được (item.date)
            date: isAlreadyExist ? existingRecord.date : item.date,
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

    // Ghi log thành công bắn lên Axiom
    logger.info('Cào thông báo hoàn tất', {
        meta: { action: 'SUCCESS_CRON_SCRAPING', newItems: newItemsCount, totalProcessed: recordsToUpsert.length }
    });

    return response.status(200).json({ 
        success: true, 
        message: `Đã xử lý ${recordsToUpsert.length} tin. ${newItemsCount} tin mới. Giữ nguyên ngày tháng tin cũ.`,
        data: recordsToUpsert 
    });

  } catch (error) {
    // Ghi log lỗi sập hệ thống lên Axiom
    logger.error('Lỗi sập API Cron cào thông báo', {
        meta: { action: 'SYSTEM_ERROR_CRON', error: error.message, ip: clientIp }
    });
    return response.status(500).json({ error: error.message });
  }
}