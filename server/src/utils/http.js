/** HTTP hata sinifi. Durum kodu ile birlikte firlatilir. */
export class HttpError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg = 'Gecersiz istek', details) => new HttpError(400, msg, details);
export const unauthorized = (msg = 'Oturum gerekli') => new HttpError(401, msg);
export const forbidden = (msg = 'Yetkiniz yok') => new HttpError(403, msg);
export const notFound = (msg = 'Kayit bulunamadi') => new HttpError(404, msg);
export const conflict = (msg = 'Kayit zaten mevcut') => new HttpError(409, msg);

/** Async route handler sarmalayici (Express 4 icin gerekli). */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Liste sorgusu icin sayfalama parametrelerini normalize eder.
 * @returns {{limit:number, offset:number}}
 */
export function pagination(query, { defaultLimit = 50, maxLimit = 500 } = {}) {
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || defaultLimit, 1), maxLimit);
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  return { limit, offset: (page - 1) * limit };
}

/**
 * Beyaz listeye gore ORDER BY dizesi uretir (SQL injection korumasi).
 * @param {string|undefined} requested
 * @param {Record<string,string>} allowed  orn. { name: 'customers.name' }
 * @param {string} fallback
 */
export function safeSort(requested, allowed, fallback = 'id DESC') {
  if (!requested) return fallback;
  const [field, dirRaw] = String(requested).split(':');
  const column = allowed[field];
  if (!column) return fallback;
  const dir = String(dirRaw).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return `${column} ${dir}`;
}
