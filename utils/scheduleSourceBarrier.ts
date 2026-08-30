const BARRIER_CODE = '55000';
const BARRIER_MESSAGE = 'HUB_SCHEDULE_SOURCE_WRITES_DISABLED';
export const SCHEDULE_SOURCE_UNAVAILABLE_MESSAGE =
  'Tính năng lịch đang tạm thời không khả dụng.';
export const SCHEDULE_SOURCE_INTERNAL_ERROR_MESSAGE =
  'Không thể lưu dữ liệu lịch lúc này. Vui lòng thử lại sau.';

export const isScheduleSourceBarrierError = (error: unknown) => {
  const candidate = error as { code?: unknown; message?: unknown } | null;
  return candidate?.code === BARRIER_CODE
    && String(candidate?.message || '').includes(BARRIER_MESSAGE);
};

const throwSafeBarrierError = (error: unknown) => {
  if (isScheduleSourceBarrierError(error)) {
    throw new Error(SCHEDULE_SOURCE_UNAVAILABLE_MESSAGE);
  }
  throw new Error(SCHEDULE_SOURCE_INTERNAL_ERROR_MESSAGE);
};

export const assertScheduleSourceMutationSucceeded = (error: unknown) => {
  if (error) throwSafeBarrierError(error);
};
