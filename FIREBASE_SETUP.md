# تفعيل المكتبة المشتركة

1. من Firebase Console للمشروع `alansari-a8524`، أنشئ قاعدة Firestore وفعّل Firebase Storage.
2. فعّل تسجيل الدخول بالبريد وكلمة المرور في Authentication. يجب أن يكون حساب المشرف هو الحساب ذو UID المحدد في `site.js` وملفي القواعد.
3. ثبّت Firebase CLI وسجّل الدخول به، ثم من مجلد المشروع انشر القواعد:

```powershell
firebase login
firebase deploy --project alansari-a8524 --only firestore:rules,storage
```

4. للسماح بتنزيل الصوت من المتصفح، ثبّت Google Cloud CLI وسجّل الدخول إلى المشروع، ثم طبّق إعداد CORS:

```powershell
gcloud storage buckets update gs://alansari-a8524.firebasestorage.app --cors-file=storage-cors.json
```

تسمح القواعد للجميع بقراءة المكتبة والاستماع للصوت، وتقصر الإضافة والتعديل والحذف على حساب المشرف. الحد الأقصى لملف الصوت 100 ميجابايت. بعد نشر نسخة الصفحة التي تتضمن التغييرات، تتم مزامنة القوائم والمجلدات تلقائيًا، ويمكن الاستماع للصوت أو تنزيله.
