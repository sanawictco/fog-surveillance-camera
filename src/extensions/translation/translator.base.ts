import { LanguageKeysBase } from './languageKeys.base';

export enum DictionarySections {
  ACTOR_LOG = 'actorLog',
  SYSTEM_LOG = 'systemLog',
  RULECHAIN_LOG = 'rulechainLog',
}

export interface TranslatorBase {
  prepareDictionaryFormatForEachSection(
    section: DictionarySections,
  ): Partial<LanguageKeysBase>;
  translateByName(name: keyof LanguageKeysBase): string;
  translateByPattern(pattern: string, params: unknown[]): string;
}
