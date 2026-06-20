# 《源河 · Lumera》人机系统：数学模型与技术实现

> 本文描述当前人机对手（AI）的数学模型与工程实现。代码主体在 [`web/src/engine/ai.ts`](../web/src/engine/ai.ts)，随机源在 [`web/src/engine/rng.ts`](../web/src/engine/rng.ts)，单机/联机两个驱动层分别在 [`web/src/store/gameStore.ts`](../web/src/store/gameStore.ts) 与 [`server/src/room.ts`](../server/src/room.ts)。规则术语见 [game-rules.md](game-rules.md)，整体架构见 [architecture.md](architecture.md)。

---

## 〇、设计目标与「不作弊」约束

人机的目标不是「最强」，而是**像人**：有性格、会失误、靠公开信息读牌、思考有快有慢、同一局面不总做同一件事。唯有最高的**大师档**例外——它从博弈论最优基线出发、再叠加剥削，专门用来当「最终 boss」（见 §十）。

一条硬约束贯穿始终：**AI 只吃 `viewFor(state, seat)` 给出的过滤视图**，与真人完全同构——它看不到牌库顺序、看不到别人的手牌、看不到桌上盖着的真实牌。所有「读牌」都只能基于公开信息（别人宣称了什么、谁质疑过、谁放行了、摊牌时亮出的牌、各人手牌数量/计分/凝聚度）去**统计推断**。因此「会偷看底牌的作弊 AI」在结构上根本写不出来（详见 [architecture.md](architecture.md) §四的安全边界论述）。

整个决策管线可以概括为：

```
公开事件流 ──observe()──► 对手模型(opp：诈牌率/嗜抓度/放行记录) + 牌张记忆(seen+去重) + 上头(tilt)
                                              │
当前视图 view ──decide()──► 估计诈牌概率 pLie ─┤
                                              ▼
              性格(traits) × 难度 × 真命成本EV阈值 p* × 多人外部性κ × 全场危险 × 上头  ──► 行动概率 ──► 抽样出 Command
                                              │
                                              └──► 思考时长 delayMs()（拟人节奏）
```

> 开启**混沌天气（DLC）**时，`decide` 会在上述管线之上再叠一层「维度建议层」对各概率做有界微调（见 §十一）；关闭天气时该层短路，行为与本文逐字节一致。

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

预置 5 种性格（`PROFILES`，[ai.ts](../web/src/engine/ai.ts)）：

| 性格 | bluff | challenge | risk | read | rationality | tilt | patience |
|------|-------|-----------|------|------|-------------|------|----------|
| aggressive 激进 | 0.70 | 0.75 | 0.80 | 0.50 | 0.55 | 0.70 | 0.25 |
| steady 稳健 | 0.35 | 0.45 | 0.40 | 0.55 | 0.80 | 0.30 | 0.50 |
| cautious 谨慎 | 0.20 | 0.30 | 0.25 | 0.65 | 0.80 | 0.25 | 0.80 |
| capricious 善变 | 0.55 | 0.60 | 0.65 | 0.35 | 0.35 | 0.80 | 0.35 |
| cunning 狡黠 | 0.55 | 0.55 | 0.55 | 0.85 | 0.85 | 0.35 | 0.60 |

**性格分配是确定性的**：用 `pickProfile(seed, seat)` 把（局种子, 座位号）经一个 32 位混合散列 `mixHash` 映射到 5 种性格之一（[ai.ts](../web/src/engine/ai.ts)）。同一局里座位与性格的对应固定、可复现；换一局种子则重新洗牌。玩家看到的 AI 名字就带上了性格标签（如 `Selvar · 狡黠`）。

---

## 二、难度调制（Difficulty）

难度 `easy / normal / hard / master` 不是另一套 AI，而是对性格向量做一次**仿射变换**后再用（`applyDifficulty`，[ai.ts](../web/src/engine/ai.ts)）。核心是缩放「理性 / 看人 / 质疑」这三维——它们决定 AI 用不用蒙特卡洛、信不信对手模型、敢不敢抓——同时调味「诈牌 / 上头 / 耐心」塑造手感：

| 难度 | 变换要点 | 手感 |
|------|----------|------|
| **easy** | `rationality ×0.55`、`read ×0.4`、`challenge ×0.75`，但**抬高** `bluff ×1.3`、`tilt ×1.8+0.15` | 莽撞新手：算不清、记不住、爱乱诈、一受挫就上头 |
| **normal** | `rationality ×1.08+0.06`、`read ×1.1+0.06`、`challenge ×1.06+0.03` | 基线小幅增强，松弛可亲 |
| **hard** | `rationality` 封顶 `0.86`、`read` 封顶 `0.82`、`challenge ×1.2+0.10`、压 `bluff`、`tilt ×0.4`、抬耐心 | 老练对手：读得准、爱抓、冷静，但**刻意不触顶**（留一线人味） |
| **master** | 直接重写为近最优基线：`rationality≈0.99`、`read≈0.98`、`challenge≈0.82`、`tilt ×0.02`，原性格仅作约 ±1–5% 的调味噪声 | 最终 boss：**所有性格都解锁全部智能**，几乎不上头、几乎不失误（见 §十） |

所有结果经 `clamp` 收回 `[0,1]`。直觉：难度越高，越多跨过 §四、§五里 `rationality > 0.55 / 0.6 / 0.7` 的门槛，读牌越准、抓得越狠、越不上头；只有 master 把理性/看人推到接近 1，从而无条件启用全部高级特性。

---

## 三、信息来源：牌张计数与对手建模

AI 的「记忆」都在 `observe(events, view)` 里随公开事件更新（[ai.ts](../web/src/engine/ai.ts)）。

### 3.1 牌张记忆 `seen`

每当有牌被**公开**——摊牌 `CardRevealed`、兜底亮手 `Fallback`、以及**摸牌亮牌 `HandRevealed`**（反屯牌规则：摸牌时随机亮一张手牌给全场）——就把它记进 `seen`（`key -> 计数` 的 Map，key 为 `color:num` / `wild` / `func`），并把该物理牌 id 记入 `seenIds` **去重**（同一张牌先被 `HandRevealed`、后又被 `CardRevealed` 不会重复计数）。

记牌**按难度保留**，模拟记忆力（`recordCard`，[ai.ts](../web/src/engine/ai.ts)）：

```
公开硬信息（摊牌/兜底/摸牌亮牌）：rationality>0.7（master/hard）强制记入；否则按难度保留率 ρ 概率遗忘
ρ(d) = master 1.0 / hard 0.9 / normal 0.7 / easy 0.4      // easy 大漏 = 记牌残缺（保梯度）
```

> **修过的两处记牌缺陷**：① `HandRevealed` 早期**完全没吃**，对手摸牌亮的牌 AI 视而不见（你的「它真记牌吗」之疑由此而来）；② 同名牌被多事件双记会让 `seen` 虚高、误触「必诈地板」造成假阳性质疑。现分别由「吃 HandRevealed」与「按 id 去重」修复——这是 §五的 `p*` 阈值能真正生效的前提：阈值再对，`pLie` 估计烂照样误判。

由此可估「某张牌还剩几张没出现」（`countRemaining`，[ai.ts](../web/src/engine/ai.ts)）：

```
该色该数字总张数 total = (num==0 ? 1 : 2)
remaining   = max(0, total − 我手里持有数 − 已见数)
unseenWilds = max(0, 玩家数 − 我手里万能牌 − 已见万能牌)
```

`remaining + unseenWilds` 就是「某人手里**可能**真持有这张宣称牌」的牌源规模——判断对方有没有撒谎的物理上限（万能牌恒判真，所以未现身的万能牌也算「能接得上」的牌源）。

### 3.2 对手模型 `opp`

对每个对手座位维护一组计数（`OppStat`，[ai.ts](../web/src/engine/ai.ts)）：`claims / lies / truths / challenges / passes`。

**「放行」是怎么记的？** 源河的规则是**全场任何人都可质疑**（见 [game-rules.md](game-rules.md)）。所以每当有人出牌（`CardPlayed`），`observe` 先把当时所有「有资格质疑的人」记入 `pendingChallengers`；等到有人真的质疑（`Challenged`）或回合推进（`TurnStarted`）时，把**没出手的那些人**记一次 `passes`（[ai.ts](../web/src/engine/ai.ts)、[ai.ts](../web/src/engine/ai.ts)）。这让 AI 不只看「谁爱抓」，还能看「谁该抓却一直放」——可趁虚而入。

由这些计数导出几个估计量：

| 估计量 | 公式 | 用途 |
|--------|------|------|
| 对手诈牌率 `bluffRate` | `(lies + 0.4·2)/(lies + truths + 2)`，无记录 = 0.4 | 这人一向爱不爱骗（Beta 先验平滑，[ai.ts](../web/src/engine/ai.ts)） |
| 嗜抓度 `trigger` | `challenges/(challenges + 3)`，无记录 = 0.35 | 他多爱质疑（[ai.ts](../web/src/engine/ai.ts)） |
| 全场危险 `aggregateDanger` | `1 − ∏(1 − trigger_i)`（遍历所有在场对手） | 我这一手被**任何人**抓的总概率（[ai.ts](../web/src/engine/ai.ts)） |
| 精细质疑率 `challengeRate` | `(challenges + 0.9)/(challenges + passes + 3)`，样本 <3 或无记录 = 0.3 | **大师/老练独占**：区分「真爱抓」与「只是没机会」，用于挑出全场最爱拆者来校准诈牌频率 f\*（[ai.ts](../web/src/engine/ai.ts)） |

注意 `trigger` 与 `aggregateDanger` 是面向「我要不要诈牌」的——全场越嗜抓，我越不敢诈；`challengeRate` 则供大师/老练算 §六的无差异诈牌频率 `f*`（面向**全场最爱拆者**而非单一下家，反诱导）。

### 3.3 上头 `tilt`

情绪状态。每次 `observe` 先整体衰减 `tilt ×= 0.85`；当**自己**被翻出撒谎、或自己中枪复归（`Returned`）时，`tilt` 上跳（幅度随性格 `tilt` 维放大）。`tilt` 会在 §五抬高质疑欲、在 §六抬高诈牌欲——模拟人「越输越上头」。难度越高 `tilt` 被压得越狠（master 几乎为 0）。

---

## 四、诈牌概率 `pLie` 的三源估计

轮到 AI 决定**要不要质疑刚出牌的人**时（`decideRespond`，[ai.ts](../web/src/engine/ai.ts)），核心是估计这一手宣称为假的概率 `pLie`。

### 4.0 地板：数学必诈

若 `remaining <= 0 且 unseenWilds <= 0`，即**全世界都不可能再有这张牌**，则对方必然撒谎 → 近乎必抓：

```
missRate = (rationality > 0.95) ? 0 : 0.02 + (1 − rationality)·0.03     // 大师零失误
challenge  if  rand() ≥ missRate
```

### 4.1 三个证据源

| 源 | 公式 | 说明 |
|----|------|------|
| 牌张计数 `countLie` | `clamp(1 − (remaining + 0.4·unseenWilds) / max(1, maxCopies))` | 可能持有的牌源越少，越像在骗 |
| 历史 `histLie` | `0.32 + read · (bluffRate(player) − 0.4) · 0.7` | 这人一向爱骗 → 上调；`read` 越高越信对手模型 |
| 价值偏置 `valueBias` | `(val(num)/10) · 0.12` | 宣称的数字越大越可疑（高位牌稀缺） |

其中 `val(num)` 把 `0` 当作该色最大值 `10`（[game.ts](../web/src/engine/game.ts)）。

### 4.2 蒙特卡洛

`rationality > 0.55` 时额外跑蒙特卡洛 `mcLieProb`（[ai.ts](../web/src/engine/ai.ts)）：把所有「未现身的牌」组成牌池，其中能让宣称**成真**的为 `good = 该宣称牌剩余 + 未现身万能牌`，其余为 `other`（含 >2 人时未现身的功能牌）。从池中**无放回**抽 `handSize ≈ 对方手牌数 + 1` 张（`+1` 因为他刚打出一张），重复 `runs` 次，统计「至少抽到一张 good」的频率：

```
pLie_MC = 1 − P(handSize 抽样中至少命中一张 good)
runs = 200 (rat>0.95) / 100 (>0.9) / 60 (>0.75) / 30 (其余)     // 越理性采样越密
```

这本质是对**超几何分布**「对方手里一张能接的牌都没有」的概率做蒙特卡洛估计——比纯计数更细，因为它考虑了对方手牌的容量。

### 4.3 合成

```
高理性（rationality>0.55）:  pLie = mix(countLie, mcLie, 0.6)·0.65 + histLie·0.25 + valueBias
                          // mix(a,b,0.6)=0.4·countLie+0.6·mcLie，即以 MC 为主、计数为辅
低理性                   :  pLie = countLie·0.5 + histLie·0.35 + (iHold/maxCopies)·0.15 + valueBias
                          // iHold = 我自己手里持有几张这张牌（我占得越多，对方越不可能真有）

若 remaining<=0:  pLie = max(pLie, 0.7)        // 计数已说几乎不可能，托住下限
（大师终局读心见 §十）
最终              pLie = clamp(pLie, 0.05, 0.97)
```

---

## 五、质疑决策：真命成本破局阈值

拿到 `pLie` 后转成「出手质疑的概率」`pCh`，再 `rand() < pCh` 抽样定夺。核心是一条**期望值不等式**：质疑赢了吞下整摞牌堆（+P），输了既掉一条命（−L）又把牌堆白送对手。

### 5.1 真命成本 L（`lifeCost`，[ai.ts](../web/src/engine/ai.ts)）

输掉质疑要受罚掷骰，掉命的期望损失就是「真命成本」。引擎的受罚轮盘：赌定 `N = min(escalation, 6)` 个不同点；`N ≥ 3`（`penaltyTwoDiceFrom` 默认 3）时掷 **2 颗**骰、否则 1 颗，任一落在所赌点即掉 1 命（命值 `lifeLossValue = 5`）：

```
N = min(max(esc, 1), 6)
P(中枪) = N≥3 ? 1 − ((6−N)/6)²    // 双骰，尾部骤升
              : N/6               // 单骰
L = 5 · P(中枪)
```

逐档实测：`L(1)=0.83, L(2)=1.67, L(3)=3.75, L(4)=4.44, L(5)=4.86, L(6)=5.0`。**esc≥3 的双骰让代价从 esc3 起骤升（3.75 而非线性的 2.5）**——这是「越到后期越不敢乱拆」的数学锚。L 取**我自己**当前的 escalation（质疑失败是我受罚）。

### 5.2 破局阈值 p\*

设 `pLie` 为对方撒谎概率、`P = max(pileCount, 1)` 为牌堆赌注。质疑相对放行的期望增益：

```
ΔEV = pLie·P − (1−pLie)·(L + P)       // 赢吞 P；输既掉 L 又把 P 送给对手 → 全摆动
ΔEV > 0  ⟺  pLie > p* = (P + L) / (2P + L)
```

> **关键修正**：早期版本误用 `p* = L/(P+L)`，漏算了「输掉质疑还把牌堆喂给对手」这半个摆动，导致**严重过度质疑**（实测命中率仅 44%、每局全场掉 7.5 命、躺平不抓的人反而赢）。计入全摆动后阈值恒在 `(0.5, 1)`，质疑变得「少而准」（掉命 −36%、躺平剥削者从 31% 打回 7%）。

### 5.3 多人外部性修正 κ（`kingmakerKappa`，大师/老练独占）

3 人以上时，A 拆 B 无论输赢都有人受损，**没参与的第三方坐收渔利**（kingmaker）。于是按相对名次修正阈值——只为拆真正领先者花命、垫底互拆要收敛：

```
κ = (avgOtherThreat − threatB) · coef · (1 + (N_active−2)·0.15) · (0.6 + 0.8·(1−meBehind))
    coef = master 0.12 / hard 0.06 / 其余 0       // 只有高难度有外部性意识（保梯度）
    meBehind = clamp(avgOther − myThreat + 0.5)    // 我越落后越该搅局 → κ 越小、少受抑制
p*_adj = clamp(p* + κ, 0.05, 0.92)
```

B 是领先者（`threatB` 高）→ κ<0 → 阈值降（**该拆，命花刀刃上**）；B 是垫底、而我不落后 → κ>0 → 阈值升（**别替领先的第三方除掉弱者**）。2 人局 `N_active<2 → κ=0`，退化为纯 1v1。`threatB / avgOther / myThreat` 都由 `opponentThreat`（综合对手手牌将空 + 已得分）算出。

### 5.4 阈值 → 出手概率（双分支按理性插值）

```
externAware = clamp((rationality − 0.5) / 0.45)       // easy≈0, normal≈0.8, hard≈0.8, master≈1
margin = pLie − p*_adj

EV 分支（理性者）:   pChEv = margin>0 ? clamp(0.3 + margin·2.8)            // 破阈中位起步、明显超阈才高信心
                                : clamp(0.05 + margin·0.5, 0.02, 0.3)
sigmoid 分支（莽撞）: thr = clamp(p* + 0.05, 0.2, 0.85) − (challenge−0.5)·0.5 − tilt·0.1
                    pChLow = clamp(sigmoid((pLie−thr)·(4 + rationality·8)),  floor, 1−floor)
                    floor = 0.04 + (1 − rationality)·0.10

pCh = mix(pChLow, pChEv, externAware) + advice.dpCh    // 低理性走 sigmoid 高 floor（仍会误抓=弱），高理性走精确 EV
```

`−5/命` 的代价下，`pChEv` 刻意「破阈不立刻开枪、明显超阈才有信心」——偏好**精度**而非破平衡乱抓（这条爬升斜率与 §5.2 的 `p*` 是仅有的两个质疑调参旋钮）。**必诈地板（§4.0）绕过整套 EV**：数学上不可能为真时 gain 确定、无外部性损失，仍近 100% 抓。

---

## 六、出牌与宣称

轮到 AI 出牌（`decidePlay`，[ai.ts](../web/src/engine/ai.ts)）：先看有没有可出的数字/万能牌（没有则 `Fallback` 兜底）；非首家时按概率先**明甩功能牌**（用全场危险 `aggregateDanger` 而非只看下家来估收益；嗜抓的下家在场时更想甩 `skip` 跳过他）；随后进入首家或跟牌分支。

### 6.1 首家起手（`firstPlay`，[ai.ts](../web/src/engine/ai.ts)）

首家须宣称某色 `1..3`。手里有真 `1..3` 时**大概率老实打**（诈牌概率随 `bluff` 升高）；没有低牌时盖任意一张、谎称一个低牌。高理性者把宣称颜色**偏向自己手里的优势色**（后续更接得上，圆得回来），弃牌交给 `smartDump`（见 §6.4）。

### 6.2 跟牌（`followPlay`，[ai.ts](../web/src/engine/ai.ts)）

优先级大致是：

1. **有合法的老实牌** → 多数情况老实接，用 `pickEscalation` 决定爬多高（保守者贴梯顶、冒险者跳高）；小概率改诈（master 仅 0.06，其余 `bluff·0.18`）。
2. **接不上** → 按 `pDraw` 概率先 `Draw` 补一张（保守、耐心者更爱摸；全场嗜抓则少摸）。
3. **万能牌**：当脱困王牌（必判真、能接任何梯）。高理性档**留着作后手**——有 4-8 垃圾数字可盖时优先盖数字、把万能存起来；只在被迫（无数字可盖）、全场太危险（数字诈牌大概率被抓，安全的万能才值得烧）、或 bless 下打 0（纯赚分）时才出。低理性档仍按 `risk` 随意烧。
4. **诈牌**：先算 `bluffAppetite = clamp(bluff + tilt·0.2 − aggregateDanger·0.5·read)`（上头更敢诈、全场嗜抓则收敛），高理性再减 `riskScore` 与 `feedRestraint`（多人不互喂）。**触发概率**：master/hard 用 §10.4 的无差异校准 `f*`（不可读）、normal 半混 `mix(启发式, f*, 0.5)`、easy 走启发式 `clamp(0.35 + bluffAppetite·0.6)`。无路可退（不能摸、无万能）时被迫诈。

### 6.3 选宣称内容（`pickClaim`，[ai.ts](../web/src/engine/ai.ts)）

要诈牌时「喊什么」很关键——目标是**让对方难以证伪**。

- 高理性走 `strategicBluffClaim`（[ai.ts](../web/src/engine/ai.ts)）：给每个合法宣称打分，偏好 **`remaining + unseenWilds` 大**（牌源多、不易被算死）、**爬升幅度小**，并按全场危险 `aggregateDanger` 调权重——越危险越要挑「圆得最稳」的牌。
- 低理性走 `smartBluffClaim`（[ai.ts](../web/src/engine/ai.ts)）或直接 `minEscalation` 取最小爬升。

### 6.4 智能弃牌（`smartDump` / `keepValue`，[ai.ts](../web/src/engine/ai.ts)）

盖牌诈牌要「盖哪张」时，按**战略留存价值** `keepValue` 丢**最低**的那张：

| 牌 | `keepValue` | 为何该留 |
|----|------------|---------|
| **0**（顶格=10） | 1.0 | 封梯 + 领计分卡 + 最强接牌 + bless 加分，最该留 |
| **9 / 1-3** | 0.55 | 9 是同色仅 0 能压的强接牌；1-3 是首家起手燃料 |
| 4-8 | 0.15 | 中段垃圾，盖牌掩护的首选 |

大师再给**优势色**的牌加分（`+0.06×同色张数`，保留连续接牌）。**关键修正**：旧版按 `val(num)` 降序「丢最高值」，而 `val(0)=10`、`val(9)=9` 恰是最高——于是把最该留的 **0 和 9 当垃圾第一个盖掉**了（你正是看到这个）。现改为丢 `keepValue` 最低（4-8 优先，决不先丢 0/9/1-3）。低理性档仍按旧「丢最高值」乱来，维持难度梯度（实测大师战略牌浪费率 2.4%，梯度不变）。

---

## 七、受罚选点

进入受罚（俄罗斯轮盘）阶段时，须一次性**赌定 N 个不同点数**（N = 本次受罚累进 `rollsRemaining`，封顶 6），只掷一次骰，掷出的点落在所赌 N 个之内即中枪——中枪率恒为 `N/6`。AI 用 `pickDistinctDice(N)`（[ai.ts](../web/src/engine/ai.ts)）从 `1..6` 里**随机取 N 个不同点**返回 `ChooseNumber{ ns }`。因为中枪率只取决于 N（赌哪几个点都一样），这里没有可优化空间，随机取 N 个不同点即最优。

---

## 八、拟人思考节奏

AI 绝不秒回、也不匀速。每次决策算一个停顿 `think(base, span, hardness)`（[ai.ts](../web/src/engine/ai.ts)）：

```
slow = 0.65 + patience·0.8                       // 耐心越高越慢
ms   = (base + span · clamp(hardness)) · slow     // 抉择越难（hardness 大）停越久
ms  *= 0.75 + rand()·0.6                          // ±抖动，绝不复读
ms   = clamp(round(ms), 240, 3200)                // 收进 0.24s–3.2s
```

`hardness` 由抉择的「纠结程度」给：质疑分支里 `hardness = 1 − min(1, |pLie − 0.5|·3)`——`pLie` 越接近 5 成（最难判）停得越久；一边倒的局面则快。驱动层另有一套**为动画服务**的节拍 `delayFor(events)`，最终采用 `max(delayFor, ai.delayMs())`。

---

## 九、随机性与可复现

- 每个 AI 持有**自己独立的一条种子化 RNG 流**：构造时 `rng = seed ^ hash(seat)`，推进用 mulberry32（`nextRng`，[rng.ts](../web/src/engine/rng.ts)）。
- 因此：**同一局**（同种子）完全可复现，便于调试与回放；**不同局**有变数；**同一局面**因 RNG 已推进，也不总做同一件事（决策处处是 `rand()` 抽样而非硬规则）。
- 引擎本身的随机（洗牌、掷骰）与 AI 的随机是**两条独立的种子流**，互不污染。

---

## 十、大师档：从博弈论最优基线出发的「最优 + 剥削」

`master` 先把性格压成近最优基线（§二），无条件启用普通档需高理性才触发的全部特性（MC 200 次采样、§五真命成本 EV、§5.3 kingmaker、§六 f\* 校准诈牌、§3.1 完整记牌 ρ=1.0）。它的强**不是「更爱开枪」，而是「算得最优 + 针对具体对手剥削」**——旧版靠在 EV 之后裸加 `pCh` 多质疑，反而在 −5/命 的代价下变弱（命中率仅 44%、互相送命喂第三方）；新版把所有剥削信号一律折进 `pLie` **证据**或 §5.3 的阈值修正 **κ**，决不绕过 EV 框架。

### 10.1 终局读心（抬 `pLie` 证据，[ai.ts](../web/src/engine/ai.ts)）
对手手牌越少越可能在收尾诈牌，于是**按其历史骗率成比例**上调 `pLie`（而非硬抬到高位制造假阳性）：

```
对手 handCount ≤ 2:  pLie += 0.18 · bluffRate(player)
对手 handCount ≤ 4:  pLie += 0.10 · bluffRate(player)
bluffRate(player) > 0.5:  pLie += (bluffRate − 0.5)·0.25      // 惯犯加大怀疑
```

这些只是**抬高估计**，仍要经 §五的 `p*` 阈值过滤，不会变成无脑乱抓。

### 10.2 多人 kingmaker（阈值修正 κ）
见 §5.3——只为拆真正领先者花命、垫底互拆收敛、人多搭便车。这是治「两个 AI 互相送命、把没参与的第三方喂成赢家」的核心；作用在 §五的阈值 `p*` 上，而非裸加 `pCh`（旧版 `pCh += 0.10 / += (br−0.5)·0.35` 已删，前者并入 κ、后者并入 §10.1 的 `pLie` 证据）。

### 10.3 摸牌的期望值与泄露成本（`estimateDrawHit`，[ai.ts](../web/src/engine/ai.ts)）
接不上时先估「摸一张能合法如实出」的概率（牌池里能接当前梯顶的牌占比），并计入摸牌的**信息泄露 + 冷却**成本（反屯牌规则：摸牌随机亮一张己牌、且锁 1~2 回合）：

```
drawHit > 0.35:  pDraw += 0.25       // 大概率摸到能用的 → 倾向摸
drawHit < 0.12:  pDraw −= 0.20       // 几乎摸不到 → 不如直接诈
pDraw += challengeRate(下家)·0.15     // 下家越爱抓，诈牌代价越大 → 越倾向摸
pDraw −= (0.10 + (手牌≤2 ? 0.04 : 0.08)) · rationality   // 摸牌泄一张己牌 + 冷却锁，越亏越少摸
```

> （`firstPlay` 的保底摸牌**不**折价——它是破「囤牌耗死」僵局的关键，须保留把牌库往见底推。）

### 10.4 不可读的诈牌（无差异频率 f\*）
大师/老练的诈牌频率不再「专挑软柿子下家」，而用**无差异校准**（`bluffFreqStar`）：

```
f* = Lⱼ / (P + Lⱼ)      // j* = 全场 challengeRate 最高者；Lⱼ = 其真命成本
bluffP(master/hard) = clamp(f* + (bluff−0.5)·0.12 + (bluffAppetite−0.5)·0.1)
```

让最爱拆的人「抓与不抓无差异」→ 诈牌**不可读**。已删除旧版「`+= (0.5−challengeRate(下家))·0.4` 专挑下家」「`recentPassStreak≥3 → +0.15` 连放就加码」这两个可被真人诱导的 tell。多人局再叠 `feedRestraint`：非「我领先且正拦截领先者」时收敛诈牌，不替第三方做嫁衣。

### 10.5 预判性功能牌（[ai.ts](../web/src/engine/ai.ts)）
有对手手牌将空（`handCount ≤ 4`）时，大幅抬高甩功能牌的概率（`pFunc += 0.28`），优先用 `skip` 打断对手的跑成节奏。

> 综合效果：大师档**少质疑、超准、不互喂、不可读**——记得清（ρ=1 + 去重）、算得对（真命成本 EV），按对手历史调整诈牌与质疑（面对爱抓的收敛、惯犯加大怀疑、对领先者精准拦截），且决不靠乱开枪送命。无头实测：每局全场掉命 −36%、各类剥削打法（躺平/紧逼/拆诈）胜率从 30%+ 压回 ~7%、难度梯度 master>hard>normal>easy 全配置严格成立。它是为「打得过普通档之后还想被虐」准备的最终 boss。

---

## 十一、混沌天气的维度建议层（DLC）

当混沌天气（见 [weather-mode.md](weather-mode.md)）开启时，AI 不重写任何决策逻辑，而是在 `decide` 开头算一个**维度建议包 `DimAdvice`**（`dimAdvice(view)`，[ai.ts](../web/src/engine/ai.ts)），对前面各节算出的决策标量做**有界微调**：加项中性元 = 0、乘子中性元 = 1。

**经典模式逐字节不变**：`view.weather === null` 时 `dimAdvice` 硬短路返回冻结的 `NEUTRAL_ADVICE`（全 +0/×1）——不读 `traits`、不进分支、不消费 RNG、不分配对象。所以关掉天气时，AI 行为与本文前十节描述的完全一致。

**难度门控**：调整强度统一乘 `gate = clamp((rationality − 0.45) / 0.5)`——easy≈0、normal≈0.5、hard≈0.8、master≈1。即**大师把天气读得最透，新手几乎无视天气**，与 §二的难度梯度一致。

七个建议字段与各天气的微调：

| 天气 | 调整（×gate） | 意图 |
|------|--------------|------|
| **源涌** surge | `honestBluffMul = 1 − 0.5·rationality`；`dBluffAppetite −= (esc−1)/6 ·0.35·rationality` | 累进高了撒谎被抓更痛 → 收敛诈牌（质疑侧 escRisk 已被 EV 框架捕捉，故 `dpCh` 恒 0） |
| **恩泽** bless | `zeroBias = 0.5 + 0.4·risk`；`dpDraw −= 0.14`；`dpCh += 0.05` | 打 0/跑成/赢家都加分（分即排名）→ 抢着打或诈 0、少摸快清手、更敢质疑 |
| **丰沛** bounty | `dpDraw −= 0.08`；`dpCh −= 0.04` | 全场手牌变厚 → 少摸；`handCount` 信号噪声变大 → 质疑略保守 |
| **禁制** ban | `skipMul = 1 − 0.4·read` | 本梯有免费 `skip` → 自家主动甩 `skip` 贬值（只贬 skip） |
| **乱向** veer | `reverseMul = 1 − 0.6·read`；`dBluffAppetite −= 0.06` | 本梯有免费 `reverse` → 自家 `reverse` 贬值更狠；方向不定 → 定点诈牌略保守 |
| **乱流** shuffle | 恒等（无调整） | 手牌数不变、不翻牌、`seen` 仍有效 → 无需动 |

这些字段在各决策点被消费：`dpCh` 加到 §五末的 `pCh`，`dpDraw / dBluffAppetite / honestBluffMul` 进 §六的 `followPlay`，`skipMul / reverseMul` 进功能牌段，`zeroBias` 驱动恩泽下「优先如实/诈出 0」。**扩展新模式**只需：给 `DimAdvice` 加字段（带中性默认）+ 在 `dimAdvice` 加一个 `case` + 在对应 hook 加一行 `+=`/`*=`，经典路径不受任何影响。

---

## 十二、类与接口（技术实现）

核心是一个有状态的类 `AiPlayer`（[ai.ts](../web/src/engine/ai.ts)）：

```ts
class AiPlayer {
  constructor(opts: { seat: number; seed: number; profile?: AiProfile; difficulty?: Difficulty });

  observe(events: GameEvent[], view: PlayerView): void;  // 喂入公开事件，更新 opp / seen / tilt / pendingChallengers
  decide(view: PlayerView): Command;                     // 仅凭过滤视图产出一条命令
  delayMs(): number;                                     // 上一次 decide 估出的拟人停顿
}
```

- **内部状态**：`traits`（已按难度调制）、`rng`（独立流）、`opp`（对手模型 Map，含放行记录）、`seen`（牌张记忆 Map）、`tilt`、`lastDelay`、`pendingChallengers`、`advice`（当前天气的维度建议包，见 §十一；经典模式为冻结的 `NEUTRAL_ADVICE`）。
- **`decide` 按 `view.prompt.kind` 分派**：`penalty → ChooseNumber`、`respond → decideRespond`、`play → decidePlay`、其它（不是你行动）→ `Accept`。
- **唯一输入是 `PlayerView`**——这就是「结构上不可作弊」的实现层保证。
- 文件末尾另有无状态便捷函数 `chooseCommand(view)`（[ai.ts](../web/src/engine/ai.ts)），用临时 AI 池决策、**无对手记忆**，仅供测试/兜底；真正对局一律由驱动层持久的 `AiPlayer` 实例驱动。

---

## 十三、驱动层接入（单机 / 联机）

两端复用**同一个 `AiPlayer`**，模式一致：建局时给每个 AI 座位 `new AiPlayer({ seat, seed, profile: pickProfile(seed, seat), difficulty })`，每次 `apply` 之后对所有 AI 调一遍 `observe`，轮到 AI 行动时 `decide` + 延时 `setTimeout` 再把命令喂回 `apply`。

| | 单机（[gameStore.ts](../web/src/store/gameStore.ts)） | 联机（[room.ts](../server/src/room.ts)） |
|---|---|---|
| AI 容器 | 模块级 `ais: Map<seat, AiPlayer>` | 每个 `Room` 实例的 `this.ais` |
| 观察 | `observeAll` 对每个 AI 喂 `viewFor(state, seat)` | 同左 |
| 驱动 | `loop()`：`setTimeout(max(delayFor, ai.delayMs()))` | `drive()`：`setTimeout(max(delayFor, ai.delayMs()·DELAY_SCALE))` |
| 难度来源 | `newGame(players, difficulty)` 传入（默认 normal；教程固定用 easy/steady） | 环境变量 `YUANHE_AI_DIFFICULTY`（默认 normal） |
| 命名 | `${AI_NAMES[i]} · ${PERSONA_LABEL[profile]}` | 同左（真人座位掉线转 AI 也复用此名） |
| 掉线接管 | — | 真人掉线超时，用一个**临时 AI**（随机性格）替他出一手（`takeover`） |

驱动层都做了 stale-closure 防护：`setTimeout` 回调里一律 `getState()` / `this.state` 现取最新状态，并校验「轮到的还是同一个 AI 座位」才落子。

---

## 十四、验证（无头模拟）

AI 既是对手，也是引擎的**对抗性压力测试器**。`npm run sim`（[sim.ts](../web/src/engine/sim.ts)）让 AI 自我对弈跑 **1200 场**（2/3/4 人各 400 场、种子遍历，难度按 `seed % 4` 在四档间轮替），每局逐步断言：

- **牌张守恒**：`deck + pile + discard + Σ(hand + scored)` 恒等于建局牌数；
- **无信息泄露**：随机抽查座位视图，确认其中**不含**他人在手牌 id、不含牌堆盖牌 id（摊牌公开的除外）——这正是 §〇「不作弊」约束的自动化回归；
- **必然终局**：上限 30000 步内一定进入 `over`，否则报死循环；
- **状态合法**：凝聚度、受罚累进等不越界。

跑完打印平均/中位/最长步数，作为节奏与平衡的体感参考。

---

## 附：可调参数一览

| 位置 | 参数 | 作用 |
|------|------|------|
| `PROFILES` | 5×7 性格矩阵 | 性格基线 |
| `applyDifficulty` | 4 档变换系数 | 难度强弱与手感（easy 莽撞、master 近最优） |
| `recordCard` | 保留率 `ρ(d) = 1.0/0.9/0.7/0.4` | 按难度的记牌完整度（公开硬信息 master/hard 必记 + id 去重） |
| `bluffRate` / `trigger` / `challengeRate` | 先验与平滑常数 | 对手历史的平滑估计 |
| `mcLieProb` | `runs = 30 / 60 / 100 / 200` | 蒙特卡洛采样次数（随理性升） |
| `lifeCost` | 命值 5、`penaltyTwoDiceFrom` | 真命成本 L（与引擎受罚轮盘同步；改引擎须同步此处） |
| `decideRespond` | `p* = (P+L)/(2P+L)`、`pChEv` 爬升斜率 | 质疑阈值与开枪信心（仅有的两个质疑旋钮） |
| `kingmakerKappa` | `coef = 0.12/0.06/0` | 大师/老练的多人不互喂力度 |
| §十 master 各式 | pLie 证据、draw 泄露折价、`f*` 校准、`feedRestraint` | 大师档的剥削与反 tell 力度 |
| `think` | `[240, 3200]ms`、`slow` | 拟人停顿区间 |
| 驱动层 | `delayFor`、`DELAY_SCALE` | 动画节拍与全局快慢 |

调这些不动任何引擎规则——AI 是引擎之外的一层「玩家」，与规则数值（`GameConfig`）相互独立。
