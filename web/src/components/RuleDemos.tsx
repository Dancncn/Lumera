import { Card, Color } from '../engine/types';
import { useT } from '../i18n';
import { CardBack, CardFace } from './Card';

const card = (color: Color, num: number): Card => ({ id: -1, kind: 'number', color, num });

/** 接牌演示：梯顶 Aurel 3，循环展示三种合法接法（同色更大 / 同数字换色 / 同色相同）。 */
export function LadderDemo() {
  const { t } = useT();
  return (
    <div className="rule-demo">
      <div className="rd-col">
        <CardFace small card={card('aurel', 3)} />
        <span className="rd-cap">{t('梯顶')}</span>
      </div>
      <span className="rd-arrow">→</span>
      <div className="rd-slot">
        <div className="rd-opt rd-opt-a">
          <CardFace small card={card('aurel', 7)} />
          <span className="rd-cap rd-ok">{t('同色更大')}</span>
        </div>
        <div className="rd-opt rd-opt-b">
          <CardFace small card={card('thalos', 3)} />
          <span className="rd-cap rd-ok">{t('同数字换色')}</span>
        </div>
        <div className="rd-opt rd-opt-c">
          <CardFace small card={card('aurel', 3)} />
          <span className="rd-cap rd-ok">{t('同色相同')}</span>
        </div>
      </div>
    </div>
  );
}

/** 截牌演示：盖着的牌被翻面对质（循环翻牌）。 */
export function ChallengeDemo() {
  const { t } = useT();
  return (
    <div className="rule-demo">
      <div className="rd-col">
        <div className="rd-flip">
          <div className="rd-flip-inner">
            <div className="rd-flip-back">
              <CardBack small />
            </div>
            <div className="rd-flip-front">
              <CardFace small card={card('selvar', 2)} />
            </div>
          </div>
        </div>
        <span className="rd-cap">{t('截牌 → 翻面对质')}</span>
      </div>
    </div>
  );
}
