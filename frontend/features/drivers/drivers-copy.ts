// Driver record vocabulary extends the existing shared locale provider.
export const driversEnglish = {
  "Add driver": "Add driver",
  "Edit driver": "Edit driver",
  "Edit details": "Edit details",
  "Full name": "Full name",
  "Phone number": "Phone number",
  "Driver records hold contact details only. Driver app sign-in is set up separately.":
    "Driver records hold contact details only. Driver app sign-in is set up separately.",
  "Use 2 to 150 characters.": "Use 2 to 150 characters.",
  "Use digits, spaces, dashes, or parentheses, with an optional leading +.":
    "Use digits, spaces, dashes, or parentheses, with an optional leading +.",
  "Suspend driver": "Suspend driver",
  "Reactivate driver": "Reactivate driver",
  "Suspending...": "Suspending...",
  "Reactivating...": "Reactivating...",
  "Suspended drivers cannot receive new parcel assignments.":
    "Suspended drivers cannot receive new parcel assignments.",
  "Reactivated drivers return as offline until they start work.":
    "Reactivated drivers return as offline until they start work.",
  "Suspend {name}? They will not receive new parcel assignments until reactivated.":
    "Suspend {name}? They will not receive new parcel assignments until reactivated.",
  "Confirm suspension": "Confirm suspension",
  "Keep active": "Keep active",
  "Check the driver name and phone number, then try again.":
    "Check the driver name and phone number, then try again.",
  "This driver is no longer available. Refresh the list.":
    "This driver is no longer available. Refresh the list.",
  "Drivers could not be saved right now. Please try again.":
    "Drivers could not be saved right now. Please try again.",
  "We could not confirm whether the change was saved. Refresh to check before trying again.":
    "We could not confirm whether the change was saved. Refresh to check before trying again.",
  "Find, add, and manage the delivery drivers in your company.":
    "Find, add, and manage the delivery drivers in your company.",
  "Add your first driver to start assigning vehicles and parcels.":
    "Add your first driver to start assigning vehicles and parcels.",
} as const;

export const driversArabic: Record<keyof typeof driversEnglish, string> = {
  "Add driver": "إضافة سائق",
  "Edit driver": "تعديل السائق",
  "Edit details": "تعديل البيانات",
  "Full name": "الاسم الكامل",
  "Phone number": "رقم الهاتف",
  "Driver records hold contact details only. Driver app sign-in is set up separately.":
    "يحتوي سجل السائق على بيانات التواصل فقط. يُعدّ تسجيل الدخول لتطبيق السائق بشكل منفصل.",
  "Use 2 to 150 characters.": "استخدم من 2 إلى 150 حرفًا.",
  "Use digits, spaces, dashes, or parentheses, with an optional leading +.":
    "استخدم أرقامًا أو مسافات أو شرطات أو أقواسًا، مع علامة + اختيارية في البداية.",
  "Suspend driver": "إيقاف السائق",
  "Reactivate driver": "إعادة تفعيل السائق",
  "Suspending...": "جارٍ الإيقاف...",
  "Reactivating...": "جارٍ إعادة التفعيل...",
  "Suspended drivers cannot receive new parcel assignments.":
    "لا يمكن إسناد طرود جديدة إلى السائقين الموقوفين.",
  "Reactivated drivers return as offline until they start work.":
    "يعود السائق بعد إعادة التفعيل بحالة غير متصل حتى يبدأ العمل.",
  "Suspend {name}? They will not receive new parcel assignments until reactivated.":
    "إيقاف {name}؟ لن تُسند إليه طرود جديدة حتى تتم إعادة تفعيله.",
  "Confirm suspension": "تأكيد الإيقاف",
  "Keep active": "الإبقاء نشطًا",
  "Check the driver name and phone number, then try again.":
    "تحقق من اسم السائق ورقم الهاتف ثم حاول مجددًا.",
  "This driver is no longer available. Refresh the list.":
    "لم يعد هذا السائق متاحًا. حدّث القائمة.",
  "Drivers could not be saved right now. Please try again.":
    "تعذّر حفظ السائق حاليًا. يرجى المحاولة مجددًا.",
  "We could not confirm whether the change was saved. Refresh to check before trying again.":
    "تعذّر التأكد من حفظ التغيير. حدّث الصفحة للتحقق قبل المحاولة مجددًا.",
  "Find, add, and manage the delivery drivers in your company.":
    "ابحث عن سائقي التوصيل في شركتك وأضفهم وأدرهم.",
  "Add your first driver to start assigning vehicles and parcels.":
    "أضف أول سائق لتبدأ بإسناد المركبات والطرود.",
};
