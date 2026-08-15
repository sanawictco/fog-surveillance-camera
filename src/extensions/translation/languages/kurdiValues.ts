import { LanguageKeysBase } from '../languageKeys.base';

export const kurdiValues: LanguageKeysBase = {
  nvr: {
    actorLog: {
      nameUpdated: 'ناوی NVR لە {0} بۆ {2} گۆڕا (زنجیرە {1})',
      passwordUpdated: 'وشەی نهێنی NVRی {0} (زنجیرە {1}) گۆڕدرا',
      langUpdated: {
        toFa: 'زمانی NVRی {0} (زنجیرە {1}) بۆ فارسی گۆڕا',
        toEn: 'زمانی NVRی {0} (زنجیرە {1}) بۆ ئینگلیزی گۆڕا',
        toAr: 'زمانی NVRی {0} (زنجیرە {1}) بۆ عەرەبی گۆڕا',
        toKu: 'زمانی NVRی {0} (زنجیرە {1}) بۆ کوردی گۆڕا',
      },
    },
    response: {
      socket: {
        updated: 'NVR نوێکرایەوە',
      },
    },
    errorResponse: {
      badRequest: {
        nameIsDuplicated: 'ناوی NVR دووبارەیە',
      },
    },
  },
  camera: {
    actorLog: {
      nameUpdated: 'ناوی کامێرا لە {0} بۆ {1} گۆڕا',
      activated: 'کامێرای {0} چالاککرا',
      inactivated: 'کامێرای {0} ناچالاککرا',
    },
    systemLog: {
      disconnected: 'کامێرای {0} لە دەستڕاگەیشتن دەرچوو',
    },
    response: {
      socket: {
        updated: 'کامێرا نوێکرایەوە',
      },
    },
    errorResponse: {
      badRequest: {
        nameIsDuplicated: 'ناوی کامێرا دووبارەیە',
      },
    },
  },
  dashboard: {
    actorLog: {
      created: 'پەڕەیەک بە ناوی {0} دروستکرا',
      deleted: 'پەڕەیەک بە ناوی {0} سڕایەوە',
      nameUpdated: 'ناوی پەڕە لە {0} بۆ {1} گۆڕا',
      contentUpdated: 'ناوەڕۆکی پەڕە بە ناوی {1} نوێکرایەوە',
      pageIndexUpdated: 'ڕیزبەندی پەڕە بە ناوی {0} نوێکرایەوە',
    },
    response: {
      http: {
        created: 'پەڕە دروستکرا',
        updated: 'پەڕە نوێکرایەوە',
      },
      socket: {
        created: 'پەڕە دروستکرا',
        updated: 'پەڕە نوێکرایەوە',
        deleted: 'پەڕە سڕایەوە',
      },
    },
    errorResponse: {
      badRequest: {
        notExists: 'پەڕەیەک بەم ناسنامەیە بوونی نییە',
        nameIsDuplicated: 'ناوی پەڕە دووبارەیە',
      },
    },
  },
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
