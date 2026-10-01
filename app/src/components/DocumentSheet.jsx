import { money, dateFmt, number } from '../lib/api.js';
import { STATUS_LABELS } from '../lib/api.js';

/**
 * Teklif / fatura icin yazdirilabilir evrak.
 * Ekran gorunumu de ayni bileseni kullanir; @media print ile kagit bicimine gecer.
 */
export function DocumentSheet({ kind, doc, company, demo = false }) {
  if (!doc) return null;

  const isInvoice = kind === 'invoice';
  const title = isInvoice ? 'FATURA' : 'TEKLİF';
  const items = doc.items || [];

  return (
    <div className="doc-sheet">
      {demo ? <div className="doc-demo-watermark">DEMO — SATIN ALINMADI</div> : null}
      {/* ---- Baslik ---- */}
      <header className="doc-head">
        <div className="doc-issuer">
          {company?.logo ? (
            <img className="doc-logo" src={company.logo} alt="" />
          ) : null}
          <div className="doc-issuer-text">
            <div className="doc-company">{company?.name || 'Veltron'}</div>
            {company?.tagline ? <div className="doc-tagline">{company.tagline}</div> : null}
            <div className="doc-contact">
              {company?.address ? <div>{company.address}</div> : null}
              {company?.city ? <div>{company.city}</div> : null}
              {company?.phone ? <div>Tel: {company.phone}</div> : null}
              {company?.email ? <div>{company.email}</div> : null}
            </div>
          </div>
        </div>

        <div className="doc-title-block">
          <div className="doc-title">{title}</div>
          <table className="doc-meta">
            <tbody>
              <tr>
                <td>Belge No</td>
                <td className="mono strong">{doc.number}</td>
              </tr>
              {isInvoice && doc.issue_date ? (
                <tr>
                  <td>Fatura Tarihi</td>
                  <td>{dateFmt(doc.issue_date)}</td>
                </tr>
              ) : null}
              {!isInvoice && doc.issue_date ? (
                <tr>
                  <td>Teklif Tarihi</td>
                  <td>{dateFmt(doc.issue_date)}</td>
                </tr>
              ) : null}
              {doc.due_date ? (
                <tr>
                  <td>Vade Tarihi</td>
                  <td>{dateFmt(doc.due_date)}</td>
                </tr>
              ) : null}
              {doc.valid_until && !isInvoice ? (
                <tr>
                  <td>Geçerlilik</td>
                  <td>{dateFmt(doc.valid_until)}</td>
                </tr>
              ) : null}
              {doc.status ? (
                <tr>
                  <td>Durum</td>
                  <td>{STATUS_LABELS[doc.status] || doc.status}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </header>

      {/* ---- Taraflar ---- */}
      <section className="doc-parties">
        <div className="doc-party">
          <div className="doc-label">Düzenleyen</div>
          <div className="doc-party-name">{company?.name || 'Veltron'}</div>
          {company?.tax_office || company?.tax_number ? (
            <div className="doc-muted">
              {company.tax_office ? <div>{company.tax_office}</div> : null}
              {company.tax_number ? <div>VKN: {company.tax_number}</div> : null}
            </div>
          ) : null}
        </div>

        <div className="doc-party">
          <div className="doc-label">{isInvoice ? 'Sayın' : 'Teklif Alıcı'}</div>
          <div className="doc-party-name">{doc.customer_name || '-'}</div>
          <div className="doc-muted">
            {doc.customer_contact ? <div>Yetkili: {doc.customer_contact}</div> : null}
            {doc.customer_city ? <div>{doc.customer_city}</div> : null}
          </div>
        </div>

        {doc.project_name ? (
          <div className="doc-party">
            <div className="doc-label">İlgili Proje</div>
            <div className="doc-party-name">{doc.project_name}</div>
          </div>
        ) : null}
      </section>

      {/* ---- Kalemler ---- */}
      <table className="doc-items">
        <thead>
          <tr>
            <th style={{ width: 34 }}>#</th>
            <th>Açıklama</th>
            <th style={{ width: 68 }}>Miktar</th>
            <th style={{ width: 58 }}>Birim</th>
            <th style={{ width: 96, textAlign: 'right' }}>Birim Fiyat</th>
            <th style={{ width: 104, textAlign: 'right' }}>Tutar</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={6} className="doc-empty">
                Kalem girilmemiş
              </td>
            </tr>
          ) : (
            items.map((item, i) => (
              <tr key={item.id ?? i}>
                <td>{i + 1}</td>
                <td>
                  <div className="doc-item-desc">{item.description}</div>
                  {item.product_sku ? <div className="doc-item-sku mono">{item.product_sku}</div> : null}
                </td>
                <td className="doc-num">{number(item.quantity)}</td>
                <td>{item.unit || '-'}</td>
                <td className="doc-num">{money(item.unit_price)}</td>
                <td className="doc-num strong">{money(Number(item.quantity || 0) * Number(item.unit_price || 0))}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* ---- Toplamlar ---- */}
      <section className="doc-bottom">
        <div className="doc-notes">
          {doc.notes ? (
            <>
              <div className="doc-label">Notlar</div>
              <div className="doc-note-text">{doc.notes}</div>
            </>
          ) : company?.default_notes ? (
            <>
              <div className="doc-label">Notlar</div>
              <div className="doc-note-text">{company.default_notes}</div>
            </>
          ) : null}

          {isInvoice && doc.paid_amount ? (
            <div className="doc-paid">
              <div>
                <span className="doc-label">Tahsil edilen</span> <strong>{money(doc.paid_amount)}</strong>
              </div>
              {Number(doc.remaining) > 0 ? (
                <div>
                  <span className="doc-label">Kalan</span>{' '}
                  <strong style={{ color: '#b91c1c' }}>{money(doc.remaining)}</strong>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <table className="doc-totals">
          <tbody>
            <tr>
              <td>Ara Toplam</td>
              <td className="doc-num">{money(doc.subtotal)}</td>
            </tr>
            {Number(doc.discount) > 0 ? (
              <tr>
                <td>İndirim</td>
                <td className="doc-num">-{money(doc.discount)}</td>
              </tr>
            ) : null}
            <tr>
              <td>KDV (%{doc.tax_rate})</td>
              <td className="doc-num">{money(doc.tax)}</td>
            </tr>
            <tr className="doc-grand">
              <td>GENEL TOPLAM</td>
              <td className="doc-num">{money(doc.total)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* ---- Banka / imza ---- */}
      {company?.bank_name || company?.iban ? (
        <section className="doc-bank">
          <div className="doc-label">Banka Bilgileri</div>
          {company.bank_name ? <div>{company.bank_name}</div> : null}
          {company.iban ? <div className="mono">{company.iban}</div> : null}
        </section>
      ) : null}

      <section className="doc-signatures">
        <div className="doc-sign">
          <div className="doc-sign-line" />
          <div>Düzenleyen</div>
        </div>
        <div className="doc-sign">
          <div className="doc-sign-line" />
          <div>{isInvoice ? 'Kabul Eden' : 'Teklif Alan'}</div>
        </div>
      </section>

      <footer className="doc-footer">
        {company?.invoice_footer ? <div>{company.invoice_footer}</div> : null}
        {company?.website ? <div>{company.website}</div> : null}
      </footer>
    </div>
  );
}
