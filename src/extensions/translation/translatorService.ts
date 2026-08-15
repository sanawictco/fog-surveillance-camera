import { Injectable } from '@nestjs/common';
import { StringExtensions } from 'src/dddLib/utils/stringExtensions';
import { LanguageCode } from './languageCode.enum';
import { LanguageKeysBase } from './languageKeys.base';
import { arabicValues } from './languages/arabicValues';
import { englishValues } from './languages/englishValues';
import { farsiValues } from './languages/farsiValues';
import { kurdiValues } from './languages/kurdiValues';
import { DictionarySections, TranslatorBase } from './translator.base';

@Injectable()
export class TranslatorService implements TranslatorBase {
  private static lang: LanguageCode = LanguageCode.FA;

  static get LANG(): LanguageCode {
    return this.lang;
  }

  static set LANG(value: LanguageCode) {
    this.lang = value;
  }

  prepareDictionaryFormatForEachSection(
    section: DictionarySections,
  ): Partial<LanguageKeysBase> {
    const dictionary: Partial<LanguageKeysBase> = structuredClone(
      this.getLanguageDictionary(),
    );

    for (const key of Object.keys(dictionary) as Array<
      keyof LanguageKeysBase
    >) {
      if (key === 'others') {
        delete dictionary[key];
        continue;
      }
      const innerDictionary = dictionary[key] as
        Record<string, unknown> | undefined;
      if (!innerDictionary) continue;
      for (const innerKey of Object.keys(innerDictionary)) {
        if (innerKey !== section) delete innerDictionary[innerKey];
      }
      if (Object.keys(innerDictionary).length === 0) delete dictionary[key];
    }
    return dictionary;
  }

  translateByName(keychain: string): string {
    return getObjectPropertyByStringKeyChain(
      this.getLanguageDictionary(),
      keychain,
    );
  }

  translateByPattern(keychain: string, params: unknown[]): string {
    return StringExtensions.formatWithParams(
      getObjectPropertyByStringKeyChain(this.getLanguageDictionary(), keychain),
      params,
    );
  }

  private getLanguageDictionary(): LanguageKeysBase {
    const dictionaries: Record<LanguageCode, LanguageKeysBase> = {
      [LanguageCode.FA]: farsiValues,
      [LanguageCode.EN]: englishValues,
      [LanguageCode.AR]: arabicValues,
      [LanguageCode.KU]: kurdiValues,
    };
    const dictionary = dictionaries[TranslatorService.LANG];
    if (!dictionary) {
      throw new Error(
        `Language code '${TranslatorService.LANG}' is not supported`,
      );
    }
    return dictionary;
  }
}

function getObjectPropertyByStringKeyChain(
  object: LanguageKeysBase,
  keychain: string,
): string {
  if (!keychain) throw new Error('Translation keychain cannot be empty');
  try {
    const value = keychain.split('.').reduce<unknown>((parent, property) => {
      if (typeof parent !== 'object' || parent === null) {
        throw new Error(`Property '${property}' does not exist`);
      }
      return (parent as Record<string, unknown>)[property];
    }, object);
    if (typeof value !== 'string') {
      throw new Error('Translation value is not a string');
    }
    return value;
  } catch (err) {
    throw new Error(`Translation keychain "${keychain}" is not valid`, {
      cause: err,
    });
  }
}
