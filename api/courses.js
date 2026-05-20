import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { withLogging } from '../server/middleware.js'; // Bọc Bác bảo vệ

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const errorMessage = (error) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const hasPushConfig = Boolean(process.env.VITE_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
if (hasPushConfig) {
  webpush.setVapidDetails(
    'mailto:admin@hotrosinhvienhub.id.vn',
    process.env.VITE_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

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

  const profilesMap = (data || []).reduce((map, profile) => {
    map[profile.id] = { ...profile, email: privateMap[profile.id]?.email };
    return map;
  }, {});

  uniqueUserIds.forEach((id) => {
    if (!profilesMap[id] && privateMap[id]?.email) {
      profilesMap[id] = {
        id,
        email: privateMap[id].email,
        student_code: String(privateMap[id].email || '').split('@')[0],
      };
    }
  });

  const missingUserIds = uniqueUserIds.filter((id) => !profilesMap[id]);
  for (const id of missingUserIds) {
    const { data: authUser } = await supabase.auth.admin.getUserById(id);
    const email = authUser?.user?.email || '';
    profilesMap[id] = {
      id,
      email,
      student_code: email ? email.split('@')[0] : id,
    };
  }

  return profilesMap;
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
  const selectedFieldKeys = Array.isArray(body.fieldKeys)
    ? [...new Set(body.fieldKeys.map((key) => String(key || '').trim()).filter(Boolean))]
    : [];

  const { data: row, error: readError } = await supabase
    .from('user_schedules')
    .select('id, course_id, custom_data, course_schedules (*)')
    .eq('id', userScheduleId)
    .maybeSingle();

  if (readError) throw readError;
  if (!row?.course_schedules?.id) return response.status(404).json({ error: 'Schedule row not found' });

  const customData = parseCustomData(row.custom_data);
  const updates = getSyncableDiff(row);
  const syncKeys = selectedFieldKeys.length > 0 ? selectedFieldKeys : Object.keys(updates);
  const selectedUpdates = syncKeys.reduce((result, key) => {
    if (!Object.prototype.hasOwnProperty.call(updates, key)) return result;
    result[key] = updates[key];
    return result;
  }, {});

  if (Object.keys(selectedUpdates).length === 0) {
    return response.status(200).json({ success: true, data: { updates: {}, remainingCustomData: customData } });
  }

  const { error: updateError } = await supabase
    .from('course_schedules')
    .update(selectedUpdates)
    .eq('id', row.course_schedules.id);

  if (updateError) throw updateError;

  const remainingCustomData = Object.entries(customData).reduce((result, [key, value]) => {
    if (!Object.prototype.hasOwnProperty.call(selectedUpdates, key)) result[key] = value;
    return result;
  }, {});

  const { error: customError } = await supabase
    .from('user_schedules')
    .update({ custom_data: remainingCustomData })
    .eq('id', userScheduleId);

  if (customError) throw customError;

  return response.status(200).json({ success: true, data: { updates: selectedUpdates, remainingCustomData } });
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

const ensureNotificationReceiverProfile = async (userId) => {
  const { data: existingProfile, error: profileReadError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (profileReadError) throw profileReadError;
  if (existingProfile?.id) return;

  const { data: authUser } = await supabase.auth.admin.getUserById(userId);
  const email = authUser?.user?.email || null;
  const studentCode = email ? email.split('@')[0] : null;

  const { error: insertError } = await supabase
    .from('profiles')
    .insert({
      id: userId,
      email,
      student_code: studentCode,
      full_name: studentCode || 'Sinh viên HUB',
    });

  if (insertError) throw insertError;
};

const notifyCourseRequestApproved = async (userId, course) => {
  if (!userId) return { notification: false, push: { sent: 0, failed: 0 } };

  const subjectName = String(course?.subject_name || 'môn học').trim();
  const courseCode = String(course?.course_code || '').trim();
  const courseLabel = courseCode ? `${subjectName} (${courseCode})` : subjectName;
  const content = `Môn ${courseLabel} bạn yêu cầu đã được cập nhật lên hệ thống.`;
  const payload = {
    title: 'Môn học đã được cập nhật',
    body: content,
    url: '/schedule',
  };

  let notification = false;
  await ensureNotificationReceiverProfile(userId);
  const { error: notificationError } = await supabase
    .from('notifications')
    .insert({
      receiver_id: userId,
      actor_id: null,
      type: 'course_request_approved',
      content,
      link: '/schedule',
      is_read: false,
    });

  if (!notificationError) {
    notification = true;
  } else {
    console.error('Course request notification insert failed:', notificationError.message);
  }

  if (!hasPushConfig) return { notification, push: { sent: 0, failed: 0 } };

  const { data: subscriptions, error: subscriptionError } = await supabase
    .from('push_subscriptions')
    .select('id, subscription')
    .eq('user_id', userId);

  if (subscriptionError) {
    console.error('Course request push subscription lookup failed:', subscriptionError.message);
    return { notification, push: { sent: 0, failed: 0 } };
  }

  const results = await Promise.all((subscriptions || []).map(async (sub) => {
    try {
      await webpush.sendNotification(sub.subscription, JSON.stringify(payload));
      return true;
    } catch (error) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
      }
      console.error('Course request push failed:', error?.message || error);
      return false;
    }
  }));

  const sent = results.filter(Boolean).length;
  return { notification, push: { sent, failed: results.length - sent } };
};

const handleCourseRequests = async (request, response) => {
  const role = await getActorRole(request);
  if (!['admin', 'auditor'].includes(role || '')) {
    return response.status(403).json({ error: 'Forbidden' });
  }

  if (request.method === 'GET') {
    const { status = 'pending', search = '', limit = 200 } = request.query;
    let query = supabase
      .from('user_course_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Number(limit));

    if (status && status !== 'all') query = query.eq('status', status);

    const term = String(search || '').trim();
    if (term) {
      query = query.or(`subject_name.ilike.%${term}%,course_code.ilike.%${term}%,instructor.ilike.%${term}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const profilesMap = await fetchProfilesMap((data || []).map((item) => item.user_id));
    const rows = (data || []).map((item) => ({
      ...item,
      user: profilesMap[item.user_id] || null,
    }));

    return response.status(200).json({ success: true, data: rows });
  }

  if (request.method === 'PATCH') {
    if (role !== 'admin') return response.status(403).json({ error: 'Forbidden' });

    const body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : (request.body || {});
    const { requestId, status } = body;
    if (!requestId || !['pending', 'approved', 'rejected'].includes(status)) {
      return response.status(400).json({ error: 'Invalid request update' });
    }

    const { data, error } = await supabase
      .from('user_course_requests')
      .update({ status })
      .eq('id', requestId)
      .select('*')
      .single();

    if (error) throw error;
    return response.status(200).json({ success: true, data });
  }

  if (request.method === 'POST') {
    if (role !== 'admin') return response.status(403).json({ error: 'Forbidden' });

    const body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : (request.body || {});
    const { requestId, course = {} } = body;
    if (!requestId || !course.subject_name || !course.course_code) {
      return response.status(400).json({ error: 'Missing course request data' });
    }

    const { data: courseRequest, error: requestReadError } = await supabase
      .from('user_course_requests')
      .select('id, user_id, subject_name, course_code')
      .eq('id', requestId)
      .maybeSingle();

    if (requestReadError) throw requestReadError;
    if (!courseRequest) return response.status(404).json({ error: 'Course request not found' });

    const payload = {
      ...course,
      is_user_added: false,
    };
    delete payload.id;
    delete payload.user;
    delete payload.created_at;
    delete payload.status;

    const { data: existingCourse, error: existingCourseError } = await supabase
      .from('course_schedules')
      .select('id')
      .eq('course_code', payload.course_code)
      .eq('semester', payload.semester)
      .maybeSingle();

    if (existingCourseError) throw existingCourseError;

    let officialCourse = null;
    if (existingCourse?.id) {
      const { data: updatedCourse, error: updateCourseError } = await supabase
        .from('course_schedules')
        .update(payload)
        .eq('id', existingCourse.id)
        .select('*')
        .single();

      if (updateCourseError) throw updateCourseError;
      officialCourse = updatedCourse;
    } else {
      const { data: insertedCourse, error: insertError } = await supabase
        .from('course_schedules')
        .insert(payload)
        .select('*')
        .single();

      if (insertError) throw insertError;
      officialCourse = insertedCourse;
    }

    const { error: requestError } = await supabase
      .from('user_course_requests')
      .update({ status: 'approved' })
      .eq('id', requestId);

    if (requestError) throw requestError;

    let notification = { notification: false, push: { sent: 0, failed: 0 }, error: null };
    try {
      notification = {
        ...(await notifyCourseRequestApproved(courseRequest.user_id, insertedCourse)),
        error: null,
      };
    } catch (error) {
      notification.error = errorMessage(error);
      console.error('Course request approval notification failed:', notification.error);
    }

    return response.status(200).json({ success: true, data: officialCourse, notification, reusedExistingCourse: Boolean(existingCourse?.id) });
  }

  return response.status(405).json({ error: 'Method not allowed' });
};

async function handler(request, response) {
  const { resource } = request.query;

  if (resource === 'user-schedules' && request.method === 'PATCH') {
    try {
      return handleSyncUserSchedule(request, response);
    } catch (error) {
      return response.status(500).json({ error: errorMessage(error) });
    }
  }

  if (resource === 'course-requests') {
    try {
      return handleCourseRequests(request, response);
    } catch (error) {
      return response.status(500).json({ error: errorMessage(error) });
    }
  }

  if (resource === 'profile-private-map' && request.method === 'POST') {
    try {
      return handleProfilePrivateMap(request, response);
    } catch (error) {
      return response.status(500).json({ error: errorMessage(error) });
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
    return response.status(500).json({ error: errorMessage(error) });
  }
}

export default withLogging(handler);
