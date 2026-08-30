export const SCHEDULE_SOURCE_BARRIER_CODE = '55000'
export const SCHEDULE_SOURCE_BARRIER_MESSAGE = 'HUB_SCHEDULE_SOURCE_WRITES_DISABLED'
export const SCHEDULE_SOURCE_UNAVAILABLE_MESSAGE = 'Tính năng lịch đang tạm thời không khả dụng.'
export const INTERNAL_SERVER_ERROR_MESSAGE = 'Internal server error'

export class ScheduleSourceUnavailableError extends Error {
  readonly statusCode = 503
  readonly code = SCHEDULE_SOURCE_BARRIER_CODE

  constructor() {
    super(SCHEDULE_SOURCE_UNAVAILABLE_MESSAGE)
    this.name = 'ScheduleSourceUnavailableError'
  }
}

export const isScheduleSourceBarrierError = (error: unknown) => {
  const candidate = error as { code?: unknown; message?: unknown } | null
  return candidate?.code === SCHEDULE_SOURCE_BARRIER_CODE
    && String(candidate?.message || '').includes(SCHEDULE_SOURCE_BARRIER_MESSAGE)
}

export const assertScheduleSourceWriteSucceeded = (error: unknown) => {
  if (error) throw error
}

type ErrorLike = {
  code?: unknown
  message?: unknown
  name?: unknown
  statusCode?: unknown
}

export const safeHttpError = (
  error: unknown,
  options: { allowClient4xx?: boolean } = {},
) => {
  if (error instanceof ScheduleSourceUnavailableError || isScheduleSourceBarrierError(error)) {
    return { status: 503, message: SCHEDULE_SOURCE_UNAVAILABLE_MESSAGE }
  }

  const candidate = error as ErrorLike | null
  const status = Number(candidate?.statusCode)
  if (
    options.allowClient4xx === true
    && Number.isInteger(status)
    && status >= 400
    && status < 500
  ) {
    return {
      status,
      message: String(candidate?.message || 'Request failed'),
    }
  }

  return { status: 500, message: INTERNAL_SERVER_ERROR_MESSAGE }
}

export const logServerError = (context: string, error: unknown) => {
  const candidate = error as ErrorLike | null
  console.error(JSON.stringify({
    event: 'schedule_source_application_error',
    context,
    errorName: String(candidate?.name || 'Error').slice(0, 80),
    errorCode: String(candidate?.code || '').slice(0, 80),
    statusCode: Number.isInteger(Number(candidate?.statusCode))
      ? Number(candidate?.statusCode)
      : undefined,
  }))
}
