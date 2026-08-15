import { ValueObject } from 'src/dddLib/core';
import { ArgumentInvalidException } from 'src/dddLib/core/exceptions';
import { ActorLogMessageProps } from '../actorLog.type';

export type { ActorLogMessageProps } from '../actorLog.type';
export class ActorLogMessage extends ValueObject<ActorLogMessageProps> {
  private _actorLogMessageProps: ActorLogMessageProps;
  constructor(actorLogMessageProps: ActorLogMessageProps) {
    super();
    this._actorLogMessageProps = actorLogMessageProps;
    this.validate();
  }
  protected validate(): void {
    const { key, params } = this._actorLogMessageProps;
    if (typeof key !== 'string')
      throw new ArgumentInvalidException(
        `ValueObjectError - key=${key} which must be string`,
      );
    let i = -1;
    for (const item of params) {
      i++;
      if (!['string', 'number'].includes(typeof item))
        throw new ArgumentInvalidException(
          `ValueObjectError - paramsIndex=${i} at key=${key}, is ${item} which is not valid`,
        );
    }
  }

  public unpack(): ActorLogMessageProps {
    return this._actorLogMessageProps;
  }
}
