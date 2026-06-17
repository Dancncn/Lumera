import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { clearRecords, GameRecord, loadRecords } from '../net/history';

const DIFF_LABEL: Record<string, string> = { easy: '新手', normal: '常规', hard: '老练' };

// 对局记录：只读本机 localStorage。
export function HistoryButton() {
  const { t, lang } = useT();
  const [open, setOpen] = useState(false);
  const [records, setRecords] = useState<GameRecord[]>([]);

  useEffect(() => {
    if (!open) return;
    setRecords(loadRecords());
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const locale = lang === 'en' ? 'en-US' : lang === 'tw' ? 'zh-TW' : 'zh-CN';
  const fmt = (ms: number) => {
    try {
      return new Date(ms).toLocaleString(locale, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <>
      <button className="rules-icon" type="button" onClick={() => setOpen(true)} title={t('对局记录')} aria-label={t('对局记录')}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
          <path d="M5.5 3.5v3h3" />
          <path d="M12 8v4.2l3 1.8" />
        </svg>
      </button>

      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="hist-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rules-head">
              <span className="rules-title">{t('对局记录')}</span>
              <button className="flog-close" type="button" onClick={() => setOpen(false)} aria-label={t('关闭')}>
                ✕
              </button>
            </div>
            <div className="hist-body">
              {records.length === 0 ? (
                <p className="hist-empty">{t('还没有对局记录 —— 打一局就会出现在这里。')}</p>
              ) : (
                <ul className="hist-list">
                  {records.map((r, i) => (
                    <li key={i} className={`hist-row${r.won ? ' hist-won' : ''}`}>
                      <span className="hist-when">{fmt(r.at)}</span>
                      <span className="hist-mode">{r.mode === 'online' ? t('联机') : t(DIFF_LABEL[r.difficulty] ?? '常规')}</span>
                      <span className="hist-players">{t('{n} 人', { n: r.players })}</span>
                      <span className={`hist-rank${r.won ? ' hist-rank-win' : ''}`}>
                        {r.won ? t('胜') : t('第 {a}/{b}', { a: r.rank, b: r.players })}
                      </span>
                      <span className="hist-score">{t('{n} 分', { n: r.score })}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="hist-foot">
              <span className="hist-note">{t('仅保存在本机浏览器')}</span>
              {records.length > 0 && (
                <button
                  className="hist-clear"
                  type="button"
                  onClick={() => {
                    clearRecords();
                    setRecords([]);
                  }}
                >
                  {t('清空记录')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
