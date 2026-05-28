import { createClient } from '@supabase/supabase-js';
import { withLogging } from '../middleware.js';
import { getActorRole } from '../moderator-notifications.shared.js';
import { analyzeEventCandidate } from '../event-candidate-ai.shared.js';
import { handleCors } from '../api-cors.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

const allowedRoles = new Set(['admin', 'auditor']);

const getCandidateId = (req) => {
  const fromQuery = String(req.query?.id || '').trim();
  if (fromQuery) return fromQuery;

  const rawUrl = String(req.url || '').split('?')[0];
  const match = rawUrl.match(/\/api\/event-candidates\/([^/]+)\/analyze\/?$/i);
  if (match?.[1]) return decodeURIComponent(match[1]).trim();

  return '';
};

async function handler(req, res) {
  if (handleCors(req, res, {
    headers: 'Content-Type, Authorization',
    methods: 'POST,OPTIONS',
  })) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const role = await getActorRole(req);
  if (!role || !allowedRoles.has(role)) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      details: 'Admin or auditor session is required to analyze event candidates.',
    });
  }

  const candidateId = getCandidateId(req);
  if (!candidateId) {
    return res.status(400).json({ success: false, error: 'Missing candidate id' });
  }

  const { data: candidate, error: candidateError } = await supabase
    .from('event_candidates')
    .select('id, source_name, post_url, raw_content, image_url, ai_is_event, ai_confidence, ai_reason, ai_result')
    .eq('id', candidateId)
    .maybeSingle();

  if (candidateError) {
    return res.status(500).json({
      success: false,
      error: 'Supabase query error',
      details: candidateError.message,
    });
  }

  if (!candidate) {
    return res.status(404).json({ success: false, error: 'Candidate not found' });
  }

  if (!String(candidate.raw_content || '').trim()) {
    return res.status(400).json({
      success: false,
      error: 'raw_content is empty',
      details: 'Candidate has no raw_content to analyze',
    });
  }

  try {
    const aiResult = await analyzeEventCandidate(candidate);

    const { data: updatedCandidate, error: updateError } = await supabase
      .from('event_candidates')
      .update({
        ai_is_event: aiResult.is_event,
        ai_confidence: aiResult.confidence,
        ai_reason: aiResult.reason,
        ai_result: aiResult,
      })
      .eq('id', candidateId)
      .select('*')
      .maybeSingle();

    if (updateError) {
      return res.status(500).json({
        success: false,
        error: 'Supabase update error',
        details: updateError.message,
      });
    }

    return res.status(200).json({
      success: true,
      candidate: updatedCandidate,
      ai_result: aiResult,
    });
  } catch (error) {
    const isGroqError = error?.message === 'Groq API error';
    return res.status(500).json({
      success: false,
      error: isGroqError ? 'Groq API error' : (error?.message || 'Analyze failed'),
      details: error?.details || error?.stack || null,
    });
  }
}

export default withLogging(handler);
