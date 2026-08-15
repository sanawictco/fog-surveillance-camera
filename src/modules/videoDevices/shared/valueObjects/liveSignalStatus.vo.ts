import { ValueObject } from 'src/dddLib/core';
import { ArgumentInvalidException } from 'src/dddLib/core/exceptions';
export enum LiveSignalStatuses {
  CONNECTED = 1,
  DIS_CONNECTED = 2,
}

const INIT_VALUE = LiveSignalStatuses.CONNECTED;
export class LiveSignalStatus extends ValueObject<LiveSignalStatuses> {
  private _status: LiveSignalStatuses;
  constructor(language: LiveSignalStatuses) {
    super();
    this._status = language;
    this.validate();
  }
  get language() {
    return this._status;
  }
  protected validate(): void {
    if (!Object.values(LiveSignalStatuses).includes(this._status))
      throw new ArgumentInvalidException(
        `ValueObjectError: status=${this._status} is not valid`,
      );
  }

  public unpack(): LiveSignalStatuses {
    return this._status;
  }

  static init(): LiveSignalStatus {
    return new LiveSignalStatus(INIT_VALUE);
  }
}
