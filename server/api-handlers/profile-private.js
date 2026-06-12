import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { withLogging } from '../middleware.js';
import { handleCors } from '../api-cors.js';

const { Pool } = pg;

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const databaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL;

let pool;

const getPool = () => {
  if (!databaseUrl) {
    const error = new Error('Missing SUPABASE_DATABASE_URL/POSTGRES_URL/DATABASE_URL.');
    error.statusCode = 501;
    throw error;
  }

  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      max: Number(process.env.POSTGRES_POOL_MAX || 3),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      ssl: databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false },
    });
  }

  return pool;
};

const errorMessage = (error) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const parseBody = (body) => {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body || '{}');
    } catch {
      return {};
    }
  }
  return body;
};

const getRequestUser = async (request) => {
  const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return data.user;
};

const getActorRole = async (client, userId) => {
  const { rows } = await client.query(
    `select role
       from public.user_roles
      where user_id = $1 or id = $1
      order by case when user_id = $1 then 0 else 1 end
      limit 1`,
    [userId]
  );

  return String(rows[0]?.role || 'student').trim();
};

const canReadTarget = (actor, role, targetUserId) => {
  return actor.id === targetUserId || ['admin', 'auditor'].includes(role);
};

const canWriteTarget = (actor, role, targetUserId) => {
  return actor.id === targetUserId || role === 'admin';
};

const normalizeRow = (row) => row ? {
  user_id: row.user_id,
  email: row.email,
  data: row.data || null,
  password_set_at: row.password_set_at,
  updated_at: row.updated_at,
} : null;

const hasMeaningfulProfileData = (value) => {
  if (!value || typeof value !== 'object') return false;

  const profileKeys = ['studentName', 'cohort', 'programName', 'majorName', 'specializationName'];
  if (profileKeys.some((key) => typeof value[key] === 'string' && value[key].trim())) return true;

  const semesters = Array.isArray(value.semesters) ? value.semesters : [];
  return semesters.some((semester) => {
    const subjects = Array.isArray(semester?.subjects) ? semester.subjects : [];
    if (subjects.length > 0) return true;
    if (semester?.trainingScore !== null && semester?.trainingScore !== undefined) return true;

    const name = typeof semester?.name === 'string' ? semester.name.trim() : '';
    if (!name) return false;
    const isInitialDefault = semesters.length === 1 && name.includes('1') && name.includes('2025-2026');
    return !isInitialDefault;
  });
};

const hasTranscriptData = (value) => {
  const semesters = Array.isArray(value?.semesters) ? value.semesters : [];
  return semesters.some((semester) => {
    const subjects = Array.isArray(semester?.subjects) ? semester.subjects : [];
    return subjects.length > 0;
  });
};

const preserveExistingTranscriptData = async (client, userId, data) => {
  if (!data || hasTranscriptData(data)) return data;

  const existing = await readProfilePrivate(client, userId);
  if (!hasTranscriptData(existing?.data)) return data;

  return {
    ...data,
    semesters: existing.data.semesters,
  };
};

const readProfilePrivate = async (client, userId) => {
  const { rows } = await client.query(
    `select user_id, email, data, password_set_at, updated_at
       from public.profile_private_data
      where user_id = $1
      limit 1`,
    [userId]
  );

  return normalizeRow(rows[0] || null);
};

const readProfilePrivateMap = async (client, userIds) => {
  if (userIds.length === 0) return [];

  const { rows } = await client.query(
    `select user_id, email, data, password_set_at, updated_at
       from public.profile_private_data
      where user_id = any($1::uuid[])`,
    [userIds]
  );

  return rows.map(normalizeRow);
};

const readProfilePrivateSummaryMap = async (client, userIds) => {
  if (userIds.length === 0) return [];

  const { rows } = await client.query(
    `select
        p.user_id,
        p.email,
        jsonb_strip_nulls(jsonb_build_object(
          'studentName', p.data -> 'studentName',
          'cohort', p.data -> 'cohort',
          'programName', p.data -> 'programName',
          'majorName', p.data -> 'majorName',
          'specializationName', p.data -> 'specializationName',
          'totalCreditsRequired', p.data -> 'totalCreditsRequired',
          'hasOnboarded', p.data -> 'hasOnboarded',
          'semesters', coalesce(semesters.summary, '[]'::jsonb)
        )) as data,
        p.password_set_at,
        p.updated_at
       from public.profile_private_data p
       left join lateral (
         select jsonb_agg(
           jsonb_strip_nulls(jsonb_build_object(
             'id', coalesce(semester.value ->> 'id', 'summary-' || semester.ordinality::text),
             'name', semester.value -> 'name',
             'trainingScore', semester.value -> 'trainingScore',
             'subjects', coalesce(subjects.summary, '[]'::jsonb)
           ))
           order by semester.ordinality
         ) as summary
         from jsonb_array_elements(
           case
             when jsonb_typeof(p.data -> 'semesters') = 'array' then p.data -> 'semesters'
             else '[]'::jsonb
           end
         ) with ordinality as semester(value, ordinality)
         left join lateral (
           select jsonb_agg(
             jsonb_strip_nulls(jsonb_build_object(
               'id', 'summary-' || subject.ordinality::text,
               'name', '',
               'credits', subject.value -> 'credits',
               'scoreCC', subject.value -> 'scoreCC',
               'scoreProcess', subject.value -> 'scoreProcess',
               'scoreMid', subject.value -> 'scoreMid',
               'scoreFinal', subject.value -> 'scoreFinal',
               'isNonGPA', subject.value -> 'isNonGPA'
             ))
             order by subject.ordinality
           ) as summary
           from jsonb_array_elements(
             case
               when jsonb_typeof(semester.value -> 'subjects') = 'array' then semester.value -> 'subjects'
               else '[]'::jsonb
             end
           ) with ordinality as subject(value, ordinality)
         ) subjects on true
       ) semesters on true
      where p.user_id = any($1::uuid[])`,
    [userIds]
  );

  return rows.map(normalizeRow);
};

const upsertProfilePrivate = async (client, row) => {
  const nextRow = { ...row };
  if (Object.prototype.hasOwnProperty.call(nextRow, 'data')) {
    nextRow.data = await preserveExistingTranscriptData(client, nextRow.user_id, nextRow.data);
  }

  const hasData = Object.prototype.hasOwnProperty.call(nextRow, 'data');
  const shouldWriteData = hasData && hasMeaningfulProfileData(nextRow.data);
  const data = shouldWriteData ? nextRow.data : {};
  const updatedAt = nextRow.updated_at || new Date().toISOString();

  await client.query(
    `insert into public.profile_private_data
      (user_id, email, data, password_set_at, updated_at)
     values ($1, $2, $3::jsonb, $4, $5)
     on conflict (user_id) do update set
      email = coalesce(excluded.email, public.profile_private_data.email),
      data = case
        when $6::boolean then excluded.data
        else public.profile_private_data.data
      end,
      password_set_at = coalesce(excluded.password_set_at, public.profile_private_data.password_set_at),
      updated_at = excluded.updated_at`,
    [
      nextRow.user_id,
      nextRow.email || null,
      JSON.stringify(data || {}),
      nextRow.password_set_at || null,
      updatedAt,
      shouldWriteData,
    ]
  );
};

const updateProfilePrivate = async (client, userId, patch) => {
  const nextPatch = { ...patch };
  if (Object.prototype.hasOwnProperty.call(nextPatch, 'data')) {
    nextPatch.data = await preserveExistingTranscriptData(client, userId, nextPatch.data);
  }

  const updates = [];
  const values = [];

  const addUpdate = (column, value, transform = (item) => item) => {
    values.push(transform(value));
    updates.push(`${column} = $${values.length}`);
  };

  if (Object.prototype.hasOwnProperty.call(nextPatch, 'email')) addUpdate('email', nextPatch.email || null);
  if (Object.prototype.hasOwnProperty.call(nextPatch, 'data') && hasMeaningfulProfileData(nextPatch.data)) {
    addUpdate('data', nextPatch.data || {}, (value) => JSON.stringify(value || {}));
  }
  if (Object.prototype.hasOwnProperty.call(nextPatch, 'password_set_at')) addUpdate('password_set_at', nextPatch.password_set_at || null);

  addUpdate('updated_at', nextPatch.updated_at || new Date().toISOString());
  values.push(userId);

  const { rowCount } = await client.query(
    `update public.profile_private_data
        set ${updates.join(', ')}
      where user_id = $${values.length}`,
    values
  );

  if (rowCount === 0) {
    await upsertProfilePrivate(client, {
      user_id: userId,
      email: nextPatch.email,
      data: nextPatch.data || {},
      password_set_at: nextPatch.password_set_at,
      updated_at: nextPatch.updated_at,
    });
  }
};

async function handler(request, response) {
  if (handleCors(request, response, {
    methods: 'GET,POST,PATCH,OPTIONS',
    headers: 'Content-Type, Authorization',
  })) return;

  const actor = await getRequestUser(request);
  if (!actor?.id) return response.status(401).json({ error: 'Unauthorized' });

  let client;

  try {
    client = await getPool().connect();
    const role = await getActorRole(client, actor.id);

    if (request.method === 'GET') {
      const targetUserId = String(request.query.userId || actor.id).trim();
      if (!targetUserId) return response.status(400).json({ error: 'Missing userId' });
      if (!canReadTarget(actor, role, targetUserId)) return response.status(403).json({ error: 'Forbidden' });

      const data = await readProfilePrivate(client, targetUserId);
      return response.status(200).json({ success: true, data });
    }

    const body = parseBody(request.body);

    if (request.method === 'POST' && body.action === 'map') {
      if (!['admin', 'auditor'].includes(role)) return response.status(403).json({ error: 'Forbidden' });
      const ids = Array.isArray(body.userIds) ? body.userIds : String(body.userIds || '').split(',');
      const userIds = [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))];
      const mode = body.mode === 'summary' ? 'summary' : 'full';
      const data = mode === 'summary'
        ? await readProfilePrivateSummaryMap(client, userIds)
        : await readProfilePrivateMap(client, userIds);
      return response.status(200).json({ success: true, data });
    }

    if (request.method === 'POST') {
      const row = body.row || body;
      const targetUserId = String(row.user_id || actor.id).trim();
      if (!targetUserId) return response.status(400).json({ error: 'Missing user_id' });
      if (!canWriteTarget(actor, role, targetUserId)) return response.status(403).json({ error: 'Forbidden' });

      await upsertProfilePrivate(client, { ...row, user_id: targetUserId });
      return response.status(200).json({ success: true });
    }

    if (request.method === 'PATCH') {
      const targetUserId = String(body.userId || body.user_id || actor.id).trim();
      if (!targetUserId) return response.status(400).json({ error: 'Missing userId' });
      if (!canWriteTarget(actor, role, targetUserId)) return response.status(403).json({ error: 'Forbidden' });

      await updateProfilePrivate(client, targetUserId, body.patch || body);
      return response.status(200).json({ success: true });
    }

    return response.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return response.status(statusCode).json({ error: errorMessage(error) });
  } finally {
    client?.release();
  }
}

export default withLogging(handler);
