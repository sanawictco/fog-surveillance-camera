import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
} from '@nestjs/common';
import { LanguageCode } from './languageCode.enum';
import { DictionarySections, TranslatorBase } from './translator.base';
import { StringExtensions } from 'src/dddLib/utils/stringExtensions';
import { englishValues } from './languages/englishValues';
import { farsiValues } from './languages/farsiValues';
import { arabicValues } from './languages/arabicValues';
import { ServiceProvider } from '../serviceProvider/serviceProvider.service';
import { LanguageKeysBase } from './languageKeys.base';
import { kurdiValues } from './languages/kurdiValues';

@Injectable()
export class TranslatorService implements TranslatorBase {
  constructor() {}

  prepareDictionaryFormatForEachSection(
    lang: LanguageCode,
    section: DictionarySections,
  ) {
    let dictionary: Partial<LanguageKeysBase>;
    if (lang === LanguageCode.FA) {
      dictionary = structuredClone(farsiValues);
    } else if (lang === LanguageCode.EN) {
      dictionary = structuredClone(englishValues);
    } else if (lang === LanguageCode.AR) {
      dictionary = structuredClone(arabicValues);
    } else if (lang === LanguageCode.KU) {
      dictionary = structuredClone(kurdiValues);
    } else {
      throw new BadRequestException('not supported');
    }

    for (const key in dictionary) {
      for (const innerKey in dictionary[key]) {
        if (innerKey !== section) delete dictionary[key][innerKey];
      }
      if (Object.keys(dictionary[key]).length === 0) delete dictionary[key];
    }
    // delete dictionary.exposedApi;
    // delete dictionary.others;
    return dictionary;
  }

  translateByName(
    keychain: string,
    lang: LanguageCode = LanguageCode.FA,
  ): string {
    switch (lang) {
      case LanguageCode.EN:
        return getObjectPropertyByStringKeyChain(englishValues, keychain);
      case LanguageCode.FA:
        return getObjectPropertyByStringKeyChain(farsiValues, keychain);
      case LanguageCode.AR:
        return getObjectPropertyByStringKeyChain(arabicValues, keychain);
      case LanguageCode.KU:
        return getObjectPropertyByStringKeyChain(kurdiValues, keychain);
      default:
        return 'not supported language';
    }
  }

  translateByPattern(
    keychain: string,
    params: unknown[],
    lang: LanguageCode = LanguageCode.EN,
  ): string {
    switch (lang) {
      case LanguageCode.EN:
        return StringExtensions.formatWithParams(
          getObjectPropertyByStringKeyChain(englishValues, keychain),
          params,
        );
      case LanguageCode.FA:
        return StringExtensions.formatWithParams(
          getObjectPropertyByStringKeyChain(farsiValues, keychain),
          params,
        );
      case LanguageCode.AR:
        return StringExtensions.formatWithParams(
          getObjectPropertyByStringKeyChain(arabicValues, keychain),
          params,
        );
      case LanguageCode.KU:
        return StringExtensions.formatWithParams(
          getObjectPropertyByStringKeyChain(kurdiValues, keychain),
          params,
        );
      default:
        return 'not supported language';
    }
  }
}

const getObjectPropertyByStringKeyChain = (object, keychain) => {
  if (!keychain) return;
  try {
    return keychain.split('.').reduce((p, prop) => p[prop], object);
  } catch (e) {
    console.log('>>>>>>>>', keychain, e);
  }
};
