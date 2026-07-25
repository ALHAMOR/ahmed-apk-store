# تطبيقات أحمد — GitHub Pages + Releases

هذه النسخة مضبوطة على:

- الحساب: `ALHAMOR`
- المستودع: `ahmed-apk-store`
- الفرع: `main`

## الملفات

- `index.html`: الصفحة العامة.
- `admin.html`: لوحة رفع APK.
- `public.js`: يجلب التطبيقات تلقائيًا من GitHub Releases.
- `admin.js`: ينشئ Release ويرفع APK عبر GitHub API.
- `config.js`: إعدادات الحساب والمستودع.
- `styles.css`: التصميم.
- `.nojekyll`: يمنع معالجة Jekyll غير المطلوبة.

## الأمان

لا تكتب مفتاح GitHub داخل `config.js` أو أي ملف في المستودع.
أدخل المفتاح يدويًا داخل صفحة `admin.html`.
لوحة الرفع عامة من ناحية الرابط، لكنها لا تستطيع الرفع أو الحذف دون مفتاح يملك صلاحية المستودع.

## صلاحية المفتاح المطلوبة

Fine-grained personal access token:
- Repository access: Only select repositories
- اختر: `ahmed-apk-store`
- Repository permissions → Contents: Read and write

## النشر

من إعدادات المستودع:
Settings → Pages → Deploy from a branch → main → /(root) → Save
