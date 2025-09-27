export type Primitives = string | number | boolean;

export interface DomainPrimitive<T extends Primitives | Date> {
  value: T;
}

export abstract class ValueObject<T> {
  protected abstract validate(): void;

  static isValueObject(obj: unknown): obj is ValueObject<unknown> {
    return obj instanceof ValueObject;
  }

  public equals(vo?: ValueObject<T>): boolean {
    if (vo === null || vo === undefined) {
      return false;
    }
    return JSON.stringify(this) === JSON.stringify(vo);
  }

  public abstract unpack(): T;

  static createValueObjectIfDefined<T, U>(
    value: T | undefined,
    ValueObjectClass: new (arg: T) => U,
  ): U | undefined {
    return value !== undefined ? new ValueObjectClass(value) : undefined;
  }
}
