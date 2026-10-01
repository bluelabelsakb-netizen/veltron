import { Building2, MapPin, Phone, Users } from 'lucide-react';
import { ResourcePage } from '../components/ResourcePage.jsx';
import { dateFmt, money } from '../lib/api.js';
import { CUSTOMER_TYPE_OPTIONS } from '../lib/api.js';
import { StatusBadge } from '../components/StatusBadge.jsx';

export default function Customers() {
  return (
    <ResourcePage
      emptyIcon={Building2}
      endpoint="/customers"
      title="Müşteriler"
      description="Bayi ve şahıs müşteriler, vergi bilgileri ve iletişim kayıtları"
      createLabel="Yeni Müşteri"
      searchPlaceholder="Ünvan, yetkili, telefon, vergi no ara..."
      defaultSort={{ key: 'company', dir: 'asc' }}
      csvName="veltron-musteriler"
      fields={[
        { name: 'title', label: 'Müşteri tipi', type: 'select', options: CUSTOMER_TYPE_OPTIONS, required: true, defaultValue: 'Sahis' },
        { name: 'company', label: 'Ünvan', required: true, placeholder: 'Örn. Akdeniz Enerji A.Ş.' },
        { name: 'contact', label: 'Yetkili kişi' },
        { name: 'phone', label: 'Telefon', type: 'tel' },
        { name: 'email', label: 'E-posta', type: 'email' },
        { name: 'tax_number', label: 'Vergi / TC kimlik no' },
        { name: 'tax_office', label: 'Vergi dairesi' },
        { name: 'city', label: 'Şehir' },
        { name: 'address', label: 'Adres', type: 'textarea', span: 2, rows: 2 },
        { name: 'notes', label: 'Notlar', type: 'textarea', span: 2, rows: 3 },
        { name: 'is_active', label: 'Aktif müşteri', type: 'checkbox', defaultValue: 1 },
      ]}
      sections={[
        {
          title: 'Kimlik',
          fields: ['title', 'company', 'contact', 'tax_number', 'tax_office'],
        },
        {
          title: 'İletişim',
          fields: ['phone', 'email', 'city', 'address'],
        },
        {
          title: 'Diğer',
          fields: ['notes', 'is_active'],
        },
      ]}
      columns={[
        {
          key: 'company',
          header: 'Ünvan',
          sortKey: 'company',
          render: (r) => (
            <div>
              <div className="cell-strong">{r.company || r.contact}</div>
              {!r.company && r.contact ? <div className="cell-dim">{r.contact}</div> : null}
            </div>
          ),
          csv: (r) => r.company || r.contact,
        },
        {
          key: 'title',
          header: 'Tip',
          width: 96,
          render: (r) => <span className={`badge ${r.title === 'Bayi' ? 'primary' : 'muted'}`}>{r.title}</span>,
        },
        {
          key: 'contact',
          header: 'Yetkili',
          render: (r) => (
            <div>
              <div>{r.contact || '-'}</div>
              {r.phone ? (
                <div className="cell-dim">
                  <Phone size={10} style={{ verticalAlign: -1, marginRight: 3 }} />
                  {r.phone}
                </div>
              ) : null}
            </div>
          ),
        },
        {
          key: 'city',
          header: 'Şehir',
          sortKey: 'city',
          render: (r) =>
            r.city ? (
              <span className="cell-muted">
                <MapPin size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
                {r.city}
              </span>
            ) : (
              '-'
            ),
        },
        {
          key: 'tax_number',
          header: 'Vergi no',
          render: (r) => <span className="mono">{r.tax_number || '-'}</span>,
        },
        {
          key: 'is_active',
          header: 'Durum',
          width: 90,
          render: (r) => (
            <span className={`badge ${r.is_active ? 'success' : 'muted'}`}>{r.is_active ? 'Aktif' : 'Pasif'}</span>
          ),
          csv: (r) => (r.is_active ? 'Aktif' : 'Pasif'),
        },
        {
          key: 'created_at',
          header: 'Kayıt',
          sortKey: 'createdAt',
          width: 104,
          render: (r) => <span className="cell-dim">{dateFmt(r.created_at)}</span>,
        },
      ]}
      filters={[{ name: 'title', label: 'Tüm tipler', options: CUSTOMER_TYPE_OPTIONS }]}
      deleteMessage={(r) =>
        `"${r.company || r.contact}" pasifleştirilecek.\n\nPasifleştirilen müşteriler geçmiş fatura ve proje kayıtlarıyla bağlantıyı korur, listelerde "Pasif" olarak görünür. Silmek yerine arşivlenir.`
      }
    />
  );
}
