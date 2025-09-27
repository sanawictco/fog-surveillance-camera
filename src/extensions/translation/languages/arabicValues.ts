import { LanguageKeysBase } from '../languageKeys.base';

export const arabicValues: LanguageKeysBase = {
  others: {
    erroResponse: {
      badRequest: {
        wrongPassword: 'كلمة المرور غير صحيحة',
        accessDenied: 'وصول غير مصرح به',
        invalidInput: 'إدخال غير صالح',
        invalidRequest: 'طلب غير صالح',
        invalidCmdStructures: 'تنسيق البيانات المرسلة غير صالح',
      },
    },
    geo: {
      lat: 'الطول',
      lng: 'العرض',
      alt: 'الارتفاع',
    },
    time: 'الوقت',
    true: 'صحيح',
    false: 'خطأ',
    internalServerError: 'حدث خطأ داخلي في الخادم',
  },
};

export const arabicSystemLogSections = {
  SYSTEM_LOG_SECTION_DEVICE_LIVE_SIGNAL: 'إشارة حالة الجهاز',
  SYSTEM_LOG_SECTION_DEVICE_CONFIG: 'إعدادات الجهاز',
  SYSTEM_LOG_SECTION_DEVICE_DATA: 'بيانات الجهاز',
  SYSTEM_LOG_SECTION_RULE_CHAIN: 'سلسلة القواعد',
  SYSTEM_LOG_SECTION_RULE_CHAIN_CATEGORY: 'تصنيف سلسلة القواعد',
  SYSTEM_LOG_SECTION_RULE_CHAIN_STORAGE_NODE: 'عقدة تخزين سلسلة القواعد',
  SYSTEM_LOG_SECTION_RULE_CHAIN_NODE: 'عقدة سلسلة القواعد',
};
