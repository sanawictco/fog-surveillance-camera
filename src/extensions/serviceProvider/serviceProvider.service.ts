import { Injectable } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LoggerService } from 'src/extensions/logger/logger.service';
import { SerializerService } from 'src/extensions/serialization/serializer.service';
import { TranslatorService } from 'src/extensions/translation/translatorService';
import { UserInfoService } from 'src/extensions/userInfo/userInfo.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { HttpService } from '../http/http.service';

@Injectable()
export class ServiceProvider {
  constructor(
    readonly serializer: SerializerService,
    readonly userInfoService: UserInfoService,
    readonly logger: LoggerService,
    ////////////////////////////////////////
    readonly eventEmitter: EventEmitter2,
    readonly commandBus: CommandBus,
    readonly queryBus: QueryBus,
    readonly translatorService: TranslatorService,
    readonly scheduler: SchedulerService,
    readonly httpService: HttpService,
  ) {}
}
