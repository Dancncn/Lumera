import { useEffect, useState } from 'react';
import { useT } from '../i18n';

// 关于：作者 / 博客 / GitHub / 致谢，主页右上角入口。
export function AboutButton() {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button className="rules-icon" type="button" onClick={() => setOpen(true)} title={t('关于')} aria-label={t('关于')}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11.2v4.6" />
          <circle cx="12" cy="7.8" r="0.7" fill="currentColor" stroke="none" />
        </svg>
      </button>

      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="about-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rules-head">
              <span className="rules-title">{t('关于 · 源河 Lumera')}</span>
              <button className="flog-close" type="button" onClick={() => setOpen(false)} aria-label={t('关闭')}>
                ✕
              </button>
            </div>
            <div className="about-body">
              <p className="about-line">
                <span className="about-k">{t('游戏开发')}</span>
                <span className="about-v">DanArnoux</span>
              </p>
              <p className="about-line">
                <span className="about-k">{t('博客')}</span>
                <a className="about-v about-link" href="https://danarnoux.com/" target="_blank" rel="noreferrer noopener">
                  danarnoux.com
                </a>
              </p>
              <p className="about-line">
                <span className="about-k">GitHub</span>
                <a className="about-v about-link" href="https://github.com/Dancncn" target="_blank" rel="noreferrer noopener">
                  github.com/Dancncn
                </a>
              </p>
              <p className="about-thanks">{t('感谢支持 —— 有任何意见或建议，欢迎到博客留言联系。')}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
