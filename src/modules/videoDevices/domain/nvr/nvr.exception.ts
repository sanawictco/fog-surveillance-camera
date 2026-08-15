import { ExceptionBase } from 'src/dddLib/core/exceptions';

export class NvrAlreadyExistsError extends ExceptionBase {
  static readonly message = 'Nvr already exists';

  public readonly code = 'Nvr.ALREADY_EXISTS';

  constructor(cause?: Error, metadata?: unknown) {
    super(NvrAlreadyExistsError.message, cause, metadata);
  }
}
