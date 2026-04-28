/**
 * 游戏模块导出
 */

export {
  GameEngine,
  getGameEngine,
  // AI 决策相关导出
  DefaultAIDecisionMaker,
  CustomAIDecisionMaker,
} from './GameEngine';

export type {
  AIActionType,
  AIDecision,
  AIBattleContext,
  AIDecisionMaker,
} from './GameEngine';

export { PixiRenderer } from './PixiRenderer';
