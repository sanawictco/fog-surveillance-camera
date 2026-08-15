import { forwardRef, Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  Command,
  CommandProps,
  IdType,
} from 'src/dddLib/applicationService/command.base';
import { AggregateID } from 'src/dddLib/core';
import { LanguageCode } from 'src/extensions/translation/languageCode.enum';

import { NVR_REPOSITORY } from '../../../infra/nvr/nvr.diToken';
import { NvrRepository } from '../../../infra/nvr/nvr.repository';
import { NvrActorLogService } from '../../services/actorLogs/nvrActorLog.service';
import { NvrEntity } from 'src/modules/videoDevices/domain/nvr/nvr.entity';
import { UpdateNvrProps } from 'src/modules/videoDevices/domain/nvr/nvr.type';
import { LiveSignalStatuses } from 'src/modules/videoDevices/shared/valueObjects/liveSignalStatus.vo';

export class UpdateNvrCommand extends Command implements UpdateNvrProps {
  name?: string;
  password?: string;
  lang?: LanguageCode;
  liveSignalStatus?: LiveSignalStatuses;
  cloudFailedAt?: number;
  runningConfigs?: Record<string, string>;

  constructor(props: CommandProps<UpdateNvrCommand> & IdType) {
    super(props);
    this.name = props.name;
    this.password = props.password;
    this.lang = props.lang;
    this.liveSignalStatus = props.liveSignalStatus;
    this.cloudFailedAt = props.cloudFailedAt;
    this.runningConfigs = props.runningConfigs;
  }
}

@CommandHandler(UpdateNvrCommand)
export class UpdateNvrCommandHandler implements ICommandHandler<UpdateNvrCommand> {
  constructor(
    @Inject(NVR_REPOSITORY)
    private readonly nvrRepo: NvrRepository,
    @Inject(forwardRef(() => NvrActorLogService))
    private readonly nvrActorLogService: NvrActorLogService,
  ) {}

  async execute(command: UpdateNvrCommand): Promise<AggregateID> {
    const nvrEntity: NvrEntity | undefined = await this.nvrRepo.findById(
      command.id,
    );
    const updateObj: UpdateNvrProps = {
      name: command.name,
      password: command.password,
      lang: command.lang,
      liveSignalStatus: command.liveSignalStatus,
      cloudFailedAt: command.cloudFailedAt,
      runningConfigs: command.runningConfigs,
    };
    if (!nvrEntity) throw Error('not exist nvr with id');
    nvrEntity.update(updateObj);
    await this.nvrRepo.update(nvrEntity);
    await this.processDependencies(nvrEntity, command);
    return command.id;
  }

  private async processDependencies(
    nvrEntity: NvrEntity,
    command: UpdateNvrCommand,
  ) {
    const actorId = command.actorProps?.actorId;
    const { name, password, lang } = command;
    const currentOrOldName = nvrEntity.getProps().name;
    if (name || password || lang)
      await this.nvrActorLogService.update({
        nvrEntity,
        actorId,
        updatedNvrProps: {
          currentOrOldName,
          updatedProps: command,
        },
      });
  }
}
