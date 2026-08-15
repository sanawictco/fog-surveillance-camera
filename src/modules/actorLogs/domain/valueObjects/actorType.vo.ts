import { ValueObject } from 'src/dddLib/core';
import { ActorLogTypes } from '../actorLog.type';
import { ArgumentInvalidException } from 'src/dddLib/core/exceptions';

export class ActorType extends ValueObject<ActorLogTypes> {
  private _actorType: ActorLogTypes;
  constructor(actorType: ActorLogTypes) {
    super();
    this._actorType = actorType;
    this.validate();
  }
  protected validate(): void {
    if (!Object.values(ActorLogTypes).includes(this._actorType))
      throw new ArgumentInvalidException(
        `ValueObjectError - actorType=${this._actorType} which is not valid`,
      );
  }

  public unpack(): ActorLogTypes {
    return this._actorType;
  }
}
