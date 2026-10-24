const fs = require("node:fs");
const path = require("node:path");
const translations = {
  appName: ["Fleetora Merchant", "فليتورا للتاجر"],
  home: ["Overview", "الرئيسية"],
  parcels: ["Parcels", "الطرود"],
  pickups: ["Pickup requests", "طلبات الاستلام"],
  account: ["Account", "الحساب"],
  login: ["Sign in", "تسجيل الدخول"],
  email: ["Email", "البريد الإلكتروني"],
  password: ["Password", "كلمة المرور"],
  name: ["Full name", "الاسم الكامل"],
  activate: ["Activate account", "تفعيل الحساب"],
  activationToken: ["Invitation code", "رمز الدعوة"],
  activationHelp: [
    "Use the secure invitation supplied by your delivery company.",
    "استخدم الدعوة الآمنة التي زودتك بها شركة التوصيل.",
  ],
  activated: [
    "Account activated. Sign in with your email and password.",
    "تم تفعيل الحساب. سجّل الدخول ببريدك وكلمة مرورك.",
  ],
  loginHelp: [
    "Manage your deliveries with your company.",
    "أدر عمليات التوصيل مع شركتك.",
  ],
  logout: ["Sign out", "تسجيل الخروج"],
  language: ["العربية", "English"],
  loading: ["Loading…", "جارٍ التحميل…"],
  retry: ["Try again", "إعادة المحاولة"],
  back: ["Back", "رجوع"],
  confirm: ["Confirm", "تأكيد"],
  save: ["Save", "حفظ"],
  saved: ["Saved successfully", "تم الحفظ بنجاح"],
  empty: ["No records yet", "لا توجد سجلات بعد"],
  previous: ["Previous", "السابق"],
  next: ["Next", "التالي"],
  search: ["Search", "بحث"],
  required: ["This field is required", "هذا الحقل مطلوب"],
  invalidEmail: [
    "Enter a valid email address",
    "أدخل بريدًا إلكترونيًا صالحًا",
  ],
  invalidPassword: ["Use at least 8 characters", "استخدم 8 أحرف على الأقل"],
  newParcel: ["Create parcel", "إنشاء طرد"],
  imports: ["Bulk import", "الاستيراد الجماعي"],
  newPickup: ["Request pickup", "طلب استلام"],
  finances: ["Statement", "كشف الحساب"],
  settlements: ["Settlement requests", "طلبات التسوية"],
  employees: ["Merchant team", "فريق التاجر"],
  activity: ["Activity history", "سجل النشاط"],
  profile: ["Merchant profile", "ملف التاجر"],
  permissionDenied: [
    "You do not have permission to view this page.",
    "ليس لديك صلاحية لعرض هذه الصفحة.",
  ],
  welcome: ["Your merchant workspace", "مساحة عمل متجرك"],
  dashboardHelp: [
    "Create parcels, arrange pickups and follow deliveries.",
    "أنشئ الطرود ونسّق الاستلام وتابع التوصيل.",
  ],
  recentParcels: ["Recent parcels", "أحدث الطرود"],
  viewAll: ["View all", "عرض الكل"],
  view: ["View", "عرض"],
  sessionExpired: [
    "Your session expired. Sign in again.",
    "انتهت الجلسة. سجّل الدخول مجددًا.",
  ],
  logoutWarning: [
    "Sign out of this device?",
    "هل تريد تسجيل الخروج من هذا الجهاز؟",
  ],
  configuration: [
    "API_BASE_URL must point to your Fleetora backend. Use HTTPS for release builds.",
    "يجب إعداد API_BASE_URL لعنوان خادم فليتورا. يلزم HTTPS في نسخة الإصدار.",
  ],
  unavailable: ["Not available", "غير متاح"],
  error_network: [
    "Cannot connect. Check your connection and try again. For an uncertain write, check the list before submitting again.",
    "تعذّر الاتصال. تحقق من الشبكة وأعد المحاولة. عند غموض نتيجة الحفظ، راجع القائمة قبل الإرسال مجددًا.",
  ],
  error_unauthorized: [
    "Your session expired. Sign in again.",
    "انتهت الجلسة. سجّل الدخول مجددًا.",
  ],
  error_forbidden: [
    "You do not have permission for this action.",
    "ليس لديك صلاحية لهذا الإجراء.",
  ],
  error_notFound: [
    "This record is no longer available.",
    "هذا السجل لم يعد متاحًا.",
  ],
  error_conflict: [
    "The record or price changed. Refresh before continuing.",
    "تغيّر السجل أو السعر. حدّث البيانات قبل المتابعة.",
  ],
  error_validation: [
    "Check the entered values and invitation validity.",
    "تحقق من القيم المدخلة وصلاحية الدعوة.",
  ],
  error_server: [
    "The service is temporarily unavailable. Please try later.",
    "الخدمة غير متاحة مؤقتًا. حاول لاحقًا.",
  ],
  error_invalidResponse: [
    "Could not read the server response. Refresh or contact your company.",
    "تعذّر قراءة استجابة الخادم. حدّث البيانات أو تواصل مع شركتك.",
  ],
  error_sessionChanged: [
    "The signed-in account changed. Reload this page.",
    "تغيّر الحساب المسجّل. أعد فتح الصفحة.",
  ],
};
const status = {
  CREATED: ["Created — awaiting receipt", "أُنشئ — بانتظار الاستلام"],
  READY_FOR_PICKUP: ["Ready for pickup", "جاهز للاستلام"],
  PICKUP_ASSIGNED: ["Pickup assigned", "عُيّن للاستلام"],
  PICKED_UP: ["Picked up", "تم الاستلام"],
  AT_WAREHOUSE: ["At warehouse", "في المستودع"],
  ASSIGNED: ["Assigned", "مُعيّن"],
  OUT_FOR_DELIVERY: ["Out for delivery", "قيد التوصيل"],
  DELIVERED: ["Delivered", "تم التسليم"],
  DELIVERY_FAILED: ["Delivery failed", "تعذّر التسليم"],
  RETURN_REQUESTED: ["Return requested", "طُلب الإرجاع"],
  RETURN_IN_TRANSIT: ["Return in transit", "المرتجع في الطريق"],
  RETURNED: ["Returned", "تم الإرجاع"],
  CANCELLED: ["Cancelled", "ملغي"],
  REQUESTED: ["Requested", "مطلوب"],
  PROPOSED: ["Proposed time", "موعد مقترح"],
  CONFIRMED: ["Confirmed", "مؤكد"],
  RECEIVED: ["Received", "مستلم"],
  REVIEWED: ["Reviewed — not proof of payment", "مراجع — لا يثبت الدفع"],
  APPROVED: ["Approved", "موافق عليه"],
  REJECTED: ["Rejected", "مرفوض"],
  ACTIVE: ["Active", "نشط"],
  REVOKED: ["Revoked", "ملغى الصلاحية"],
  PENDING: ["Pending", "معلّق"],
  MISSING: ["Missing", "ناقص"],
  DISCREPANT: ["Discrepancy reported", "اختلاف مُسجّل"],
  MERCHANT: ["With merchant", "لدى التاجر"],
  DRIVER: ["With driver", "لدى السائق"],
  WAREHOUSE: ["At warehouse", "في المستودع"],
  CUSTOMER: ["With recipient", "لدى المستلم"],
  COMPANY_PICKUP: ["Company pickup", "استلام الشركة"],
  WAREHOUSE_DROPOFF: ["Warehouse drop-off", "تسليم للمستودع"],
  COD: ["Cash on delivery", "الدفع عند الاستلام"],
  PREPAID: ["No customer collection", "دون تحصيل من المستلم"],
};
for (const [key, pair] of Object.entries(status))
  translations["status_" + key] = pair;
const root = path.resolve(__dirname, "..");
function visit(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, ent.name);
    if (ent.isDirectory()) visit(file);
    else if (ent.name === "translations.json") {
      const extra = JSON.parse(fs.readFileSync(file, "utf8"));
      for (const [k, v] of Object.entries(extra)) {
        const pair = [v.en, v.ar];
        translations[k] = pair;
      }
    }
  }
}
visit(path.join(root, "lib/features"));
const quote = (s) =>
  s.replaceAll("'", "''").replaceAll("{", "'{' ").replaceAll("}", " '}'");
for (const [i, locale] of ["en", "ar"].entries()) {
  const arb = {
    "@@locale": locale,
    text: `{key, select, ${Object.entries(translations)
      .map(([k, v]) => `${k}{${quote(v[i])}}`)
      .join(" ")} other{${locale === "ar" ? "غير متاح" : "Not available"}}}`,
    "@text": {
      description: "Localized operational copy and server status labels.",
      placeholders: { key: { type: "String" } },
    },
  };
  fs.mkdirSync(path.join(root, "lib/l10n"), { recursive: true });
  fs.writeFileSync(
    path.join(root, `lib/l10n/app_${locale}.arb`),
    JSON.stringify(arb, null, 2) + "\n",
  );
}
