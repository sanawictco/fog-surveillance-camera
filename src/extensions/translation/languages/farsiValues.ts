import { LanguageKeysBase } from '../languageKeys.base';

export const farsiValues: LanguageKeysBase = {
  nvr: {
    actorLog: {
      created: 'nvr با نام {0} (سریال {1}) ثبت شد',
      deleted: 'nvr با نام {0} (سریال {1}) حذف شد',
      active: 'nvr با نام {0} (سریال {1}) فعال شد',
      inactive: 'nvr با نام {0} (سریال {1}) غیرفعال شد',
      nameUpdated: 'نام nvr از {0} به {2} (سریال {1}) تغییر یافت',
      passwordUpdated: 'رمز عبور nvr {0} (سریال {1}) تغییر کرد',
      langUpdated: {
        toFa: 'زبان nvr {0} (سریال {1}) به فارسی تغییر یافت',
        toEn: 'زبان nvr {0} (سریال {1}) به انگلیسی تغییر یافت',
        toAr: 'زبان nvr {0} (سریال {1}) به عربی تغییر یافت',
        toKu: 'زبان nvr {0} (سریال {1}) به کردی تغییر یافت',
      },
    },
    response: {
      socket: {
        updated: 'nvr به‌روزرسانی شد',
      },
    },
    errorResponse: {
      badRequest: {
        nameIsDuplicated: 'نام nvr تکراری است',
      },
    },
  },
  camera: {
    actorLog: {
      created: 'دوربین با نام {0} ایجاد شد',
      deleted: 'دوربین با نام {0} حذف شد',
      nameUpdated: 'نام دوربین از {0} به {1} تغییر یافت',
      activated: 'دوربین با نام {0} فعال شد',
      inactivated: 'دوربین با نام {0} غیرفعال شد',
    },
    systemLog: {
      disconnected: 'دوربین با نام {0} از دسترس خارج شد',
    },
    response: {
      socket: {
        updated: 'دوربین به‌روزرسانی شد',
      },
    },
    errorResponse: {
      badRequest: {
        nameIsDuplicated: 'نام دوربین تکراری است',
      },
    },
  },
  dashboard: {
    actorLog: {
      created: 'صفحه‌ای با نام {0} ایجاد شد',
      deleted: 'صفحه‌ای با نام {0} حذف شد',
      nameUpdated: 'نام صفحه از {0} به {1} تغییر یافت',
      contentUpdated: 'محتوای صفحه با نام {1} به‌روزرسانی شد',
      pageIndexUpdated: 'ترتیب صفحه با نام {0} به‌روزرسانی شد',
    },
    response: {
      http: {
        created: 'صفحه ایجاد شد',
        updated: 'صفحه به‌روزرسانی شد',
      },
      socket: {
        created: 'صفحه ایجاد شد',
        updated: 'صفحه به‌روزرسانی شد',
        deleted: 'صفحه حذف شد',
      },
    },
    errorResponse: {
      badRequest: {
        notExists: 'صفحه‌ای با این شناسه وجود ندارد',
        nameIsDuplicated: 'نام صفحه تکراری است',
      },
    },
  },
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
