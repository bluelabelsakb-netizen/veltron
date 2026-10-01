import { ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { EmptyState, Loading } from './Primitives.jsx';
import { toCsv } from '../lib/api.js';

/**
 * Sunucudan sayfalanan veri tablosu.
 *
 * @param {object}   p
 * @param {Array}    p.columns   [{ key, header, render?, sortKey?, align?, csv?, className? }]
 * @param {Array}    p.rows
 * @param {boolean}  p.loading
 * @param {object}   p.pagination { total, limit, offset, onChange, pageSizeOptions }
 * @param {object}   p.sort       { key, dir, onChange }
 * @param {Function} p.onRowClick
 * @param {React.ReactNode} p.rowActions  satir sonu aksiyonlari
 * @param {React.ReactNode} p.emptyAction
 */
export function DataTable({
  columns,
  rows = [],
  loading = false,
  pagination,
  sort,
  onRowClick,
  rowActions,
  emptyTitle,
  emptyDescription,
  emptyAction,
  emptyIcon,
  rowKey = (r) => r.id,
  onExport,
  exportName = 'veltron',
}) {
  // pagination verilmezse tum kayitlar tek sayfada gorunur.
  const page = pagination ? Math.floor(pagination.offset / pagination.limit) + 1 : 1;
  const pages = pagination ? Math.max(Math.ceil(pagination.total / pagination.limit), 1) : 1;
  const from = pagination?.total ? pagination.offset + 1 : 0;
  const to = pagination ? Math.min(pagination.offset + pagination.limit, pagination.total) : rows.length;

  const handleSort = (col) => {
    if (!col.sortKey || !sort?.onChange) return;
    const dir = sort.key === col.sortKey && sort.dir === 'asc' ? 'desc' : 'asc';
    sort.onChange({ key: col.sortKey, dir });
  };

  return (
    <div className="card">
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              {columns.map((col) => {
                // sort anahtari tanimsizken undefined === undefined eslesmesin diye
                // once aktif bir siralama olup olmadigi kontrol edilir.
                const sortable = Boolean(col.sortKey) && Boolean(sort?.key);
                const isSorted = sortable && sort.key === col.sortKey;
                const SortIcon = isSorted ? (sort.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
                return (
                  <th
                    key={col.key}
                    style={{ width: col.width, textAlign: col.align }}
                    className={col.sortKey ? 'sortable' : undefined}
                    onClick={col.sortKey ? () => handleSort(col) : undefined}
                  >
                    {col.header}
                    {col.sortKey ? (
                      <span className="sort-ind" style={{ opacity: isSorted ? 1 : 0.3 }}>
                        <SortIcon size={11} />
                      </span>
                    ) : null}
                  </th>
                );
              })}
              {rowActions ? <th className="col-actions">İşlem</th> : null}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`sk-${i}`}>
                    {columns.map((col) => (
                      <td key={col.key}>
                        <div
                          style={{
                            height: 11,
                            borderRadius: 3,
                            background: 'var(--bg-hover)',
                            opacity: 0.55 - i * 0.05,
                            width: `${55 + ((i * 13 + col.key.length * 7) % 40)}%`,
                          }}
                        />
                      </td>
                    ))}
                    {rowActions ? <td /> : null}
                  </tr>
                ))
              : rows.map((row) => (
                  <tr
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={onRowClick ? 'row-link' : undefined}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        style={{ textAlign: col.align }}
                        className={col.className || undefined}
                      >
                        {col.render ? col.render(row) : (row[col.key] ?? '-')}
                      </td>
                    ))}
                    {rowActions ? (
                      <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                        <div className="cell-actions">{rowActions(row)}</div>
                      </td>
                    ) : null}
                  </tr>
                ))}
          </tbody>
        </table>

        {!loading && rows.length === 0 ? (
          <EmptyState
            icon={emptyIcon}
            title={emptyTitle || 'Kayıt bulunamadı'}
            description={emptyDescription}
            action={emptyAction}
          />
        ) : null}
      </div>

      {pagination || onExport ? (
        <div className="pagination">
          {pagination ? (
            <>
              <span>
                {pagination.total > 0 ? (
                  <>
                    <strong style={{ color: 'var(--text)' }}>{from}–{to}</strong> / {pagination.total} kayıt
                  </>
                ) : (
                  'Kayıt yok'
                )}
              </span>

              <select
                className="select"
                style={{ width: 'auto', padding: '4px 24px 4px 8px', fontSize: 12 }}
                value={pagination.limit}
                onChange={(e) => pagination.onChange({ limit: Number(e.target.value), offset: 0 })}
              >
                {[25, 50, 100, 200].map((n) => (
                  <option key={n} value={n}>
                    {n} satır
                  </option>
                ))}
              </select>

              <div className="spacer" />

              <button
                className="btn btn-sm btn-icon"
                disabled={page <= 1}
                onClick={() => pagination.onChange({ limit: pagination.limit, offset: (page - 1) * pagination.limit - pagination.limit })}
                title="Önceki sayfa"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="text-sm nowrap">
                {page} / {pages}
              </span>
              <button
                className="btn btn-sm btn-icon"
                disabled={page >= pages}
                onClick={() => pagination.onChange({ limit: pagination.limit, offset: page * pagination.limit })}
                title="Sonraki sayfa"
              >
                <ChevronRight size={15} />
              </button>
            </>
          ) : (
            <div className="spacer" />
          )}

          {onExport ? (
            <button className="btn btn-sm" onClick={() => onExport(toCsv(columns, rows))}>
              CSV indir
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Kucuk sayfa ici tablo (belge kalemleri, hareket listesi gibi). */
export function MiniTable({ columns, rows, empty = 'Kayıt yok', footer }) {
  if (!rows?.length) {
    return <div className="text-dim text-sm" style={{ padding: '10px 0' }}>{empty}</div>;
  }
  return (
    <div className="table-scroll">
      <table className="items-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{ textAlign: c.align || 'left', width: c.width }}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id ?? i}>
              {columns.map((c) => (
                <td key={c.key} style={{ textAlign: c.align || 'left' }} className={c.className}>
                  {c.render ? c.render(row, i) : (row[c.key] ?? '-')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer ? <tfoot>{footer}</tfoot> : null}
      </table>
    </div>
  );
}

export { Loading };
