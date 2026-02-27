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
// HÀM CÀO DỮ LIỆU SIÊU TỐC ĐA NỀN TẢNG (OLD, MODERN, LIBRARY)
// ============================================================================
async function scrapeSource(source) {
  const pageUrls = [source.url];
  
  if (source.maxPages > 1) {
      if (source.type === 'modern') {
          const baseUrl = source.url.replace(/\/$/, '');
          for (let i = 2; i <= source.maxPages; i++) pageUrls.push(`${baseUrl}?trang=${i}`);
      } else if (source.type === 'library') {
          // Trang library.hub dùng cấu trúc &Page=2
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

          // -------------------------------------------------------------
          // 1. TRANG CŨ (online.hub.edu.vn)
          // -------------------------------------------------------------
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
          // -------------------------------------------------------------
          // 2. TRANG ĐẶC BIỆT THƯ VIỆN (library.hub.edu.vn)
          // -------------------------------------------------------------
          else if (source.type === 'library') {
            const baseOrigin = 'https://library.hub.edu.vn';
            $('a').each((index, element) => {
              const rawLink = $(element).attr('href');
              // Lọc chỉ lấy link chứa bài viết (ArticleId)
              if (!rawLink || !rawLink.toLowerCase().includes('articleid=')) return;

              let title = $(element).text().replace(/\s+/g, ' ').trim();
              if (!title || title.length < 15) return; 

              const finalLink = normalizeLink(rawLink, baseOrigin);
              if (!finalLink) return;

              let dateFound = null;
              // Dò tìm class "topic_ngay" xung quanh link
              let container = $(element).closest('div, td, tr');
              let text = container.text().replace(/\s+/g, ' ').trim();
              
              // Bắt cụm "Đăng ngày: 14/02/2026"
              const match = text.match(/(\d{1,2})[\/\-\.]+(\d{1,2})[\/\-\.]+(\d{4})/);
              if (match) {
                  dateFound = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
              }

              let isoDate = dateFound || new Date().toISOString().split('T')[0]; 
              pageResults.push({ title, link: finalLink, date: isoDate, hasRealDate: !!dateFound });
            });
          }
          // -------------------------------------------------------------
          // 3. CÁC TRANG HIỆN ĐẠI (CLC, ĐBCL, Đào tạo, CNTT, Tổ chức...)
          // -------------------------------------------------------------
          else if (source.type === 'modern') {
            const urlObj = new URL(source.url);
            const baseOrigin = urlObj.origin;

            $('a').each((index, element) => {
              const rawLink = $(element).attr('href');
              
              // Lọc bao quát: Cứ là link bài viết (đuôi .html) thì lấy, bỏ qua nút bấm phân trang
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

    // ĐẠI GIA ĐÌNH 11 TRANG WEB CỦA HUB 🚀
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
      { id: 'ketoan', url: 'https://phongketoan.hub.edu.vn/thong-bao', type: 'modern', maxPages: isDeepScrape ? 3 : 1 },
      { id: 'library', url: 'https://library.hub.edu.vn/Default.aspx?TopicId=b1e09557-8d7e-420e-9af4-9cfccbeb0883', type: 'library', maxPages: isDeepScrape ? 26 : 1 }
    ];

    if (specificTarget) SOURCES = SOURCES.filter(s => s.id === specificTarget);

    const scrapedArrays = await Promise.all(SOURCES.map(scrapeSource));
    const allScrapedData = scrapedArrays.flat(); 

    if (allScrapedData.length === 0) return response.status(200).json({ message: "Không tìm thấy tin nào." });

    // 1. Lọc trùng lặp nội bộ dựa trên Tiêu đề
    const uniqueMap = new Map();
    allScrapedData.forEach(item => {
        const normalizedTitle = item.title.trim().toLowerCase().replace(/\s+/g, ' ');
        if (!uniqueMap.has(normalizedTitle)) {
            uniqueMap.set(normalizedTitle, item);
        }
    });
    const finalScrapedData = Array.from(uniqueMap.values());

    // 2. Đối chiếu DB cũ
    const titlesToCheck = finalScrapedData.map(item => item.title.trim());
    const titleChunks = chunkArray(titlesToCheck, 300);
    const existingRecords = [];

    for (const chunk of titleChunks) {
        const { data, error } = await supabase
            .from('school_announcements')
            .select('title') 
            .in('title', chunk);
        if (!error && data) existingRecords.push(...data);
    }

    const existingTitlesMap = new Map();
    existingRecords.forEach(record => {
        const normTitle = record.title.trim().toLowerCase().replace(/\s+/g, ' ');
        existingTitlesMap.set(normTitle, true);
    });

    // 3. Chuẩn bị dữ liệu Insert
    const recordsToInsert = [];
    finalScrapedData.forEach(item => {
        const normTitle = item.title.trim().toLowerCase().replace(/\s+/g, ' ');
        if (!existingTitlesMap.has(normTitle)) {
            recordsToInsert.push({
                title: item.title,
                link: item.link,
                date: item.date, 
                is_new: true 
            });
        }
    });

    // 4. Lưu vào Supabase
    if (recordsToInsert.length > 0) {
        const insertChunks = chunkArray(recordsToInsert, 300);
        for (const chunk of insertChunks) {
            const { error } = await supabase
                .from('school_announcements')
                .insert(chunk);
            if (error) throw error;
        }
    }

    logger.info('Cào dữ liệu hoàn tất', { meta: { newItems: recordsToInsert.length }});

    return response.status(200).json({ 
        success: true, 
        message: `Đã quét ${SOURCES.reduce((acc, curr) => acc + curr.maxPages, 0)} trang. Cào được ${finalScrapedData.length} tin tổng hợp. Thêm mới ${recordsToInsert.length} tin.`,
    });

  } catch (error) {
    logger.error('Lỗi sập API Cron', { meta: { error: error.message }});
    return response.status(500).json({ error: error.message });
  }
}