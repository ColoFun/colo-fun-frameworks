
export interface ColoFunOptions {
  apiKey: string;
  verboseLog?: boolean;
  gameName: string;
  gameBackground: string;
  gameRules: string;
  administratorTask: string;
  stages: {
    description: string;
  }[];
  getGameStats: () => Promise<Stats>;
  players: ColoFunPlayer[];
  operations: ColoFunOperation<OperationArg[]>[];
}

export interface Stats {
  [key: string]: { // example: hp, damage, defense, funds
    value: string | number;
    description: string;
  };
}

export interface ColoFunPlayer {
  id: string;
  name: string;
  personality: string;
  strategy: string;
  getStats: () => Promise<Stats>;
}

export type ExecutableArgs<T extends OperationArg[]> = {
  [K in T[number]['name']]: string;
};

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
