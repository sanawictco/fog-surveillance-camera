import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'checkExistSpecialCharacter', async: false })
export class AvoidUsingWhiteSpaceCharacters implements ValidatorConstraintInterface {
  validate(text: string /*, args: ValidationArguments*/) {
    return !/\s/.test(text);
  }

  defaultMessage(/*args: ValidationArguments*/) {
    // here you can provide default error message if validation failed
    return 'white space character exists';
  }
}
