import { useState, useEffect } from 'react';
import { Shield, KeyRound, Ban } from 'lucide-react';
import { ResourcePage } from '../components/ResourcePage.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { api } from '../lib/api.js';
import { dateTimeFmt, initials, STATUS_LABELS } from '../lib/api.js';
import { Modal } from '../components/Modal.jsx';
import { FormField, useFormState } from '../components/Form.jsx';

const CUSTOMER_ROLES = ['customer_progress', 'customer_finance'];

export default function Users() {
  const { user: me, refreshUser } = useAuth();
  const toast = useToast();
  const [resetting, setResetting] = useState(null);
  // Musteri portali icin musteri secimi gerekli.
  const [customers, setCustomers] = useState([]);

  useEffect(() => {
    api
      .get('/customers', { is_active: 'true', limit: 300 })
      .then((r) => setCustomers(r.data || []))
      .catch(() => setCustomers([]));
  }, []);

  return (
    <>
      <ResourcePage
        emptyIcon={Shield}
        endpoint="/users"
        title="Kullanıcılar"
        description="Sisteme erişimi olan hesaplar ve yetkileri"
        createLabel="Yeni Kullanıcı"
        searchPlaceholder="Ad, kullanıcı adı veya e-posta ara..."
        defaultSort={{ key: 'name', dir: 'asc' }}
        csvName="veltron-kullanicilar"
        fields={[
          { name: 'full_name', label: 'Ad soyad', required: true },
          { name: 'username', label: 'Kullanıcı adı', required: true, hint: 'Küçük harf, rakam, nokta, tire ve alt çizgi' },
          { name: 'email', label: 'E-posta', type: 'email' },
          { name: 'role', label: 'Yetki', type: 'select', options: [
            { value: 'user', label: 'Personel' },
            { value: 'admin', label: 'Yönetici' },
            { value: 'customer_progress', label: 'Müşteri - İş Takip' },
            { value: 'customer_finance', label: 'Müşteri - Mali' },
          ], defaultValue: 'user', hint: 'Müşteri hesapları sadece kendi portalını görür' },
          {
            name: 'customer_id',
            label: 'Müşteri',
            type: 'select',
            span: 2,
            options: [
              { value: '', label: '— seçilmedi —' },
              ...customers.map((c) => ({ value: c.id, label: c.company || c.title })),
            ],
            hint: 'Müşteri rolü seçildiğinde zorunludur. Bu hesap yalnızca bu müşterinin verisini görür.',
          },
          { name: 'is_active', label: 'Hesap aktif', type: 'checkbox', defaultValue: 1 },
        ]}
        sections={[{ title: 'Hesap', fields: ['full_name', 'username', 'email', 'role', 'customer_id', 'is_active'] }]}
        columns={[
          {
            key: 'full_name',
            header: 'Kullanıcı',
            sortKey: 'name',
            render: (r) => (
              <div className="row" style={{ gap: 9 }}>
                <div className="avatar" style={{ width: 28, height: 28, fontSize: 11 }}>
                  {initials(r.full_name)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="cell-strong truncate">
                    {r.full_name}
                    {r.id === me?.id ? <span className="text-dim" style={{ fontWeight: 400 }}> (siz)</span> : null}
                  </div>
                  <div className="cell-dim mono">{r.username}</div>
                </div>
              </div>
            ),
          },
          { key: 'email', header: 'E-posta', render: (r) => <span className="cell-muted">{r.email || '-'}</span> },
          {
            key: 'role',
            header: 'Yetki',
            sortKey: 'role',
            width: 150,
            render: (r) => (
              <span
                className={`badge ${
                  r.role === 'admin'
                    ? 'purple'
                    : CUSTOMER_ROLES.includes(r.role)
                      ? 'warning'
                      : 'info'
                }`}
              >
                {STATUS_LABELS[r.role] || r.role}
              </span>
            ),
            csv: (r) => STATUS_LABELS[r.role] || r.role,
          },
          ...(me?.role === 'admin'
            ? [
                {
                  key: 'customer_company',
                  header: 'Bağlı müşteri',
                  render: (r) =>
                    CUSTOMER_ROLES.includes(r.role) ? (
                      <span className="cell-muted">{r.customer_company || r.customer_title || '—'}</span>
                    ) : (
                      <span className="cell-dim">—</span>
                    ),
                  csv: (r) => (CUSTOMER_ROLES.includes(r.role) ? r.customer_company || '' : ''),
                },
              ]
            : []),
          {
            key: 'is_active',
            header: 'Durum',
            width: 96,
            render: (r) => (
              <span className={`badge ${r.is_active ? 'success' : 'muted'}`}>{r.is_active ? 'Aktif' : 'Pasif'}</span>
            ),
            csv: (r) => (r.is_active ? 'Aktif' : 'Pasif'),
          },
          {
            key: 'last_login_at',
            header: 'Son giriş',
            sortKey: 'last_login',
            width: 138,
            render: (r) => <span className="cell-dim nowrap">{r.last_login_at ? dateTimeFmt(r.last_login_at) : 'Hiç girmemiş'}</span>,
            csv: (r) => r.last_login_at || '',
          },
          {
            key: 'created_at',
            header: 'Oluşturma',
            sortKey: 'createdAt',
            width: 104,
            render: (r) => <span className="cell-dim">{dateTimeFmt(r.created_at)}</span>,
          },
        ]}
        filters={[
          { name: 'role', label: 'Tüm yetkiler', options: [
            { value: 'admin', label: 'Yöneticiler' },
            { value: 'user', label: 'Kullanıcılar' },
          ] },
          { name: 'is_active', label: 'Tüm durumlar', options: [
            { value: 'true', label: 'Aktif hesaplar' },
            { value: 'false', label: 'Pasif hesaplar' },
          ] },
        ]}
        // Kullanici eklemede sifre alani gerekir; kaydetmeden once sorulur.
        toPayload={(values) => {
          const password = window.prompt(`${values.full_name} için başlangıç şifresi belirleyin (en az 6 karakter):`);
          if (!password) throw new Error('Şifre girilmediği için kayıt iptal edildi.');
          return { ...values, password };
        }}
        rowActions={(row) => (
          <button
            className="btn btn-sm btn-icon"
            title="Şifre sıfırla"
            onClick={() => setResetting(row)}
          >
            <KeyRound size={14} />
          </button>
        )}
        deleteMessage={(r) =>
          `"${r.full_name}" hesabı devre dışı bırakılacak.\n\nHesap silinmez; giriş yapılamaz ama geçmiş kayıtları korunur.`
        }
      />

      {resetting ? (
        <ResetPasswordModal
          user={resetting}
          onClose={() => setResetting(null)}
          onDone={() => {
            setResetting(null);
            toast.success('Şifre sıfırlandı', `${resetting.full_name} yeni şifresiyle giriş yapabilir.`);
          }}
        />
      ) : null}
    </>
  );
}

function ResetPasswordModal({ user, onClose, onDone }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const fields = [
    { name: 'password', label: 'Yeni şifre', type: 'password', required: true, span: 2, hint: 'En az 6 karakter' },
  ];
  const form = useFormState(fields, {});

  const save = async () => {
    const values = form.submit();
    if (!values) return;
    setBusy(true);
    try {
      await api.post(`/users/${user.id}/reset-password`, values);
      onDone();
    } catch (err) {
      toast.fromError(err, 'Şifre sıfırlanamadı');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Şifre sıfırla"
      subtitle={user.full_name}
      size="sm"
      footer={
        <>
          <div className="spacer" />
          <button className="btn" onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Kaydediliyor...' : 'Sıfırla'}
          </button>
        </>
      }
    >
      <div className="alert warning">
        <Ban size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Yeni şifreyi kullanıcıya güvenli bir kanaldan iletin. Kullanıcı ilk girişte şifresini değiştirebilir.
        </span>
      </div>
      <div className="form-grid">
        {fields.map((f) => (
          <FormField
            key={f.name}
            field={f}
            value={form.values[f.name]}
            error={form.errors[f.name]}
            onChange={(v) => form.setValue(f.name, v)}
            disabled={busy}
          />
        ))}
      </div>
    </Modal>
  );
}
