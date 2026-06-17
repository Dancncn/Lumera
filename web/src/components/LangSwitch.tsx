import { LANGS, useLang } from '../i18n';

// 语言切换：简 / 繁 / EN
export function LangSwitch() {
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  return (
    <div className="lang-switch" role="group" aria-label="语言 / language">
      {LANGS.map((l) => (
        <button
          key={l.key}
          type="button"
          className={`lang-btn${lang === l.key ? ' lang-on' : ''}`}
          onClick={() => setLang(l.key)}
          title={l.full}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
