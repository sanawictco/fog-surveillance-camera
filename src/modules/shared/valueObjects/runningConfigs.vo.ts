import { ValueObject } from 'src/dddLib/core';
import { ArgumentInvalidException } from 'src/dddLib/core/exceptions';
const INIT_VALUE = { init: '-1' };

export class RunningConfigs extends ValueObject<Record<string, string>> {
  private _runningConfigs: Record<string, string>;
  constructor(runningConfigs: Record<string, string>) {
    super();
    this._runningConfigs = runningConfigs;
    // this.validate();
  }

  protected validate(): void {
    for (const value of Object.values(this._runningConfigs))
      if (isNaN(Number(value)))
        throw new ArgumentInvalidException(
          `value of runningConfig=${this._runningConfigs} is not numeric`,
        );
  }

  public unpack(): Record<string, string> {
    return this._runningConfigs;
  }

  static init(): RunningConfigs {
    return new RunningConfigs(INIT_VALUE);
  }
}
