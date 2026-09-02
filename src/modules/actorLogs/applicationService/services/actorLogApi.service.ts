import { Injectable } from '@nestjs/common';
import AppConfig from 'configs/app.config';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';
import { CloudRecoveryService } from 'src/modules/cloudConnection/applicationService/cloudRecovery.service';
import { CloudConnectionService } from 'src/modules/cloudConnection/applicationService/services/cloudConnection.service';
import { ActorLogTypes, assertActorLogId } from '../../domain/actorLog.type';
import { ActorLogMessageProps } from '../../domain/valueObjects/actorLogMessage.vo';
import { CreateActorLogCommand } from '../commands/createActorLog.command';

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
    assertActorLogId(actorId);
    if (
      !CloudConnectionService.CLOUD_IS_AVAILABLE &&
      !CloudRecoveryService.RECOVERY_PROCESS_INITIALIZED
    ) {
      await this.serviceProvider.commandBus.execute(
        new CreateActorLogCommand({
          createdAt,
          tenantId: AppConfig().tenantId,
          actorId,
          actorType,
          messageProps,
        }),
      );
    }
  }
}
