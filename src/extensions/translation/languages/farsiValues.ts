import { LanguageKeysBase } from '../languageKeys.base';

export const farsiValues: LanguageKeysBase = {
  others: {
    erroResponse: {
      badRequest: {
        wrongPassword: 'رمز عبور نامعتبر است',
        accessDenied: 'دسترسی غیرمجاز',
        invalidInput: 'ورودی نامعتبر',
        invalidRequest: 'درخواست نامعتبر',
        invalidCmdStructures: 'فرمت داده ارسالی نامعتبر است',
      },
    },
    geo: {
      lat: 'طول',
      lng: 'عرض',
      alt: 'ارتفاع',
    },
    time: 'زمان',
    true: 'صحیح',
    false: 'غلط',
    internalServerError: 'خطای داخلی سرور رخ داد',
  },
};

export const farsiSystemLogSections = {
  SYSTEM_LOG_SECTION_DEVICE_LIVE_SIGNAL: 'سیگنال سلامت',
  SYSTEM_LOG_SECTION_DEVICE_CONFIG: 'تنظیمات تجهیز',
  SYSTEM_LOG_SECTION_DEVICE_DATA: 'داده تجهیز',
  SYSTEM_LOG_SECTION_RULE_CHAIN: 'زنجیره قواعد',
  SYSTEM_LOG_SECTION_RULE_CHAIN_CATEGORY: 'دسته بندی زنجیره قواعد',
  SYSTEM_LOG_SECTION_RULE_CHAIN_STORAGE_NODE: 'نود ذخیره زنجیره قواعد',
  SYSTEM_LOG_SECTION_RULE_CHAIN_NODE: 'نود زنجیره قواعد',
};

export const farsiReportFields = {
  EMPLOYEE: 'کارمند',
  RULE_CHAIN: 'زنجیره قواعد',
  EXPOSED_REST_API: 'وب سرویس',
  createdAt: 'تاریخ',
  actorLogType: 'اکتور',
  actorId: 'شناسه اکتور',
  messageKey: 'توضیحات',
};
