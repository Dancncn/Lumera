import { useT } from '../i18n';

// 读对面：五种 AI 性格 + 对策，外加两条「对手会怎么想」的通用心理。
// 内容对应 engine/ai.ts 的性格旋钮与读牌行为（记诈牌史、牌堆越肥越爱截）。
const PERSONAS: { label: string; trait: string; counter: string }[] = [
  { label: '激进', trait: '爱诈牌、爱截人、敢冲高位。', counter: '他的宣称水分大，可大胆截他；但他也爱抓人，别在他面前硬撑破绽明显的谎。' },
  { label: '稳健', trait: '按牌理走，诈得少、截牌必有把握。', counter: '他放行，多半你就安全；他一旦截你，通常是你真有破绽。' },
  { label: '谨慎', trait: '几乎不诈、极少截牌、想得很久。', counter: '他报的牌基本可信——别白截（多半反而你受罚）；他很少抓人，可在他前面放心诈一手。' },
  { label: '善变', trait: '情绪化、受挫易上头、不按常理出牌。', counter: '难预测，刚被罚后更疯——别费劲找他的规律，稳住自己的节奏。' },
  { label: '狡黠', trait: '最会读人、记性好。', counter: '他记得你诈过几次，连环诈必被抓；真假混着出，关键牌别让他逮到。' },
];

const TIPS: string[] = [
  '对手会记你的诈牌史：被翻穿得越多，之后越爱截你——所以偶尔诈、别连环诈。',
  '牌堆越叠越肥，对手越想截牌（赌注大）——在厚牌堆上诈牌，风险翻倍。',
];

export function PersonaGuide() {
  const { t } = useT();
  return (
    <div className="persona-guide">
      <ul className="persona-list">
        {PERSONAS.map((p) => (
          <li key={p.label} className="persona-item">
            <span className="persona-label">{t(p.label)}</span>
            <div className="persona-body">
              <span className="persona-trait">{t(p.trait)}</span>
              <span className="persona-counter">
                <b>{t('对策')}</b> {t(p.counter)}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <div className="persona-tips">
        {TIPS.map((tip, i) => (
          <p key={i} className="persona-tip">
            {t(tip)}
          </p>
        ))}
      </div>
    </div>
  );
}
