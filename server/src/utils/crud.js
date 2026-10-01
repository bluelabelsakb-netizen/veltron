import { Router } from 'express';
import { query, get, run, scalar } from '../db.js';
import { logActivity } from './activity.js';
import { wrap, notFound, conflict, pagination, safeSort } from './http.js';

/**
 * Basit varliklar icin tam CRUD router'i uretir.
 *
 * @param {object}   o
 * @param {string}   o.table          tablo adi
 * @param {string}   o.entity         aktivite logu icin insan-okur ad
 * @param {import('zod').ZodTypeAny} o.schema  olusturma dogrulama semasi
 * @param {string[]} [o.creatable]    yazilabilir sutunlar (varsayilan: sema anahtarlari)
 * @param {string[]} [o.editable]     guncellenebilir sutunlar (varsayilan: creatable)
 * @param {string[]} [o.search]       serbest metin arama sutunlari
 * @param {Record<string,string>} [o.filters]     query parami -> tam eslesme sutunu
 * @param {Record<string,string>} [o.dateBefore] query parami -> "sutun <= deger"
 * @param {Record<string,string>} [o.dateAfter]  query parami -> "sutun >= deger"
 * @param {Record<string,string>} [o.numbers]    query parami -> "sutun >= deger" (sayisal)
 * @param {Record<string,string>} [o.sort]       sort anahtari -> kolon
 * @param {string}   [o.defaultSort]
 * @param {string}   [o.listSelect]   ozel SELECT ifadesi
 * @param {string}   [o.listFrom]     ozel FROM (JOIN'lu)
 * @param {string}   [o.getSelect]    ozel SELECT (tek kayit)
 * @param {string}   [o.getFrom]      ozel FROM (tek kayit)
 * @param {string}   [o.alias]        tablo takma adi (varsayilan: table)
 * @param {(row:object)=>string} [o.describe] aktivite logu icin okunur etiket
 * @param {(body:object, req:object)=>object} [o.beforeCreate]
 * @param {(row:object)=>object} [o.afterCreate]
 * @param {(body:object, row:object)=>object} [o.beforeUpdate]
 * @param {(id:number, row:object)=>void} [o.onDelete]
 * @param {string[]} [o.inactiveFields] DELETE yerine pasiflestirilecek boolean sutunlar
 */
export function createCrudRouter(o) {
  const {
    table,
    entity,
    schema,
    creatable,
    editable,
    search = [],
    filters = {},
    dateBefore = {},
    dateAfter = {},
    numbers = {},
    sort = {},
    defaultSort = 'id DESC',
    listSelect,
    listFrom,
    getSelect,
    getFrom,
    alias = table,
    describe = (row) => row?.name ?? row?.title ?? `#${row?.id}`,
    beforeCreate,
    afterCreate,
    beforeUpdate,
    onDelete,
    inactiveFields = [],
  } = o;

  const writeCols = creatable ?? Object.keys(schema.shape);
  const updateCols = editable ?? writeCols;
  const sel = listSelect ?? `${alias}.*`;
  const from = listFrom ?? `${table} ${alias}`;
  const oneSel = getSelect ?? sel;
  const oneFrom = getFrom ?? from;
  const ref = (col) => (col.includes('.') ? col : `${alias}.${col}`);

  const router = Router();

  /** WHERE parcalarini ve degerlerini kurar. */
  function buildWhere(q) {
    const clauses = [];
    const params = [];

    const term = String(q.search ?? '').trim();
    if (term && search.length) {
      clauses.push(`(${search.map((c) => `CAST(${ref(c)} AS TEXT) LIKE ?`).join(' OR ')})`);
      search.forEach(() => params.push(`%${term}%`));
    }

    for (const [param, column] of Object.entries(filters)) {
      const value = q[param];
      if (value === undefined || value === '' || value === 'all') continue;
      // Boolean sutunlar SQLite'ta 1/0 olarak tutulur; arayuz 'true'/'false' gonderir.
      if (value === 'true' || value === 'false') {
        clauses.push(`${ref(column)} = ?`);
        params.push(value === 'true' ? 1 : 0);
        continue;
      }
      const values = String(value).split(',').map((v) => v.trim()).filter(Boolean);
      clauses.push(`${ref(column)} IN (${values.map(() => '?').join(',')})`);
      params.push(...values);
    }

    for (const [param, column] of Object.entries(dateBefore)) {
      const value = q[param];
      if (!value) continue;
      clauses.push(`${ref(column)} IS NOT NULL AND ${ref(column)} <= ?`);
      params.push(String(value));
    }

    for (const [param, column] of Object.entries(dateAfter)) {
      const value = q[param];
      if (!value) continue;
      clauses.push(`${ref(column)} IS NOT NULL AND ${ref(column)} >= ?`);
      params.push(String(value));
    }

    for (const [param, column] of Object.entries(numbers)) {
      const value = Number(q[param]);
      if (!Number.isFinite(value)) continue;
      clauses.push(`${ref(column)} >= ?`);
      params.push(value);
    }

    return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
  }

  // ---- Liste ---------------------------------------------------------
  router.get(
    '/',
    wrap((req, res) => {
      const { limit, offset } = pagination(req.query);
      const { sql: where, params } = buildWhere(req.query);
      const orderBy = safeSort(req.query.sort, sort, defaultSort);

      const total = Number(scalar(`SELECT COUNT(*) FROM ${from} ${where}`, params) ?? 0);
      const rows = query(
        `SELECT ${sel} FROM ${from} ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      res.json({ data: rows, total, limit, offset });
    })
  );

  // ---- Tek kayit -----------------------------------------------------
  router.get(
    '/:id',
    wrap((req, res) => {
      const row = get(`SELECT ${oneSel} FROM ${oneFrom} WHERE ${alias}.id = ?`, [req.params.id]);
      if (!row) throw notFound(`${entity} bulunamadi`);
      res.json({ data: row });
    })
  );

  // ---- Olustur -------------------------------------------------------
  router.post(
    '/',
    wrap((req, res) => {
      let body = schema.parse(req.body ?? {});
      if (beforeCreate) body = beforeCreate(body, req);

      const cols = writeCols.filter((c) => body[c] !== undefined);
      if (!cols.length) throw conflict('Kaydedilecek veri yok');

      const { lastInsertRowid } = run(
        `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        cols.map((c) => normalize(body[c]))
      );

      const row = get(`SELECT ${oneSel} FROM ${oneFrom} WHERE ${alias}.id = ?`, [lastInsertRowid]);
      logActivity({
        userId: req.user?.id ?? null,
        action: 'create',
        entity,
        entityId: lastInsertRowid,
        detail: `${entity} olusturuldu: ${describe(row)}`,
      });
      if (afterCreate) afterCreate(row, req);

      res.status(201).json({ data: row });
    })
  );

  // ---- Guncelle ------------------------------------------------------
  router.put(
    '/:id',
    wrap((req, res) => {
      const id = Number(req.params.id);
      const existing = get(`SELECT ${alias}.* FROM ${oneFrom} WHERE ${alias}.id = ?`, [id]);
      if (!existing) throw notFound(`${entity} bulunamadi`);

      let body = schema.partial().parse(req.body ?? {});
      if (beforeUpdate) body = beforeUpdate(body, existing);

      const cols = updateCols.filter((c) => body[c] !== undefined);
      if (cols.length) {
        run(
          `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
          [...cols.map((c) => normalize(body[c])), id]
        );
      }

      const row = get(`SELECT ${oneSel} FROM ${oneFrom} WHERE ${alias}.id = ?`, [id]);
      logActivity({
        userId: req.user?.id ?? null,
        action: 'update',
        entity,
        entityId: id,
        detail: `${entity} guncellendi: ${describe(row)}`,
      });

      res.json({ data: row });
    })
  );

  // ---- Sil (veya pasiflestir) ---------------------------------------
  router.delete(
    '/:id',
    wrap((req, res) => {
      const id = Number(req.params.id);
      const existing = get(`SELECT ${alias}.* FROM ${oneFrom} WHERE ${alias}.id = ?`, [id]);
      if (!existing) throw notFound(`${entity} bulunamadi`);

      const label = describe(existing);

      if (inactiveFields.length) {
        run(
          `UPDATE ${table} SET ${inactiveFields.map((c) => `${c} = 0`).join(', ')} WHERE id = ?`,
          [id]
        );
        logActivity({
          userId: req.user?.id ?? null,
          action: 'update',
          entity,
          entityId: id,
          detail: `${entity} pasiflestirildi: ${label}`,
        });
        return res.json({ data: { id, archived: true } });
      }

      if (onDelete) onDelete(id, existing);
      run(`DELETE FROM ${table} WHERE id = ?`, [id]);
      logActivity({
        userId: req.user?.id ?? null,
        action: 'delete',
        entity,
        entityId: id,
        detail: `${entity} silindi: ${label}`,
      });

      res.json({ data: { id, deleted: true } });
    })
  );

  return router;
}

/** SQLite'a yazmadan once degeri normalize eder. */
function normalize(value) {
  if (value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}
