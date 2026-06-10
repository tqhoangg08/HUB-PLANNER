import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";
const HOUR_MS = 60 * 60 * 1e3;
const DAY_MS = 24 * HOUR_MS;
const VN_OFFSET_MS = 7 * HOUR_MS;
const ONE_HOUR_WINDOW_MIN = 65;
const ONE_HOUR_WINDOW_MAX = 45;
const EVENING_START_MIN = 20 * 60;
const EVENING_END_MIN = 20 * 60 + 30;
let supabaseClient = null;
let webPushConfigured = false;
const firstValue = (value) => Array.isArray(value) ? value[0] : value;
const requireEnv = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};
const getSupabase = () => {
  if (!supabaseClient) {
    supabaseClient = createClient(
      requireEnv("VITE_SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY")
    );
  }
  return supabaseClient;
};
const configureWebPush = () => {
  if (webPushConfigured) return;
  webpush.setVapidDetails(
    "mailto:admin@hotrosinhvienhub.id.vn",
    requireEnv("VITE_VAPID_PUBLIC_KEY"),
    requireEnv("VAPID_PRIVATE_KEY")
  );
  webPushConfigured = true;
};
const isAuthorized = (req) => {
  const bearer = firstValue(req.headers.authorization)?.replace(/^Bearer\s+/i, "");
  const querySecret = firstValue(req.query?.secret);
  const headerSecret = firstValue(req.headers["x-secret-key"]);
  if (process.env.CRON_SECRET && bearer === process.env.CRON_SECRET) return true;
  if (process.env.MY_SECRET_SCRAPER_KEY && querySecret === process.env.MY_SECRET_SCRAPER_KEY) return true;
  if (process.env.MY_SECRET_SCRAPER_KEY && headerSecret === process.env.MY_SECRET_SCRAPER_KEY) return true;
  return false;
};
const parseJson = (value) => {
  if (!value) return {};
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};
const splitData = (value) => {
  if (!value) return [];
  const text = value.toString().trim();
  if (!text) return [];
  if (text.includes("\n")) return text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  return text.split(/\s+/).filter(Boolean);
};
const parseWeeks = (weeks) => {
  if (!weeks) return [];
  const result = /* @__PURE__ */ new Set();
  weeks.toString().replace(/[,;]/g, " ").split(/\s+/).map((part) => part.trim()).filter(Boolean).forEach((part) => {
    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      for (let week2 = Math.min(start, end); week2 <= Math.max(start, end); week2 += 1) {
        result.add(week2);
      }
      return;
    }
    const week = Number(part);
    if (Number.isFinite(week)) result.add(week);
  });
  return [...result];
};
const getMainShiftType = (shift) => {
  const normalized = (shift || "").trim().toUpperCase();
  if (normalized === "S") return "S";
  if (normalized === "C") return "C";
  if (/\b(6|7|8|9|10)\b/.test(normalized)) return "C";
  if (/\b(1|2|3|4|5)\b/.test(normalized)) return "S";
  return "";
};
const getCourseStart = (shift) => {
  const normalized = (shift || "").trim().toUpperCase();
  if (normalized === "S") return { time: "07:00", minutes: 7 * 60, range: "07:00 - 11:05" };
  if (normalized === "C") return { time: "13:00", minutes: 13 * 60, range: "13:00 - 17:05" };
  if (normalized.includes("1-3")) return { time: "07:00", minutes: 7 * 60, range: "07:00 - 09:15" };
  if (normalized.includes("4-5")) return { time: "09:35", minutes: 9 * 60 + 35, range: "09:35 - 11:05" };
  if (normalized.includes("6-8")) return { time: "13:00", minutes: 13 * 60, range: "13:00 - 15:15" };
  if (normalized.includes("9-10")) return { time: "15:35", minutes: 15 * 60 + 35, range: "15:35 - 17:05" };
  return getMainShiftType(normalized) === "C" ? { time: "13:00", minutes: 13 * 60, range: "13:00 - 17:05" } : { time: "07:00", minutes: 7 * 60, range: "07:00 - 11:05" };
};
const getExamStart = (shift) => {
  const normalized = (shift || "").replace(/\s/g, "").toUpperCase();
  const map = {
    CA1: "07:00",
    "1": "07:00",
    CA2: "09:30",
    "2": "09:30",
    CA3: "13:00",
    "3": "13:00",
    CA4: "15:30",
    "4": "15:30",
    CA5: "18:00",
    "5": "18:00",
    CAS1: "07:00",
    S1: "07:00",
    CAS2: "08:30",
    S2: "08:30",
    CAS3: "10:00",
    S3: "10:00",
    CAC1: "13:00",
    C1: "13:00",
    CAC2: "14:30",
    C2: "14:30",
    CAC3: "16:00",
    C3: "16:00"
  };
  const time = map[normalized] || "07:00";
  const [hour, minute] = time.split(":").map(Number);
  return { time, minutes: hour * 60 + minute };
};
const pad = (value) => value.toString().padStart(2, "0");
const getVnParts = (timestamp = Date.now()) => {
  const date = new Date(timestamp + VN_OFFSET_MS);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes()
  };
};
const makeVnDate = (year, month, day) => new Date(Date.UTC(year, month - 1, day));
const addDays = (parts, days) => {
  const date = makeVnDate(parts.year, parts.month, parts.day + days);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
};
const dateInfo = (parts, semester) => {
  const date = makeVnDate(parts.year, parts.month, parts.day);
  const dayOfWeek = date.getUTCDay() === 0 ? 8 : date.getUTCDay() + 1;
  const start = semester === "HK1_2025_2026" ? Date.UTC(2025, 7, 11) : Date.UTC(2026, 1, 2);
  return {
    iso: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
    display: `${pad(parts.day)}/${pad(parts.month)}/${parts.year}`,
    dayMonth: `${pad(parts.day)}/${pad(parts.month)}`,
    dayOfWeek,
    week: Math.floor((date.getTime() - start) / DAY_MS / 7) + 1
  };
};
const matchesDate = (value, target) => {
  if (!value) return false;
  const text = value.trim();
  return text === target.display || text === target.dayMonth;
};
const getCourseDetailsForSlot = (course, targetDay, targetWeek, targetShiftType) => {
  const weekArr = splitData(course.weeks);
  const dayArr = splitData(course.day_of_week);
  const roomArr = splitData(course.room);
  const shiftArr = splitData(course.shift);
  const maxLen = Math.max(weekArr.length, dayArr.length, shiftArr.length);
  for (let index = maxLen - 1; index >= 0; index -= 1) {
    const dayText = dayArr[index] !== void 0 ? dayArr[index] : dayArr[dayArr.length - 1] || "";
    const shiftText = shiftArr[index] !== void 0 ? shiftArr[index] : shiftArr[0] || "";
    const roomText = roomArr[index] !== void 0 ? roomArr[index] : roomArr[0] || "";
    const weekText = weekArr[index] !== void 0 ? weekArr[index] : weekArr[0] || "";
    if (!parseWeeks(weekText).includes(targetWeek)) continue;
    const days = dayText.replace(/,/g, " ").trim().split(/\s+/).map(Number);
    if (!days.includes(targetDay)) continue;
    if (getMainShiftType(shiftText) !== targetShiftType) continue;
    return { shift: shiftText, room: roomText, weeks: weekText };
  }
  return null;
};
const labelText = (label) => label.type === "Kh\xE1c" ? label.text || "Ghi ch\xFA" : label.type;
const makeReminder = (base, kind, title, body) => ({
  ...base,
  kind,
  title,
  body,
  scheduledFor: `${base.date}T00:00:00+07:00`,
  key: `${base.userId}:${kind}:${base.key}`
});
const buildEventsForDate = (row, target, kind) => {
  const baseCourse = row.course_schedules;
  if (!baseCourse || !row.user_id) return [];
  const customData = parseJson(row.custom_data);
  const course = {
    ...baseCourse,
    ...customData,
    id: baseCourse.id
  };
  const subject = course.subject_name || "M\xF4n h\u1ECDc";
  const events = [];
  const labels = (course.labels || []).filter((label) => matchesDate(label.date, target));
  const labelsBlockNormalClass = labels.length > 0;
  const add = (key, startMinutes, title, body) => {
    events.push(makeReminder({
      userId: row.user_id,
      userScheduleId: row.id,
      courseId: course.id,
      key,
      date: target.iso,
      url: "/schedule",
      startMinutes
    }, kind, title, body));
  };
  const slots = ["S", "C"].map((slot) => {
    const details = getCourseDetailsForSlot(course, target.dayOfWeek, target.week, slot);
    if (!details) return null;
    const start = getCourseStart(details.shift);
    return { details, start };
  }).filter(Boolean);
  labels.forEach((label) => {
    const text = labelText(label);
    const isOff = text.toLowerCase().includes("ngh\u1EC9");
    const slot = slots[0];
    const title = kind === "tomorrow" ? `Ng\xE0y mai: ${text}` : `S\u1EAFp \u0111\u1EBFn: ${text}`;
    const body = slot && !isOff ? `${subject} l\xFAc ${slot.start.range}${slot.details.room ? ` t\u1EA1i P. ${slot.details.room}` : ""}.` : `${subject}${isOff ? " \u0111\u01B0\u1EE3c \u0111\xE1nh d\u1EA5u ngh\u1EC9." : " c\xF3 nh\xE3n trong th\u1EDDi kh\xF3a bi\u1EC3u."}`;
    add(`label:${label.id || text}:${course.id}`, isOff ? void 0 : slot?.start.minutes, title, body);
  });
  (course.makeup_schedules || []).filter((item) => matchesDate(item.date, target)).forEach((item) => {
    const start = getCourseStart(item.shift);
    add(
      `makeup:${item.id || item.date}:${course.id}`,
      start.minutes,
      kind === "tomorrow" ? "Ng\xE0y mai c\xF3 l\u1ECBch h\u1ECDc b\xF9" : "S\u1EAFp t\u1EDBi gi\u1EDD h\u1ECDc b\xF9",
      `${subject} l\xFAc ${start.range}${item.room ? ` t\u1EA1i P. ${item.room}` : ""}.`
    );
  });
  if (matchesDate(course.exam_date, target)) {
    const start = getExamStart(course.exam_shift);
    add(
      `exam:${course.exam_date}:${course.id}`,
      start.minutes,
      kind === "tomorrow" ? "Ng\xE0y mai c\xF3 l\u1ECBch thi" : "S\u1EAFp t\u1EDBi gi\u1EDD thi",
      `${subject} l\xFAc ${start.time}${course.exam_room ? ` t\u1EA1i P. ${course.exam_room}` : ""}.`
    );
  }
  if (!labelsBlockNormalClass) {
    slots.forEach(({ details, start }) => {
      add(
        `class:${target.iso}:${details.shift}:${course.id}`,
        start.minutes,
        kind === "tomorrow" ? "Ng\xE0y mai c\xF3 l\u1ECBch h\u1ECDc" : "S\u1EAFp t\u1EDBi gi\u1EDD h\u1ECDc",
        `${subject} l\xFAc ${start.range}${details.room ? ` t\u1EA1i P. ${details.room}` : ""}.`
      );
    });
  }
  return events;
};
const shouldSend = (event, nowMinutes) => {
  if (event.kind === "tomorrow") return true;
  if (event.startMinutes === void 0) return false;
  const minutesUntil = event.startMinutes - nowMinutes;
  return minutesUntil <= ONE_HOUR_WINDOW_MIN && minutesUntil >= ONE_HOUR_WINDOW_MAX;
};
const reserveReminder = async (event) => {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("schedule_notification_logs").upsert({
    user_id: event.userId,
    user_schedule_id: event.userScheduleId,
    course_id: event.courseId,
    reminder_key: event.key,
    reminder_kind: event.kind,
    scheduled_for: event.scheduledFor
  }, { onConflict: "reminder_key", ignoreDuplicates: true }).select("id");
  if (error) {
    if (error.code === "23505") return false;
    throw error;
  }
  return Array.isArray(data) && data.length > 0;
};
const sendToUser = async (event, subscriptions) => {
  const supabase = getSupabase();
  const payload = JSON.stringify({
    title: event.title,
    body: event.body,
    url: event.url
  });
  const results = await Promise.all(subscriptions.map(async (sub) => {
    try {
      await webpush.sendNotification(sub.subscription, payload);
      return true;
    } catch (error) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      }
      console.error("Schedule reminder push failed:", error);
      return false;
    }
  }));
  return results.filter(Boolean).length;
};
async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!isAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
  let supabase;
  try {
    supabase = getSupabase();
    configureWebPush();
  } catch (error) {
    return res.status(500).json({
      error: "Schedule reminder configuration error",
      detail: error?.message || String(error)
    });
  }
  const now = getVnParts();
  const nowMinutes = now.hour * 60 + now.minute;
  const runTomorrow = nowMinutes >= EVENING_START_MIN && nowMinutes < EVENING_END_MIN;
  const todayInfo = dateInfo(now);
  const tomorrowParts = addDays(now, 1);
  const { data: subscriptions, error: subError } = await supabase.from("push_subscriptions").select("id, user_id, subscription");
  if (subError) return res.status(500).json({ error: subError.message });
  if (!subscriptions?.length) return res.status(200).json({ success: true, sent: 0, message: "No subscriptions" });
  const subscriptionsByUser = /* @__PURE__ */ new Map();
  subscriptions.forEach((sub) => {
    if (!sub.user_id) return;
    subscriptionsByUser.set(sub.user_id, [...subscriptionsByUser.get(sub.user_id) || [], sub]);
  });
  const userIds = [...subscriptionsByUser.keys()];
  const { data: scheduleRows, error: scheduleError } = await supabase.from("user_schedules").select("id, user_id, course_id, semester, custom_data, course_schedules (*)").in("user_id", userIds);
  if (scheduleError) return res.status(500).json({ error: scheduleError.message });
  const events = (scheduleRows || []).flatMap((row) => {
    const rowTodayInfo = dateInfo(now, row.semester);
    const rowTomorrowInfo = dateInfo(tomorrowParts, row.semester);
    return [
      ...buildEventsForDate(row, rowTodayInfo, "one_hour"),
      ...runTomorrow ? buildEventsForDate(row, rowTomorrowInfo, "tomorrow") : []
    ];
  }).filter((event) => shouldSend(event, nowMinutes));
  let sent = 0;
  let skipped = 0;
  for (const event of events) {
    const reserved = await reserveReminder(event);
    if (!reserved) {
      skipped += 1;
      continue;
    }
    sent += await sendToUser(event, subscriptionsByUser.get(event.userId) || []);
  }
  return res.status(200).json({
    success: true,
    sent,
    skipped,
    candidates: events.length,
    runTomorrow,
    now: `${todayInfo.iso} ${pad(now.hour)}:${pad(now.minute)} Asia/Ho_Chi_Minh`
  });
}
export {
  handler as default
};
