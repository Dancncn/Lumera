// 源 · Lumera 徽记：从原 logo 抽出的母题（环 + 四力节点 + 四道螺旋 + 星点），
// 去掉方框与文字、透明背景、金属渐变描边——可干净地嵌进页面，不再像一张突兀的缩略图。
export function Emblem({ className }: { className?: string }) {
  const gid = 'emblem-gold';
  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-label="源 · Lumera" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e7d49c" />
          <stop offset="40%" stopColor="#c39a3f" />
          <stop offset="62%" stopColor="#8f6a22" />
          <stop offset="100%" stopColor="#d8bf7a" />
        </linearGradient>
      </defs>

      {/* 周行之环 */}
      <circle cx="100" cy="100" r="80" fill="none" stroke={`url(#${gid})`} strokeWidth="1.4" />
      <circle cx="100" cy="100" r="72" fill="none" stroke="#c2a158" strokeWidth="0.5" strokeOpacity="0.4" />

      {/* 四道螺旋（四力之色，自源旋出） */}
      <path d="M100,100 C123,80 117,42 100,20" fill="none" stroke="#c79a3a" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M100,100 C123,122 162,117 180,100" fill="none" stroke="#4c77a8" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M100,100 C77,120 83,159 100,180" fill="none" stroke="#7c8595" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M100,100 C74,80 37,85 20,100" fill="none" stroke="#5f8c5a" strokeWidth="1.4" strokeLinecap="round" />

      {/* 四力节点：阳上·海右·月下·地左 */}
      <g>
        <circle cx="100" cy="20" r="5.6" fill="none" stroke={`url(#${gid})`} strokeWidth="0.9" />
        <circle cx="100" cy="20" r="3.2" fill="#c79a3a" />
        <circle cx="180" cy="100" r="5.6" fill="none" stroke={`url(#${gid})`} strokeWidth="0.9" />
        <circle cx="180" cy="100" r="3.2" fill="#4c77a8" />
        <circle cx="100" cy="180" r="5.6" fill="none" stroke={`url(#${gid})`} strokeWidth="0.9" />
        <circle cx="100" cy="180" r="3.2" fill="#7c8595" />
        <circle cx="20" cy="100" r="5.6" fill="none" stroke={`url(#${gid})`} strokeWidth="0.9" />
        <circle cx="20" cy="100" r="3.2" fill="#5f8c5a" />
      </g>

      {/* 源心 */}
      <circle cx="100" cy="100" r="8" fill="none" stroke={`url(#${gid})`} strokeWidth="0.8" />
      <circle cx="100" cy="100" r="2.2" fill="#bd9038" />

      {/* 散落星点 */}
      <g fill="#c2a158">
        <circle cx="150" cy="44" r="1.5" opacity="0.5" />
        <circle cx="158" cy="150" r="1.7" opacity="0.45" />
        <circle cx="48" cy="156" r="1.4" opacity="0.5" />
        <circle cx="40" cy="46" r="1.6" opacity="0.45" />
        <circle cx="100" cy="100" r="0" />
      </g>
    </svg>
  );
}
