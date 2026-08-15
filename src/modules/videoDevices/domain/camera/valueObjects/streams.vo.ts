import { ValueObject } from 'src/dddLib/core';

export class StreamsProps {
  recordStream!: CameraStreamRecord;
  liveStream!: CameraStreamRecord;
}

class CameraStreamRecord {
  token!: string;
  path!: string;
  resolutions!: ResolutionRecord[];
}

class ResolutionRecord {
  height!: number;
  width!: number;
}

export class Streams extends ValueObject<StreamsProps> {
  private _streams: StreamsProps;

  constructor(streams: StreamsProps) {
    super();
    this._streams = streams;
    this.validate();
  }
  get streams(): StreamsProps {
    return this._streams;
  }

  protected validate(): void {}

  public unpack(): StreamsProps {
    return Object.freeze(this._streams);
  }
}
