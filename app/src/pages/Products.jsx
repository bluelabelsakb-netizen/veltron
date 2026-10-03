import { Package, AlertTriangle, TrendingDown, Layers } from 'lucide-react';
import { ResourcePage } from '../components/ResourcePage.jsx';
import { money, number, dateFmt } from '../lib/api.js';

export default function Products() {
  return (
    <ResourcePage
      emptyIcon={Package}
      endpoint="/products"
      title="Ürün ve Malzeme"
      description="Stok kartları, minimum seviyeler ve birim fiyatlar"
      createLabel="Yeni Ürün"
      searchPlaceholder="Ürün adı, k stok kodu veya kategori ara..."
      defaultSort={{ key: 'name', dir: 'asc' }}
      csvName="veltron-urunler"
      fields={[
        { name: 'name', label: 'Ürün adı', required: true, span: 2, placeholder: 'Örn. Endüstriyel Elektrik Panosu' },
        { name: 'sku', label: 'Stok kodu', placeholder: 'VTR-ELK-001' },
        { name: 'category', label: 'Kategori' },
        { name: 'unit', label: 'Birim', defaultValue: 'Adet', hint: 'Adet, Rulo, Kg, Mt, Litre...' },
        { name: 'min_stock', label: 'Minimum stok', type: 'number', min: 0, step: '0.01', hint: 'Bu seviyeye düşünce uyarı verir' },
        { name: 'unit_price', label: 'Birim fiyat (₺)', type: 'money', min: 0 },
        { name: 'initial_stock', label: 'Açılış stoğu', type: 'number', min: 0, step: '0.01', hint: 'Yalnızca yeni ürün oluşturulurken' },
        { name: 'location', label: 'Depo / raf konumu' },
        { name: 'notes', label: 'Notlar', type: 'textarea', span: 2, rows: 2 },
        { name: 'is_active', label: 'Aktif ürün', type: 'checkbox', defaultValue: 1 },
      ]}
      sections={[
        { title: 'Ürün', fields: ['name', 'sku', 'category', 'unit'] },
        { title: 'Stok ve fiyat', fields: ['min_stock', 'unit_price', 'initial_stock', 'location'] },
        { title: 'Diğer', fields: ['notes', 'is_active'] },
      ]}
      columns={[
        {
          key: 'name',
          header: 'Ürün',
          sortKey: 'name',
          render: (r) => (
            <div>
              <div className="cell-strong">{r.name}</div>
              <div className="cell-dim">
                {r.sku ? <span className="mono">{r.sku}</span> : '—'}
                {r.category ? ` · ${r.category}` : ''}
              </div>
            </div>
          ),
        },
        {
          key: 'stock',
          header: 'Stok',
          sortKey: 'stock',
          align: 'right',
          width: 140,
          render: (r) => (
            <div>
              <div className={`money ${Number(r.stock) <= 0 ? 'neg' : r.is_low_stock ? '' : 'pos'}`}>
                {number(r.stock)} {r.unit}
              </div>
              <div style={{ marginTop: 4, width: 100, marginLeft: 'auto' }}>
                <div className="progress">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${r.min_stock > 0 ? Math.min((Number(r.stock) / Number(r.min_stock)) * 100, 100) : 100}%`,
                      background:
                        Number(r.stock) <= 0
                          ? 'var(--danger)'
                          : r.is_low_stock
                            ? 'var(--warning)'
                            : 'var(--success)',
                    }}
                  />
                </div>
                <div className="text-dim" style={{ fontSize: 10.5, textAlign: 'right', marginTop: 3 }}>
                  min. {number(r.min_stock)}
                </div>
              </div>
            </div>
          ),
          csv: (r) => r.stock,
        },
        {
          key: 'unit_price',
          header: 'Birim fiyat',
          sortKey: 'unit_price',
          align: 'right',
          width: 112,
          render: (r) => <span className="money">{money(r.unit_price)}</span>,
        },
        {
          key: 'stock_value',
          header: 'Stok değeri',
          align: 'right',
          width: 116,
          render: (r) => <span className="money cell-muted">{money(r.stock_value)}</span>,
          csv: (r) => r.stock_value,
        },
        {
          key: 'location',
          header: 'Konum',
          width: 108,
          render: (r) => <span className="cell-dim">{r.location || '-'}</span>,
        },
        {
          key: 'is_active',
          header: 'Durum',
          width: 96,
          render: (r) => (
            <div className="row" style={{ gap: 5 }}>
              {!r.is_active ? <span className="badge muted">Pasif</span> : null}
              {Number(r.stock) <= 0 ? (
                <span className="badge danger">Tükendi</span>
              ) : r.is_low_stock ? (
                <span className="badge warning">Kritik</span>
              ) : (
                <span className="badge success">Yeterli</span>
              )}
            </div>
          ),
          csv: (r) => (!r.is_active ? 'Pasif' : Number(r.stock) <= 0 ? 'Tükendi' : r.is_low_stock ? 'Kritik' : 'Yeterli'),
        },
      ]}
      filters={[
        { name: 'low_stock', label: 'Tüm stoklar', options: [{ value: 'true', label: 'Sadece kritik/eksik' }] },
        { name: 'is_active', label: 'Tüm durumlar', options: [
          { value: 'true', label: 'Sadece aktifler' },
          { value: 'false', label: 'Sadece pasifler' },
        ] },
      ]}
      deleteMessage={(r) =>
        r.movement_count
          ? `"${r.name}" ürünü pasifleştirilecek.\n\nStok hareketi olduğu için kalıcı olarak silinmez.`
          : `"${r.name}" ürünü ve tüm stok verisi kalıcı olarak silinecek.\n\nBu işlem geri alınamaz.`
      }
    />
  );
}
