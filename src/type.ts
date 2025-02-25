import { LLMModel } from '@virtuals-protocol/game';

export interface ColoFunOptions {
  apiKey: string;
  verboseLog?: boolean;
  gameName: string;
  gameBackground: string;
  gameRules: string;
  adminTask: string;
  adminLlmModel?: LLMModel | string;
  players: ColoFunPlayer[];
  stages: ColoFunStage[];
  getGameStats: () => Promise<Stats>;
}

export interface Stats {
  [key: string]: { // example: hp, damage, defense, funds
    value: string | number;
    description: string;
  };
}

export interface ColoFunPlayer {
  name: string;
  personality: string;
  strategy: string;
  task: string;
  llmModel?: LLMModel | string;
  getStats: () => Promise<Stats>;
}

export type ExecutableArgs<T extends OperationArg[]> = {
  [K in T[number]['name']]: string;
};

export interface ColoFunStage {
  id: string;
  name: string;
  description: string;
  operations: ColoFunOperation<OperationArg[]>[];
}

export interface ColoFunOperation<T extends OperationArg[]> {
  name: string;
  description: string;
  args: T;
  tips?: string;
  limitation?: string;
  executable: (
    player: ColoFunPlayer,
    args: Partial<ExecutableArgs<T>>,
  ) => Promise<string>;
}

export interface OperationArg {
  name: string;
  description: string;
  type?: string;
  optional?: boolean;
}
