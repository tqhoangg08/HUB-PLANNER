const GROQ_KEYS = [
  process.env.GROQ_API_KEY,
  process.env.GROQ_API_KEY_2,
  process.env.GROQ_API_KEY_3,
  process.env.GROQ_API_KEY_4,
  process.env.GROQ_API_KEY_5,
  process.env.GROQ_CHAT_KEY,
].filter(Boolean);

const GROQ_MODEL = process.env.GROQ_EVENT_CANDIDATE_MODEL || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

const EVENT_CATEGORIES = [
  'Hoạt động phong trào',
  'Minigame',
  'Tình nguyện',
  'Cuộc thi học thuật',
  'Cổ vũ',
  'Talkshow',
  'Tọa đàm',
  'Hội thảo',
  'Sự kiện offline',
  'Teambuilding',
  'Hoạt động thể thao',
  'Khác (Tự nhập)',
];

const DEFAULT_EVENT_CATEGORY = EVENT_CATEGORIES[0];

const normalizeText = (value) => String(value || '').trim();
const normalizeOptionalText = (value) => {
  const text = normalizeText(value);
  return text ? text : null;
};

const normalizeCategory = (value) => {
  const text = normalizeOptionalText(value);
  if (!text) return DEFAULT_EVENT_CATEGORY;
  return EVENT_CATEGORIES.includes(text) ? text : DEFAULT_EVENT_CATEGORY;
};

const normalizeDate = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().split('T')[0];
};

const normalizeTime = (value) => {
  const text = normalizeText(value);
  if (!text) return null;
  const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const hours = String(match[1]).padStart(2, '0');
  const minutes = String(match[2]).padStart(2, '0');
  const seconds = String(match[3] || '00').padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

const cleanAiResult = (result) => {
  const safe = result && typeof result === 'object' ? result : {};
  return {
    is_event: Boolean(safe.is_event),
    confidence: Number.isFinite(Number(safe.confidence))
      ? Math.max(0, Math.min(1, Number(safe.confidence)))
      : 0,
    title: normalizeOptionalText(safe.title),
    organizer: normalizeOptionalText(safe.organizer),
    category: normalizeCategory(safe.category),
    criteria: normalizeOptionalText(safe.criteria),
    points: safe.points === undefined || safe.points === null ? null : safe.points,
    format: normalizeOptionalText(safe.format),
    location_type: normalizeOptionalText(safe.location_type),
    classification: normalizeOptionalText(safe.classification),
    event_date: normalizeDate(safe.event_date),
    event_time: normalizeTime(safe.event_time),
    deadline: normalizeDate(safe.deadline),
    deadline_time: normalizeTime(safe.deadline_time),
    registration_start_date: normalizeDate(safe.registration_start_date),
    registration_start_time: normalizeTime(safe.registration_start_time),
    link: normalizeOptionalText(safe.link),
    description: normalizeOptionalText(safe.description),
    reason: normalizeOptionalText(safe.reason),
  };
};

const buildPrompt = (candidate) => `
You are a student event extraction system for Facebook posts.
Return ONE valid JSON object only. No markdown. No code fences. Do not explain anything.

Rules:
- Decide whether the post is an upcoming or ongoing event.
- Recap, thanks, congratulations, recruitment, results, post-event photo albums are NOT events.
- Do not invent data. If a field is missing, use null.
- Date format must be YYYY-MM-DD.
- Time format must be HH:mm:ss.
- format must be one of: Online, Offline, Hỗn hợp, or null.
- location_type must be one of: Trong trường, Ngoài trường, or null.
- category must be exactly one of:
  ${EVENT_CATEGORIES.map((item) => `- ${item}`).join('\n')}
- If none fit, use "Hoạt động phong trào".

Return exactly this JSON shape:
{
  "is_event": boolean,
  "confidence": number,
  "title": string | null,
  "organizer": string | null,
  "category": "Hoạt động phong trào" | "Minigame" | "Tình nguyện" | "Cuộc thi học thuật" | "Cổ vũ" | "Talkshow" | "Tọa đàm" | "Hội thảo" | "Sự kiện offline" | "Teambuilding" | "Hoạt động thể thao" | "Khác (Tự nhập)" | null,
  "criteria": string | null,
  "points": number | null,
  "format": "Online" | "Offline" | "Hỗn hợp" | null,
  "location_type": "Trong trường" | "Ngoài trường" | null,
  "classification": string | null,
  "event_date": "YYYY-MM-DD" | null,
  "event_time": "HH:mm:ss" | null,
  "deadline": "YYYY-MM-DD" | null,
  "deadline_time": "HH:mm" | null,
  "registration_start_date": "YYYY-MM-DD" | null,
  "registration_start_time": "HH:mm:ss" | null,
  "link": string | null,
  "description": string | null,
  "reason": string
}

Source name: ${candidate.source_name || ''}
Post URL: ${candidate.post_url || ''}
Raw content:
${candidate.raw_content || ''}
`.trim();

const stripCodeFences = (text) => {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] || raw).trim();
};

export const analyzeEventCandidate = async (candidate) => {
  if (!candidate?.raw_content || !String(candidate.raw_content).trim()) {
    throw new Error('Raw content is empty');
  }

  if (!GROQ_KEYS.length) {
    throw new Error('Missing GROQ_API_KEY');
  }

  const apiKey = GROQ_KEYS[Math.floor(Math.random() * GROQ_KEYS.length)];
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content: 'You are an event extraction engine. Always return valid JSON only.',
        },
        {
          role: 'user',
          content: buildPrompt(candidate),
        },
      ],
    }),
  });

  const responseText = await response.text();

  if (!response.ok) {
    console.warn('Groq API error', {
      status: response.status,
      body: responseText,
    });
    const error = new Error('Groq API error');
    error.details = responseText;
    throw error;
  }

  let parsedResponse;
  try {
    parsedResponse = JSON.parse(responseText);
  } catch {
    const error = new Error('Groq API returned invalid JSON response');
    error.details = responseText;
    throw error;
  }

  const content = parsedResponse?.choices?.[0]?.message?.content || '';
  const cleaned = stripCodeFences(content);

  let parsedContent;
  try {
    parsedContent = JSON.parse(cleaned);
  } catch {
    const error = new Error('Groq model output is not valid JSON');
    error.details = cleaned;
    throw error;
  }

  return cleanAiResult(parsedContent);
};
