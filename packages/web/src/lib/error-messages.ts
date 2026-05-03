import type { ApiClientError } from './api';

export interface ErrorUI {
  title: string;
  detail: string;
  action?: string;
  variant: 'error' | 'warning' | 'info';
}

const FALLBACK: ErrorUI = {
  title: 'Something went wrong',
  detail: 'Please try again. If the problem persists, contact support.',
  variant: 'error',
};

/**
 * Codes that exist server-side but don't deserve a custom UI string.
 * We surface the server's `message`/`detail` verbatim instead of "Something went wrong"
 * so reviewers can debug without opening DevTools.
 */
const PASSTHROUGH_CODES = new Set([
  'VALIDATION_FAILED',
  'BAD_REQUEST',
  'INVALID_REQUEST',
  'IF_MATCH_INVALID',
  'INVALID_CURSOR',
  'APPOINTMENT_NOT_FOUND',
  'DEALERSHIP_NOT_FOUND',
  'SERVICE_TYPE_NOT_FOUND',
  'CUSTOMER_NOT_FOUND',
  'VEHICLE_NOT_FOUND',
  'NOT_FOUND',
  'INSERT_RETURNED_NO_ROW',
  'INTERNAL_ERROR',
  'ERROR',
]);

const MAP: Record<string, ErrorUI> = {
  // Concurrency
  BAY_UNAVAILABLE: {
    title: 'Bay already booked',
    detail: 'Pick a different bay or time.',
    action: 'Pick another slot',
    variant: 'error',
  },
  TECHNICIAN_UNAVAILABLE: {
    title: 'Technician busy',
    detail: 'Pick a different technician or time.',
    action: 'Pick another technician',
    variant: 'error',
  },
  BOOKING_CONFLICT: {
    title: 'Booking conflict',
    detail: 'The slot is no longer available.',
    variant: 'error',
  },

  // Business rules
  OUTSIDE_BUSINESS_HOURS: {
    title: 'Outside business hours',
    detail: 'The dealership is closed at the requested time.',
    action: 'See hours',
    variant: 'warning',
  },
  DEALERSHIP_CLOSED: {
    title: 'Dealership closed',
    detail: 'No work is scheduled that day.',
    action: 'Pick another date',
    variant: 'warning',
  },
  TECHNICIAN_OFF_SHIFT: {
    title: 'Technician off shift',
    detail: 'They do not work this day.',
    action: 'Pick another technician',
    variant: 'warning',
  },
  TECHNICIAN_LACKS_SKILL: {
    title: 'Skill mismatch',
    detail: "Technician isn't certified for this service.",
    action: 'Pick another technician',
    variant: 'warning',
  },
  INVALID_LOCAL_TIME: {
    title: 'Invalid local time',
    detail: "That time doesn't exist (likely a daylight saving change).",
    action: 'Pick another time',
    variant: 'warning',
  },

  // Lifecycle
  INVALID_STATUS_TRANSITION: {
    title: 'Already finalized',
    detail: 'This appointment can no longer be modified.',
    variant: 'info',
  },
  PRECONDITION_FAILED: {
    title: 'Modified by someone else',
    detail: 'Refresh to see the latest version, then retry.',
    action: 'Refresh and retry',
    variant: 'warning',
  },

  // Idempotency
  IDEMPOTENCY_KEY_REQUIRED: {
    title: 'Missing idempotency key',
    detail: 'The request was rejected because no key was sent.',
    variant: 'error',
  },
  IDEMPOTENCY_KEY_CONFLICT: {
    title: 'Duplicate request',
    detail: 'This idempotency key was used with a different body.',
    variant: 'error',
  },
  IF_MATCH_REQUIRED: {
    title: 'Missing version',
    detail: 'The request was rejected because no If-Match version was sent.',
    variant: 'error',
  },

  // Auth
  INVALID_CREDENTIALS: {
    title: 'Wrong email or password',
    detail: 'Check your credentials and try again.',
    variant: 'error',
  },
  ACCOUNT_LOCKED: {
    title: 'Account locked',
    detail: 'Too many failed sign-in attempts. Try again in 30 minutes.',
    variant: 'error',
  },
  TOKEN_INVALID: {
    title: 'Session expired',
    detail: 'Sign in again to continue.',
    variant: 'info',
  },
  TOKEN_REVOKED: {
    title: 'Session revoked',
    detail: 'Suspicious activity detected. Sign in again.',
    variant: 'error',
  },

  // Limits
  RATE_LIMIT_EXCEEDED: {
    title: 'Too many requests',
    detail: 'Slow down for a minute and try again.',
    variant: 'warning',
  },

  // GDPR
  ALREADY_ANONYMIZED: {
    title: 'Already anonymized',
    detail: 'This customer has already been redacted.',
    variant: 'info',
  },
};

export function lookupError(code: string | undefined): ErrorUI {
  if (!code) return FALLBACK;
  return MAP[code] ?? FALLBACK;
}

/**
 * Look up an ErrorUI from a full ApiClientError. Unlike `lookupError(code)`, this
 * surfaces the server's `message`/`detail` for known passthrough codes
 * (validation, not-found, internal) instead of the bland "Something went wrong"
 * fallback. For totally unknown codes, it still falls back gracefully.
 */
export function lookupErrorFromResponse(err: ApiClientError): ErrorUI {
  const code = err.body.code;
  if (code && MAP[code]) return MAP[code];

  const serverDetail =
    typeof err.body.message === 'string' && err.body.message.trim().length > 0
      ? err.body.message
      : typeof err.body.detail === 'string' && err.body.detail.trim().length > 0
        ? err.body.detail
        : null;

  if (code && PASSTHROUGH_CODES.has(code) && serverDetail) {
    return {
      title: titleForCode(code),
      detail: serverDetail,
      variant: code === 'INTERNAL_ERROR' || code === 'ERROR' ? 'error' : 'warning',
    };
  }

  // Last-resort: still better than the bland fallback if the server gave us text.
  if (serverDetail) {
    return {
      title: code ? `${code.replace(/_/g, ' ').toLowerCase()}` : FALLBACK.title,
      detail: serverDetail,
      variant: 'error',
    };
  }
  return FALLBACK;
}

function titleForCode(code: string): string {
  switch (code) {
    case 'VALIDATION_FAILED':
      return 'Invalid input';
    case 'BAD_REQUEST':
    case 'INVALID_REQUEST':
      return 'Bad request';
    case 'IF_MATCH_INVALID':
      return 'Invalid version header';
    case 'INVALID_CURSOR':
      return 'Invalid cursor';
    case 'APPOINTMENT_NOT_FOUND':
      return 'Appointment not found';
    case 'DEALERSHIP_NOT_FOUND':
      return 'Dealership not found';
    case 'SERVICE_TYPE_NOT_FOUND':
      return 'Service type not found';
    case 'CUSTOMER_NOT_FOUND':
      return 'Customer not found';
    case 'VEHICLE_NOT_FOUND':
      return 'Vehicle not found';
    case 'NOT_FOUND':
      return 'Not found';
    case 'INSERT_RETURNED_NO_ROW':
      return 'Database write failed';
    case 'INTERNAL_ERROR':
    case 'ERROR':
      return 'Server error';
    default:
      return 'Request failed';
  }
}

export function errorToToast(err: ApiClientError): {
  title: string;
  detail: string;
  variant: 'error' | 'warning' | 'info' | 'success';
} {
  const ui = lookupErrorFromResponse(err);
  return { title: ui.title, detail: ui.detail, variant: ui.variant };
}
