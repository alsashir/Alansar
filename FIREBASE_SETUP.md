# إعداد Cloudinary وFirestore

ترفع الصفحة الصوتيات والصور مباشرة من المتصفح إلى Cloudinary باستخدام `Unsigned upload preset`، ثم تحفظ قيمة `secure_url` وبيانات الملف في مستند المكتبة على Firestore. لا تحتاج Firebase Cloud Functions أو API Secret.

1. في Cloudinary استخدم `Cloud name` بقيمة `kqhoezjm`، واضبط preset `my_project` على `Unsigned`. اسمح بالصيغ الصوتية والصورية المطلوبة وحدد حدًا لحجم الملف؛ كل من يعرف اسم الحساب والـpreset يستطيع محاولة رفع ملفات وفق هذه الإعدادات.
2. في Firebase فعّل Firestore وAuthentication بالبريد وكلمة المرور. حساب المشرف يجب أن يطابق UID الموجود في `site.js` و`firestore.rules`.
3. انشر قواعد Firestore والواجهة الثابتة:

```powershell
firebase login
firebase deploy --only firestore:rules,hosting --project alansari-a8524
```

4. افتح `https://alansari-a8524.web.app`. للمصادقة أثناء التطوير المحلي، أضف `localhost` و`127.0.0.1` إلى Authorized domains في Firebase Authentication.

قواعد Firestore تسمح بالقراءة العامة وتقيّد كتابة المكتبة بحساب المشرف. حفظ المكتبة حاليًا في مستند واحد؛ حد Firestore للمستند 1 MiB. رفع أو استبدال ملف في Cloudinary يعيد `secure_url`، ويحفظ الرابط في بيانات الصوت أو الموضوع. يتطلب نشر قواعد Firestore إنشاء قاعدة بيانات Firestore في المشروع أولًا.

الرفع المباشر بنمط Unsigned لا يستخدم سرًا، لكنه يجعل preset نقطة رفع عامة؛ قيود أنواع الملفات والحجم في إعداد preset مهمة. حذف سجل من المكتبة لا يحذف الملف الأصلي من Cloudinary لأن ذلك يتطلب API Secret على خادم، وليس في المتصفح.
