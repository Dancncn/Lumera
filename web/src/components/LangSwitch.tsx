import { useEffect, useRef, useState } from 'react';
import { Lang, LANGS, useLang } from '../i18n';

export function LangSwitch() {
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  function pick(k: Lang) {
    setLang(k);
    setOpen(false);
  }

  const cur = LANGS.find((l) => l.key === lang)!;

  return (
    <div className="lang-drop" ref={ref}>
      <button
        className="btn btn-ghost btn-icon lang-globe"
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={cur.full}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z" />
        </svg>
        <span className="lang-cur">{cur.label}</span>
      </button>
      {open && (
        <div className="lang-menu">
          {LANGS.map((l) => (
            <button
              key={l.key}
              type="button"
              className={`lang-item${lang === l.key ? ' lang-item-on' : ''}`}
              onClick={() => pick(l.key)}
            >
              <span className="lang-item-label">{l.label}</span>
              <span className="lang-item-full">{l.full}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
