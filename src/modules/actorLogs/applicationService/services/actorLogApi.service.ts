import { Injectable } from '@nestjs/common';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import { CloudRecoveryService } from 'src/modules/cloudConnection/applicationService/cloudRecovery.service';
import { CloudConnectionService } from 'src/modules/cloudConnection/applicationService/services/cloudConnection.service';
import { ActorLogTypes } from '../../domain/actorLog.type';
import { ActorLogMessageProps } from '../../domain/valueObjects/actorLogMessage.vo';
import { CreateActorLogCommand } from '../commands/createActorLog.command';
import { CreateActorLogSubTableCommand } from '../commands/createActorLogSubTable.command';
import { DeleteActorLogSubTableCommand } from '../commands/deleteActorLogSubTable.command';

@Injectable()
export class ActorLogApiService {
  constructor(private readonly serviceProvider: ServiceProvider) {}

  async registerActorLog(actorLogProps: {
    createdAt?: number;
    actorId?: string;
    actorType?: ActorLogTypes;
    messageProps: ActorLogMessageProps;
  }) {
    const { messageProps } = actorLogProps;
    let { actorId, actorType, createdAt } = actorLogProps;
    createdAt = createdAt !== undefined ? createdAt : new Date().getTime();
    const actorInfo = this.serviceProvider.userInfoService.getNvrAsActorProps();
    actorId = actorId || actorInfo.id;
    actorType = actorType || ActorLogTypes.EMPLOYEE;
    if (
      !CloudConnectionService.CLOUD_IS_AVAILABLE &&
      !CloudRecoveryService.RECOVERY_PROCESS_INITIALIZED
    ) {
      await this.serviceProvider.commandBus.execute(
        new CreateActorLogCommand({
          createdAt,
          actorId,
          actorType,
          messageProps,
        }),
      );
    }
  }

  async createSubTable(subTableName: string) {
    await this.serviceProvider.commandBus.execute(
      new CreateActorLogSubTableCommand({ subTableName }),
    );
  }

  async deleteSubTable(subTableName: string) {
    await this.serviceProvider.commandBus.execute(
      new DeleteActorLogSubTableCommand({ subTableName }),
    );
  }
}
