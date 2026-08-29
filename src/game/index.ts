/**
 * 游戏模块导出
 */

export {
  GameEngine,
  getGameEngine,
  // AI 决策相关导出
  DefaultAIDecisionMaker,
  CustomAIDecisionMaker,
  PART_WEIGHT_RANGE,
} from './GameEngine';

export type {
  AIActionType,
  AIDecision,
  AIBattleContext,
  AntCompositionEntry,
  AIDecisionMaker,
  AIMode,
  PartWeights,
  StrategicDirective,
  IStrategicAdvisor,
} from './GameEngine';

// 战略顾问（从 ./ai 重新导出，便于外部接入）
export { DeepSeekStrategicAdvisor } from '../ai/DeepSeekStrategicAdvisor';
export type { DeepSeekStrategicAdvisorOptions } from '../ai/DeepSeekStrategicAdvisor';

export { PixiRenderer } from './PixiRenderer';
