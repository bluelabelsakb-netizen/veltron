import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Alan tipine gore girdi bileseni.
 * @param {object} field  { name, label, type, required, options, span, hint, rows, min, step, placeholder, disabled }
 */
export function FormField({ field, value, error, onChange, disabled }) {
  const {
    name, label, type = 'text', required, options, span, hint,
    rows = 3, min, step, placeholder, readOnly,
  } = field;

  const common = {
    id: `f-${name}`,
    name,
    disabled: disabled || readOnly,
    'aria-invalid': error ? 'true' : undefined,
  };

  let control;

  switch (type) {
    case 'select':
      control = (
        <select
          {...common}
          className={`select ${error ? 'invalid' : ''}`}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        >
          <option value="">{field.emptyLabel ?? '— Seçiniz —'}</option>
          {(options || []).map((o) => {
            const optValue = typeof o === 'object' ? o.value : o;
            const optLabel = typeof o === 'object' ? o.label : o;
            const optHint = typeof o === 'object' ? o.hint : null;
            return (
              <option key={optValue} value={optValue}>
                {optLabel}
                {optHint ? ` — ${optHint}` : ''}
              </option>
            );
          })}
        </select>
      );
      break;

    case 'textarea':
      control = (
        <textarea
          {...common}
          className={`textarea ${error ? 'invalid' : ''}`}
          rows={rows}
          placeholder={placeholder}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;

    case 'checkbox':
      return (
        <div className={`field ${span === 2 || span === 'full' ? 'span-full' : ''}`} style={{ paddingTop: 4 }}>
          <div className="checkbox-row">
            <input
              type="checkbox"
              id={common.id}
              checked={Boolean(value)}
              disabled={common.disabled}
              onChange={(e) => onChange(e.target.checked ? 1 : 0)}
            />
            <label htmlFor={common.id}>{label}</label>
          </div>
          {error ? <div className="field-error">{error}</div> : null}
        </div>
      );

    case 'number':
    case 'money':
      control = (
        <input
          {...common}
          type="number"
          className={`input ${error ? 'invalid' : ''}`}
          step={step ?? (type === 'money' ? '0.01' : '1')}
          min={min}
          placeholder={placeholder}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        />
      );
      break;

    case 'date':
      control = (
        <input
          {...common}
          type="date"
          className={`input ${error ? 'invalid' : ''}`}
          value={value ? String(value).slice(0, 10) : ''}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
      break;

    case 'static':
      return (
        <div className={`field ${span === 2 || span === 'full' ? 'span-full' : ''}`}>
          <label className="field-label" htmlFor={common.id}>
            {label}
          </label>
          <div
            id={common.id}
            className="input"
            style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', background: 'transparent', border: '1px dashed var(--border)' }}
          >
            {value ?? '-'}
          </div>
        </div>
      );

    case 'hidden':
      return null;

    default:
      control = (
        <input
          {...common}
          type={type === 'email' ? 'email' : type === 'tel' ? 'tel' : 'text'}
          className={`input ${error ? 'invalid' : ''}`}
          placeholder={placeholder}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }

  return (
    <div className={`field ${span === 2 ? 'span-2' : span === 'full' ? 'span-full' : ''}`}>
      <label className="field-label" htmlFor={common.id}>
        {label}
        {required ? <span className="req">*</span> : null}
      </label>
      {control}
      {error ? (
        <div className="field-error">{error}</div>
      ) : hint ? (
        <div className="field-hint">{hint}</div>
      ) : null}
    </div>
  );
}

/**
 * Form durumu: degerler, dokunulmus alanlar, dogrulama.
 * @param {Array}  fields  alan yapilandirmasi
 * @param {object} initial
 * @param {(values:object)=>object} [onSubmitValues] gonderim oncesi son sekillendirme
 */
export function useFormState(fields, initial = {}, onSubmitValues) {
  const defaults = useMemo(() => {
    const out = {};
    for (const f of fields) {
      if (f.type === 'hidden') continue;
      out[f.name] = initial[f.name] ?? (f.type === 'checkbox' ? 0 : f.defaultValue ?? '');
    }
    return { ...out, ...initial };
  }, [fields, initial]);

  const [values, setValues] = useState(defaults);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  /**
   * Disa kaynaktan (orn. urun secimi, sunucudan gelen kayit) deger al.
   * Yalnizca initial gercekten DEGISTIGINDE uygulanir; aksi halde cagrida
   * her render'da yeniden nesne olusturan ust bileşenler, kullanicinin girdigi
   * degerleri silerdi.
   */
  const lastInitial = useRef(initial);
  useEffect(() => {
    const previous = lastInitial.current;
    const patch = {};
    let changed = false;

    for (const [key, value] of Object.entries(initial)) {
      if (previous[key] !== value) {
        patch[key] = value;
        changed = true;
      }
    }

    if (changed) {
      lastInitial.current = initial;
      setValues((prev) => ({ ...prev, ...patch }));
    }
  }, [initial]);

  const setValue = useCallback((name, value) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => (e[name] ? { ...e, [name]: undefined } : e));
  }, []);

  const setMany = useCallback((patch) => {
    setValues((v) => ({ ...v, ...patch }));
  }, []);

  const validate = useCallback(() => {
    const next = {};
    for (const f of fields) {
      if (f.type === 'hidden' || f.type === 'static') continue;
      const v = values[f.name];
      const empty = v === '' || v === null || v === undefined;

      if (f.required && empty) {
        next[f.name] = 'Bu alan zorunludur';
        continue;
      }
      if (empty) continue;

      if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v))) {
        next[f.name] = 'Geçerli bir e-posta adresi girin';
      }
      if ((f.type === 'number' || f.type === 'money') && Number.isNaN(Number(v))) {
        next[f.name] = 'Sayısal bir değer girin';
      }
      if (f.type === 'money' && Number(v) < 0) {
        next[f.name] = 'Negatif olamaz';
      }
      if (f.validate) {
        const msg = f.validate(v, values);
        if (msg) next[f.name] = msg;
      }
    }
    setErrors(next);
    return next;
  }, [fields, values]);

  const submit = useCallback(() => {
    const found = validate();
    if (Object.keys(found).length) {
      setTouched(Object.fromEntries(fields.map((f) => [f.name, true])));
      return null;
    }
    // Bos string'leri null yap: sunucu tarafinda NULL olarak saklansin.
    const clean = {};
    for (const [k, v] of Object.entries(values)) {
      clean[k] = v === '' ? null : v;
    }
    return onSubmitValues ? onSubmitValues(clean) : clean;
  }, [validate, values, fields, onSubmitValues]);

  const reset = useCallback((next) => {
    setValues(next ?? defaults);
    setErrors({});
    setTouched({});
  }, [defaults]);

  return { values, errors, touched, setValue, setMany, validate, submit, reset, setErrors };
}
