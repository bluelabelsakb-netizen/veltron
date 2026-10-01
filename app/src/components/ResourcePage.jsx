import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Pencil, Trash2, Search, RotateCcw, Package, X } from 'lucide-react';
import { api, ApiError } from '../lib/api.js';
import { useToast } from './Toast.jsx';
import { Modal, ConfirmDialog } from './Modal.jsx';
import { DataTable } from './DataTable.jsx';
import { FormField, useFormState } from './Form.jsx';
import { PageHeader } from './Primitives.jsx';

const bridge = typeof window !== 'undefined' ? window.veltron : null;

/**
 * Yapilandirma tabanli CRUD ekrani.
 *
 * @param {object} cfg
 * @param {string} cfg.endpoint
 * @param {string} cfg.title
 * @param {string} [cfg.description]
 * @param {Array}  cfg.columns     DataTable sutun tanimlari
 * @param {Array}  [cfg.filters]   [{ name, label, type, options, placeholder, width }]
 * @param {Array}  cfg.fields      form alanlari
 * @param {Array}  [cfg.sections]  [{ title, fields }]  -> formu boler
 * @param {string} [cfg.searchPlaceholder]
 * @param {Function} [cfg.toFormValues]  satir -> form degerleri
 * @param {Function} [cfg.toPayload]     form degerleri -> govde
 * @param {object} [cfg.defaultSort]     { key, dir }
 * @param {string} [cfg.createLabel]
 * @param {Function} [cfg.deleteMessage] satir -> onay metni
 * @param {Function} [cfg.rowActions]   satir -> ek butonlar
 * @param {Function} [cfg.onRowClick]   satir -> tiklama
 * @param {boolean} [cfg.hideCreate]
 * @param {boolean} [cfg.hideEdit]
 * @param {boolean} [cfg.hideDelete]
 * @param {Function} [cfg.toolbar]      ek arac cubugu
 * @param {string}  [csvName]
 */
export function ResourcePage(cfg) {
  const {
    endpoint,
    title,
    description,
    columns,
    filters = [],
    fields,
    sections,
    searchPlaceholder = 'Ara...',
    toFormValues,
    toPayload,
    defaultSort,
    createLabel = 'Yeni Kayıt',
    deleteMessage,
    rowActions,
    onRowClick,
    hideCreate,
    hideEdit,
    hideDelete,
    toolbar,
    emptyTitle,
    emptyDescription,
    csvName = 'veltron',
    extraParams,
  } = cfg;

  const toast = useToast();

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterValues, setFilterValues] = useState({});
  const [sort, setSort] = useState(defaultSort || null);
  const [page, setPage] = useState({ limit: 50, offset: 0 });

  const [editing, setEditing] = useState(null); // null | 'new' | row
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [summary, setSummary] = useState(null);

  // Arama girisini 300 ms geciktir.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage((p) => ({ ...p, offset: 0 }));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(endpoint, {
        search: debouncedSearch || undefined,
        sort: sort ? `${sort.key}:${sort.dir}` : undefined,
        limit: page.limit,
        offset: page.offset,
        ...filterValues,
        ...extraParams?.(),
      });
      setRows(res.data || []);
      setTotal(res.total ?? 0);
      setSummary(res.summary ?? null);
    } catch (err) {
      toast.fromError(err, 'Liste yüklenemedi');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [endpoint, debouncedSearch, sort, page.limit, page.offset, filterValues, extraParams, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  // --- form ---------------------------------------------------------------
  const initialValues = useMemo(() => {
    if (!editing) return {};
    if (editing === 'new') {
      const base = {};
      for (const f of fields) {
        if (f.defaultValue !== undefined) base[f.name] = f.defaultValue;
        else if (f.type === 'checkbox') base[f.name] = 0;
      }
      return base;
    }
    const row = editing;
    const base = {};
    for (const f of fields) {
      if (f.name in row) base[f.name] = row[f.name];
      else if (f.type === 'checkbox') base[f.name] = 0;
      else base[f.name] = '';
    }
    return toFormValues ? toFormValues(row) : base;
  }, [editing, fields, toFormValues]);

  const form = useFormState(fields, initialValues, (values) =>
    toPayload ? toPayload(values) : values
  );

  const closeForm = useCallback(() => {
    setEditing(null);
    setFormKey((k) => k + 1);
  }, []);

  const save = useCallback(async () => {
    const payload = form.submit();
    if (!payload) return;

    setBusy(true);
    try {
      if (editing === 'new') {
        await api.post(endpoint, payload);
        toast.success(`${title} eklendi`);
      } else {
        await api.put(`${endpoint}/${editing.id}`, payload);
        toast.success(`${title} güncellendi`);
      }
      closeForm();
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
        form.setErrors(err.fieldErrors);
        toast.error('Eksik hatalı alan var', 'Formda kırmızı işaretli alanları düzeltin.');
      } else {
        toast.fromError(err, 'Kaydedilemedi');
      }
    } finally {
      setBusy(false);
    }
  }, [form, editing, endpoint, title, toast, closeForm, refresh]);

  const remove = useCallback(async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      const res = await api.del(`${endpoint}/${deleting.id}`);
      setDeleting(null);
      if (res?.data?.archived) {
        toast.success('Kayıt pasifleştirildi', 'Geçmiş kayıtlar silinmez, arşivlenir.');
      } else {
        toast.success(`${title} silindi`);
      }
      await refresh();
    } catch (err) {
      toast.fromError(err, 'Silinemedi');
    } finally {
      setBusy(false);
    }
  }, [deleting, endpoint, title, toast, refresh]);

  const handleExport = useCallback(
    async (csv) => {
      if (bridge) {
        const res = await bridge.app.exportText({ defaultName: `${csvName}-${new Date().toISOString().slice(0, 10)}.csv`, content: csv });
        if (res?.ok) toast.success('Dosya kaydedildi', res.filePath);
        return;
      }
      const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${csvName}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('CSV indirildi');
    },
    [csvName, toast]
  );

  const activeFilterCount = Object.values(filterValues).filter((v) => v && v !== 'all').length;
  const canFilter = filters.length > 0;

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          <>
            {summary ? <SummaryChips summary={summary} /> : null}
            {toolbar?.()}
            {!hideCreate ? (
              <button
                className="btn btn-primary"
                onClick={() => {
                  setEditing('new');
                  setFormKey((k) => k + 1);
                }}
              >
                <Plus size={15} />
                {createLabel}
              </button>
            ) : null}
          </>
        }
      />

      {canFilter ? (
        <div className="card mb-14" style={{ background: 'transparent', border: 'none', padding: 0 }}>
          <div className="row row-wrap" style={{ marginBottom: 12 }}>
            <div className="search-box">
              <Search size={14} />
              <input
                className="input"
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search ? (
                <button
                  className="btn btn-ghost btn-icon"
                  style={{ position: 'absolute', right: 3, top: 3, width: 26, height: 26 }}
                  onClick={() => setSearch('')}
                  aria-label="Aramayı temizle"
                >
                  <X size={13} />
                </button>
              ) : null}
            </div>

            {filters.map((f) =>
              f.type === 'date' ? (
                <input
                  key={f.name}
                  type="date"
                  className="input"
                  style={{ width: 150 }}
                  title={f.label}
                  value={filterValues[f.name] || ''}
                  onChange={(e) => {
                    setFilterValues((v) => ({ ...v, [f.name]: e.target.value }));
                    setPage((p) => ({ ...p, offset: 0 }));
                  }}
                />
              ) : (
                <select
                  key={f.name}
                  className="select filter-select"
                  value={filterValues[f.name] ?? 'all'}
                  onChange={(e) => {
                    setFilterValues((v) => ({ ...v, [f.name]: e.target.value }));
                    setPage((p) => ({ ...p, offset: 0 }));
                  }}
                >
                  <option value="all">{f.label}</option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )
            )}

            {activeFilterCount > 0 ? (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setFilterValues({});
                  setSearch('');
                }}
              >
                <RotateCcw size={13} />
                Filtreleri temizle
              </button>
            ) : null}

            <div className="spacer" />
            <button className="btn btn-sm" onClick={refresh} disabled={loading} title="Listeyi yenile">
              <RotateCcw size={13} />
            </button>
          </div>
        </div>
      ) : null}

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        pagination={{ total, limit: page.limit, offset: page.offset, onChange: setPage }}
        sort={sort ? { ...sort, onChange: (s) => { setSort(s); setPage((p) => ({ ...p, offset: 0 })); } } : null}
        onRowClick={onRowClick}
        emptyIcon={cfg.emptyIcon}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        emptyAction={
          !hideCreate ? (
            <button className="btn btn-primary" onClick={() => { setEditing('new'); setFormKey((k) => k + 1); }}>
              <Plus size={15} />
              {createLabel}
            </button>
          ) : null
        }
        onExport={handleExport}
        rowActions={(row) => (
          <>
            {rowActions?.(row)}
            {!hideEdit ? (
              <button
                className="btn btn-sm btn-icon"
                title="Düzenle"
                onClick={() => {
                  setEditing(row);
                  setFormKey((k) => k + 1);
                }}
              >
                <Pencil size={14} />
              </button>
            ) : null}
            {!hideDelete ? (
              <button className="btn btn-sm btn-icon" title="Sil" onClick={() => setDeleting(row)}>
                <Trash2 size={14} />
              </button>
            ) : null}
          </>
        )}
      />

      {/* ---- Duzenleme / ekleme formu ---- */}
      <Modal
        key={formKey}
        open={Boolean(editing)}
        onClose={closeForm}
        size={cfg.modalSize || 'md'}
        title={editing === 'new' ? createLabel : `${title} düzenle`}
        subtitle={editing && editing !== 'new' ? editing.name || editing.full_name || editing.company || undefined : undefined}
        footer={
          <>
            <div className="spacer" />
            <button className="btn" onClick={closeForm} disabled={busy}>
              Vazgeç
            </button>
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </>
        }
      >
        <FormBody
          fields={fields}
          sections={sections}
          form={form}
          disabled={busy}
          entity={editing === 'new' ? null : editing}
        />
      </Modal>

      {/* ---- Silme onayi ---- */}
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        busy={busy}
        title={`${title} silinsin mi?`}
        message={
          deleting
            ? deleteMessage
              ? deleteMessage(deleting)
              : `"${deleting.name || deleting.full_name || deleting.company || `#${deleting.id}`}" kaydı silinecek.\n\nBu işlem geri alınamaz.`
            : ''
        }
      />
    </>
  );
}

/** Formu istege bagli olarak bolumlere ayirir. */
function FormBody({ fields, sections, form, disabled }) {
  if (!sections) {
    return <FieldGrid fields={fields} form={form} disabled={disabled} />;
  }

  // Bolumler alan adlarini (metin) listeler; tanimlara cozumlenir.
  // Boylece ayni alan hem duzenleme hem de dogrulama icin tek kaynaktan gelir.
  const byName = new Map(fields.map((f) => [f.name, f]));

  return (
    <div>
      {sections.map((sec, i) => (
        <div className="form-section" key={sec.title || i}>
          {sec.title ? <div className="form-section-title">{sec.title}</div> : null}
          <div className="form-grid">
            {sec.fields.map((ref) => {
              const def = typeof ref === 'string' ? byName.get(ref) : ref;
              if (!def) {
                console.warn(`[ResourcePage] Bolumde tanimsiz alan: ${String(ref)}`);
                return null;
              }
              return <Field key={def.name} def={def} form={form} disabled={disabled} />;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function FieldGrid({ fields, form, disabled }) {
  return (
    <div className="form-grid">
      {fields.map((f) => (
        <Field key={f.name} def={f} form={form} disabled={disabled} />
      ))}
    </div>
  );
}

function Field({ def, form, disabled }) {
  return (
    <FormField
      field={def}
      value={form.values[def.name]}
      error={form.errors[def.name]}
      onChange={(v) => form.setValue(def.name, v)}
      disabled={disabled}
    />
  );
}

function SummaryChips({ summary }) {
  const entries = Object.entries(summary).filter(
    ([, v]) => v !== null && v !== undefined && typeof v !== 'object'
  );
  if (!entries.length) return null;
  return (
    <>
      {entries.map(([key, value]) => (
        <span key={key} className="badge muted" style={{ textTransform: 'capitalize' }}>
          {key}: <strong style={{ marginLeft: 3 }}>{value}</strong>
        </span>
      ))}
    </>
  );
}

export { Package };
