export const companyErrors: Record<string, [string, string]> = {
  forbidden: [
    "You don't have permission to manage companies.",
    "ليست لديك صلاحية لإدارة الشركات.",
  ],
  conflict: [
    "The company changed or this action is no longer allowed. Refresh and try again.",
    "تغيّرت الشركة أو لم يعد الإجراء مسموحًا. حدّث وحاول مجددًا.",
  ],
  "email-in-use": [
    "An account already uses this email.",
    "يوجد حساب يستخدم هذا البريد الإلكتروني.",
  ],
  invalid: [
    "Check the required fields and try again.",
    "تحقّق من الحقول المطلوبة وحاول مجددًا.",
  ],
  "not-found": ["Company not found.", "الشركة غير موجودة."],
  changed: [
    "Your session changed. Refresh before continuing.",
    "تغيّرت جلستك. حدّث الصفحة قبل المتابعة.",
  ],
  unavailable: [
    "Unable to reach the company service. Try again.",
    "تعذّر الوصول إلى خدمة الشركات. حاول مجددًا.",
  ],
};
export const companyStatuses: Record<string, [string, string]> = {
  ACTIVE: ["Active", "نشطة"],
  PENDING: ["Pending approval", "بانتظار الموافقة"],
  REJECTED: ["Rejected", "مرفوضة"],
  SUSPENDED: ["Suspended", "موقوفة"],
};
export const companyEvents: Record<string, [string, string]> = {
  COMPANY_REGISTRATION_REQUESTED: ["Company registered", "تسجيل الشركة"],
  COMPANY_CREATED: ["Company created", "إنشاء الشركة"],
  COMPANY_APPROVED: ["Company approved", "الموافقة على الشركة"],
  COMPANY_REJECTED: ["Company rejected", "رفض الشركة"],
  COMPANY_SUSPENDED: ["Company suspended", "إيقاف الشركة"],
  COMPANY_REACTIVATED: ["Company reactivated", "إعادة تفعيل الشركة"],
  COMPANY_RESUBMITTED: ["Company resubmitted", "إعادة تقديم الشركة"],
  COMPANY_PROFILE_CHANGED: ["Company profile updated", "تعديل بيانات الشركة"],
  COMPANY_ADMIN_INVITED: [
    "Admin invitation reissued",
    "إعادة إرسال دعوة المدير",
  ],
  COMPANY_ADMIN_ACTIVATED: ["Primary admin activated", "تفعيل المدير الأساسي"],
};
