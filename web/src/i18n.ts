import { useMemo } from 'react';
import { create } from 'zustand';
import { TW } from './i18n.tw';
import { EN } from './i18n.en';

// 三语：源文为简体中文（即 key）。tw/en 缺译时回落简体，保证永不破。
export type Lang = 'zh' | 'tw' | 'en';
export const LANGS: { key: Lang; label: string; full: string }[] = [
  { key: 'zh', label: '简', full: '简体中文' },
  { key: 'tw', label: '繁', full: '繁體中文' },
  { key: 'en', label: 'EN', full: 'English' },
];

function load(): Lang {
  try {
    const v = localStorage.getItem('lumera_lang');
    if (v === 'zh' || v === 'tw' || v === 'en') return v;
  } catch {
    /* ignore */
  }
  return 'zh';
}

interface LangStore {
  lang: Lang;
  setLang: (l: Lang) => void;
}
export const useLang = create<LangStore>((set) => ({
  lang: load(),
  setLang: (l) => {
    try {
      localStorage.setItem('lumera_lang', l);
    } catch {
      /* ignore */
    }
    set({ lang: l });
  },
}));

export function translate(zh: string, lang: Lang, params?: Record<string, string | number>): string {
  let s = lang === 'tw' ? TW[zh] ?? zh : lang === 'en' ? EN[zh] ?? zh : zh;
  if (params) for (const k in params) s = s.split(`{${k}}`).join(String(params[k]));
  return s;
}

// 玩家名里的「你」与性格标签随语言切换（造名 Aurel/Selvar… 保持不变）
const NAME_MAP: Record<string, Record<Lang, string>> = {
  你: { zh: '你', tw: '你', en: 'You' },
  激进: { zh: '激进', tw: '激進', en: 'Aggressive' },
  稳健: { zh: '稳健', tw: '穩健', en: 'Steady' },
  谨慎: { zh: '谨慎', tw: '謹慎', en: 'Cautious' },
  善变: { zh: '善变', tw: '善變', en: 'Volatile' },
  狡黠: { zh: '狡黠', tw: '狡黠', en: 'Cunning' },
};
export function translateName(name: string, lang: Lang): string {
  if (lang === 'zh') return name;
  let s = name;
  for (const k in NAME_MAP) s = s.split(k).join(NAME_MAP[k][lang]);
  return s;
}

export function useT() {
  const lang = useLang((s) => s.lang);
  return useMemo(
    () => ({
      t: (zh: string, params?: Record<string, string | number>) => translate(zh, lang, params),
      tn: (name: string) => translateName(name, lang),
      lang,
    }),
    [lang],
  );
}
