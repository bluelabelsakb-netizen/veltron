import { Plus, Trash2 } from 'lucide-react';
import { useLookups } from '../context/LookupsContext.jsx';
import { money } from '../lib/api.js';

/**
 * Belge kalemleri duzenleyici (teklif / fatura ortak).
 * Kalem toplamlari ve KDV asagida hesaplanir.
 */
export function ItemsEditor({ items, onChange, productOptions, readOnly = false, discount, taxRate, onDiscountChange, onTaxRateChange, showTotals = true }) {
  const update = (index, patch) => {
    onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  };

  const remove = (index) => onChange(items.filter((_, i) => i !== index));

  const add = () =>
    onChange([
      ...items,
      { product_id: null, description: '', quantity: 1, unit: 'Adet', unit_price: 0 },
    ]);

  /** Urun secildiginde aciklama, birim ve fiyat otomatik dolar. */
  const pickProduct = (index, productId) => {
    const p = productOptions.find((x) => String(x.value) === String(productId));
    if (!p) {
      update(index, { product_id: null });
      return;
    }
    update(index, {
      product_id: p.value,
      description: items[index].description || p.label,
      unit: items[index].unit || p.unit || 'Adet',
      unit_price: items[index].unit_price || p.unit_price || 0,
    });
  };

  const subtotal = items.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unit_price || 0), 0);
  const disc = Number(discount || 0);
  const taxable = Math.max(subtotal - disc, 0);
  const rate = Number(taxRate || 0);
  const tax = (taxable * rate) / 100;
  const total = taxable + tax;

  return (
    <div>
      <div className="table-scroll">
        <table className="items-table">
          <thead>
            <tr>
              <th style={{ width: '26%' }}>Ürün / Açıklama</th>
              <th style={{ width: 92 }}>Miktar</th>
              <th style={{ width: 78 }}>Birim</th>
              <th style={{ width: 118, textAlign: 'right' }}>Birim fiyat</th>
              <th style={{ width: 116, textAlign: 'right' }}>Tutar</th>
              {!readOnly ? <th style={{ width: 36 }} /> : null}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={readOnly ? 5 : 6} style={{ textAlign: 'center', padding: '20px 0' }}>
                  <span className="text-dim text-sm">Henüz kalem eklenmedi</span>
                </td>
              </tr>
            ) : (
              items.map((item, index) => (
                <tr key={index}>
                  <td>
                    {readOnly ? (
                      <div>
                        {item.description}
                        {item.product_sku ? <div className="cell-dim mono">{item.product_sku}</div> : null}
                      </div>
                    ) : (
                      <div className="stack" style={{ gap: 5 }}>
                        <select
                          className="select"
                          value={item.product_id ?? ''}
                          onChange={(e) => pickProduct(index, e.target.value)}
                        >
                          <option value="">— Serbest satır —</option>
                          {productOptions.map((p) => (
                            <option key={p.value} value={p.value}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                        <input
                          className="input"
                          value={item.description || ''}
                          onChange={(e) => update(index, { description: e.target.value })}
                          placeholder="Açıklama"
                        />
                      </div>
                    )}
                  </td>
                  <td>
                    {readOnly ? (
                      Number(item.quantity).toLocaleString('tr-TR')
                    ) : (
                      <input
                        type="number"
                        className="input"
                        min="0"
                        step="0.01"
                        value={item.quantity ?? 1}
                        onChange={(e) => update(index, { quantity: e.target.value })}
                      />
                    )}
                  </td>
                  <td>
                    {readOnly ? (
                      item.unit || '-'
                    ) : (
                      <input
                        className="input"
                        value={item.unit || ''}
                        onChange={(e) => update(index, { unit: e.target.value })}
                      />
                    )}
                  </td>
                  <td className="col-num">
                    {readOnly ? (
                      money(item.unit_price)
                    ) : (
                      <input
                        type="number"
                        className="input"
                        min="0"
                        step="0.01"
                        style={{ textAlign: 'right' }}
                        value={item.unit_price ?? 0}
                        onChange={(e) => update(index, { unit_price: e.target.value })}
                      />
                    )}
                  </td>
                  <td className="col-num money">
                    {money(Number(item.quantity || 0) * Number(item.unit_price || 0))}
                  </td>
                  {!readOnly ? (
                    <td>
                      <button
                        className="btn btn-sm btn-icon"
                        title="Kalemi sil"
                        onClick={() => remove(index)}
                        disabled={items.length === 1}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!readOnly ? (
        <button className="btn btn-sm mt-0" style={{ marginTop: 10 }} onClick={add}>
          <Plus size={13} />
          Kalem ekle
        </button>
      ) : null}

      {showTotals ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <div style={{ width: 290 }}>
            {!readOnly ? (
              <div className="row" style={{ gap: 10, marginBottom: 9 }}>
                <div className="field" style={{ flex: 1 }}>
                  <label className="field-label">İndirim (₺)</label>
                  <input
                    type="number"
                    className="input"
                    min="0"
                    step="0.01"
                    value={discount ?? 0}
                    onChange={(e) => onDiscountChange?.(e.target.value)}
                  />
                </div>
                <div className="field" style={{ width: 96 }}>
                  <label className="field-label">KDV %</label>
                  <input
                    type="number"
                    className="input"
                    min="0"
                    step="1"
                    value={taxRate ?? 0}
                    onChange={(e) => onTaxRateChange?.(e.target.value)}
                  />
                </div>
              </div>
            ) : null}

            <div className="stat-row">
              <span className="label">Ara toplam</span>
              <span className="value">{money(subtotal)}</span>
            </div>
            {disc > 0 ? (
              <div className="stat-row">
                <span className="label">İndirim</span>
                <span className="value money neg">-{money(disc)}</span>
              </div>
            ) : null}
            <div className="stat-row">
              <span className="label">KDV (%{rate})</span>
              <span className="value">{money(tax)}</span>
            </div>
            <div className="stat-row total">
              <span className="label">Genel toplam</span>
              <span className="value money">{money(total)}</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
