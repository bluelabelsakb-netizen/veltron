/**
 * TIR FOTOGRAFLARI ve IS EMLERI
 * =============================
 * Is emrine fotograf / belge ekler.
 *
 * NEDEN VAR: "Tir burada bosaliyordu" tartismasini foto sonlandirir.
 * Tartim kaniti, teslim tutanagi, sozlesme, irsaliye hepsi burada.
 *
 * Dosyalar kamariye acik DEGILDIR: indirme icin oturum gerekir.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Upload, Trash2, FileText, Image as ImageIcon, Download, Plus } from 'lucide-react';
import { api, getServerUrl, getToken, dateFmt, todayIso } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import { EmptyState } from '../components/Primitives.jsx';

const KINDS = [
  { value: 'photo', label: 'Tır / Kantar', icon: Camera },
  { value: 'document', label: 'Belge', icon: FileText },
  { value: 'imza', label: 'İmza', icon: FileText },
];

/**
 * Kimlik dogrulamalı gorsel.
 *
 * ONEMLI: <img src> OZEL Authorization BASLIGI GONDEREMEZ. Bu yuzden once
 * fetch ile token'la indirip blob URL'ye ceviriyoruz. Aksi halde resim
 * 401 alir ve kirik gorunurdu.
 */
function AuthImage({ id, alt }) {
  const [url, setUrl] = useState(null);
  const [hata, setHata] = useState(false);

  useEffect(() => {
    let iptal = false;
    let objectUrl = null;

    (async () => {
      try {
        const res = await fetch(`${getServerUrl()}/api/attachments/${id}/file`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (iptal) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch {
        if (!iptal) setHata(true);
      }
    })();

    return () => {
      iptal = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  if (hata) {
    return (
      <div className="attach-pdf" style={{ color: 'var(--danger)' }}>
        <FileText size={24} />
        <span>acılamadı</span>
      </div>
    );
  }
  if (!url) return <div className="attach-skeleton" />;
  return <img src={url} alt={alt || ''} loading="lazy" />;
}

/** Indirme baglantisi. */
function dosyaUrl(id, download = false) {
  return `${getServerUrl()}/api/attachments/${id}/file${download ? '?download=1' : ''}`;
}

export function Attachments({ workOrderId, onChanged }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState('photo');
  const [caption, setCaption] = useState('');
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/attachments', { work_order_id: workOrderId });
      setItems(res.data);
    } catch (err) {
      toast.fromError(err, 'Ekler yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [workOrderId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const upload = async (e) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;

    // Istemci tarafi kontrol: bosuna yuklemeyelim
    if (file.size > 8 * 1024 * 1024) {
      toast.error('Dosya çok büyük', 'En fazla 8 MB yükleyebilirsiniz.');
      input.value = '';
      return;
    }

    const fd = new FormData();
    fd.append('file', file);
    fd.append('work_order_id', String(workOrderId));
    fd.append('kind', kind);
    if (caption.trim()) fd.append('caption', caption.trim());
    fd.append('taken_at', todayIso());

    setBusy(true);
    try {
      const res = await fetch(`${getServerUrl()}/api/attachments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Sunucu ${res.status}`);
      toast.success('Yüklendi', file.name);
      setCaption('');
      if (fileRef.current) fileRef.current.value = '';
      await load();
      onChanged?.();
    } catch (err) {
      toast.fromError(err, 'Yüklenemedi');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`"${item.file_name}" silinsin mi?\n\nBu işlem geri alınamaz.`)) return;
    try {
      await api.del(`/attachments/${item.id}`);
      toast.success('Silindi');
      await load();
      onChanged?.();
    } catch (err) {
      toast.fromError(err, 'Silinemedi');
    }
  };

  const photos = items.filter((i) => i.kind === 'photo');
  const docs = items.filter((i) => i.kind !== 'photo');

  return (
    <div className="card mb-14">
      <div className="card-head">
        <Camera size={15} style={{ color: 'var(--info)' }} />
        <h3>Tır Fotoğrafları ve Evrak ({items.length})</h3>
      </div>

      <div className="card-body">
        {/* ---- Yukleme ---- */}
        <div className="attach-upload">
          <div className="seg mb-14">
            {KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                className={`seg-item ${kind === k.value ? 'on' : ''}`}
                onClick={() => setKind(k.value)}
              >
                {k.label}
              </button>
            ))}
          </div>

          <div className="row row-wrap" style={{ gap: 10 }}>
            <input
              className="input"
              style={{ maxWidth: 260 }}
              placeholder="Açıklama (örn. boş tartım)"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={200}
            />
            <input ref={fileRef} type="file" onChange={upload} disabled={busy} style={{ display: 'none' }} accept="image/*,application/pdf" />
            <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload size={14} />
              {busy ? 'Yükleniyor...' : 'Dosya seç ve yükle'}
            </button>
            <span className="text-dim text-sm">JPG · PNG · WEBP · HEIC · GIF · PDF — en fazla 8 MB</span>
          </div>
        </div>

        {/* ---- Fotograflar ---- */}
        {photos.length ? (
          <div className="attach-grid mt-14">
            {photos.map((p) => (
              <div className="attach-item" key={p.id}>
                <a href={dosyaUrl(p.id, true)} title="İndir" className="attach-thumb">
                  {String(p.mime_type || '').startsWith('image/') ? (
                    <AuthImage id={p.id} alt={p.caption || p.file_name} />
                  ) : (
                    <div className="attach-pdf">
                      <FileText size={26} />
                      <span>PDF</span>
                    </div>
                  )}
                </a>
                <div className="attach-meta">
                  <div className="truncate" title={p.caption || p.file_name}>
                    {p.caption || p.file_name}
                  </div>
                  {p.uploaded_by_name ? (
                    <div className="text-dim" style={{ fontSize: 10.5 }}>
                      {p.uploaded_by_name} · {dateFmt(p.created_at)}
                    </div>
                  ) : null}
                </div>
                <button className="attach-del" onClick={() => remove(p)} title="Sil">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {/* ---- Belgeler ---- */}
        {docs.length ? (
          <div className="list mt-14">
            {docs.map((d) => (
              <div className="list-row" key={d.id}>
                <FileText size={15} className="text-dim" />
                <div className="grow">
                  <div className="title">{d.caption || d.file_name}</div>
                  <div className="meta">
                    {d.kind === 'imza' ? 'İmza' : 'Belge'} · {dateFmt(d.created_at)}
                  </div>
                </div>
                <a className="btn btn-sm" href={dosyaUrl(d.id, true)}>
                  <Download size={13} />
                  İndir
                </a>
                <button className="btn btn-sm btn-icon" onClick={() => remove(d)} title="Sil">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {!loading && !items.length ? (
          <div className="mt-14">
            <EmptyState
              compact
              icon={ImageIcon}
              title="Fotoğraf yok"
              description="Tırın kantar öncesi/sonrası fotoğrafını ekleyin. Tartışmalarda kanıt olur ve müşteri portalında görebilirler."
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
