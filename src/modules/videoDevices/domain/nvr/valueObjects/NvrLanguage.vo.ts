import { ValueObject } from 'src/dddLib/core';
import { ArgumentOutOfRangeException } from 'src/dddLib/core/exceptions';
import { Guard } from 'src/dddLib/utils';
import { LanguageCode } from 'src/extensions/translation/languageCode.enum';
const INIT_VALUE = LanguageCode.FA;
export class NvrLanguage extends ValueObject<LanguageCode> {
  private _lang: LanguageCode;
  constructor(language: LanguageCode) {
    super();
    this._lang = language;
    this.validate();
  }
  get language() {
    return this._lang;
  }
  protected validate(): void {
    if (
      !Guard.isEmpty(this._lang) &&
      !Object.values(LanguageCode).includes(this._lang)
    )
      throw new ArgumentOutOfRangeException(
        `lang=${this._lang} is out of range - ValueObjectError`,
      );
  }

  public unpack(): LanguageCode {
    return this._lang;
  }

  static init(): NvrLanguage {
    return new NvrLanguage(INIT_VALUE);
  }
}
