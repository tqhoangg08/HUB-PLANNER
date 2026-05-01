import { createClient } from '@supabase/supabase-js';
import { withLogging } from '../server/middleware.js'; // Bọc Bác bảo vệ

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const normalizeSemester = (value = '') => String(value).replace(/\s+/g, '_').replace(/[()]/g, '');
const SYNCABLE_COURSE_FIELDS = [
  'course_code',
  'subject_name',
  'credits',
  'shift',
  'day_of_week',
  'weeks',
  'room',
  'campus',
  'exam_date',
  'exam_shift',
  'exam_room',
  'cohort',
  'major',
  'academic_program',
  'phase',
  'semester',
  'instructor',
];

const normalizeComparable = (value) => {
  if (value === undefined || value === null) return '';
  return String(value).trim();
};

const parseCustomData = (value) => {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) || {};
    } catch {
      return {};
    }
  }
  return value;
};

const mergeScheduleCourse = (item, profile) => {
  const baseCourse = item.course_schedules || {};
  const customData = parseCustomData(item.custom_data);

  return {
    ...baseCourse,
    ...customData,
    id: baseCourse.id || item.course_id,
    user_schedule_id: item.id,
    semester: item.semester,
    user: profile,
    original_course: baseCourse,
    custom_data: customData,
  };
};

const getSyncableDiff = (item) => {
  const baseCourse = item.course_schedules || {};
  const customData = parseCustomData(item.custom_data);

  return SYNCABLE_COURSE_FIELDS.reduce((diff, field) => {
    if (!Object.prototype.hasOwnProperty.call(customData, field)) return diff;
    if (normalizeComparable(customData[field]) === normalizeComparable(baseCourse[field])) return diff;
    diff[field] = customData[field];
    return diff;
  }, {});
};

const matchesSearch = (course, rawSearch = '') => {
  const term = rawSearch.trim().toLowerCase();
  if (!term) return true;

  return [
    course.subject_name,
    course.course_code,
    course.instructor,
    course.user?.full_name,
    course.user?.student_code,
    course.user?.email,
  ].some((value) => String(value || '').toLowerCase().includes(term));
};

const getActorRole = async (request) => {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return null;

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user?.id) return null;

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  return (roleData?.role || 'student').trim();
};

const fetchProfilesMap = async (userIds) => {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueUserIds.length === 0) return {};

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, student_code')
    .in('id', uniqueUserIds);

  if (error) throw error;

  const { data: privateRows, error: privateError } = await supabase
    .from('profile_private_data')
    .select('user_id, email')
    .in('user_id', uniqueUserIds);

  if (privateError) throw privateError;
  const privateMap = (privateRows || []).reduce((map, row) => {
    map[row.user_id] = row;
    return map;
  }, {});

  return (data || []).reduce((map, profile) => {
    map[profile.id] = { ...profile, email: privateMap[profile.id]?.email };
    return map;
  }, {});
};

const handleUserSchedules = async (request, response) => {
  const role = await getActorRole(request);
  if (!['admin', 'auditor'].includes(role || '')) {
    return response.status(403).json({ error: 'Forbidden' });
  }

  const { mode = 'changed', semester = 'HK2_2025_2026', phase = 'all', search = '', userId } = request.query;
  const dbSemester = normalizeSemester(semester);

  let schedulesQuery = supabase
    .from('user_schedules')
    .select('id, user_id, course_id, semester, custom_data, course_schedules (*)')
    .in('semester', [semester, dbSemester]);

  if (mode === 'changed') {
    schedulesQuery = schedulesQuery
      .not('custom_data', 'is', null)
      .not('custom_data', 'eq', '{}');
  }

  if (mode === 'courses' && userId) {
    schedulesQuery = schedulesQuery.eq('user_id', userId);
  }

  const { data: schedules, error } = await schedulesQuery.limit(10000);

  if (error) throw error;

  const rows = schedules || [];
  const profilesMap = await fetchProfilesMap(rows.map((item) => item.user_id));

  if (mode === 'summaries') {
    const userIds = [...new Set(rows.map((item) => item.user_id).filter(Boolean))];
    const data = userIds
      .map((id) => {
        const profile = profilesMap[id] || {};
        const userItems = rows.filter((item) => item.user_id === id);
        return {
          user_id: id,
          full_name: profile.full_name || 'Chưa có tên',
          student_code: profile.student_code || id,
          email: profile.email,
          course_count: userItems.length,
          semesters: [...new Set(userItems.map((item) => item.semester).filter(Boolean))],
        };
      })
      .sort((a, b) => a.student_code.localeCompare(b.student_code, 'vi'));

    return response.status(200).json({ success: true, data });
  }

  if (mode === 'courses') {
    if (!userId) return response.status(400).json({ error: 'Missing userId' });

    const data = rows
      .filter((item) => item.user_id === userId)
      .map((item) => mergeScheduleCourse(item, profilesMap[userId] || {}))
      .filter((course) => course.id);

    return response.status(200).json({ success: true, data });
  }

  const data = rows
    .filter((item) => Object.keys(getSyncableDiff(item)).length > 0)
    .map((item) => mergeScheduleCourse(item, profilesMap[item.user_id] || { full_name: 'Ẩn danh', student_code: '???' }))
    .filter((course) => course.id)
    .filter((course) => phase === 'all' || String(course.phase || '') === String(phase))
    .filter((course) => matchesSearch(course, search));

  return response.status(200).json({ success: true, data });
};

const handleSyncUserSchedule = async (request, response) => {
  const role = await getActorRole(request);
  if (role !== 'admin') {
    return response.status(403).json({ error: 'Forbidden' });
  }

  const body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : (request.body || {});
  const { userScheduleId } = body;
  if (!userScheduleId) return response.status(400).json({ error: 'Missing userScheduleId' });

  const { data: row, error: readError } = await supabase
    .from('user_schedules')
    .select('id, course_id, custom_data, course_schedules (*)')
    .eq('id', userScheduleId)
    .maybeSingle();

  if (readError) throw readError;
  if (!row?.course_schedules?.id) return response.status(404).json({ error: 'Schedule row not found' });

  const customData = parseCustomData(row.custom_data);
  const updates = getSyncableDiff(row);

  if (Object.keys(updates).length === 0) {
    return response.status(200).json({ success: true, data: { updates: {}, remainingCustomData: customData } });
  }

  const { error: updateError } = await supabase
    .from('course_schedules')
    .update(updates)
    .eq('id', row.course_schedules.id);

  if (updateError) throw updateError;

  const remainingCustomData = Object.entries(customData).reduce((result, [key, value]) => {
    if (!SYNCABLE_COURSE_FIELDS.includes(key)) result[key] = value;
    return result;
  }, {});

  const { error: customError } = await supabase
    .from('user_schedules')
    .update({ custom_data: remainingCustomData })
    .eq('id', userScheduleId);

  if (customError) throw customError;

  return response.status(200).json({ success: true, data: { updates, remainingCustomData } });
};

const handleProfilePrivateMap = async (request, response) => {
  const role = await getActorRole(request);
  if (!['admin', 'auditor'].includes(role || '')) {
    return response.status(403).json({ error: 'Forbidden' });
  }

  const body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : (request.body || {});
  const ids = Array.isArray(body.userIds) ? body.userIds : String(body.userIds || '').split(',');
  const userIds = [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))];

  if (userIds.length === 0) {
    return response.status(200).json({ success: true, data: [] });
  }

  const rows = [];
  const batchSize = 200;

  for (let index = 0; index < userIds.length; index += batchSize) {
    const batch = userIds.slice(index, index + batchSize);
    const { data, error } = await supabase
      .from('profile_private_data')
      .select('user_id, email, data, password_set_at, updated_at')
      .in('user_id', batch);

    if (error) throw error;
    rows.push(...(data || []));
  }

  return response.status(200).json({ success: true, data: rows });
};

async function handler(request, response) {
  const { resource } = request.query;

  if (resource === 'user-schedules' && request.method === 'PATCH') {
    try {
      return handleSyncUserSchedule(request, response);
    } catch (error) {
      return response.status(500).json({ error: error.message });
    }
  }

  if (resource === 'profile-private-map' && request.method === 'POST') {
    try {
      return handleProfilePrivateMap(request, response);
    } catch (error) {
      return response.status(500).json({ error: error.message });
    }
  }

  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'Chỉ hỗ trợ phương thức GET' });
  }

  try {
    // Nhận các tham số lọc từ đường link URL do Frontend gửi lên
    const { semester, phase, search, limit = 50 } = request.query;

    if (resource === 'user-schedules') {
      return handleUserSchedules(request, response);
    }

    let query = supabase.from('course_schedules')
      .select('*')
      .limit(Number(limit)); // Giới hạn số lượng lấy để chống cào data

    if (semester) {
      query = query.eq('semester', semester);
    }
    
    if (phase && phase !== 'all') {
      query = query.eq('phase', phase);
    }

    if (search) {
      query = query.or(`subject_name.ilike.%${search}%,course_code.ilike.%${search}%,instructor.ilike.%${search}%`);
    }

    const { data, error } = await query;

    if (error) throw error;

    return response.status(200).json({ success: true, data: data });

  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}

export default withLogging(handler);
