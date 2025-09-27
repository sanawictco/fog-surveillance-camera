import {
  ARGUMENT_INVALID,
  ARGUMENT_NOT_PROVIDED,
  ARGUMENT_OUT_OF_RANGE,
  CONFLICT,
  INTERNAL_SERVER_ERROR,
  NOT_FOUND,
} from './exception.codes';
import { ExceptionBase } from './exception.base';

//Used to indicate that an incorrect argument was provided to a method/function/class constructor
export class ArgumentInvalidException extends ExceptionBase {
  readonly code = ARGUMENT_INVALID;
}

// Used to indicate that an argument was not provided (is empty object/array, null of undefined).
export class ArgumentNotProvidedException extends ExceptionBase {
  readonly code = ARGUMENT_NOT_PROVIDED;
}

//Used to indicate that an argument is out of allowed range
//(for example: incorrect string/array length, number not in allowed min/max range etc)
export class ArgumentOutOfRangeException extends ExceptionBase {
  readonly code = ARGUMENT_OUT_OF_RANGE;
}

// Used to indicate conflicting entities (usually in the database)
export class ConflictException extends ExceptionBase {
  readonly code = CONFLICT;
}

// Used to indicate wrong state for entity (usually in the database)
export class WrongStateException extends ExceptionBase {
  readonly code = CONFLICT;
}

// Used to indicate that entity is not found
export class NotFoundException extends ExceptionBase {
  static readonly message = 'Not found';

  constructor(message = NotFoundException.message) {
    super(message);
  }

  readonly code = NOT_FOUND;
}

// Used to indicate an internal server error that does not fall under all other errors
export class InternalServerErrorException extends ExceptionBase {
  static readonly message = 'Internal server error';

  constructor(message = InternalServerErrorException.message) {
    super(message);
  }

  readonly code = INTERNAL_SERVER_ERROR;
}
