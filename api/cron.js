import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';
import logger from './logger.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY 
);

// ============================================================================
// HÀM CHUẨN HÓA LINK (CHỐNG TRÙNG LẶP RÁC)
// ============================================================================
function normalizeLink(rawLink, baseOrigin) {
    if (!rawLink) return null;
    let link = rawLink.trim();
    
    link = link.replace(/\/$/, '');
    if (link.startsWith('javascript:')) return null; 

    if (link.startsWith('/')) {
        link = `${baseOrigin}${link}`;
    } else if (!link.startsWith('http')) {
        if (link.includes('hub.edu.vn')) {
            link = `https://${link}`;
        } else {
            link = `${baseOrigin}/${link}`;
        }
    }

    link = link.replace(/^http:\/\//i, 'https://');
    return link;
}

// ============================================================================
// HÀM CÀO DỮ LIỆU SIÊU TỐC VÀ TRUY VẾT NGÀY THÁNG ĐỊCH DANH CLASS
// ============================================================================
async function scrapeSource(source) {
  const pageUrls = [source.url];
  
  if (source.maxPages > 1 && source.type === 'modern') {
      const baseUrl = source.url.replace(/\/$/, '');
      for (let i = 2; i <= source.maxPages; i++) {
          pageUrls.push(`${baseUrl}?trang=${i}`);
      }
  }

  const fetchPromises = pageUrls.map(async (targetUrl) => {
      try {
          const res = await fetch(targetUrl);
          if (!res.ok) return []; 

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
              let hasRealDate = false;
              
              const parts = dateText.split('/'); 
              if (parts.length === 3) {
                  isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
                  hasRealDate = true;
              }

              let finalLink = rawLink;
              if (rawLink && rawLink.startsWith('javascript:')) {
                  finalLink = `https://online.hub.edu.vn/#id=${Buffer.from(title).toString('base64')}`; 
              } else if (rawLink && !rawLink.startsWith('http')) {
                  finalLink = `https://online.hub.edu.vn/${rawLink}`;
              }

              if (title && finalLink) {
                  pageResults.push({ title, link: finalLink, date: isoDate, hasRealDate });
              }
            });
          } else {
            const urlObj = new URL(source.url);
            const baseOrigin = urlObj.origin;

            $('a').each((index, element) => {
              const rawLink = $(element).attr('href');
              
              if (!rawLink || !rawLink.includes('/thong-bao/')) return;
              if (rawLink === '/thong-bao' || rawLink === '/thong-bao/' || rawLink.includes('?trang=')) return;

              let title = $(element).text().replace(/\s+/g, ' ').trim();
              if (!title) title = $(element).attr('title')?.trim();
              if (!title) title = $(element).find('img').attr('alt')?.trim();
              if (!title || title.length < 15) return; 

              const finalLink = normalizeLink(rawLink, baseOrigin);
              if (!finalLink) return;

              let dateFound = null;
              
              const cardContainer = $(element).closest('.notification-item, .news-item, article');

              if (cardContainer.length > 0) {
                  // Kịch bản A: Dành cho HUB MAIN, CLC và ĐBCL 
                  const dayEl = cardContainer.find('.date .day');
                  const monthYearEl = cardContainer.find('.date .month-year');
                  
                  if (dayEl.length > 0 && monthYearEl.length > 0) {
                      const day = dayEl.text().trim().padStart(2, '0');
                      const monthYear = monthYearEl.text().trim(); 
                      const parts = monthYear.split('.');
                      if (parts.length === 2) {
                          const month = parts[0].padStart(2, '0');
                          const year = parts[1];
                          dateFound = `${year}-${month}-${day}`;
                      }
                  } 
                  // Kịch bản B: Dành cho SCC 
                  else {
                      const newsDateEl = cardContainer.find('.news-date');
                      if (newsDateEl.length > 0) {
                          const textDate = newsDateEl.text().trim(); 
                          const match = textDate.match(/(\d{1,2})[\/\-\.]+(\d{1,2})[\/\-\.]+(\d{4})/);
                          if (match) {
                              const day = match[1].padStart(2, '0');
                              const month = match[2].padStart(2, '0');
                              const year = match[3];
                              dateFound = `${year}-${month}-${day}`;
                          }
                      }
                  }

                  if (!dateFound) {
                      let text = cardContainer.text().replace(/\s+/g, ' ').trim();
                      const match = text.match(/\b(\d{1,2})[\s\/\-\.]+(\d{1,2})[\s\/\-\.]+(\d{4})\b/);
                      if (match) {
                          const day = match[1].padStart(2, '0');
                          const month = match[2].padStart(2, '0');
                          const year = match[3];
                          dateFound = `${year}-${month}-${day}`;
                      }
                  }
              }

              let isoDate = dateFound || new Date().toISOString().split('T')[0]; 
              
              pageResults.push({ 
                  title, 
                  link: finalLink, 
                  date: isoDate, 
                  hasRealDate: !!dateFound 
              });
            });
          }
          return pageResults;
      } catch (err) {
          return []; 
      }
  });

  const resultsArrays = await Promise.all(fetchPromises);
  return resultsArrays.flat();
}

const chunkArray = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (v, i) => arr.slice(i * size, i * size + size));

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
    const isDeepScrape = request.query?.deep === 'true'; 
    const specificTarget = request.query?.target;        

    logger.info(`Bắt đầu cào thông báo. Chế độ sâu: ${isDeepScrape}, Mục tiêu: ${specificTarget || 'Tất cả'}`);

    // 👇 ĐÃ THÊM: Nguồn web chính của HUB vào danh sách (ID: hub_main) 👇
    let SOURCES = [
      { id: 'old', url: 'https://online.hub.edu.vn/', type: 'old', maxPages: 1 },
      { id: 'dbcl', url: 'https://phongktdbcl.hub.edu.vn/thong-bao', type: 'modern', maxPages: isDeepScrape ? 14 : 1 },
      { id: 'scc', url: 'https://scc.hub.edu.vn/thong-bao', type: 'modern', maxPages: isDeepScrape ? 23 : 1 },
      { id: 'clc', url: 'https://clc.hub.edu.vn/thong-bao', type: 'modern', maxPages: isDeepScrape ? 60 : 1 },
      { id: 'hub_main', url: 'https://hub.edu.vn/thong-bao', type: 'modern', maxPages: isDeepScrape ? 71 : 1 } // Thay số 40 bằng số trang thực tế nhé
    ];

    if (specificTarget) SOURCES = SOURCES.filter(s => s.id === specificTarget);

    const scrapedArrays = await Promise.all(SOURCES.map(scrapeSource));
    const allScrapedData = scrapedArrays.flat(); 

    if (allScrapedData.length === 0) return response.status(200).json({ message: "Không tìm thấy tin nào." });

    const uniqueMap = new Map();
    allScrapedData.forEach(item => {
        if (!uniqueMap.has(item.link) || uniqueMap.get(item.link).title.length < item.title.length) {
            uniqueMap.set(item.link, item);
        }
    });
    const finalScrapedData = Array.from(uniqueMap.values());

    const linksToCheck = finalScrapedData.map(item => item.link);
    const linkChunks = chunkArray(linksToCheck, 300);
    const existingRecords = [];

    for (const chunk of linkChunks) {
        const { data, error } = await supabase
            .from('school_announcements')
            .select('link, date') 
            .in('link', chunk);
        if (!error && data) existingRecords.push(...data);
    }

    const existingMap = new Map();
    existingRecords.forEach(record => existingMap.set(record.link, record));

    const recordsToUpsert = finalScrapedData.map(item => {
        const existingRecord = existingMap.get(item.link);
        let finalDate = item.date;
        
        if (existingRecord && !item.hasRealDate) {
            finalDate = existingRecord.date;
        }

        return {
            title: item.title,
            link: item.link,
            date: finalDate, 
            is_new: !existingRecord 
        };
    });

    const upsertChunks = chunkArray(recordsToUpsert, 300);
    for (const chunk of upsertChunks) {
        const { error } = await supabase
            .from('school_announcements')
            .upsert(chunk, { onConflict: 'link', ignoreDuplicates: false });
        if (error) throw error;
    }

    const newItemsCount = recordsToUpsert.filter(i => i.is_new).length;
    logger.info('Cào dữ liệu hoàn tất', { meta: { newItems: newItemsCount }});

    return response.status(200).json({ 
        success: true, 
        message: `Đã quét ${SOURCES.reduce((acc, curr) => acc + curr.maxPages, 0)} trang. Xử lý ${recordsToUpsert.length} tin. Hệ thống đã dò chính xác cấu trúc HTML và sửa lỗi ngày!`,
    });

  } catch (error) {
    logger.error('Lỗi sập API Cron', { meta: { error: error.message }});
    return response.status(500).json({ error: error.message });
  }
}