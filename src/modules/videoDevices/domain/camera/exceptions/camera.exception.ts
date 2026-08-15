import { ExceptionBase } from 'src/dddLib/core/exceptions';

export class CameraAlreadyExistsError extends ExceptionBase {
  static readonly message = 'Camera already exists';

  public readonly code = 'Camera.ALREADY_EXISTS';

  constructor(cause?: Error, metadata?: unknown) {
    super(CameraAlreadyExistsError.message, cause, metadata);
  }
}
