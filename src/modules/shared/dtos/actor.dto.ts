import { ActorLogTypes } from 'src/modules/actorLogs/domain/actorLog.type';

export class ActorDto {
  actorId?: string;
  actorType?: ActorLogTypes;
}
