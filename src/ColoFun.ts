/* eslint-disable max-len */
import {
  ExecutableGameFunctionResponse,
  ExecutableGameFunctionStatus,
  GameAgent,
  GameFunction,
  GameWorker,
} from '@virtuals-protocol/game';

import { GAME_ADMINISTRATOR_GOAL } from './constant';
import { ColoFunOperation, ColoFunOptions, ColoFunPlayer, OperationArg } from './type';

export class ColoFun {
  private finishAgentInit?: () => void;
  private waitAgentInit = new Promise<void>(rs => this.finishAgentInit = rs);
  private gameAdmin: GameAgent;
  private gamePlayers: GameAgent[];
  private currentStepEvents: {
    player: string;
    stage: string;
    operation: string;
    result: string;
  }[] = [];
  private violations: {
    player: string;
    stage: string;
    content: string;
  }[] = [];

  constructor(private options: ColoFunOptions) {
    const {
      apiKey,
      gameName,
      adminTask,
      adminLlmModel,
      gameBackground,
      gameRules,
      getGameStats,
      players,
    } = this.options;

    this.gameAdmin = new GameAgent(apiKey, {
      name: `Game Administrator of \`${gameName}\``,
      goal: `${GAME_ADMINISTRATOR_GOAL}\nAdministrator Task: ${adminTask}`,
      description: `Game Background: ${gameBackground}\nGame Rules: ${gameRules}`,
      llmModel: adminLlmModel,
      workers: this.getAdminWorkers(),
      getAgentState: getGameStats,
    });

    this.gamePlayers = players.map(player => {
      const { name, personality, strategy, task, llmModel, getStats } = player;
      return new GameAgent(apiKey, {
        name: `${name}`,
        goal: task,
        description: `Personality: \`${personality}\`\nStrategy: \`${strategy}\``,
        workers: this.getStages(player),
        llmModel,
        getAgentState: async () => {
          const [gameStats, playerStats] = await Promise.all([
            getGameStats(),
            getStats(),
          ]);
          return {
            ...gameStats,
            ...playerStats,
          };
        },
      });
    });

    Promise.all([
      this.gameAdmin.init(),
      ...this.gamePlayers.map(player => player.init()),
    ]).then(() => this.finishAgentInit?.());
  }

  private getAdminWorkers = () => {
    return [new GameWorker({
      id: 'check_player_events',
      name: 'Check Player Events',
      description: 'Check the user\'s gameplay activity log against the game rules for any violations. If a violation is detected, identify the offending player, specify the action that caused the violation, explain the reason for the violation, and prompt the player to redo the operation.',
      functions: [new GameFunction({
        name: 'Remind the offending player',
        description: 'Identify the violating player, specify the action that caused the violation, explain the reason for the violation, and prompt the player to perform the action again.',
        args: [{
          name: 'player',
          description: 'name of the offending player',
          type: 'string',
          optional: false,
        }, {
          name: 'stage',
          description: 'the stage in which the player committed a violation',
          type: 'string',
          optional: false,
        }, {
          name: 'content',
          description: 'As the referee, draft the message you want to deliver to the violating player.',
          type: 'string',
          optional: false,
        }],
        executable: async (args, logger) => {
          try {
            const result = `Game Admin check Player ${args.player}: "${args.content}"`;
            logger(result);
            this.violations.push({
              player: args.player!,
              stage: args.stage!,
              content: args.content!,
            });
            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Done,
              result,
            );
          } catch (e) {
            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Failed,
              (e as Error).toString(),
            );
          }
        },
      })],
    })];
  };

  private getStages = (player: ColoFunPlayer) => {
    const { stages } = this.options;
    return stages.map(({ id, name, description, operations }) => new GameWorker({
      id,
      name,
      description: `Use the operation to complete the following requirements: ${description}`,
      functions: this.getOperations(operations, id, player),
    }));
  };

  private getOperations = (operations: ColoFunOperation<OperationArg[]>[], stageId: string, player: ColoFunPlayer) => {
    return operations.map(({ name, description, args, tips, limitation, executable }) => new GameFunction({
      name,
      description: `Your name is ${player.name}, Operation Description: \`${
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
          const exist = this.currentStepEvents.find(event => event.player === player.name && event.operation === name);
          if (exist) {
            return new ExecutableGameFunctionResponse(
              ExecutableGameFunctionStatus.Done,
              exist.result,
            );
          }

          const result = await executable(player, args);
          this.currentStepEvents.push({
            player: player.name,
            stage: stageId,
            operation: name,
            result,
          });
          logger(`Player ${player.name}'s ${name} operation result: \`${result}\``);

          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Done,
            result,
          );
        } catch (e) {
          logger(`Player ${player.name}'s ${name} operation Error: ${(e as Error).toString()}`);
          return new ExecutableGameFunctionResponse(
            ExecutableGameFunctionStatus.Failed,
            `Player ${player.name}'s ${name} operation failed.`,
          );
        }
      },
    }));
  };

  private getAllPlatersDesc = async () => {
    return (await Promise.all(
      this.gamePlayers.map(async player => `${player.name}, stats: ${JSON.stringify(await player.getAgentState?.())}`),
    )).join(';');
  };

  step = async () => {
    await this.waitAgentInit;
    const allPlayersDesc = await this.getAllPlatersDesc();
    await Promise.all(this.options.stages.map(async ({ id }) => {
      await Promise.all(this.gamePlayers.map(async player => {
        await player.getWorkerById(id).runTask(
          `Please complete your task. Any Operation can only be executed once.\nAll players in the current game: ${allPlayersDesc}`,
          { verbose: this.options.verboseLog ?? false },
        );
      }));
    }));

    await this.gameAdmin.getWorkerById('check_player_events').runTask(`Please check if the player has any violations: ${JSON.stringify(this.currentStepEvents)}`);

    await Promise.all(this.violations.map(async ({ player, stage, content }) => {
      await this.gamePlayers.find(p => p.name === player)?.getWorkerById(stage).runTask(content);
    }));

    this.currentStepEvents.length = 0;
    this.violations.length = 0;
  };
}
