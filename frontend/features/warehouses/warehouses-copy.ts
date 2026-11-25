// Warehouse vocabulary extends the existing shared locale provider.
export const warehousesEnglish = {
  Warehouses: "Warehouses",
  "Find, add, and manage your company's warehouses.":
    "Find, add, and manage your company's warehouses.",
  "Add warehouse": "Add warehouse",
  "Edit warehouse": "Edit warehouse",
  "Warehouse name": "Warehouse name",
  "Use 2 to 120 characters.": "Use 2 to 120 characters.",
  "Use 5 to 300 characters.": "Use 5 to 300 characters.",
  "Warehouses are the company locations where parcels are received and stored.":
    "Warehouses are the company locations where parcels are received and stored.",
  "Search warehouses": "Search warehouses",
  "Search by name or address": "Search by name or address",
  "Warehouse status": "Warehouse status",
  Archived: "Archived",
  "Loading warehouses...": "Loading warehouses...",
  "No warehouses yet.": "No warehouses yet.",
  "No archived warehouses.": "No archived warehouses.",
  "Archived warehouses appear here and can be restored at any time.":
    "Archived warehouses appear here and can be restored at any time.",
  "Add your first warehouse to start receiving parcels at your locations.":
    "Add your first warehouse to start receiving parcels at your locations.",
  "No warehouses match your search.": "No warehouses match your search.",
  "Try a different name or address.": "Try a different name or address.",
  "No warehouses on this page.": "No warehouses on this page.",
  "There are no warehouses to display on this page.":
    "There are no warehouses to display on this page.",
  "Warehouse pagination": "Warehouse pagination",
  Edit: "Edit",
  Archive: "Archive",
  Restore: "Restore",
  "Edit {name}": "Edit {name}",
  "Archive {name}": "Archive {name}",
  "Restore {name}": "Restore {name}",
  "Archiving...": "Archiving...",
  "Restoring...": "Restoring...",
  "Confirm archive": "Confirm archive",
  "Keep warehouse": "Keep warehouse",
  "Archive {name}? It stays in your history but cannot be used for new pickup requests.":
    "Archive {name}? It stays in your history but cannot be used for new pickup requests.",
  "Check the warehouse name and address, then try again.":
    "Check the warehouse name and address, then try again.",
  "This warehouse is no longer available. Refresh the list.":
    "This warehouse is no longer available. Refresh the list.",
  "Warehouses could not be saved right now. Please try again.":
    "Warehouses could not be saved right now. Please try again.",
  "This warehouse has open pickup requests. Complete or cancel them before archiving.":
    "This warehouse has open pickup requests. Complete or cancel them before archiving.",
  "This warehouse was archived. Restore it before editing.":
    "This warehouse was archived. Restore it before editing.",
  "We couldn’t load warehouses. Please try again.":
    "We couldn’t load warehouses. Please try again.",
} as const;

export const warehousesArabic: Record<keyof typeof warehousesEnglish, string> = {
  Warehouses: "المستودعات",
  "Find, add, and manage your company's warehouses.":
    "ابحث عن مستودعات شركتك وأضفها وأدرها.",
  "Add warehouse": "إضافة مستودع",
  "Edit warehouse": "تعديل المستودع",
  "Warehouse name": "اسم المستودع",
  "Use 2 to 120 characters.": "استخدم من 2 إلى 120 حرفًا.",
  "Use 5 to 300 characters.": "استخدم من 5 إلى 300 حرف.",
  "Warehouses are the company locations where parcels are received and stored.":
    "المستودعات هي مواقع الشركة التي تُستلم فيها الطرود وتُخزَّن.",
  "Search warehouses": "البحث في المستودعات",
  "Search by name or address": "ابحث بالاسم أو العنوان",
  "Warehouse status": "حالة المستودع",
  Archived: "مؤرشف",
  "Loading warehouses...": "جارٍ تحميل المستودعات...",
  "No warehouses yet.": "لا توجد مستودعات بعد.",
  "No archived warehouses.": "لا توجد مستودعات مؤرشفة.",
  "Archived warehouses appear here and can be restored at any time.":
    "تظهر المستودعات المؤرشفة هنا ويمكن استعادتها في أي وقت.",
  "Add your first warehouse to start receiving parcels at your locations.":
    "أضف أول مستودع لتبدأ باستلام الطرود في مواقعك.",
  "No warehouses match your search.": "لا توجد مستودعات تطابق بحثك.",
  "Try a different name or address.": "جرّب اسمًا أو عنوانًا مختلفًا.",
  "No warehouses on this page.": "لا توجد مستودعات في هذه الصفحة.",
  "There are no warehouses to display on this page.":
    "لا توجد مستودعات لعرضها في هذه الصفحة.",
  "Warehouse pagination": "تصفح صفحات المستودعات",
  Edit: "تعديل",
  Archive: "أرشفة",
  Restore: "استعادة",
  "Edit {name}": "تعديل {name}",
  "Archive {name}": "أرشفة {name}",
  "Restore {name}": "استعادة {name}",
  "Archiving...": "جارٍ الأرشفة...",
  "Restoring...": "جارٍ الاستعادة...",
  "Confirm archive": "تأكيد الأرشفة",
  "Keep warehouse": "الإبقاء على المستودع",
  "Archive {name}? It stays in your history but cannot be used for new pickup requests.":
    "أرشفة {name}؟ سيبقى في السجل لكن لا يمكن استخدامه في طلبات استلام جديدة.",
  "Check the warehouse name and address, then try again.":
    "تحقق من اسم المستودع وعنوانه ثم حاول مجددًا.",
  "This warehouse is no longer available. Refresh the list.":
    "لم يعد هذا المستودع متاحًا. حدّث القائمة.",
  "Warehouses could not be saved right now. Please try again.":
    "تعذّر حفظ المستودع حاليًا. يرجى المحاولة مجددًا.",
  "This warehouse has open pickup requests. Complete or cancel them before archiving.":
    "لدى هذا المستودع طلبات استلام مفتوحة. أكملها أو ألغها قبل الأرشفة.",
  "This warehouse was archived. Restore it before editing.":
    "تمت أرشفة هذا المستودع. استعده قبل التعديل.",
  "We couldn’t load warehouses. Please try again.":
    "تعذّر تحميل المستودعات. يرجى المحاولة مجددًا.",
};
