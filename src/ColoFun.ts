import {
  ExecutableGameFunctionResponse,
  ExecutableGameFunctionStatus,
  GameAgent,
  GameFunction,
  GameWorker,
} from '@virtuals-protocol/game';

import { GAME_ADMINISTRATOR_GOAL } from './constant';
import { ColoFunOptions, ColoFunPlayer } from './type';

export class ColoFun {
  private finishAgentInit?: () => void;
  private waitAgentInit = new Promise<void>(rs => this.finishAgentInit = rs);
  private agent: GameAgent;

  constructor(private options: ColoFunOptions) {
    const { apiKey, gameName, administratorTask, gameBackground, gameRules, getGameStats } = this.options;

    this.agent = new GameAgent(apiKey, {
      name: `Game Administrator of \`${gameName}\``,
      goal: `${GAME_ADMINISTRATOR_GOAL}\nAdministrator Task: ${administratorTask}`,
      description: `Game Background: ${gameBackground}\nGame Rules: ${gameRules}`,
      workers: this.getPlayers(),
      getAgentState: getGameStats,
    });
    this.agent.init().then(() => this.finishAgentInit?.());
  }

  private getPlayers = () => {
    const { players } = this.options;
    return players.map(player => {
      const { id, name, personality, strategy, getStats } = player;
      return new GameWorker({
        id,
        name: `Player: ${name}`,
        description: `Personality: \`${personality}\`\nStrategy: \`${strategy}\``,
        functions: this.getOperations(player),
        getEnvironment: getStats,
      });
    });
  };

  private getOperations = (player: ColoFunPlayer) => {
    const { operations } = this.options;
    return operations.map(({ name, description, args, tips, limitation, executable }) => {
      return new GameFunction({
        name: `Operation: ${name}`,
        description: `Operation Description: \`${
          description
        }\`${tips
          ? `\nOperation Tips: \`${tips}\``
          : ''
        }${limitation
          ? `\nOperation Limitation: \`${limitation}\``
          : ''
        }`,
        args,
        executable: async (args, logger) => {
          try {
            const result = await executable(player, args);
            logger(`Player ${player.name}'s ${name} operation result: \`${result}\``);
            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Done,
              result,
            );
          } catch (e) {
            logger(`Player ${player.name}'s ${name} operation failed. Error: ${(e as Error).toString()}`);
            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Failed,
              `Player ${player.name}'s ${name} operation failed.`,
            );
          }
        },
      });
    });
  };

  step = async () => {
    await this.waitAgentInit;

    await Promise.all(
      this.options.stages.map(async ({ description }) => {
        await Promise.all(
          this.options.players.map(async ({ id }) => {
            const player = this.agent.getWorkerById(id);
            await player.runTask(description, { verbose: this.options.verboseLog ?? false });
          }),
        );
      }),
    );
  };
}
