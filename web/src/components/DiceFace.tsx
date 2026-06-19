const DOTS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[72, 28], [28, 72]],
  3: [[72, 28], [50, 50], [28, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 28], [28, 50], [28, 72], [72, 28], [72, 50], [72, 72]],
};

export function DiceFace({ value, size = 32, className }: { value: number; size?: number; className?: string }) {
  const dots = DOTS[value] ?? DOTS[1];
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-label={`${value}`}>
      {dots.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={10} fill="currentColor" />
      ))}
    </svg>
  );
}
