import { LanguageKeysBase } from '../languageKeys.base';

export const kurdiValues: LanguageKeysBase = {
  others: {
    erroResponse: {
      badRequest: {
        wrongPassword: 'پاسۆرد هەڵەیە',
        accessDenied: 'دەستڕاگەیشتن ڕێگەپێدراو نییە',
        invalidInput: 'داتای نێردراو هەڵەیە',
        invalidRequest: 'داواکاری هەڵەیە',
        invalidCmdStructures: 'فۆرماتی داتای نێردراو هەڵەیە',
      },
    },
    geo: {
      lat: 'درێژی',
      lng: 'پانی',
      alt: 'بەرزی',
    },
    time: 'کات',
    true: 'دروست',
    false: 'هەڵە',
    internalServerError: 'هەڵەیەکی ناوەکی سێرڤەر ڕوویدا',
  },
};

export const kurdiSystemLogSections = {
  SYSTEM_LOG_SECTION_DEVICE_LIVE_SIGNAL: 'نیشانەی تەندروستی ئامێر',
  SYSTEM_LOG_SECTION_DEVICE_CONFIG: 'ڕێکخستنەکانی ئامێر',
  SYSTEM_LOG_SECTION_DEVICE_DATA: 'زانیاری ئامێر',
  SYSTEM_LOG_SECTION_RULE_CHAIN: 'زنجیرەی یاساکان',
  SYSTEM_LOG_SECTION_RULE_CHAIN_CATEGORY: 'پۆلێنی زنجیرەی یاساکان',
  SYSTEM_LOG_SECTION_RULE_CHAIN_STORAGE_NODE: 'نۆدی زنجیرەی یاساکان',
  SYSTEM_LOG_SECTION_RULE_CHAIN_NODE: 'نۆدی زنجیرەی یاساکان',
};

export const kurdiReportFields = {
  EMPLOYEE: 'کارمەند',
  RULE_CHAIN: 'زنجیرەی یاساکان',
  EXPOSED_REST_API: 'API',
  createdAt: 'بەروار',
  actorLogType: 'ئەکتەر',
  actorId: 'ناسنامەی ئەکتەر',
  messageKey: 'پێناسە',
};
