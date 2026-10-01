/**
 * ŞİFRE SIFIRLAMA TALEPLERİ (yönetici ekranı)
 * ============================================
 * Giriş ekranından gelen "Şifremi Unuttum" taleplerini görür ve onaylar.
 *
 * AKIŞ:
 *   Bekleyen talep  ->  Onayla  ->  sistem GEÇİCİ ŞİFRE üretir
 *                                     kullanıcı ilk girişte değiştirmeye zorlanır
 *                  ->  Reddet   ->  gerekçe yazılır, kullanıcıya bildirilir
 *
 * GÜVENLİK: Yeni şifreyi KULLANICI seçmez. Onaylamak = sistemin geçici şifre
 * üretmesine izin vermek. Bu ekran yalnızca `admin` rolüne açıktır (sunucu
 * `requireAdmin` ile zorlar; ekranda gizlemek güvenlik değildir).
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ShieldCheck, ShieldX, Clock, Copy, Check, KeyRound, RefreshCw, History, Users, Info,
} from 'lucide-react';
import { api, dateTimeFmt, dateTimeAgo } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, EmptyState, Loading } from '../components/Primitives.jsx';
import { Modal } from '../components/Modal.jsx';

const DURUM_ETIKET = {
  pending: { label: 'Bekliyor', className: 'warning', icon: Clock },
  approved: { label: 'Onaylandı', className: 'success', icon: ShieldCheck },
  rejected: { label: 'Reddedildi', className: 'danger', icon: ShieldX },
  fulfilled: { label: 'Tamamlandı', className: 'info', icon: Check },
};

export default function PasswordRequests() {
  const toast = useToast();
  const [bekleyen, setBekleyen] = useState([]);
  const [gecmis, setGecmis] = useState([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [onaylanan, setOnaylanan] = useState(null); // { username, gecici_sifre }
  const [reddedilecek, setReddedilecek] = useState(null);
  const [sekme, setSekme] = useState('bekleyen');

  const yukle = useCallback(async () => {
    try {
      const [b, g] = await Promise.all([
        api.get('/password-reset/pending'),
        api.get('/password-reset/history'),
      ]);
      setBekleyen(b.data || []);
      setGecmis(g.data || []);
    } catch (err) {
      toast.fromError(err, 'Talepler yüklenemedi');
    } finally {
      setYukleniyor(false);
    }
  }, [toast]);

  useEffect(() => {
    yukle();
  }, [yukle]);

  const onayla = async (talep) => {
    try {
      const r = await api.post(`/password-reset/${talep.id}/approve`, {});
      setOnaylanan({ username: r.data.username, gecici_sifre: r.data.gecici_sifre });
      await yukle();
    } catch (err) {
      toast.fromError(err, 'Talep onaylanamadı');
    }
  };

  const reddet = async (talep, gerekce) => {
    try {
      await api.post(`/password-reset/${talep.id}/reject`, { gerekce: gerekce || undefined });
      setReddedilecek(null);
      toast.success('Talep reddedildi');
      await yukle();
    } catch (err) {
      toast.fromError(err, 'Talep reddedilemedi');
    }
  };

  if (yukleniyor) return <Loading label="Talepler yükleniyor..." />;

  return (
    <>
      <PageHeader
        title="Şifre Talepleri"
        description="Giriş ekranından gelen şifremi unuttum talepleri"
        badge={bekleyen.length ? <span className="badge danger">{bekleyen.length}</span> : null}
        actions={
          <button className="btn" onClick={yukle}>
            <RefreshCw size={14} />
            Yenile
          </button>
        }
      />

      <div className="alert info mb-14">
        <ShieldCheck size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          <strong>Bilerek davranın.</strong> Bu listedeki istekler
          <strong> gerçek kullanıcılardan gelmeyebilir</strong>. Onaylarsanız o
          kişi hesaba girer. Emin değilseniz <strong>Reddet</strong> deyin ve
          kullanıcıyı telefonla arayın.
        </span>
      </div>

      {/* Bekleyen */}
      {bekleyen.length ? (
        <div className="card mb-14">
          <div className="card-head">
            <KeyRound size={15} style={{ color: '#f59e0b' }} />
            <h3>Bekleyen Talepler</h3>
            <span className="badge warning">{bekleyen.length}</span>
          </div>
          <div className="card-body">
            <div className="list">
              {bekleyen.map((t) => (
                <div className="list-row" key={t.id}>
                  <div className="grow">
                    <div className="title">
                      {t.username}
                      {t.full_name ? (
                        <span className="text-dim text-sm"> · {t.full_name}</span>
                      ) : null}
                    </div>
                    <div className="meta">
                      {dateTimeAgo(t.created_at)}
                      {t.contact ? ` · ${t.contact}` : ''}
                    </div>
                    {t.note ? (
                      <div
                        className="text-sm text-dim mt-6"
                        style={{ borderLeft: '2px solid var(--border)', paddingLeft: 8 }}
                      >
                        “{t.note}”
                      </div>
                    ) : null}
                  </div>
                  <div className="row" style={{ gap: 7 }}>
                    <button
                      className="btn btn-sm"
                      onClick={() => setReddedilecek(t)}
                    >
                      <ShieldX size={13} />
                      Reddet
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={() => onayla(t)}>
                      <ShieldCheck size={13} />
                      Onayla
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="card mb-14">
          <div className="card-body">
            <EmptyState
              icon={ShieldCheck}
              title="Bekleyen talep yok"
              description="Şifresini unutan kullanıcı giriş ekranından talep bıraktığında burada görünecek."
              compact
            />
          </div>
        </div>
      )}

      {/* Geçmiş */}
      <div className="card">
        <div className="card-head">
          <History size={15} style={{ color: 'var(--text-dim)' }} />
          <h3>İşlem Geçmişi</h3>
          <div className="spacer" />
          <div className="segmented">
            <button
              className={sekme === 'bekleyen' ? 'on' : ''}
              onClick={() => setSekme('bekleyen')}
            >
              Bekleyen ({bekleyen.length})
            </button>
            <button className={sekme === 'gecmis' ? 'on' : ''} onClick={() => setSekme('gecmis')}>
              Geçmiş ({gecmis.length})
            </button>
          </div>
        </div>
        <div className="card-body">
          {sekme === 'gecmis' ? (
            !gecmis.length ? (
              <EmptyState
                icon={History}
                title="Henüz işlem yok"
                description="Onaylanan veya reddedilen talepler burada listelenir."
                compact
              />
            ) : (
              <div className="list" style={{ maxHeight: 420, overflowY: 'auto' }}>
                {gecmis.map((t) => {
                  const d = DURUM_ETIKET[t.status] || DURUM_ETIKET.pending;
                  const Ikon = d.icon;
                  return (
                    <div className="list-row" key={t.id}>
                      <div className="grow">
                        <div className="title">{t.username}</div>
                        <div className="meta">
                          {dateTimeFmt(t.created_at)}
                          {t.handled_at ? ` · işlem: ${dateTimeFmt(t.handled_at)}` : ''}
                          {t.handled_by_name ? ` · ${t.handled_by_name}` : ''}
                        </div>
                      </div>
                      <span className={`badge ${d.className}`}>
                        <Ikon size={11} />
                        {d.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <EmptyState
              icon={Users}
              title="Bekleyen talep listesi yukarıda"
              description="Onay bekleyen talepleri yukarıdaki karttan değerlendirin."
              compact
            />
          )}
        </div>
      </div>

      {/* Geçici şifre gösterimi */}
      {onaylanan ? (
        <TempPasswordModal
          data={onaylanan}
          onClose={() => setOnaylanan(null)}
        />
      ) : null}

      {reddedilecek ? (
        <RejectModal
          talep={reddedilecek}
          onClose={() => setReddedilecek(null)}
          onConfirm={(g) => reddet(reddedilecek, g)}
        />
      ) : null}
    </>
  );
}

/** Onay sonrası geçici şifreyi BİR KEZ gösterir (kopyalanabilir). */
function TempPasswordModal({ data, onClose }) {
  const toast = useToast();
  const [kopyalandi, setKopyalandi] = useState(false);

  const kopyala = async () => {
    try {
      await navigator.clipboard.writeText(data.gecici_sifre);
      setKopyalandi(true);
      setTimeout(() => setKopyalandi(false), 2000);
    } catch {
      toast.error('Kopyalanamadı', 'Şifreyi elle yazabilirsiniz.');
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Geçici Şifre Oluşturuldu"
      subtitle={data.username}
      size="sm"
      footer={<button className="btn btn-primary" onClick={onClose}>Tamam</button>}
    >
      <div className="alert success mb-14">
        <ShieldCheck size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Şifre sıfırlandı. <strong>Bu şifreyi kullanıcıya iletin</strong> — ekranda
          bir daha gösterilmeyecek.
        </span>
      </div>

      <div className="field">
        <label className="field-label">Geçici şifre</label>
        <div className="row" style={{ gap: 8 }}>
          <input
            className="input mono"
            value={data.gecici_sifre}
            readOnly
            onFocus={(e) => e.target.select()}
            style={{ fontSize: 18, letterSpacing: 1.5, flex: 1 }}
          />
          <button className="btn" onClick={kopyala}>
            {kopyalandi ? <Check size={14} /> : <Copy size={14} />}
            {kopyalandi ? 'Kopyalandı' : 'Kopyala'}
          </button>
        </div>
      </div>

      <div className="alert info" style={{ marginBottom: 0 }}>
        <Info size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Kullanıcı bu şifreyle girdiğinde sistem
          <strong> kendi şifresini seçmeye zorlar</strong>. Yani geçici şifre
          uzun süreli kullanılamaz. Kullanıcının eski oturumları da kapandı.
        </span>
      </div>
    </Modal>
  );
}

/** Reddetme gerekçesi. */
function RejectModal({ talep, onClose, onConfirm }) {
  const [gerekce, setGerekce] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      open
      onClose={onClose}
      title="Talebi Reddet"
      subtitle={talep.username}
      size="sm"
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button
            className="btn btn-danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onConfirm(gerekce);
              setBusy(false);
            }}
          >
            <ShieldX size={14} />
            {busy ? 'Reddediliyor...' : 'Reddet'}
          </button>
        </>
      }
    >
      <p className="text-dim mb-14" style={{ lineHeight: 1.7 }}>
        Talebi reddederseniz hesap şifresi <strong>değişmez</strong>. Kullanıcı
        tekrar talep bırakabilir veya size ulaşabilir.
      </p>

      {talep.contact ? (
        <div className="alert info mb-14">
          <span>
            Kullanıcının bıraktığı iletişim: <strong>{talep.contact}</strong>
          </span>
        </div>
      ) : null}

      <div className="field">
        <label className="field-label" htmlFor="reject-reason">
          Gerekçe <span className="text-dim">(isteğe bağlı)</span>
        </label>
        <textarea
          id="reject-reason"
          className="input"
          rows={2}
          value={gerekce}
          onChange={(e) => setGerekce(e.target.value)}
          placeholder="Örn: Kimliği doğrulanamadı, kullanıcıyı arayın."
          style={{ resize: 'vertical' }}
        />
      </div>
    </Modal>
  );
}