import { z } from 'zod';

/** Bos string'i null'a cevirir (formlarda "temizlenmis" alanlar icin). */
const blankToNull = (v) => (typeof v === 'string' && v.trim() === '' ? null : v);

export const id = z.coerce.number().int().positive().nullable().optional();
export const text = (max = 255) => z.preprocess(blankToNull, z.string().trim().max(max).nullable().optional());
export const requiredText = (max = 255) =>
  z.string({ required_error: 'Zorunlu alan' }).trim().min(1, 'Zorunlu alan').max(max);
export const longText = () => z.preprocess(blankToNull, z.string().max(5000).nullable().optional());
export const num = () => z.preprocess(blankToNull, z.coerce.number().nullable().optional());
export const nonNegNum = () =>
  z.preprocess(blankToNull, z.coerce.number().min(0, 'Negatif olamaz').nullable().optional());
export const bool = () =>
  z.preprocess(
    (v) => (v === 'true' || v === 1 || v === '1' ? 1 : v === 'false' || v === 0 || v === '0' ? 0 : blankToNull(v)),
    z.number().int().min(0).max(1).nullable().optional()
  );
export const date = () =>
  z.preprocess(
    blankToNull,
    z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG biciminde olmali').nullable().optional()
  );
export const dateTime = () =>
  z.preprocess(
    blankToNull,
    z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/, 'Tarih/saat bicimi hatali')
      .nullable()
      .optional()
  );
export const oneOf = (values, fallback) =>
  z.preprocess(
    blankToNull,
    z.enum(values, { errorMap: () => ({ message: `Gecerli degerler: ${values.join(', ')}` }) }).default(fallback)
  );

/** Sayfa/limit parametreleri icin kucuk cozumleyici. */
export const boolQuery = (v) => v === 'true' || v === '1';
