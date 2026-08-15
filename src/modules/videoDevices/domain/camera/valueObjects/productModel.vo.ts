import { ValueObject } from 'src/dddLib/core';
import { ArgumentOutOfRangeException } from 'src/dddLib/core/exceptions';
import { Guard } from 'src/dddLib/utils/guard';

export class ProductModel extends ValueObject<string> {
  private _productModel: string;
  constructor(productModel: string) {
    super();
    this._productModel = productModel;
    this.validate();
  }

  protected validate(): void {
    if (!Guard.isBetween(this._productModel, 1, 100))
      throw new ArgumentOutOfRangeException(
        `ValueObjectError: productModel=${this._productModel} is out of range`,
      );
  }

  public unpack(): string {
    return this._productModel;
  }
}
