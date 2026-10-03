/**
 * OFİS STOĞU
 * ==========
 * Kişiye verilen koruyucu malzeme: eldiven, gözlük, bant, marker…
 *
 * ⛔ İŞ EMRİ MALZEMESİNDEN AYRI. Buradaki hiçbir kayıt iş emrine düşmez,
 *    kârı etkilemez, `products` tablosuna dokunmaz. Kendi sayımı var.
 *
 * ÜÇ SEKME:
 *   Malzeme    → tanım + stok (kaç depoda, kaç kişide)
 *   Verilenler → kim, ne, ne zaman aldı; geri al
 *   Hareketler → "stok neden azaldı?" sorusunun cevabı
 *
 * ⛔ ANA KURAL: `re_request_days` kadar gün geçmeden aynı malzeme tekrar
 *    verilemez. Kullanıcı Gönder'e basmadan ÖNCE uyarı gösterilir
 *    (/kontrol ucu). "Yine de ver" ile kural bilerek ihlal edilebilir —
 *    eldiven kaybolduysa yeni çifti hemen vermek gerekir.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Package, Users, ArrowLeftRight, Plus, Pencil, Trash2, Info, RefreshCw,
  HandCoins, Undo2, AlertTriangle, Check, Search, Download,
} from 'lucide-react';
import { api, number, money, dateFmt, dateTimeFmt } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Kpi } from '../components/Primitives.jsx';
import { Modal, ConfirmDialog } from '../components/Modal.jsx';
import { DataTable } from '../components/DataTable.jsx';

const BOS_MALZEME = {
  name: '', sku: '', category: '', unit: 'Adet',
  re_request_days: 0, min_stock: 0, unit_price: 0,
  location: '', notes: '', initial_stock: 0, is_active: 1,
};

// Aralık önerileri — kullanıcının gerçek işine göre
const ARALIK_SERIDESI = [
  { gun: 0, etiket: 'Kısıt yok — istediğinde' },
  { gun: 7, etiket: '7 gün — eldiven, maske' },
  { gun: 30, etiket: '30 gün — bant, marker, eldiven' },
  { gun: 90, etiket: '90 gün — forma, yağlık' },
  { gun: 365, etiket: '365 gün — gözlük, kulaklık' },
  { gun: 730, etiket: '730 gün — 2 yılda bir' },
];

const DURUM_ETIKET = {
  erken: { yazi: 'Süresi dolmadı', renk: 'warning' },
  serbest: { yazi: 'Yenilenebilir', renk: 'success' },
  geri: { yazi: 'Geri alındı', renk: 'muted' },
};

export default function OfficeStock() {
  const toast = useToast();
  const [sekme, setSekme] = useState('malzeme');
  const [yukleniyor, setYukleniyor] = useState(false);

  // malzeme sekmesi
  const [malzemeler, setMalzemeler] = useState([]);
  const [ozet, setOzet] = useState(null);
  const [arama, setArama] = useState('');
  const [formAcik, setFormAcik] = useState(false);
  const [form, setForm] = useState(BOS_MALZEME);
  const [duzenlenen, setDuzenlenen] = useState(null);
  const [kaydediyor, setKaydediyor] = useState(false);

  // verilenler sekmesi
  const [veriler, setVeriler] = useState([]);
  const [verOzet, setVerOzet] = useState(null);
  const [durum, setDurum] = useState('acik');
  const [calisanlar, setCalisanlar] = useState([]);

  // ver modalı
  const [verAcik, setVerAcik] = useState(false);
  const [verForm, setVerForm] = useState({ item_id: '', employee_id: '', quantity: 1, note: '' });
  const [kontrol, setKontrol] = useState(null);
  const [ihlalOnayi, setIhlalOnayi] = useState(false);

  // hareket sekmesi
  const [hareketler, setHareketler] = useState([]);

  const [silinecek, setSilinecek] = useState(null);
  const [geriAlinacak, setGeriAlinacak] = useState(null);
  const [hareketAcik, setHareketAcik] = useState(false);
  const [hareketForm, setHareketForm] = useState({ type: 'in', quantity: 1, note: '' });

  // ------------------------------------------------------------------ yükle
  const malzemeYukle = useCallback(async () => {
    const r = await api.get('/office-stock', { search: arama || undefined, limit: 200 });
    setMalzemeler(r.data || []);
    setOzet(r.summary || null);
  }, [arama]);

  const veriYukle = useCallback(async () => {
    const r = await api.get('/office-stock/veris/liste', { durum, limit: 200 });
    setVeriler(r.data || []);
    setVerOzet(r.summary || null);
  }, [durum]);

  const hareketYukle = useCallback(async () => {
    const r = await api.get('/office-stock/hareketler/liste', { limit: 200 });
    setHareketler(r.data || []);
  }, []);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    try {
      if (sekme === 'malzeme') await malzemeYukle();
      else if (sekme === 'verilen') await veriYukle();
      else await hareketYukle();
    } catch (err) {
      toast.fromError(err, 'Yüklenemedi');
    } finally {
      setYukleniyor(false);
    }
  }, [sekme, malzemeYukle, veriYukle, hareketYukle, toast]);

  useEffect(() => { yukle(); }, [yukle]);

  useEffect(() => {
    api.get('/employees', { is_active: 'true', limit: 300 })
      .then((r) => setCalisanlar(r.data || []))
      .catch(() => setCalisanlar([]));
  }, []);

  // ------------------------------------------------------------------ malzeme
  const yeniMalzeme = () => {
    setDuzenlenen(null);
    setForm(BOS_MALZEME);
    setFormAcik(true);
  };

  const malzemeDuzenle = (m) => {
    setDuzenlenen(m);
    setForm({
      name: m.name || '', sku: m.sku || '', category: m.category || '',
      unit: m.unit || 'Adet', re_request_days: Number(m.re_request_days) || 0,
      min_stock: Number(m.min_stock) || 0, unit_price: Number(m.unit_price) || 0,
      location: m.location || '', notes: m.notes || '', is_active: m.is_active ?? 1,
      initial_stock: 0,
    });
    setFormAcik(true);
  };

  const malzemeKaydet = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('İsim gerekli', 'Malzemenin adını yaz.');
      return;
    }
    setKaydediyor(true);
    try {
      if (duzenlenen) {
        await api.put(`/office-stock/${duzenlenen.id}`, form);
        toast.success('Malzeme güncellendi', form.name);
      } else {
        await api.post('/office-stock', form);
        toast.success('Malzeme eklendi', form.name);
      }
      setFormAcik(false);
      malzemeYukle();
    } catch (err) {
      toast.fromError(err, 'Kaydedilemedi');
    } finally {
      setKaydediyor(false);
    }
  };

  const malzemeSil = async () => {
    if (!silinecek) return;
    const hedef = silinecek;
    setSilinecek(null);
    try {
      await api.del(`/office-stock/${hedef.id}`);
      toast.success('Malzeme silindi', hedef.name);
      malzemeYukle();
    } catch (err) {
      toast.fromError(err, 'Silinemedi', 'Malzeme kişilerdeyse silinemez.');
    }
  };

  const hareketAc = (m, type) => {
    setHareketForm({ type: type || 'in', quantity: 1, note: '' });
    setDuzenlenen(m);
    setHareketAcik(true);
  };

  const hareketKaydet = async (e) => {
    e.preventDefault();
    if (hareketForm.quantity === '' || Number(hareketForm.quantity) === 0) {
      toast.error('Miktar gerekli', '0 olamaz.');
      return;
    }
    setKaydediyor(true);
    try {
      await api.post(`/office-stock/${duzenlenen.id}/hareket`, hareketForm);
      toast.success('Hareket kaydedildi', `${hareketForm.type === 'in' ? 'Giriş' : hareketForm.type === 'out' ? 'Çıkış' : 'Düzeltme'}: ${hareketForm.quantity} ${duzenlenen.unit}`);
      setHareketAcik(false);
      malzemeYukle();
    } catch (err) {
      toast.fromError(err, 'Kaydedilemedi');
    } finally {
      setKaydediyor(false);
    }
  };

  // ------------------------------------------------------------------ verme
  const verModalAc = (item) => {
    setVerForm({ item_id: item?.id || '', employee_id: '', quantity: 1, note: '' });
    setKontrol(null);
    setIhlalOnayi(false);
    setVerAcik(true);
  };

  /**
   * Malzeme + çalışan seçilince kural kontrolü. Kullanıcı "Gönder"
   * demeden ÖNCE uyarı burada belirir.
   */
  useEffect(() => {
    if (!verAcik || !verForm.item_id || !verForm.employee_id) {
      setKontrol(null);
      return undefined;
    }
    let iptal = false;
    api.get(`/office-stock/${verForm.item_id}/kontrol`, {
      employee_id: verForm.employee_id,
      quantity: verForm.quantity,
    })
      .then((r) => { if (!iptal) { setKontrol(r.data); setIhlalOnayi(false); } })
      .catch(() => { if (!iptal) setKontrol(null); });
    return () => { iptal = true; };
  }, [verAcik, verForm.item_id, verForm.employee_id, verForm.quantity]);

  const verGonder = async () => {
    if (!verForm.item_id || !verForm.employee_id) {
      toast.error('Eksik seçim', 'Malzeme ve çalışan seç.');
      return;
    }
    setKaydediyor(true);
    try {
      const r = await api.post(`/office-stock/${verForm.item_id}/ver`, {
        ...verForm,
        quantity: Number(verForm.quantity) || 1,
        zana_kural: ihlalOnayi,
      });
      toast.success('Malzeme verildi', r.data?.uyari || 'Kayıt oluşturuldu');
      setVerAcik(false);
      veriYukle();
      malzemeYukle();
    } catch (err) {
      // 409 = aralık kuralı. Onay isteyerek yeniden dene.
      if (err.status === 409) {
        toast.error('Kural engelledi', err.message);
        setKontrol((k) => ({ ...(k || {}), izin: false, gerekce: err.message }));
        setIhlalOnayi(false);
      } else {
        toast.fromError(err, 'Verilemedi');
      }
    } finally {
      setKaydediyor(false);
    }
  };

  const geriAl = async () => {
    if (!geriAlinacak) return;
    const hedef = geriAlinacak;
    setGeriAlinacak(null);
    try {
      await api.post(`/office-stock/veris/${hedef.id}/geri-al`, {});
      toast.success('Geri alındı', `${hedef.employee_name} · ${hedef.item_name} · stoğa geri girdi`);
      veriYukle();
      malzemeYukle();
    } catch (err) {
      toast.fromError(err, 'Geri alınamadı');
    }
  };

  // ------------------------------------------------------------------ kolonlar
  const malzemeKolonlari = useMemo(() => [
    {
      key: 'name', header: 'Malzeme', sortKey: 'name',
      render: (r) => (
        <div>
          <div style={{ fontWeight: 500 }}>{r.name}</div>
          {r.sku || r.category ? (
            <div className="text-dim text-sm">{r.sku || r.category}</div>
          ) : null}
        </div>
      ),
    },
    {
      key: 're_request_days', header: 'Aralık', align: 'center',
      render: (r) => (Number(r.re_request_days) > 0
        ? <span className="badge info">{r.re_request_days} gün</span>
        : <span className="text-dim text-sm">kısıt yok</span>),
    },
    {
      key: 'stock', header: 'Depoda', align: 'sag', sortKey: 'stock',
      render: (r) => (
        <div>
          <div className={Number(r.stock) <= Number(r.min_stock) ? 'sag' : ''}>
            {number(r.stock)} {r.unit}
          </div>
          {Number(r.stock) <= Number(r.min_stock) ? (
            <div className="text-dim text-sm">kritik: {number(r.min_stock)}</div>
          ) : null}
        </div>
      ),
    },
    {
      key: 'issued_out', header: 'Kişilerde', align: 'sag', sortKey: 'issued_out',
      render: (r) => (Number(r.issued_out) > 0
        ? <span className="badge primary">{number(r.issued_out)} {r.unit} · {r.person_count} kişi</span>
        : <span className="text-dim">—</span>),
    },
    {
      key: 'location', header: 'Yer',
      render: (r) => r.location || <span className="text-dim">—</span>,
    },
  ], []);

  const veriKolonlari = useMemo(() => [
    {
      key: 'employee_name', header: 'Kişi',
      render: (r) => (
        <div>
          <div style={{ fontWeight: 500 }}>{r.employee_name}</div>
          {r.employee_position ? <div className="text-dim text-sm">{r.employee_position}</div> : null}
        </div>
      ),
    },
    {
      key: 'item_name', header: 'Malzeme',
      render: (r) => (
        <div>
          <div>{r.item_name}</div>
          <div className="text-dim text-sm">{r.item_category || ''}</div>
        </div>
      ),
    },
    {
      key: 'quantity', header: 'Miktar', align: 'sag',
      render: (r) => `${number(r.quantity)} ${r.item_unit || ''}`,
    },
    {
      key: 'given_at', header: 'Veriliş', sortKey: 'given_at',
      render: (r) => (
        <div>
          <div>{dateFmt(r.given_at)}</div>
          {r.user_name ? <div className="text-dim text-sm">{r.user_name}</div> : null}
        </div>
      ),
    },
    {
      key: 'durum', header: 'Durum',
      render: (r) => {
        const d = DURUM_ETIKET[r.durum] || DURUM_ETIKET.serbest;
        return (
          <div>
            <span className={`badge ${d.renk}`}>{d.yazi}</span>
            {r.durum === 'erken' && r.kalan_gun > 0 ? (
              <div className="text-dim text-sm" style={{ marginTop: 2 }}>
                {r.kalan_gun} gün sonra
              </div>
            ) : null}
            {r.durum === 'serbest' && Number(r.re_request_days) > 0 ? (
              <div className="text-dim text-sm" style={{ marginTop: 2 }}>
                en erken {dateFmt(r.en_erken)}
              </div>
            ) : null}
            {r.returned_at ? (
              <div className="text-dim text-sm" style={{ marginTop: 2 }}>
                {dateFmt(r.returned_at)} tarihinde geri alındı
              </div>
            ) : null}
          </div>
        );
      },
    },
    {
      key: 'islem', header: '',
      render: (r) => (!r.returned_at ? (
        <button className="btn btn-sm" onClick={() => setGeriAlinacak(r)}>
          <Undo2 size={13} />
          Geri Al
        </button>
      ) : null),
    },
  ], []);

  const hareketKolonlari = useMemo(() => [
    { key: 'movement_date', header: 'Tarih', render: (r) => dateTimeFmt(r.movement_date) },
    {
      key: 'item_name', header: 'Malzeme',
      render: (r) => `${r.item_name} (${r.item_unit || ''})`,
    },
    {
      key: 'type', header: 'Hareket',
      render: (r) => {
        const et = { in: ['Giriş', 'success'], out: ['Çıkış', 'danger'], adjust: ['Düzeltme', 'info'] };
        const [yazi, renk] = et[r.type] || [r.type, 'muted'];
        const miktar = r.type === 'out' ? `-${number(r.quantity)}` : number(r.quantity);
        return <span className={`badge ${renk}`}>{yazi} {miktar}</span>;
      },
    },
    {
      key: 'kaynak', header: 'Neden',
      render: (r) => {
        const kaynak = {
          manual: 'Elle giriş/çıkış',
          assignment: r.employee_name ? `${r.employee_name}'ye verildi` : 'Çalışana verildi',
          return: r.employee_name ? `${r.employee_name} geri aldı` : 'Geri alındı',
        };
        return (
          <div>
            <div>{kaynak[r.source] || r.source}</div>
            {r.note ? <div className="text-dim text-sm">{r.note}</div> : null}
          </div>
        );
      },
    },
    {
      key: 'user_name', header: 'Kaydeden',
      render: (r) => r.user_name || <span className="text-dim">—</span>,
    },
  ], []);

  const seciliMalzeme = malzemeler.find((m) => String(m.id) === String(verForm.item_id));
  const kuralEngelli = kontrol && kontrol.izin === false;
  const stokEngelli = kontrol && kontrol.stok_ok === false;

  // ------------------------------------------------------------------ ekran
  return (
    <>
      <PageHeader
        title="Ofis Stoğu"
        description="Çalışanlara verilen koruyucu malzeme — eldiven, gözlük, bant, marker"
        actions={
          <>
            <button className="btn" onClick={yukle} disabled={yukleniyor}>
              <RefreshCw size={14} className={yukleniyor ? 'spin' : undefined} />
              Yenile
            </button>
            {sekme === 'malzeme' ? (
              <>
                <button className="btn" onClick={() => verModalAc()}>
                  <HandCoins size={14} />
                  Malzeme Ver
                </button>
                <button className="btn btn-primary" onClick={yeniMalzeme}>
                  <Plus size={14} />
                  Malzeme Ekle
                </button>
              </>
            ) : null}
          </>
        }
      />

      {/* ⛔ Ayrı liste olduğunu belirt */}
      <div className="alert info mb-14">
        <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Buradaki malzemeler <strong>iş emri malzemesinden ayrıdır</strong> — iş emrine
          düşmez, kârı etkilemez, kendi stoğu vardır. Aynı malzemeden bir malzeme
          tanımlanırsa <strong>ne kadar günde bir yenilenebileceğini</strong> yaz.
          Eldiven 7, gözlük 365 gibi.
        </span>
      </div>

      {/* ---- Sekmeler ---- */}
      <div className="row" style={{ gap: 6, marginBottom: 14 }}>
        <button
          className={`btn ${sekme === 'malzeme' ? 'btn-primary' : ''}`}
          onClick={() => setSekme('malzeme')}
        >
          <Package size={14} />
          Malzeme
          {ozet ? <span className="badge muted" style={{ marginLeft: 6 }}>{ozet.count}</span> : null}
        </button>
        <button
          className={`btn ${sekme === 'verilen' ? 'btn-primary' : ''}`}
          onClick={() => setSekme('verilen')}
        >
          <Users size={14} />
          Verilenler
          {verOzet ? <span className="badge muted" style={{ marginLeft: 6 }}>{verOzet.ac_count}</span> : null}
        </button>
        <button
          className={`btn ${sekme === 'hareket' ? 'btn-primary' : ''}`}
          onClick={() => setSekme('hareket')}
        >
          <ArrowLeftRight size={14} />
          Hareketler
        </button>
      </div>

      {/* ================= MALZEME ================= */}
      {sekme === 'malzeme' ? (
        <>
          {ozet ? (
            <div className="row row-wrap" style={{ gap: 12, marginBottom: 14 }}>
              <Kpi label="Malzeme çeşidi" value={number(ozet.count)} color="#3b82f6" icon={Package} small />
              <Kpi label="Depodaki toplam" value={number(ozet.total_stock)} color="#22c55e" icon={Package} small />
              <KpiMoneyEtiket value={ozet.value} />
              {ozet.critical > 0 ? (
                <Kpi label="Kritik stok" value={number(ozet.critical)} color="#f59e0b" icon={AlertTriangle} small />
              ) : null}
            </div>
          ) : null}

          <div className="card mb-14">
            <div className="card-body" style={{ paddingBottom: 0 }}>
              <div className="row" style={{ gap: 8 }}>
                <div className="field grow">
                  <Search size={14} style={{ position: 'absolute', left: 9, top: 11, color: 'var(--text-dim)' }} />
                  <input
                    className="input"
                    style={{ paddingLeft: 30 }}
                    placeholder="Malzeme ara..."
                    value={arama}
                    onChange={(e) => setArama(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          <DataTable
            columns={[
              ...malzemeKolonlari,
              {
                key: 'islem', header: '', align: 'right',
                render: (r) => (
                  <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost btn-icon btn-sm" title="Stok girişi"
                      onClick={() => hareketAc(r, 'in')}>
                      <Download size={13} />
                    </button>
                    <button className="btn btn-ghost btn-icon btn-sm" title="Malzeme ver"
                      onClick={() => verModalAc(r)}>
                      <HandCoins size={13} />
                    </button>
                    <button className="btn btn-ghost btn-icon btn-sm" title="Düzenle"
                      onClick={() => malzemeDuzenle(r)}>
                      <Pencil size={13} />
                    </button>
                    <button className="btn btn-ghost btn-icon btn-sm" title="Sil"
                      onClick={() => setSilinecek(r)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ),
              },
            ]}
            rows={malzemeler}
            loading={yukleniyor}
            emptyTitle="Henüz ofis malzemesi yok"
            emptyDescription="Kaynakçı eldiveni, iş gözlüğü, bant gibi malzemeleri ekleyerek başla."
            emptyAction={<button className="btn btn-primary" onClick={yeniMalzeme}><Plus size={14} /> Malzeme Ekle</button>}
            emptyIcon={Package}
          />

          {/* ⛔ Stok sütunu ne demek — kullanıcı kafasında karışmasın */}
          {malzemeler.length ? (
            <div className="alert info" style={{ marginTop: 14 }}>
              <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                <strong>Depoda</strong> = rafta duran miktar.
                <strong> Kişilerde</strong> = şu an bir çalışanın elinde olan.
                Toplamı depoda + kişilerdedir; bir çalışana verince depodan düşer,
                geri alınca depoya geri döner.
              </span>
            </div>
          ) : null}
        </>
      ) : null}

      {/* ================= VERİLENLER ================= */}
      {sekme === 'verilen' ? (
        <>
          {verOzet ? (
            <div className="row row-wrap" style={{ gap: 12, marginBottom: 14 }}>
              <Kpi label="Kişideki kayıt" value={number(verOzet.ac_count)} color="#3b82f6" icon={Users} small />
              <Kpi label="Toplam adet" value={number(verOzet.ac_adet)} color="#22c55e" icon={Package} small />
              <Kpi label="Kişi sayısı" value={number(verOzet.kisi_sayisi)} color="#a855f7" icon={Users} small />
            </div>
          ) : null}

          <div className="row" style={{ gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            {[
              { k: 'acik', l: 'Hâlâ çalışanda' },
              { k: 'geri', l: 'Geri alındı' },
              { k: 'all', l: 'Tümü' },
            ].map((x) => (
              <button
                key={x.k}
                className={`btn btn-sm ${durum === x.k ? 'btn-primary' : ''}`}
                onClick={() => setDurum(x.k)}
              >
                {x.l}
              </button>
            ))}
          </div>

          <DataTable
            columns={veriKolonlari}
            rows={veriler}
            loading={yukleniyor}
            emptyIcon={Users}
            emptyTitle={durum === 'acik' ? 'Kimsenin üzerinde malzeme yok' : 'Kayıt yok'}
            emptyDescription={
              durum === 'acik'
                ? 'Malzeme listesinden “Malzeme Ver” diyerek başla. Verilen tarihi ve kim aldıysa burada görünür.'
                : 'Geri alınan malzemeler burada listelenir.'
            }
          />
        </>
      ) : null}

      {/* ================= HAREKETLER ================= */}
      {sekme === 'hareket' ? (
        <>
          <div className="alert info mb-14">
            <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              <strong>“Stok neden azaldı?”</strong> sorusunun cevabı. Her veriş ve
              geri alma otomatik kaydedilir; elle giriş/çıkıştan ayrılır.
            </span>
          </div>
          <DataTable
            columns={hareketKolonlari}
            rows={hareketler}
            loading={yukleniyor}
            emptyIcon={ArrowLeftRight}
            emptyTitle="Hareket yok"
          />
        </>
      ) : null}

      {/* ================= MALZEME FORMU ================= */}
      <Modal
        open={formAcik}
        onClose={() => setFormAcik(false)}
        title={duzenlenen ? 'Malzeme Düzenle' : 'Yeni Ofis Malzemesi'}
        size="lg"
        footer={
          <>
            <div className="spacer" />
            <button className="btn" onClick={() => setFormAcik(false)} disabled={kaydediyor}>
              Vazgeç
            </button>
            <button className="btn btn-primary" onClick={malzemeKaydet} disabled={kaydediyor}>
              <Check size={14} />
              Kaydet
            </button>
          </>
        }
      >
        <form onSubmit={malzemeKaydet}>
          <div className="field mb-14">
            <label className="field-label" htmlFor="ofis-ad">İsim *</label>
            <input id="ofis-ad" className="input" value={form.name} required
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Örn: Kaynakçı Eldiveni" />
          </div>

          <div className="grid-2" style={{ gap: 14 }}>
            <div className="field">
              <label className="field-label" htmlFor="ofis-kod">Stok Kodu</label>
              <input id="ofis-kod" className="input mono" value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="isteğe bağlı" />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="ofis-kategori">Kategori</label>
              <input id="ofis-kategori" className="input" value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="İş Güvenliği, Kırtasiye..." />
            </div>
          </div>

          <div className="grid-2" style={{ gap: 14 }}>
            <div className="field">
              <label className="field-label" htmlFor="ofis-birim">Birim</label>
              <input id="ofis-birim" className="input" value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="Adet, Çift..." />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="ofis-yer">Yer</label>
              <input id="ofis-yer" className="input" value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="Dolap A, Raf 2..." />
            </div>
          </div>

          {/* ⛔ ANA KURAL — ekranın en önemli alanı */}
          <div className="field mb-14"
            style={{ padding: 12, border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-input)' }}>
            <label className="field-label" htmlFor="ofis-aralik">
              ⛔ Kaç günde bir yenilenebilir?
            </label>
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <input
                id="ofis-aralik" type="number" min="0" max="3650" className="input"
                style={{ width: 110 }} value={form.re_request_days}
                onChange={(e) => setForm({ ...form, re_request_days: e.target.value === '' ? '' : Number(e.target.value) })}
              />
              <span className="text-dim">gün</span>
            </div>
            <div className="row row-wrap" style={{ gap: 5, marginTop: 8 }}>
              {ARALIK_SERIDESI.map((a) => (
                <button
                  key={a.gun} type="button"
                  className={`btn btn-sm ${Number(form.re_request_days) === a.gun ? 'btn-primary' : ''}`}
                  onClick={() => setForm({ ...form, re_request_days: a.gun })}
                >
                  {a.etiket}
                </button>
              ))}
            </div>
            <div className="field-hint" style={{ marginTop: 8, lineHeight: 1.6 }}>
              ⛔ Bu süre dolmadan aynı çalışana tekrar verilemez. Örneğin eldiven için
              <strong> 7</strong> yazarsan, elindeki eldiveni geri almadıkça 7 gün geçmeden
              yenisini alamaz. <strong>0</strong> = kısıt yok.
            </div>
          </div>

          <div className="grid-3" style={{ gap: 14 }}>
            <div className="field">
              <label className="field-label" htmlFor="ofis-kritik">Kritik Stok</label>
              <input id="ofis-kritik" type="number" min="0" className="input" value={form.min_stock}
                onChange={(e) => setForm({ ...form, min_stock: e.target.value === '' ? '' : Number(e.target.value) })} />
              <div className="field-hint">Bu kadarın altına düşünce uyarı verir.</div>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="ofis-fiyat">Birim Fiyat</label>
              <input id="ofis-fiyat" type="number" min="0" step="0.01" className="input" value={form.unit_price}
                onChange={(e) => setForm({ ...form, unit_price: e.target.value === '' ? '' : Number(e.target.value) })} />
              <div className="field-hint">Sadece toplam değer için.</div>
            </div>
            {!duzenlenen ? (
              <div className="field">
                <label className="field-label" htmlFor="ofis-acilis">Açılış Stoğu</label>
                <input id="ofis-acilis" type="number" min="0" className="input" value={form.initial_stock}
                  onChange={(e) => setForm({ ...form, initial_stock: e.target.value === '' ? '' : Number(e.target.value) })} />
                <div className="field-hint">Depoda kaç tane var?</div>
              </div>
            ) : null}
          </div>

          <div className="field mb-14" style={{ marginTop: 14 }}>
            <label className="field-label" htmlFor="ofis-not">Notlar</label>
            <textarea id="ofis-not" className="input" rows={2} value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </form>
      </Modal>

      {/* ================= STOK HAREKETİ ================= */}
      <Modal
        open={hareketAcik}
        onClose={() => setHareketAcik(false)}
        title={hareketForm.type === 'in' ? 'Stok Girişi' : hareketForm.type === 'out' ? 'Stok Çıkışı' : 'Stok Düzeltme'}
        size="sm"
        footer={
          <>
            <div className="spacer" />
            <button className="btn" onClick={() => setHareketAcik(false)} disabled={kaydediyor}>Vazgeç</button>
            <button className="btn btn-primary" onClick={hareketKaydet} disabled={kaydediyor}>
              <Check size={14} /> Kaydet
            </button>
          </>
        }
      >
        {duzenlenen ? (
          <div className="field-hint mb-14">
            <strong>{duzenlenen.name}</strong> · depoda şu an{' '}
            <strong>{number(duzenlenen.stock)} {duzenlenen.unit}</strong>
          </div>
        ) : null}

        <div className="field mb-14">
          <label className="field-label">Hareket türü</label>
          <div className="row" style={{ gap: 6 }}>
            {[
              { k: 'in', l: 'Giriş (depoya girdi)' },
              { k: 'out', l: 'Çıkış (kayıp/çöp)' },
              { k: 'adjust', l: 'Düzeltme (sayım)' },
            ].map((x) => (
              <button key={x.k} type="button"
                className={`btn btn-sm ${hareketForm.type === x.k ? 'btn-primary' : ''}`}
                onClick={() => setHareketForm({ ...hareketForm, type: x.k })}>
                {x.l}
              </button>
            ))}
          </div>
        </div>

        <div className="field mb-14">
          <label className="field-label" htmlFor="h-miktar">
            Miktar {hareketForm.type === 'adjust' ? '(negatif olabilir)' : ''}
          </label>
          <input id="h-miktar" type="number" step="0.01" className="input" value={hareketForm.quantity}
            onChange={(e) => setHareketForm({ ...hareketForm, quantity: e.target.value === '' ? '' : Number(e.target.value) })} />
          {hareketForm.type === 'adjust' ? (
            <div className="field-hint">
              Gerçekte depoda kaç tane varsa onu yaz. Fark otomatik hesaplanır.
            </div>
          ) : null}
        </div>

        <div className="field">
          <label className="field-label" htmlFor="h-not">Açıklama</label>
          <input id="h-not" className="input" value={hareketForm.note}
            onChange={(e) => setHareketForm({ ...hareketForm, note: e.target.value })}
            placeholder="Örn: İkmal geldi" />
        </div>
      </Modal>

      {/* ================= MALZEME VER ================= */}
      <Modal
        open={verAcik}
        onClose={() => setVerAcik(false)}
        title="Malzeme Ver"
        footer={
          <>
            <div className="spacer" />
            <button className="btn" onClick={() => setVerAcik(false)} disabled={kaydediyor}>Vazgeç</button>
            <button
              className="btn btn-primary"
              onClick={verGonder}
              disabled={kaydediyor || !verForm.item_id || !verForm.employee_id || (kuralEngelli && !ihlalOnayi) || stokEngelli}
            >
              <Check size={14} />
              Ver
            </button>
          </>
        }
      >
        <div className="field mb-14">
          <label className="field-label" htmlFor="ver-malzeme">Malzeme *</label>
          <select id="ver-malzeme" className="input" value={verForm.item_id}
            onChange={(e) => setVerForm({ ...verForm, item_id: e.target.value })}>
            <option value="">— seç —</option>
            {malzemeler.filter((m) => m.is_active).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · depoda {number(m.stock)} {m.unit}
              </option>
            ))}
          </select>
        </div>

        <div className="field mb-14">
          <label className="field-label" htmlFor="ver-calisan">Çalışan *</label>
          <select id="ver-calisan" className="input" value={verForm.employee_id}
            onChange={(e) => setVerForm({ ...verForm, employee_id: e.target.value })}>
            <option value="">— seç —</option>
            {calisanlar.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}{c.position ? ` — ${c.position}` : ''}
              </option>
            ))}
          </select>
          {!calisanlar.length ? (
            <div className="field-hint">Aktif çalışan yok. Önce Çalışanlar ekranından ekle.</div>
          ) : null}
        </div>

        <div className="field mb-14">
          <label className="field-label" htmlFor="ver-miktar">Miktar</label>
          <input id="ver-miktar" type="number" min="1" step="1" className="input" value={verForm.quantity}
            onChange={(e) => setVerForm({ ...verForm, quantity: e.target.value === '' ? '' : Number(e.target.value) })} />
        </div>

        {/* ⛔ KURAL UYARISI — kullanıcı gönder demeden ÖNCE */}
        {stokEngelli ? (
          <div className="alert danger mb-14">
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{kontrol.stok_mesaj}</span>
          </div>
        ) : kuralEngelli ? (
          <div className="alert warning mb-14">
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <strong>Bu kişiye henüz verilebilir.</strong>
              <div style={{ marginTop: 3, fontSize: 12.5, lineHeight: 1.6 }}>{kontrol.gerekce}</div>
              <label className="row" style={{ gap: 6, marginTop: 9, cursor: 'pointer' }}>
                <input type="checkbox" checked={ihlalOnayi}
                  onChange={(e) => setIhlalOnayi(e.target.checked)} />
                <span style={{ fontSize: 12.5 }}>
                  <strong>Yine de ver</strong> — eldiveni kaybettirdiyse vb.
                </span>
              </label>
            </div>
          </div>
        ) : kontrol && kontrol.izin ? (
          <div className="alert success mb-14">
            <Check size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              Verilebilir.
              {kontrol.acik_kayit_sayisi > 0
                ? ` Elinde ${number(kontrol.acik_miktar)} ${seciliMalzeme?.unit || ''} var, süresi dolmuş.`
                : ' Üzerinde bu malzeme yok.'}
            </span>
          </div>
        ) : null}

        <div className="field">
          <label className="field-label" htmlFor="ver-not">Not</label>
          <input id="ver-not" className="input" value={verForm.note}
            onChange={(e) => setVerForm({ ...verForm, note: e.target.value })}
            placeholder="Örn: eskisi yırtıldı" />
        </div>
      </Modal>

      {/* ================= ONAYLAR ================= */}
      <ConfirmDialog
        open={!!silinecek}
        onClose={() => setSilinecek(null)}
        onConfirm={malzemeSil}
        title="Malzeme silinsin mi?"
        message={
          silinecek
            ? `"${silinecek.name}" silinecek.\n\n`
              + 'Stok hareketleri ve geçmiş veriş kayıtları da silinir.\n'
              + '⛔ Malzeme şu an bir çalışanda ise silme engellenir — önce hepsini geri al.'
            : ''
        }
        confirmLabel="Sil"
      />

      <ConfirmDialog
        open={!!geriAlinacak}
        onClose={() => setGeriAlinacak(null)}
        onConfirm={geriAl}
        title="Malzeme geri alınsın mı?"
        message={
          geriAlinacak
            ? `${geriAlinacak.employee_name}'den ${geriAlinacak.item_name} `
              + `(${number(geriAlinacak.quantity)} ${geriAlinacak.item_unit || ''}) geri alınacak.\n\n`
              + 'Stok otomatik olarak depoya geri döner ve tekrar isteme kuralı bu '
              + 'malzeme için uygulanmaz.'
            : ''
        }
        confirmLabel="Geri Al"
        danger={false}
      />
    </>
  );
}

function KpiMoneyEtiket({ value }) {
  return (
    <Kpi
      label="Depodaki değer"
      value={money(value)}
      color="#10b981"
      icon={Package}
      small
    />
  );
}
