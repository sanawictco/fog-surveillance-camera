import { ValueObject } from 'src/dddLib/core';
import { ArgumentInvalidException } from 'src/dddLib/core/exceptions';
import { Guard } from 'src/dddLib/utils';
export class ActorLogCreatedAtInUnix extends ValueObject<number> {
  private _actorLogCreatedAtInUnix: number;
  constructor(actorLogCreatedAtInUnix: number) {
    super();
    this._actorLogCreatedAtInUnix = actorLogCreatedAtInUnix;
    this.validate();
  }
  protected validate(): void {
    if (!this._actorLogCreatedAtInUnix) return;
    if (!Guard.isUnix(this._actorLogCreatedAtInUnix)) {
      throw new ArgumentInvalidException(
        `ValueObjectError: actorLogCreatedAtInUnix=${this._actorLogCreatedAtInUnix} is invalid`,
      );
    }
  }

  public unpack(): number {
    return this._actorLogCreatedAtInUnix;
  }
}
