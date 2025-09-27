import { EventEmitter2 } from '@nestjs/event-emitter';

import { LoggerBase } from '../utils';
import { Entity } from './entity.base';
import { DomainEvent } from './domainEvent.base';
import { RequestContextService } from '../utils/appRequestContext';

export abstract class AggregateRoot<
  EntityValueObjects,
  EntityProps,
> extends Entity<EntityValueObjects, EntityProps> {
  private _domainEvents: DomainEvent[] = [];

  get domainEvents(): DomainEvent[] {
    return this._domainEvents;
  }

  protected addEvent(domainEvent: DomainEvent): void {
    this._domainEvents.push(domainEvent);
  }

  public clearEvents(): void {
    this._domainEvents = [];
  }

  public async publishEvents(
    logger: LoggerBase,
    eventEmitter: EventEmitter2,
  ): Promise<void> {
    await Promise.all(
      this.domainEvents.map(async (event) => {
        logger.debug(
          `[${RequestContextService.getRequestId()}] "${
            event.constructor.name
          }" event published for aggregate ${this.constructor.name} : ${
            this.id
          }`,
        );
        return eventEmitter.emitAsync(event.constructor.name, event);
      }),
    );
    this.clearEvents();
  }
}
