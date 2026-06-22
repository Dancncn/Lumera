// ============================================================
// 《源河》引擎 —— 类型定义（与语言无关的「思想」核心）
// 真相只活在 GameState 里；外界只能通过 viewFor(state, seat) 拿到过滤视图。
// ============================================================

/** 四力（颜色）。读：造名；说：金/银/绿/蓝 或 阳/月/地/海。 */
export type Color = 'aurel' | 'selvar' | 'verda' | 'thalos';
export const COLORS: Color[] = ['aurel', 'selvar', 'verda', 'thalos'];

/**
 * 颜色的展示信息：
 * - name 造名 / glyph 单字 / say 喊色 / hex 在浅色 UI 上的识别色（筹码点等）。
 * - bg / ink 是「牌面」专用的底色与字色：阳白底金字、月黑底银字、地深绿浅字、海深蓝浅字，
 *   一律高对比、保证字清晰可读（不再用实心几何 + 假打光）。
 */
export const COLOR_META: Record<
  Color,
  { name: string; glyph: string; say: string; hex: string; bg: string; ink: string }
> = {
  aurel: { name: 'Aurel', glyph: '阳', say: '金', hex: '#E0A92E', bg: '#FBE9AE', ink: '#7C5310' },
  selvar: { name: 'Selvar', glyph: '月', say: '银', hex: '#8FA0B8', bg: '#EAEEF4', ink: '#43526A' },
  verda: { name: 'Verda', glyph: '地', say: '绿', hex: '#54AC4F', bg: '#1C4A29', ink: '#D8F2C4' },
  thalos: { name: 'Thalos', glyph: '海', say: '蓝', hex: '#2E8AD0', bg: '#0E3A65', ink: '#BBE2F8' },
};

export type FunctionalKind = 'reverse' | 'skip';

/**
 * 混沌天气（可选玩法）。每开新梯有几率降下一种天气，为战局加噪。
 * 一次性结算：bounty/shuffle/surge/bless（开梯即生效）；
 * 持续整梯：ban/veer（本梯每次出牌后按概率附带禁止/转向）。
 */
export type WeatherKind = 'bounty' | 'shuffle' | 'surge' | 'ban' | 'veer' | 'bless';
export const WEATHER_KINDS: WeatherKind[] = ['bounty', 'shuffle', 'surge', 'ban', 'veer', 'bless'];
/** 天气的展示信息（name/desc 同时作为 i18n key，简体为源）。 */
export const WEATHER_META: Record<WeatherKind, { name: string; desc: string }> = {
  bounty: { name: '丰沛', desc: '全场各摸 2 张手牌' },
  shuffle: { name: '乱流', desc: '全场各抽 2 张，混洗后重新分发' },
  surge: { name: '源涌', desc: '全场受罚累进 +1~2' },
  ban: { name: '禁制', desc: '本梯：出牌后 40% 触发「禁止」' },
  veer: { name: '乱向', desc: '本梯：出牌后 60% 触发「转向」' },
  bless: { name: '恩泽', desc: '本梯：终结这一梯者额外得分' },
};

/** 一张牌。number：0..9，其中 0 视为该色最大（=10）。 */
export type Card =
  | { id: number; kind: 'number'; color: Color; num: number }
  | { id: number; kind: 'functional'; func: FunctionalKind }
  | { id: number; kind: 'wild' };

/** 宣称：盖牌出牌时口头说的颜色 + 数字（可以撒谎）。 */
export interface Claim {
  color: Color;
  num: number; // 0..9
}

// ---------------- 命令（参与者 → 引擎） ----------------
export type Command =
  | { type: 'PlayFunctional'; cardId: number } // 明着甩功能牌（附加动作）
  | { type: 'Draw' } // 先摸 1 张，再出牌
  | { type: 'RevealCard'; cardId: number } // 摸牌后选择一张手牌亮给全场（反囤牌）
  | { type: 'PlayCard'; cardId: number; claim: Claim } // 盖牌出数字牌/万能牌并宣称
  | { type: 'Fallback' } // 兜底：无数字/万能牌时，亮手 + 弃功能 + 摸一
  | { type: 'Accept' } // 放过，不质疑
  | { type: 'Challenge' } // 质疑上家这一手
  | { type: 'ChooseNumber'; ns: number[] }; // 受罚时一次性赌定 N 个不同点数（N=本次受罚累进数，掷中其一即中枪）

// ---------------- 事件（引擎 → 参与者，按世界观换皮命名） ----------------
export type GameEvent =
  | { type: 'TurnStarted'; seat: number; isFirst: boolean }
  | { type: 'FunctionalPlayed'; seat: number; func: FunctionalKind }
  | { type: 'DirectionReversed'; direction: 1 | -1 }
  | { type: 'CardDrawn'; seat: number; count: number } // 仅数量公开
  | { type: 'HandRevealed'; seat: number; card: Card } // 摸牌亮牌：玩家选择亮 1 张手牌给全场
  | { type: 'HandOverflow'; seat: number; count: number } // 手牌溢出：超上限弃 N 张回牌库
  | { type: 'CardPlayed'; seat: number; claim: Claim; endsLadder: boolean } // 只播宣称
  | { type: 'Fallback'; seat: number; revealed: Card[] }
  | { type: 'PlayAccepted'; seat: number }
  | { type: 'Challenged'; challenger: number; against: number }
  | { type: 'CardRevealed'; seat: number; card: Card; truthful: boolean } // 摊牌：亮真实牌
  | { type: 'PileTaken'; seat: number; count: number }
  | { type: 'TokenAwarded'; seat: number; value: number } // 打 0 的勇气奖励（直接加入计分区）
  | { type: 'RanOut'; seat: number } // 清空手牌「跑成了」
  | { type: 'PenaltyStarted'; seat: number; rolls: number }
  | { type: 'DiceRolled'; seat: number; chosen: number[]; rolled: number[]; hit: boolean } // 第3枪起掷2颗→rolled 含2个点，任一∈chosen 即中枪
  | { type: 'Returned'; seat: number; livesLeft: number } // 中枪：一缕念被收回源头（扣凝聚）
  | { type: 'Survived'; seat: number } // 未中
  | { type: 'PlayerOut'; seat: number } // 复归出局
  | { type: 'LadderReset'; leader: number } // 新梯，由 leader 起手
  | { type: 'WeatherChanged'; kind: WeatherKind; seat: number } // 新梯降下一种天气（seat=首家）
  | { type: 'WeatherTriggered'; kind: 'ban' | 'veer'; seat: number } // 持续天气在某次出牌后触发（禁止/转向）
  | { type: 'WeatherBonus'; seat: number; value: number; kind: 'bold' | 'winner' } // 恩泽奖励：bold=打0/跑成的勇者，winner=截牌收场的赢家（保底）
  | { type: 'GameOver'; ranking: RankEntry[] };

/** 结构化日志条目：tpl 是中文模板（同时作为 i18n key），p 是命名参数。 */
export interface LogEntry {
  tpl: string;
  p?: Record<string, string>;
}

export interface RankEntry {
  seat: number;
  name: string;
  score: number;
  scoredCount: number;
  livesLost: number;
  out: boolean;
}

// ---------------- 可调参数（与状态机隔离，纯标量） ----------------
export interface GameConfig {
  players: number; // 2..4
  startingHand: number; // 起手张数
  startingLives: number; // 初始凝聚度（命数）
  tokenValueOnZero: number; // 打出 0 时计分区加分值
  lifeLossValue: number; // 每损失 1 命的扣分（复归出局的 −15 即 3×5，无需额外负债字段）
  refillTo: number; // 跑成成功（收走牌堆）后补牌到几张
  refillAfterCaughtLast: number; // 撒谎打最后一张被抓（不算跑成、受罚后）补牌到几张
  maxFunctionalInOpener: number; // 开局保底：起手手牌里功能牌最多几张（削弱开局方差，防被功能牌堵手）
  drawOnSurvive: number; // 受罚「险过」（未掉命）时最多补摸几张牌：补充缩水手牌 + 加速牌库消耗，破「囤牌抓 1-3」僵局
  surviveRefillTo: number; // 险过补牌的手牌上限：只把手牌补到这个数（4-6 囤牌者补不到），防囤牌者靠险过白嫖续牌
  penaltyTwoDiceFrom: number; // 受罚轮盘尾部优化：累进数 ≥ 此值时掷 2 颗骰（任一落在所赌点即中枪），保留前两枪温和、骤增尾部致命度
  escalationResetsOnHit: boolean; // 中枪后受罚累进是否重置
  drawCooldown: boolean; // 摸牌冷却：手牌≤2 时 1 回合 CD，>2 时 2 回合 CD
  handOverflowLimit: number; // 手牌溢出上限（0=关闭）：超过此数时回合结束随机弃 2 张回牌库
  revealOnDraw: boolean; // 摸牌亮牌：摸牌后须选择 1 张手牌亮给所有人看，破信息不对称
  weather: boolean; // 混沌天气开关（可选玩法）
  weatherChance: number; // 每开新梯触发天气的概率（0..1）；开局首梯豁免、触发后隔梯冷却
  // 「宗师」负重（可选 DLC）：仅作用于 handicapSeats 指定座位（生产=真人座位；空数组=不启用，经典局逐字节等价）。
  handicapSeats: number[]; // 受负重的座位
  hcHandCap: number; // 负重·手牌上限（0=关闭）：超出即弃回牌库，废掉囤牌
  hcNoSurviveRefill: boolean; // 负重·险过完全不补牌：断掉续牌永动机
  hcLivesDelta: number; // 负重·起始命数增量（-1=少一条命；0=不变）
  seed: number;
}

export const DEFAULT_CONFIG: Omit<GameConfig, 'players' | 'seed'> = {
  startingHand: 6,
  startingLives: 3,
  tokenValueOnZero: 2,
  lifeLossValue: 5,
  refillTo: 6,
  refillAfterCaughtLast: 2,
  maxFunctionalInOpener: 1,
  drawOnSurvive: 3,
  surviveRefillTo: 3, // 险过只把手牌补到 3 张：缺牌者解困，但 4-6 囤牌者白嫖不到
  penaltyTwoDiceFrom: 3,
  escalationResetsOnHit: true,
  drawCooldown: true,
  handOverflowLimit: 6,
  revealOnDraw: true,
  weather: false,
  weatherChance: 0.28,
  handicapSeats: [],
  hcHandCap: 0,
  hcNoSurviveRefill: false,
  hcLivesDelta: 0,
};

// ---------------- 引擎内部状态（真相） ----------------
export interface PlayerState {
  seat: number;
  name: string;
  isAI: boolean;
  hand: Card[];
  lives: number;
  startLives?: number; // 起始命数（记分基线；负重 -1 命时与 startingLives 不同）。缺省=config.startingLives
  scored: Card[]; // 收走的牌堆牌（计分区）
  tokens: number; // 打 0 勇气奖励累计（已合并进 scoredCount）
  escalation: number; // 下次受罚投骰次数（>=1）
  drawCooldown: number; // 摸牌冷却剩余回合（0=可摸）
  out: boolean;
}

export interface PileEntry {
  card: Card; // 真实牌（盖着，不进任何人的视图）
  claim: Claim; // 宣称（公开）
  by: number;
}

/** 状态机阶段。 */
export type Phase =
  | { kind: 'play'; current: number; isFirst: boolean; hasDrawn: boolean; needsReveal: boolean }
  | { kind: 'respond'; player: number; responder: number } // player 刚出牌（位于 pile 顶），responder 决定
  | { kind: 'penalty'; roller: number; rollsRemaining: number }
  | { kind: 'over' };

export interface GameState {
  config: GameConfig;
  players: PlayerState[];
  deck: Card[];
  pile: PileEntry[];
  discard: Card[]; // 明牌甩出/兜底弃掉的功能牌（离开博弈，仅留作牌张守恒）
  ladderTop: Claim | null; // 当前梯顶宣称；null = 新梯（首家须宣称 1..3）
  direction: 1 | -1;
  pendingSkip: number; // 已甩出的「禁止」累积，下次推进时消费
  weather: WeatherKind | null; // 当前梯的天气（开梯定、出牌读、换梯清）；关闭天气时恒为 null
  weatherCooldown: number; // 触发天气后的冷却梯数，>0 时本梯不再降天气
  phase: Phase;
  rng: number; // 种子化 RNG 当前状态
  log: LogEntry[];
  lastReveal?: { seat: number; card: Card; truthful: boolean };
  lastHandReveal?: { seat: number; card: Card };
  ranking?: RankEntry[];
  seq: number; // 单调递增，便于前端 diff
}

// ---------------- 过滤视图（每个座位拿到的脱敏快照） ----------------
export interface PublicPlayer {
  seat: number;
  name: string;
  isAI: boolean;
  lives: number; // 凝聚度
  handCount: number; // 手牌数量（不含内容）
  scoredCount: number;
  escalation: number;
  drawCooldown: number; // 摸牌冷却剩余回合（公开信息）
  out: boolean;
}

/** 当前轮到「你」时能做什么。 */
export type ViewPrompt =
  | { kind: 'play'; isFirst: boolean; canDraw: boolean; canFallback: boolean; drawCooldown: number; needsReveal: boolean } // drawCooldown：本可摸牌但被冷却挡住时的剩余回合（0=未被冷却挡）；needsReveal：摸牌后须亮牌才能出牌
  | { kind: 'respond'; player: number; claim: Claim }
  | { kind: 'penalty'; roller: number; rollsRemaining: number; dice: number } // dice：本次掷几颗骰（第3枪起为 2）
  | { kind: 'idle' } // 不是你行动
  | { kind: 'over' };

export interface PlayerView {
  you: number;
  current: number; // 当前必须行动的座位
  nextToPlay: number; // 下一个出牌的座位（respond 阶段=裁决者自己，play 阶段=下家）
  direction: 1 | -1;
  weather: WeatherKind | null; // 当前梯的天气（公开信息）
  startingLives: number; // 初始凝聚度（用于命格显示）
  players: PublicPlayer[];
  yourHand: Card[]; // 仅你自己的真实手牌
  ladderTop: Claim | null;
  pileCount: number;
  deckCount: number;
  prompt: ViewPrompt;
  lastReveal?: { seat: number; card: Card; truthful: boolean }; // 摊牌结果（公开）
  lastHandReveal?: { seat: number; card: Card }; // 最近一次摸牌亮牌（公开）
  ranking?: RankEntry[];
  log: LogEntry[];
}
