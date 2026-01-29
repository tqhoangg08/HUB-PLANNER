import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { type, content, contact } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Nội dung không được để trống' });
    }

    const { data, error } = await supabase
      .from('feedback')
      .insert([
        { 
          type: type || 'idea', 
          content: content, 
          contact: contact || null 
        }
      ]);

    if (error) throw error;

    return res.status(200).json({ success: true, message: 'Đã gửi góp ý thành công!' });

  } catch (error) {
    console.error("Feedback Error:", error);
    return res.status(500).json({ error: 'Lỗi server, vui lòng thử lại sau.' });
  }
}