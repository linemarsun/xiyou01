/**
 * 数值仿真：用 AI 执挥双方，批量跑完整战斗，输出胜率与平均回合数。
 * 用途：调平衡时快速验证数值（浏览器地址栏加 #sim 即可查看报告）。
 * 联机后同样逻辑可搬去服务器做离线回归。
 */
import { Battle, type BattleOptions } from './battle';
import { planCommands } from './ai';
import { CLASSES, classById, ENCOUNTERS } from './content';
import { Rng } from './rng';

export interface SimResult {
  classId: string;
  className: string;
  total: number;
  wins: number;
  avgRounds: number;
  avgWinRounds: number;
}

export function simulateOne(opts: BattleOptions, maxRounds = 40): { winner: 'ally' | 'enemy' | null; rounds: number } {
  const battle = new Battle(opts);
  const uiRng = new Rng(opts.seed ^ 0x9e3779b9);
  let rounds = 0;
  while (!battle.over && rounds < maxRounds) {
    // 己方也用同一套 AI 生成指令（仿真专用；真人玩家通常会打得更好）
    const allyCmds = planCommands(battle.aliveOf('ally'), battle.aliveOf('enemy'), uiRng);
    battle.resolveRound(allyCmds);
    rounds = battle.round;
  }
  return { winner: battle.winner, rounds };
}

export function simulateAll(petId: string, gamesPerClass: number, seedBase = 20261025): SimResult[] {
  const results: SimResult[] = [];
  for (const cls of CLASSES) {
    let wins = 0;
    let roundsSum = 0;
    let winRoundsSum = 0;
    for (let i = 0; i < gamesPerClass; i++) {
      const enc = ENCOUNTERS[i % ENCOUNTERS.length]; // 三种遭遇轮着来
      const seed = seedBase + i * 7919 + CLASSES.indexOf(cls) * 104729;
      const { winner, rounds } = simulateOne({
        encounterId: enc.id,
        classId: cls.id,
        petId,
        playerName: 'sim',
        seed,
      });
      roundsSum += rounds;
      if (winner === 'ally') {
        wins++;
        winRoundsSum += rounds;
      }
    }
    results.push({
      classId: cls.id,
      className: classById(cls.id).name,
      total: gamesPerClass,
      wins,
      avgRounds: roundsSum / gamesPerClass,
      avgWinRounds: wins > 0 ? winRoundsSum / wins : 0,
    });
  }
  return results;
}
