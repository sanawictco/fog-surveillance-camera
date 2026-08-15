import { LanguageCode } from 'src/extensions/translation/languageCode.enum';
import { DictionarySections } from 'src/extensions/translation/translator.base';
import { TranslatorService } from 'src/extensions/translation/translatorService';

describe('TranslatorService', () => {
  afterEach(() => {
    TranslatorService.LANG = LanguageCode.FA;
  });

  it('uses the configured NVR language for names and patterns', () => {
    TranslatorService.LANG = LanguageCode.EN;
    const translator = new TranslatorService();

    expect(translator.translateByName('dashboard.response.http.created')).toBe(
      'Page created',
    );
    expect(
      translator.translateByPattern('dashboard.actorLog.created', ['Overview']),
    ).toBe('A page named Overview was created');
  });

  it('filters dictionaries to the requested section and omits shared keys', () => {
    TranslatorService.LANG = LanguageCode.EN;
    const translator = new TranslatorService();

    const dictionary = translator.prepareDictionaryFormatForEachSection(
      DictionarySections.SYSTEM_LOG,
    );

    expect(dictionary).not.toHaveProperty('others');
    expect(dictionary.camera).toEqual({
      systemLog: { disconnected: 'Camera {0} became unavailable' },
    });
    expect(dictionary.dashboard).toBeUndefined();
  });
});
