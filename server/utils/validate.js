export class ApiError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function assert(condition, status, code, message, details) {
  if (!condition) throw new ApiError(status, code, message, details);
}

export function requireJson(req, _res, next) {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json')) {
    return next(new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send this request as application/json.'));
  }
  return next();
}

export function text(value, { field = 'text', min = 1, max = 4000, trim = true } = {}) {
  assert(typeof value === 'string', 422, 'VALIDATION_ERROR', `${field} must be text.`);
  const output = trim ? value.trim() : value;
  assert(output.length >= min, 422, 'VALIDATION_ERROR', `${field} must be at least ${min} character${min === 1 ? '' : 's'}.`);
  assert(output.length <= max, 422, 'VALIDATION_ERROR', `${field} must be ${max} characters or fewer.`);
  return output;
}

export function optionalText(value, options = {}) {
  if (value === undefined || value === null) return undefined;
  return text(value, options);
}

export function integer(value, { field = 'value', min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10);
  assert(Number.isInteger(parsed), 422, 'VALIDATION_ERROR', `${field} must be an integer.`);
  assert(parsed >= min && parsed <= max, 422, 'VALIDATION_ERROR', `${field} must be between ${min} and ${max}.`);
  return parsed;
}

export function oneOf(value, allowed, field = 'value') {
  assert(allowed.includes(value), 422, 'VALIDATION_ERROR', `${field} must be one of: ${allowed.join(', ')}.`);
  return value;
}

export function boolean(value, { field = 'value' } = {}) {
  assert(typeof value === 'boolean', 422, 'VALIDATION_ERROR', `${field} must be true or false.`);
  return value;
}

export function recordBody(body) {
  assert(body && typeof body === 'object' && !Array.isArray(body), 400, 'BAD_REQUEST', 'A JSON object body is required.');
  return body;
}

export function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}
