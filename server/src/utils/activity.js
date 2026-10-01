import { run } from '../db.js';

/**
 * Aktivite loglar. Hatalari yutmaz; loglama asla islemi bozmamalidir.
 * @param {object} p
 * @param {number|null} p.userId
 * @param {'create'|'update'|'delete'|'login'|'logout'} p.action
 * @param {string} [p.entity]
 * @param {number|null} [p.entityId]
 * @param {string} [p.detail]
 */
export function logActivity({ userId = null, action, entity = null, entityId = null, detail = null }) {
  try {
    run(
      'INSERT INTO activity_log (user_id, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?)',
      [userId, action, entity, entityId, detail]
    );
  } catch (err) {
    console.warn('[activity] kaydedilemedi:', err.message);
  }
}
