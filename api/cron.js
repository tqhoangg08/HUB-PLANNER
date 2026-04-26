import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';
import logger from '../server/logger.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY 
);

const ANNOUNCEMENT_PUSH_SPACING_MINUTES = 10;

async function queueAnnouncementPushes(newItems) {
  if (!newItems.length) return { queued: 0, skipped: true };

  const now = Date.now();
  const rows = newItems.map((item, index) => ({
    announcement_id: item.id,
    title: item.title,
    link: item.link,
    scheduled_at: new Date(now + index * ANNOUNCEMENT_PUSH_SPACING_MINUTES * 60 * 1000).toISOString(),
  }));

  const { error } = await supabase
    .from('school_announcement_push_queue')
    .upsert(rows, { onConflict: 'announcement_id' });

  if (error) {
    logger.error('Khong the xep hang push thong bao truong', { meta: { error: error.message } });
    return { queued: 0, error: error.message };
  }

  return { queued: rows.length, spacingMinutes: ANNOUNCEMENT_PUSH_SPACING_MINUTES };
}

// ============================================================================
// HÀM CHUẨN HÓA LINK
// ============================================================================
function normalizeLink(rawLink, baseOrigin) {
    if (!rawLink) return null;
    let link = rawLink.trim().replace(/\/$/, '');
    if (link.startsWith('javascript:')) return null; 

    if (link.startsWith('/')) link = `${baseOrigin}${link}`;
    else if (!link.startsWith('http')) {
        if (link.includes('hub.edu.vn')) link = `https://${link}`;
        else link = `${baseOrigin}/${link}`;
    }
    return link.replace(/^http:\/\//i, 'https://');
}

// ============================================================================
// HÀM CÀO DỮ LIỆU ĐA NỀN TẢNG
// ============================================================================
async function scrapeSource(source) {
  const pageUrls = [source.url];
  
  if (source.maxPages > 1) {
      if (source.type === 'modern') {
          const baseUrl = source.url.replace(/\/$/, '');
          for (let i = 2; i <= source.maxPages; i++) pageUrls.push(`${baseUrl}?trang=${i}`);
      } else if (source.type === 'library') {
          for (let i = 2; i <= source.maxPages; i++) pageUrls.push(`${source.url}&Page=${i}`);
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
              if (rawLink && rawLink.startsWith('javascript:')) finalLink = `https://online.hub.edu.vn/#id=${Buffer.from(title).toString('base64')}`; 
              else if (rawLink && !rawLink.startsWith('http')) finalLink = `https://online.hub.edu.vn/${rawLink}`;

              if (title && finalLink) pageResults.push({ title, link: finalLink, date: isoDate, hasRealDate });
            });
          } 
          else if (source.type === 'modern') {
            const urlObj = new URL(source.url);
            const baseOrigin = urlObj.origin;

            $('a').each((index, element) => {
              const rawLink = $(element).attr('href');
              if (!rawLink || !rawLink.endsWith('.html')) return;
              if (rawLink.includes('?trang=')) return;

              let title = $(element).text().replace(/\s+/g, ' ').trim();
              if (!title) title = $(element).attr('title')?.trim();
              if (!title) title = $(element).find('img').attr('alt')?.trim();
              if (!title || title.length < 15) return; 

              const finalLink = normalizeLink(rawLink, baseOrigin);
              if (!finalLink) return;

              let dateFound = null;
              const cardContainer = $(element).closest('.notification-item, .news-item, article');

              // 👇 VÒNG KIM CÔ CHỐNG ĂN TẠP: NẾU KHÔNG THUỘC KHUNG BÀI VIẾT THÌ VỨT BỎ NGAY 👇
              if (cardContainer.length === 0) return;

              if (cardContainer.length > 0) {
                  const dayEl = cardContainer.find('.date .day');
                  const monthYearEl = cardContainer.find('.date .month-year');
                  if (dayEl.length > 0 && monthYearEl.length > 0) {
                      const day = dayEl.text().trim().padStart(2, '0');
                      const monthYear = monthYearEl.text().trim(); 
                      const parts = monthYear.split('.');
                      if (parts.length === 2) dateFound = `${parts[1]}-${parts[0].padStart(2, '0')}-${day}`;
                  } else {
                      const newsDateEl = cardContainer.find('.news-date');
                      if (newsDateEl.length > 0) {
                          const match = newsDateEl.text().trim().match(/(\d{1,2})[\/\-\.]+(\d{1,2})[\/\-\.]+(\d{4})/);
                          if (match) dateFound = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
                      }
                  }

                  if (!dateFound) {
                      const match = cardContainer.text().replace(/\s+/g, ' ').trim().match(/\b(\d{1,2})[\s\/\-\.]+(\d{1,2})[\s\/\-\.]+(\d{4})\b/);
                      if (match) dateFound = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
                  }
              }

              let isoDate = dateFound || new Date().toISOString().split('T')[0]; 
              pageResults.push({ title, link: finalLink, date: isoDate, hasRealDate: !!dateFound });
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

    let SOURCES = [
      { id: 'old', url: 'https://online.hub.edu.vn/', type: 'old', maxPages: 1 },
      { id: 'dbcl', url: 'https://phongktdbcl.hub.edu.vn/thong-bao', type: 'modern', maxPages: isDeepScrape ? 14 : 1 },
      { id: 'scc', url: 'https://scc.hub.edu.vn/thong-bao', type: 'modern', maxPages: isDeepScrape ? 23 : 1 },
      { id: 'clc', url: 'https://clc.hub.edu.vn/thong-bao', type: 'modern', maxPages: isDeepScrape ? 60 : 1 },
      { id: 'hub_main', url: 'https://hub.edu.vn/thong-bao', type: 'modern', maxPages: isDeepScrape ? 40 : 1 },
      { id: 'daotao', url: 'https://phongdaotao.hub.edu.vn/thong-bao', type: 'modern', maxPages: isDeepScrape ? 9 : 1 },
      { id: 'qlcntt', url: 'https://phongqlcntt.hub.edu.vn/tin-hoat-dong/thong-bao', type: 'modern', maxPages: isDeepScrape ? 2 : 1 },
      { id: 'tstt', url: 'https://phongtstt.hub.edu.vn/thong-bao', type: 'modern', maxPages: isDeepScrape ? 2 : 1 },
      { id: 'tochuc', url: 'https://phongtochuc.hub.edu.vn/thong-bao', type: 'modern', maxPages: isDeepScrape ? 4 : 1 },
      { id: 'ketoan', url: 'https://phongketoan.hub.edu.vn/thong-bao', type: 'modern', maxPages: isDeepScrape ? 3 : 1 }
    ];

    if (specificTarget) SOURCES = SOURCES.filter(s => s.id === specificTarget);

    const scrapedArrays = await Promise.all(SOURCES.map(scrapeSource));
    const allScrapedData = scrapedArrays.flat(); 

    if (allScrapedData.length === 0) return response.status(200).json({ message: "Không tìm thấy tin nào." });

    const uniqueLinks = new Set();
    const uniqueTitles = new Set();
    const finalScrapedData = [];

    allScrapedData.forEach(item => {
        const normTitle = item.title.trim().toLowerCase().replace(/\s+/g, ' ');
        if (!uniqueLinks.has(item.link) && !uniqueTitles.has(normTitle)) {
            uniqueLinks.add(item.link);
            uniqueTitles.add(normTitle);
            finalScrapedData.push(item);
        }
    });

    const linksToCheck = finalScrapedData.map(item => item.link);
    const titlesToCheck = finalScrapedData.map(item => item.title.trim());
    
    const existingLinksSet = new Set();
    const existingTitlesSet = new Set();

    for (const chunk of chunkArray(linksToCheck, 300)) {
        const { data, error } = await supabase.from('school_announcements').select('link').in('link', chunk);
        if (!error && data) data.forEach(r => existingLinksSet.add(r.link));
    }

    for (const chunk of chunkArray(titlesToCheck, 300)) {
        const { data, error } = await supabase.from('school_announcements').select('title').in('title', chunk);
        if (!error && data) data.forEach(r => existingTitlesSet.add(r.title.trim().toLowerCase().replace(/\s+/g, ' ')));
    }

    const recordsToInsert = [];
    finalScrapedData.forEach(item => {
        const normTitle = item.title.trim().toLowerCase().replace(/\s+/g, ' ');
        if (!existingLinksSet.has(item.link) && !existingTitlesSet.has(normTitle)) {
            recordsToInsert.push({
                title: item.title,
                link: item.link,
                date: item.date, 
                is_new: true 
            });
        }
    });

    let actualInsertedCount = 0;
    const insertedRecords = [];
    
    if (recordsToInsert.length > 0) {
        const insertChunks = chunkArray(recordsToInsert, 50);
        for (const chunk of insertChunks) {
            const insertPromises = chunk.map(async (item) => {
                const { data, error } = await supabase
                    .from('school_announcements')
                    .insert(item)
                    .select('id, title, link')
                    .single();
                
                if (!error) {
                    actualInsertedCount++; 
                    if (data) insertedRecords.push(data);
                }
            });
            await Promise.all(insertPromises);
        }
    }

    const pushQueueSummary = await queueAnnouncementPushes(insertedRecords);

    logger.info('Cào dữ liệu hoàn tất', { meta: { attempted: recordsToInsert.length, successful: actualInsertedCount }});

    return response.status(200).json({ 
        success: true, 
        pushQueue: pushQueueSummary,
        message: `Đã quét ${SOURCES.reduce((acc, curr) => acc + curr.maxPages, 0)} trang. Đã chèn và lưu thực tế thành công ${actualInsertedCount} tin.`,
    });

  } catch (error) {
    logger.error('Lỗi sập API Cron', { meta: { error: error.message }});
    return response.status(500).json({ error: error.message });
  }
}
