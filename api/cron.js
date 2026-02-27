import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';
import logger from './logger.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY 
);

// ============================================================================
// HÀM CÀO DỮ LIỆU ĐA TRANG (PAGINATION SCRAPING)
// ============================================================================
async function scrapeSource(source) {
  let allResults = [];

  for (let page = 1; page <= source.maxPages; page++) {
    try {
      let targetUrl = source.url;
      if (source.type === 'modern' && page > 1) {
          targetUrl = `${source.url}/page/${page}/`;
      }

      const res = await fetch(targetUrl);
      if (!res.ok) break; 

      const html = await res.text();
      const $ = cheerio.load(html);
      let pageResults = [];

      if (source.type === 'old') {
        $('a.titlenews').each((index, element) => {
          const title = $(element).text().trim();
          let rawLink = $(element).attr('href');
          
          let dateText = $(element).parent().find('.lillenews').text().trim(); 
          dateText = dateText.replace('[Ngày đăng:', '').replace(']', '').trim();
          let isoDate = new Date().toISOString().split('T')[0]; 
          const parts = dateText.split('/'); 
          if (parts.length === 3) isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`;

          let finalLink = rawLink;
          if (rawLink && rawLink.startsWith('javascript:')) {
              finalLink = `https://online.hub.edu.vn/#id=${Buffer.from(title).toString('base64')}`; 
          } else if (rawLink && !rawLink.startsWith('http')) {
              finalLink = `https://online.hub.edu.vn/${rawLink}`;
          }

          if (title && finalLink) pageResults.push({ title, link: finalLink, date: isoDate });
        });
      } else {
        const urlObj = new URL(source.url);
        const baseOrigin = urlObj.origin;

        $('a').each((index, element) => {
          const rawLink = $(element).attr('href');
          
          if (!rawLink || !rawLink.includes('/thong-bao/')) return;
          if (rawLink === '/thong-bao' || rawLink === '/thong-bao/' || rawLink.includes('/page/')) return;

          let title = $(element).text().replace(/\s+/g, ' ').trim();
          if (!title) title = $(element).attr('title')?.trim();
          if (!title) title = $(element).find('img').attr('alt')?.trim();
          
          if (!title || title.length < 15) return; 

          let finalLink = rawLink;
          if (rawLink.startsWith('/')) finalLink = `${baseOrigin}${rawLink}`;
          else if (!rawLink.startsWith('http')) finalLink = `${baseOrigin}/${rawLink}`;

          let cardText = $(element).closest('div, li, article, section').text().replace(/\s+/g, ' ');
          let isoDate = new Date().toISOString().split('T')[0]; 
          
          const dateMatch = cardText.match(/(\d{1,2})[\s\/\-\.]+(\d{1,2})[\/\-\.]+(\d{4})/);
          if (dateMatch) {
              isoDate = `${dateMatch[3]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[1].padStart(2, '0')}`;
          }

          pageResults.push({ title, link: finalLink, date: isoDate });
        });
      }

      if (pageResults.length === 0) break; 
      allResults = allResults.concat(pageResults);

    } catch (err) {
      console.error(`Lỗi cào ${source.url} ở trang ${page}:`, err.message);
      break; 
    }
  }
  return allResults;
}

// ============================================================================
// HÀM XỬ LÝ CHÍNH
// ============================================================================
export default async function handler(request, response) {
  const clientIp = request.headers['x-forwarded-for'] || request.socket?.remoteAddress || 'Unknown IP';
  const secret = request.query?.secret || request.body?.secret || request.headers['x-secret-key'];

  if (secret !== process.env.MY_SECRET_SCRAPER_KEY) {
    logger.warn('Truy cập trái phép API Cron!', { meta: { action: 'UNAUTHORIZED', ip: clientIp }});
    return response.status(403).json({ error: 'Cấm truy cập: Sai mật khẩu!' });
  }

  try {
    // ĐỌC CÁC CÔNG TẮC TỪ URL CỦA ADMIN
    const isDeepScrape = request.query?.deep === 'true'; // Cờ hiệu cào vét cạn
    const specificTarget = request.query?.target;        // Cờ hiệu chọn đích danh 1 khoa để cào

    logger.info(`Bắt đầu cào thông báo. Chế độ sâu: ${isDeepScrape}, Mục tiêu: ${specificTarget || 'Tất cả'}`);

    // Cấu hình linh hoạt số trang dựa trên cờ hiệu "deep"
    let SOURCES = [
      { id: 'old', url: 'https://online.hub.edu.vn/', type: 'old', maxPages: 1 },
      { id: 'dbcl', url: 'https://phongktdbcl.hub.edu.vn/thong-bao', type: 'modern', maxPages: isDeepScrape ? 14 : 1 },
      { id: 'scc', url: 'https://scc.hub.edu.vn/thong-bao', type: 'modern', maxPages: isDeepScrape ? 23 : 1 },
      { id: 'clc', url: 'https://clc.hub.edu.vn/thong-bao', type: 'modern', maxPages: isDeepScrape ? 60 : 1 }
    ];

    // Nếu Admin chỉ định mục tiêu cụ thể, chỉ cào thằng đó để tránh sập máy chủ
    if (specificTarget) {
      SOURCES = SOURCES.filter(s => s.id === specificTarget);
    }

    // 1. Cào song song
    const scrapedArrays = await Promise.all(SOURCES.map(scrapeSource));
    const allScrapedData = scrapedArrays.flat(); 

    if (allScrapedData.length === 0) return response.status(200).json({ message: "Không tìm thấy tin nào." });

    // 2. Lọc trùng lặp nội bộ
    const uniqueMap = new Map();
    allScrapedData.forEach(item => {
        if (!uniqueMap.has(item.link) || uniqueMap.get(item.link).title.length < item.title.length) {
            uniqueMap.set(item.link, item);
        }
    });
    const finalScrapedData = Array.from(uniqueMap.values());

    // 3. Đối chiếu DB cũ
    const linksToCheck = finalScrapedData.map(item => item.link);
    const { data: existingRecords, error: fetchError } = await supabase
        .from('school_announcements')
        .select('link, date') 
        .in('link', linksToCheck);

    if (fetchError) throw fetchError;

    const existingMap = new Map();
    existingRecords.forEach(record => existingMap.set(record.link, record));

    // 4. Chuẩn bị dữ liệu
    const recordsToUpsert = finalScrapedData.map(item => {
        const existingRecord = existingMap.get(item.link);
        return {
            ...item,
            date: existingRecord ? existingRecord.date : item.date,
            is_new: !existingRecord 
        };
    });

    // 5. Lưu vào Supabase
    if (recordsToUpsert.length > 0) {
      const { error } = await supabase
        .from('school_announcements')
        .upsert(recordsToUpsert, { onConflict: 'link', ignoreDuplicates: false });
      if (error) throw error;
    }

    const newItemsCount = recordsToUpsert.filter(i => i.is_new).length;
    logger.info('Cào dữ liệu hoàn tất', { meta: { newItems: newItemsCount }});

    return response.status(200).json({ 
        success: true, 
        message: `Đã quét hoàn tất. Tổng thu thập: ${recordsToUpsert.length} tin. Thêm mới ${newItemsCount} tin.`,
    });

  } catch (error) {
    logger.error('Lỗi sập API Cron', { meta: { error: error.message }});
    return response.status(500).json({ error: error.message });
  }
}