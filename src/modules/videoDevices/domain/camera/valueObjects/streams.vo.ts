import { ValueObject } from 'src/dddLib/core';

export class StreamsProps {
  recordStream: CameraStreamRecord;
  liveStream: CameraStreamRecord;

  constructor(props: StreamsProps) {
    this.recordStream = props.recordStream;
    this.liveStream = props.liveStream;
  }
}

class CameraStreamRecord {
  token: string;
  path: string;
  resolutions: ResolutionRecord[];

  constructor(props: CameraStreamRecord) {
    this.token = props.token;
    this.path = props.path;
    this.resolutions = props.resolutions;
  }
}

class ResolutionRecord {
  height: number;
  width: number;

  constructor(props: ResolutionRecord) {
    this.height = props.height;
    this.width = props.width;
  }
}

export class Streams extends ValueObject<StreamsProps> {
  private _streams: StreamsProps;

  constructor(streams: StreamsProps) {
    super();
    this._streams = streams;
    this.validate();
  }
  get streams() {
    return this._streams;
  }

  protected validate(): void {}

  public unpack(): StreamsProps {
    return Object.freeze(this._streams);
  }
}
