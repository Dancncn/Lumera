# 《源河 · Lumera》人机系统：数学模型与技术实现

> 本文描述当前人机对手（AI）的数学模型与工程实现。代码主体在 [`web/src/engine/ai.ts`](../web/src/engine/ai.ts)，随机源在 [`web/src/engine/rng.ts`](../web/src/engine/rng.ts)，单机/联机两个驱动层分别在 [`web/src/store/gameStore.ts`](../web/src/store/gameStore.ts) 与 [`server/src/room.ts`](../server/src/room.ts)。规则术语见 [game-rules.md](game-rules.md)，整体架构见 [architecture.md](architecture.md)。

---

## 〇、设计目标与「不作弊」约束

人机的目标不是「最强」，而是**像人**：有性格、会失误、靠公开信息读牌、思考有快有慢、同一局面不总做同一件事。

一条硬约束贯穿始终：**AI 只吃 `viewFor(state, seat)` 给出的过滤视图**，与真人完全同构——它看不到牌库顺序、看不到别人的手牌、看不到桌上盖着的真实牌。所有「读牌」都只能基于公开信息（别人宣称了什么、谁质疑过、摊牌时亮出的牌、各人手牌数量/计分/凝聚度）去**统计推断**。因此「会偷看底牌的作弊 AI」在结构上根本写不出来（详见 [architecture.md](architecture.md) §四的安全边界论述）。

整个决策管线可以概括为：

```
公开事件流 ──observe()──► 对手模型(opp) + 牌张记忆(seen) + 上头(tilt)
                                              │
当前视图 view ──decide()──► 估计诈牌概率 pLie ─┤
                                              ▼
                        性格(traits) × 难度 × 风险/威胁/上头  ──► 行动概率 ──► 抽样出 Command
                                              │
                                              └──► 思考时长 delayMs()（拟人节奏）
```

---

## 一、性格档案（Persona）

每个 AI 由一个 **7 维性格向量** `Traits` 刻画，每维取值 `[0,1]`：

| 维度 | 字段 | 含义 |
|------|------|------|
| 诈牌倾向 | `bluff` | 越高越爱盖牌撒谎 |
| 质疑倾向 | `challenge` | 越高越爱戳穿别人 |
| 冒险 | `risk` | 越高越敢爬高梯/留王牌/赌一把 |
| 看人 | `read` | 越高越依赖对手模型与牌张计数 |
| 理性 | `rationality` | 越高越走「最优」分支（启用蒙特卡洛、EV 阈值、风险修正） |
| 上头 | `tilt` | 受挫后情绪波动幅度 |
| 耐心 | `patience` | 越高思考越久 |

预置 5 种性格（`PROFILES`，[ai.ts:35](../web/src/engine/ai.ts#L35)）：

| 性格 | bluff | challenge | risk | read | rationality | tilt | patience |
|------|-------|-----------|------|------|-------------|------|----------|
| aggressive 激进 | 0.70 | 0.75 | 0.80 | 0.50 | 0.55 | 0.70 | 0.25 |
| steady 稳健 | 0.35 | 0.45 | 0.40 | 0.55 | 0.80 | 0.30 | 0.50 |
| cautious 谨慎 | 0.20 | 0.30 | 0.25 | 0.65 | 0.80 | 0.25 | 0.80 |
| capricious 善变 | 0.55 | 0.60 | 0.65 | 0.35 | 0.35 | 0.80 | 0.35 |
| cunning 狡黠 | 0.55 | 0.55 | 0.55 | 0.85 | 0.85 | 0.35 | 0.60 |

**性格分配是确定性的**：用 `pickProfile(seed, seat)` 把（局种子, 座位号）经一个 32 位混合散列 `mixHash` 映射到 5 种性格之一（[ai.ts:47](../web/src/engine/ai.ts#L47)）。同一局里座位与性格的对应固定、可复现；换一局种子则重新洗牌。玩家看到的 AI 名字就带上了性格标签（如 `Selvar · 狡黠`）。

---

## 二、难度调制（Difficulty）

难度 `easy / normal / hard / master` 不是另一套 AI，而是对性格向量做一次**仿射变换**后再用（`applyDifficulty`，[ai.ts:58](../web/src/engine/ai.ts#L58)）。核心是缩放「理性 / 看人 / 质疑」这三维——它们决定 AI 用不用蒙特卡洛、信不信对手模型、敢不敢抓：

| 难度 | 主要变换（节选） |
|------|------------------|
| easy | `rationality ×0.7`、`read ×0.55`、`challenge ×0.9`——更钝、更少读人、更少抓 |
| normal | `rationality ×1.1+0.06`、`read ×1.12+0.06`、`challenge ×1.05+0.03` |
| hard | `rationality ×1.2+0.12`、`read ×1.25+0.12`、`challenge ×1.1+0.05` |
| master | 七维全面增强：`read ×1.35+0.18`、`rationality ×1.35+0.20`、`challenge ×1.15+0.10`，并**压低 `tilt ×0.5`**（更冷静）、抬高耐心 |

所有结果经 `clamp` 收回 `[0,1]`。直觉：难度越高，AI 越多走「理性分支」（§四、§五里 `rationality > 0.65 / 0.7` 的门槛会被跨过），读牌越准、抓得越狠、越不上头。

---

## 三、信息来源：牌张计数与对手建模

AI 的两类「记忆」都在 `observe(events, view)` 里随公开事件更新（[ai.ts:256](../web/src/engine/ai.ts#L256)）。

### 3.1 牌张记忆 `seen`

每当有牌被**公开**（摊牌 `CardRevealed`、兜底亮手 `Fallback`），按概率把它记进 `seen`（一个 `key -> 计数` 的 Map，key 为 `color:num` / `wild` / `func`）。**记牌不是必然成功**，模拟人的记忆力：

```
P(记住一张公开的牌) = 0.3 + 0.7 · read
```

由此可估「某张牌还剩几张没出现」（`countRemaining`，[ai.ts:138](../web/src/engine/ai.ts#L138)）：

```
该色该数字总张数 total = (num==0 ? 1 : 2)
remaining   = max(0, total − 我手里持有数 − 已见数)
unseenWilds = max(0, 玩家数 − 我手里万能牌 − 已见万能牌)
```

`remaining + unseenWilds` 就是「某人手里**可能**真持有这张宣称牌」的牌源规模——这是判断对方有没有撒谎的物理上限（万能牌恒判真，所以未现身的万能牌也算「能接得上」的牌源）。

### 3.2 对手模型 `opp`

对每个对手座位维护四个计数：`claims / lies / truths / challenges`（出过几次牌、被翻出过几次假/真、质疑过几次）。由此导出两个估计量：

**对手诈牌率**（`bluffRate`，[ai.ts:286](../web/src/engine/ai.ts#L286)）用伪计数平滑（等价于以先验均值 0.4、先验强度 2 的 Beta 平滑），证据少时回落到先验：

```
bluffRate(seat) = (lies + 0.4 × 2) / (lies + truths + 2)        // 无记录时 = 0.4
```

**对手嗜抓度**（`trigger`，[ai.ts:295](../web/src/engine/ai.ts#L295)）——他越爱质疑，我越不敢对他诈牌：

```
trigger(seat) = challenges / (challenges + 3)                    // 无记录时 = 0.35
```

### 3.3 上头 `tilt`

情绪状态。每次 `observe` 先整体衰减 `tilt ×= 0.85`；当**自己**被翻出撒谎、或自己中枪复归（`Returned`）时，`tilt` 上跳（幅度随性格 `tilt` 维放大）。`tilt` 会在 §五里抬高质疑欲、在 §七里抬高诈牌欲——模拟人「越输越上头」。

---

## 四、诈牌概率 `pLie` 的三源估计

轮到 AI 决定**要不要质疑上家**时（`decideRespond`，[ai.ts:321](../web/src/engine/ai.ts#L321)），核心是估计上家这一手宣称为假的概率 `pLie`。

### 4.0 地板：数学必诈

若 `remaining <= 0 且 unseenWilds <= 0`，即**全世界都不可能再有这张牌**，则对方必然在撒谎 → 近乎必抓：

```
missRate = 0.02 + (1 − rationality) × 0.03      // 仅留极小失手率（手滑）
challenge  if  rand() ≥ missRate
```

### 4.1 三个证据源

| 源 | 公式 | 说明 |
|----|------|------|
| 牌张计数 `countLie` | `clamp(1 − (remaining + 0.4·unseenWilds) / max(1, maxCopies))` | 可能持有的牌源越少，越像在骗 |
| 历史 `histLie` | `0.32 + read · (bluffRate(player) − 0.4) · 0.7` | 这人一向爱骗 → 上调；`read` 越高越信对手模型 |
| 价值偏置 `valueBias` | `(val(num)/10) · 0.12` | 宣称的数字越大越可疑（高位牌稀缺，撑场面更可能是吹） |

其中 `val(num)` 把 `0` 当作该色最大值 `10`（[game.ts:34](../web/src/engine/game.ts#L34)）。

### 4.2 蒙特卡洛（仅高理性启用）

`rationality > 0.65` 时额外跑一遍蒙特卡洛 `mcLieProb`（[ai.ts:152](../web/src/engine/ai.ts#L152)）：把所有「未现身的牌」组成一个牌池，其中能让宣称**成真**的牌为 `good = 该宣称牌剩余张数 + 未现身万能牌`，其余为 `other`（含 >2 人时未现身的功能牌）。然后从牌池里**无放回**地抽 `handSize ≈ 对方手牌数 + 1` 张（`+1` 因为他刚打出一张），重复 `runs` 次（理性 >0.8 跑 60 次，否则 30 次），统计「抽到至少一张 good」的频率：

```
pLie_MC = 1 − P(handSize 抽样中至少命中一张 good)
```

这本质是对**超几何分布**「对方手里一张能接的牌都没有」的概率做蒙特卡洛估计——比纯计数更细，因为它考虑了对方手牌的容量。

### 4.3 合成

```
高理性（>0.65）:  pLie = mix(countLie, mcLie, 0.6)·0.65 + histLie·0.25 + valueBias
               // mix(a,b,0.6)=0.4·countLie+0.6·mcLie，即以 MC 为主、计数为辅
低理性        :  pLie = countLie·0.5 + histLie·0.35 + (iHold/maxCopies)·0.15 + valueBias
               // iHold = 我自己手里持有几张这张牌（我占得越多，对方越不可能真有）

若 remaining<=0:  pLie = max(pLie, 0.7)        // 计数已说几乎不可能，托住下限
最终              pLie = clamp(pLie, 0.05, 0.97)
```

---

## 五、质疑决策：EV 阈值 与 sigmoid 两条路径

拿到 `pLie` 后，转成「这次出手质疑的概率」`pCh`，再 `rand() < pCh` 抽样定夺。分两条路径：

### 5.1 高理性（`rationality > 0.6`）：期望值阈值

先算一个**盈亏平衡的诈牌概率阈值** `evThreshold`：质疑赢了能吞下整摞牌堆（赌注 ∝ `pile`），输了要掷骰受罚（风险 ∝ 当前受罚累进 `escalation`）：

```
pile        = max(pileCount, 1)
escRisk     = escalation × 1.5
evThreshold = (pile + escRisk) / (2·pile + escRisk)
```

这个阈值的行为（恒在 `(0.5, 1]` 内）：

- **牌堆越肥** → 阈值越趋近 `0.5` → 哪怕只是六成把握也愿意赌（池子大，值得搏）；
- **自己受罚累进越高** → 阈值越趋近 `1` → 越谨慎（猜错就要在高累进下掷骰，很可能中枪）。

再按性格与情绪微调，并把「`pLie` 高/低于阈值」映射成一条分段线性的出手概率（保持随机、不做硬切）：

```
adjusted = evThreshold − (challenge − 0.5)·0.12 − tilt·0.06     // 爱抓/上头 → 阈值下移
pCh = pLie > adjusted ? clamp(0.7 + (pLie−adjusted)·2)          // 越过阈值：大概率抓
                      : clamp(0.15 + (pLie−adjusted)·1.5)       // 没过阈值：小概率试探
```

### 5.2 低理性：sigmoid 软判

直接定一个阈值再用 sigmoid 把「`pLie` 超出阈值的余量」压成概率，理性越低曲线越缓（越随性）：

```
thr = clamp(0.55 − (challenge−0.5)·0.5 − min(pile,10)·0.012 − tilt·0.1,  0.18, 0.85)
pCh = sigmoid((pLie − thr) · (4 + rationality·8))
floor = 0.04 + (1 − rationality)·0.10
pCh = clamp(pCh, floor, 1 − floor)        // 理性越低，越保留两头的「意外」
```

### 5.3 风险/威胁修正（仅 `rationality > 0.7`）

```
pCh −= riskScore(view) · 0.12               // 自己越脆弱，越不敢赌
pCh += opponentThreat(view, player) · 0.18  // 对手越接近得分，越要拦
pCh = clamp(pCh, 0.03, 0.98)
```

- `riskScore`（[ai.ts:208](../web/src/engine/ai.ts#L208)）综合自己的受罚累进、命数脆弱度、手牌领先/落后，输出「我现在多怕出事」。
- `opponentThreat`（[ai.ts:219](../web/src/engine/ai.ts#L219)）综合对手手牌将空（快跑成）与已得分，输出「他多有威胁」。

---

## 六、出牌与宣称

轮到 AI 出牌（`decidePlay`，[ai.ts:385](../web/src/engine/ai.ts#L385)）：先看有没有可出的数字/万能牌（没有则 `Fallback` 兜底）；非首家时按概率先**明甩功能牌**（嗜抓的下家在场时更想甩 `skip` 跳过他）；随后进入首家或跟牌分支。

### 6.1 首家起手（`firstPlay`，[ai.ts:422](../web/src/engine/ai.ts#L422)）

首家须宣称某色 `1..3`。手里有真 `1..3` 时**大概率老实打**（诈牌概率随 `bluff` 升高）；没有低牌时则盖任意一张、谎称一个低牌。高理性者会把宣称颜色**偏向自己手里的优势色**（后续更接得上，圆得回来）。

### 6.2 跟牌（`followPlay`，[ai.ts:450](../web/src/engine/ai.ts#L450)）

优先级大致是：

1. **有合法的老实牌** → 多数情况老实接，用 `pickEscalation` 决定爬多高（保守者贴着梯顶、冒险者跳高）；小概率改为诈牌。
2. **接不上**（无老实牌）→ 按 `pDraw` 概率先 `Draw` 补一张（保守、耐心者更爱摸；下家嗜抓则少摸）。
3. **万能牌**：当作脱困王牌，`risk` 高者倾向留着不轻易出。
4. **诈牌**：`bluffAppetite = clamp(bluff + tilt·0.2 − danger·0.5·read)`（上头更敢诈、下家嗜抓则收敛），高理性再减 `riskScore`。无路可退（不能摸、无万能）时被迫诈。

### 6.3 选宣称内容（`pickClaim`，[ai.ts:252](../web/src/engine/ai.ts#L252)）

要诈牌时，「喊什么」很关键——目标是**让对方难以证伪**。

- 高理性走 `strategicBluffClaim`（[ai.ts:227](../web/src/engine/ai.ts#L227)）：给每个合法宣称打分，偏好 **`remaining + unseenWilds` 大**（牌源多、不易被算死）、**爬升幅度小**（`val` 低，留余地），并参考下家嗜抓度 `trigger`——对方越爱抓，越要挑「圆得最稳」的牌喊。
- 低理性走 `smartBluffClaim`（[ai.ts:195](../web/src/engine/ai.ts#L195)）或直接 `minEscalation` 取最小爬升。

---

## 七、受罚选点

进入受罚（俄罗斯轮盘）阶段时，AI 选定本次要赌的点数 `1..6`——当前实现是**均匀随机**（`ChooseNumber, n = 1 + ⌊rand()·6⌋`，[ai.ts:305](../web/src/engine/ai.ts#L305)）。因为每个点数命中概率相同，这里没有可优化的空间，随机即可。

---

## 八、拟人思考节奏

AI 绝不秒回、也不匀速。每次决策算一个停顿 `think(base, span, hardness)`（[ai.ts:525](../web/src/engine/ai.ts#L525)）：

```
slow = 0.65 + patience·0.8                       // 耐心越高越慢
ms   = (base + span · clamp(hardness)) · slow     // 抉择越难（hardness 大）停越久
ms  *= 0.75 + rand()·0.6                          // ±抖动，绝不复读
ms   = clamp(round(ms), 240, 3200)                // 收进 0.24s–3.2s
```

`hardness` 由当前抉择的「纠结程度」给：质疑分支里 `hardness = 1 − min(1, |pLie − 0.5|·3)`——`pLie` 越接近 5 成（最难判）停得越久；一边倒的局面则快。

驱动层另有一套**为动画服务**的节拍 `delayFor(events)`（翻牌/掷骰/摊牌各有不同停顿），最终采用 `max(delayFor, ai.delayMs())`，既保证 AI「在思考」的观感，又给前端特效留足时间。

---

## 九、随机性与可复现

- 每个 AI 持有**自己独立的一条种子化 RNG 流**：构造时 `rng = seed ^ hash(seat)`，推进用 mulberry32（`nextRng`，[rng.ts:5](../web/src/engine/rng.ts#L5)）。
- 因此：**同一局**（同种子）完全可复现，便于调试与回放；**不同局**有变数；**同一局面**因 RNG 已推进，也不总做同一件事（决策处处是 `rand()` 抽样而非硬规则）。
- 引擎本身的随机（洗牌、掷骰）与 AI 的随机是**两条独立的种子流**，互不污染。

---

## 十、类与接口（技术实现）

核心是一个有状态的类 `AiPlayer`（[ai.ts:96](../web/src/engine/ai.ts#L96)）：

```ts
class AiPlayer {
  constructor(opts: { seat: number; seed: number; profile?: AiProfile; difficulty?: Difficulty });

  observe(events: GameEvent[], view: PlayerView): void;  // 喂入公开事件，更新 opp / seen / tilt
  decide(view: PlayerView): Command;                     // 仅凭过滤视图产出一条命令
  delayMs(): number;                                     // 上一次 decide 估出的拟人停顿
}
```

- **内部状态**：`traits`（已按难度调制）、`rng`（独立流）、`opp`（对手模型 Map）、`seen`（牌张记忆 Map）、`tilt`、`lastDelay`。
- **`decide` 按 `view.prompt.kind` 分派**：`penalty → ChooseNumber`、`respond → decideRespond`、`play → decidePlay`、其它（不是你行动）→ `Accept`。
- **唯一输入是 `PlayerView`**——这就是「结构上不可作弊」的实现层保证。
- 文件末尾另有一个无状态便捷函数 `chooseCommand(view)`（[ai.ts:535](../web/src/engine/ai.ts#L535)），用一个临时 AI 池决策、**无对手记忆**，仅供测试/兜底；真正对局一律由驱动层持久的 `AiPlayer` 实例驱动。

---

## 十一、驱动层接入（单机 / 联机）

两端复用**同一个 `AiPlayer`**，模式一致：建局时给每个 AI 座位 `new AiPlayer({ seat, seed, profile: pickProfile(seed, seat), difficulty })`，每次 `apply` 之后对所有 AI 调一遍 `observe`，轮到 AI 行动时 `decide` + 延时 `setTimeout` 再把命令喂回 `apply`。

| | 单机（[gameStore.ts](../web/src/store/gameStore.ts)） | 联机（[room.ts](../server/src/room.ts)） |
|---|---|---|
| AI 容器 | 模块级 `ais: Map<seat, AiPlayer>` | 每个 `Room` 实例的 `this.ais` |
| 观察 | `observeAll` 对每个 AI 喂 `viewFor(state, seat)` | 同左 |
| 驱动 | `loop()`：`setTimeout(max(delayFor, ai.delayMs()))` | `drive()`：`setTimeout(max(delayFor, ai.delayMs()·DELAY_SCALE))` |
| 难度来源 | `newGame(players, difficulty)` 传入（默认 normal） | 环境变量 `YUANHE_AI_DIFFICULTY`（默认 normal） |
| 命名 | `${AI_NAMES[i]} · ${PERSONA_LABEL[profile]}` | 同左（真人座位掉线转 AI 也复用此名） |
| 掉线接管 | — | 真人掉线超时，用一个**临时 AI**（随机性格）替他出一手（`takeover`） |

驱动层都做了 stale-closure 防护：`setTimeout` 回调里一律 `getState()` / `this.state` 现取最新状态，并校验「轮到的还是同一个 AI 座位」才落子（[gameStore.ts:109](../web/src/store/gameStore.ts#L109)、[room.ts:337](../server/src/room.ts#L337)）。

---

## 十二、验证（无头模拟）

AI 既是对手，也是引擎的**对抗性压力测试器**。`npm run sim`（[sim.ts](../web/src/engine/sim.ts)）让 AI 自我对弈跑 **1200 场**（2/3/4 人各 400 场、种子遍历，难度按 `seed % 4` 在四档间轮替），每局逐步断言：

- **牌张守恒**：`deck + pile + discard + Σ(hand + scored)` 恒等于建局牌数；
- **无信息泄露**：随机抽查座位视图，确认其中**不含**他人在手牌 id、不含牌堆盖牌 id（摊牌公开的除外）——这正是 §〇「不作弊」约束的自动化回归；
- **必然终局**：上限 30000 步内一定进入 `over`，否则报死循环；
- **状态合法**：凝聚度、受罚累进等不越界。

跑完还会打印平均/中位/最长步数，作为节奏与平衡的体感参考。

---

## 附：可调参数一览

| 位置 | 参数 | 作用 |
|------|------|------|
| `PROFILES` | 5×7 性格矩阵 | 性格基线 |
| `applyDifficulty` | 4 档仿射系数 | 难度强弱 |
| `recordCard` | `0.3 + 0.7·read` | 记牌成功率 |
| `bluffRate` | 先验 `0.4`、强度 `2` | 对手诈牌率平滑 |
| `trigger` | 分母 `+3` | 对手嗜抓度平滑 |
| `decideRespond` | `evThreshold` / `thr` / sigmoid 斜率 | 质疑阈值与软硬程度 |
| `mcLieProb` | `runs = 30 / 60` | 蒙特卡洛采样次数 |
| `think` | `[240, 3200]ms`、`slow` | 拟人停顿区间 |
| 驱动层 | `delayFor`、`DELAY_SCALE` | 动画节拍与全局快慢 |

调这些不动任何引擎规则——AI 是引擎之外的一层「玩家」，与规则数值（`GameConfig`）相互独立。
