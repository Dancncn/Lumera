// 玩家专属色：和牌色（金 #E0A92E / 银 #8FA0B8 / 绿 #54AC4F / 蓝 #2E8AD0）明确区分。
export const PLAYER_COLORS = ['#c44040', '#8855bb', '#17a2b8', '#d4764e'];

export function playerColor(seat: number): string {
  return PLAYER_COLORS[seat % PLAYER_COLORS.length];
}
