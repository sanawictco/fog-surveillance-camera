import { LanguageKeysBase } from '../languageKeys.base';

export const arabicValues: LanguageKeysBase = {
  nvr: {
    actorLog: {
      created: 'تم تسجيل جهاز NVR {0} (الرقم التسلسلي {1})',
      deleted: 'تم حذف جهاز NVR {0} (الرقم التسلسلي {1})',
      active: 'تم تفعيل جهاز NVR {0} (الرقم التسلسلي {1})',
      inactive: 'تم تعطيل جهاز NVR {0} (الرقم التسلسلي {1})',
      nameUpdated: 'تم تغيير اسم جهاز NVR من {0} إلى {2} (الرقم التسلسلي {1})',
      passwordUpdated: 'تم تغيير كلمة مرور جهاز NVR {0} (الرقم التسلسلي {1})',
      langUpdated: {
        toFa: 'تم تغيير لغة جهاز NVR {0} (الرقم التسلسلي {1}) إلى الفارسية',
        toEn: 'تم تغيير لغة جهاز NVR {0} (الرقم التسلسلي {1}) إلى الإنجليزية',
        toAr: 'تم تغيير لغة جهاز NVR {0} (الرقم التسلسلي {1}) إلى العربية',
        toKu: 'تم تغيير لغة جهاز NVR {0} (الرقم التسلسلي {1}) إلى الكردية',
      },
    },
    response: {
      socket: {
        updated: 'تم تحديث جهاز NVR',
      },
    },
    errorResponse: {
      badRequest: {
        nameIsDuplicated: 'اسم جهاز NVR مكرر',
      },
    },
  },
  camera: {
    actorLog: {
      created: 'تم إنشاء الكاميرا {0}',
      deleted: 'تم حذف الكاميرا {0}',
      nameUpdated: 'تم تغيير اسم الكاميرا من {0} إلى {1}',
      activated: 'تم تفعيل الكاميرا {0}',
      inactivated: 'تم تعطيل الكاميرا {0}',
    },
    systemLog: {
      disconnected: 'أصبحت الكاميرا {0} غير متاحة',
    },
    response: {
      socket: {
        updated: 'تم تحديث الكاميرا',
      },
    },
    errorResponse: {
      badRequest: {
        nameIsDuplicated: 'اسم الكاميرا مكرر',
      },
    },
  },
  dashboard: {
    actorLog: {
      created: 'تم إنشاء صفحة باسم {0}',
      deleted: 'تم حذف صفحة باسم {0}',
      nameUpdated: 'تم تغيير اسم الصفحة من {0} إلى {1}',
      contentUpdated: 'تم تحديث محتوى الصفحة المسماة {1}',
      pageIndexUpdated: 'تم تحديث ترتيب الصفحة المسماة {0}',
    },
    response: {
      http: {
        created: 'تم إنشاء الصفحة',
        updated: 'تم تحديث الصفحة',
      },
      socket: {
        created: 'تم إنشاء الصفحة',
        updated: 'تم تحديث الصفحة',
        deleted: 'تم حذف الصفحة',
      },
    },
    errorResponse: {
      badRequest: {
        notExists: 'لا توجد صفحة بهذا المعرف',
        nameIsDuplicated: 'اسم الصفحة مكرر',
      },
    },
  },
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
