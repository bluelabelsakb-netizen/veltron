import { run, query } from '../db.js';
import { z } from 'zod';
import * as f from './fields.js';

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Kalem satirlarindan ara toplam / KDV / genel toplam hesaplar.
 * @param {{quantity:number, unit_price:number}[]} items
 * @param {number} discount  tutar cinsinden indirim
 * @param {number} taxRate   yuzde KDV
 */
export function calcTotals(items = [], discount = 0, taxRate = 0) {
  const subtotal = round(items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0));
  const disc = round(discount);
  const taxable = round(Math.max(subtotal - disc, 0));
  const rate = Number(taxRate) || 0;
  const tax = round((taxable * rate) / 100);
  return { subtotal, discount: disc, tax_rate: rate, tax, total: round(taxable + tax) };
}

export const itemSchema = z.object({
  product_id: f.id,
  description: f.requiredText(500),
  quantity: z.coerce.number().positive('Miktar 0dan buyuk olmali'),
  unit: f.text(30),
  unit_price: f.nonNegNum().default(0),
  sort_order: z.coerce.number().int().optional(),
});

export const itemsSchema = z.array(itemSchema).default([]);

/**
 * Belge kalemlerini degistirir: once siler, sonra yeniden yazar.
 * @param {'quote_items'|'invoice_items'} table
 * @param {string} fk  'quote_id' | 'invoice_id'
 */
export function replaceItems(table, fk, parentId, items) {
  run(`DELETE FROM ${table} WHERE ${fk} = ?`, [parentId]);
  items.forEach((it, index) => {
    run(
      `INSERT INTO ${table} (${fk}, product_id, description, quantity, unit, unit_price, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        parentId,
        it.product_id ?? null,
        it.description,
        Number(it.quantity) || 1,
        it.unit ?? 'Adet',
        Number(it.unit_price) || 0,
        it.sort_order ?? index,
      ]
    );
  });
}

export function getItems(table, fk, parentId) {
  return query(
    `SELECT i.*, p.sku AS product_sku
       FROM ${table} i
       LEFT JOIN products p ON p.id = i.product_id
      WHERE i.${fk} = ?
      ORDER BY i.sort_order, i.id`,
    [parentId]
  );
}

/** Belge satirlarina toplamlari ekler (API ciktisi icin). */
export function withTotals(doc, items) {
  return { ...doc, items, ...calcTotals(items, doc.discount, doc.tax_rate) };
}
