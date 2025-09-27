import { LanguageCode } from './languageCode.enum';
import { LanguageKeysBase } from './languageKeys.base';

export enum DictionarySections {
  ACTOR_LOG = 'actorLog',
  SYSTEM_LOG = 'systemLog',
  RULECHAIN_LOG = 'rulechainLog',
}

export interface TranslatorBase {
  prepareDictionaryFormatForEachSection(
    lang: LanguageCode,
    section: DictionarySections,
  );
  translateByName(name: keyof LanguageKeysBase, lang: LanguageCode): string;
  translateByPattern(
    pattern: string,
    params: unknown[],
    lang?: LanguageCode,
  ): string;
}
