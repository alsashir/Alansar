(() => {
  'use strict';

  const STORAGE_KEY = 'ansari-library-v1';
  const DATABASE_NAME = 'ansari-library-audio';
  const DATABASE_STORE = 'audio-files';
  const initialCategories = [
    { id: 'quran', name: 'القرآن الكريم', type: 'quran' },
    { id: 'nasheed', name: 'الأناشيد', type: 'nasheed' }
  ];
  const $ = (selector, root = document) => root.querySelector(selector);
  const byId = id => document.getElementById(id);
  const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  function readState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.categories) && Array.isArray(saved.tracks) && Array.isArray(saved.folders)) {
        return saved;
      }
    } catch (error) {
      console.warn('تعذر قراءة بيانات المكتبة المحفوظة.', error);
    }
    return { categories: initialCategories, tracks: [], folders: [] };
  }

  const state = readState();
  if (!state.categories.length) state.categories = initialCategories;
  let activeCategoryId = null;
  let activeFolderId = null;
  let visibleTracks = [];
  let currentTrackId = null;
  let isAdmin = false;
  let firebaseAuth = null;
  let authStateReady = false;
  let accountMode = 'login';
  let returnToAdminAfterLogin = false;
  let databasePromise;
  let toastTimer;
  const objectUrls = new Map();

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      showToast('تعذر حفظ البيانات في هذا المتصفح.');
      console.error(error);
    }
  }

  function showToast(message) {
    const toast = byId('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
  }

  function openDialog(id) {
    const dialog = byId(id);
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function closeDialog(id) {
    const dialog = byId(id);
    if (dialog?.open && typeof dialog.close === 'function') dialog.close();
    else dialog?.removeAttribute('open');
  }

  function categoryById(id) {
    return state.categories.find(category => category.id === id);
  }

  function folderById(id) {
    return state.folders.find(folder => folder.id === id);
  }

  function createIcon(symbol) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#${symbol}`);
    svg.append(use);
    return svg;
  }

  function renderCategories() {
    const grid = byId('categoryGrid');
    const menu = byId('menuCategories');
    if (!grid || !menu) return;
    grid.replaceChildren();
    menu.replaceChildren();

    for (const category of state.categories) {
      const tracks = state.tracks.filter(track => track.categoryId === category.id);
      const card = document.createElement('article');
      card.className = 'category-card';
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'category-open';
      const icon = document.createElement('span');
      icon.className = 'category-icon';
      icon.append(createIcon('book'));
      const label = document.createElement('span');
      label.className = 'category-label';
      label.append(document.createTextNode(category.name));
      const count = document.createElement('small');
      count.className = 'category-count';
      count.textContent = `${tracks.length} صوت`;
      label.append(count);
      open.append(icon, label);
      open.addEventListener('click', () => openCategory(category.id));
      card.append(open);
      if (isAdmin && !['quran', 'nasheed'].includes(category.id)) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'row-action';
        remove.setAttribute('aria-label', `حذف ${category.name}`);
        remove.textContent = '×';
        remove.addEventListener('click', () => deleteCategory(category.id));
        card.append(remove);
      }
      grid.append(card);

      const menuButton = document.createElement('button');
      menuButton.type = 'button';
      menuButton.className = 'menu-link';
      menuButton.textContent = `${category.name} (${tracks.length})`;
      menuButton.addEventListener('click', () => {
        openCategory(category.id);
        closeDialog('menuDialog');
      });
      menu.append(menuButton);
    }

    const addButton = byId('addButton');
    if (addButton) addButton.hidden = !isAdmin;
    const adminPanelButton = byId('menuAdminPanel');
    if (adminPanelButton) adminPanelButton.hidden = !isAdmin;
    renderAdminCategories();
  }

  function renderAdminCategories() {
    const list = byId('adminCategoryList');
    if (!list) return;
    list.replaceChildren();
    for (const category of state.categories) {
      const item = document.createElement('div');
      item.className = 'admin-category-item';
      const label = document.createElement('strong');
      label.textContent = category.name;
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'folder-action';
      edit.textContent = 'تعديل';
      edit.addEventListener('click', () => editCategory(category));
      item.append(label, edit);
      list.append(item);
    }
  }

  function openCategory(id) {
    if (!categoryById(id)) return;
    activeCategoryId = id;
    activeFolderId = null;
    byId('homeView').hidden = true;
    byId('categoryView').hidden = false;
    byId('categoryTitle').textContent = categoryById(id).name;
    byId('categorySubtitle').textContent = 'قائمة الصوتيات';
    renderCategoryContents();
  }

  function goHome() {
    activeCategoryId = null;
    activeFolderId = null;
    byId('homeView').hidden = false;
    byId('categoryView').hidden = true;
    renderCategories();
  }

  function renderCategoryContents() {
    const category = categoryById(activeCategoryId);
    const folderGrid = byId('folderGrid');
    const trackList = byId('categoryTracks');
    if (!category || !folderGrid || !trackList) return;
    byId('categoryTitle').textContent = category.name;
    const folders = state.folders.filter(folder => folder.categoryId === category.id);
    folderGrid.replaceChildren();
    folderGrid.hidden = folders.length === 0;
    for (const folder of folders) {
      const card = document.createElement('div');
      card.className = 'folder-card';
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'folder-open';
      open.textContent = folder.name;
      const small = document.createElement('small');
      small.textContent = `${state.tracks.filter(track => track.folderId === folder.id).length} صوت`;
      open.append(small);
      open.addEventListener('click', () => {
        activeFolderId = folder.id;
        byId('categorySubtitle').textContent = folder.name;
        byId('clearFolderButton').hidden = false;
        renderCategoryContents();
      });
      card.append(open);
      if (isAdmin) {
        const rename = document.createElement('button');
        rename.type = 'button';
        rename.className = 'folder-action';
        rename.textContent = 'تعديل';
        rename.addEventListener('click', () => editFolder(folder));
        card.append(rename);
      }
      folderGrid.append(card);
    }

    byId('addFolderButton').hidden = !isAdmin;
    byId('clearFolderButton').hidden = !activeFolderId;
    trackList.replaceChildren();
    visibleTracks = state.tracks.filter(track => track.categoryId === category.id && (!activeFolderId || track.folderId === activeFolderId));
    if (!visibleTracks.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      const title = document.createElement('strong');
      title.textContent = activeFolderId ? 'هذا المجلد فارغ' : 'لا توجد أصوات في هذه القائمة';
      const detail = document.createElement('span');
      detail.textContent = isAdmin ? 'أضف ملفًا صوتيًا من زر الإضافة.' : 'ستظهر الأصوات هنا عند إضافتها إلى المكتبة.';
      empty.append(title, detail);
      trackList.append(empty);
      return;
    }
    for (const track of visibleTracks) trackList.append(makeTrackButton(track));
  }

  function makeTrackButton(track) {
    const entry = document.createElement('div');
    entry.className = 'audio-entry';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'audio-button';
    const title = document.createElement('strong');
    title.textContent = track.title;
    const subtitle = document.createElement('small');
    const folder = folderById(track.folderId);
    subtitle.textContent = [track.reciter, folder?.name].filter(Boolean).join(' · ') || 'اضغط للتشغيل';
    button.append(title, subtitle);
    button.addEventListener('click', () => playTrack(track));
    entry.append(button);

    if (isAdmin) {
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'row-action';
      edit.setAttribute('aria-label', `تعديل ${track.title}`);
      edit.textContent = '✎';
      edit.addEventListener('click', () => openTrackForm(track));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'row-action';
      remove.setAttribute('aria-label', `حذف ${track.title}`);
      remove.textContent = '×';
      remove.addEventListener('click', () => deleteTrack(track));
      entry.append(edit, remove);
    }
    return entry;
  }

  function openTrackForm(track = null) {
    const form = byId('trackForm');
    form.reset();
    byId('editingTrackId').value = track?.id || '';
    byId('trackDialogTitle').textContent = track ? 'تعديل صوت' : 'إضافة صوت';
    const categorySelect = byId('trackCategoryInput');
    categorySelect.replaceChildren();
    for (const category of state.categories) categorySelect.add(new Option(category.name, category.id));
    const folderSelect = byId('trackFolderInput');
    folderSelect.replaceChildren(new Option('بدون مجلد', ''));
    const selectedCategoryId = track?.categoryId || activeCategoryId || state.categories[0]?.id;
    categorySelect.value = selectedCategoryId;
    updateFolderOptions(track?.folderId || '');
    categorySelect.onchange = () => updateFolderOptions('');
    if (track) {
      byId('trackTitleInput').value = track.title;
      byId('trackDescriptionInput').value = track.description || '';
      byId('trackReciterInput').value = track.reciter || '';
    }
    openDialog('trackDialog');
  }

  function updateFolderOptions(selectedId) {
    const select = byId('trackFolderInput');
    const categoryId = byId('trackCategoryInput').value;
    select.replaceChildren(new Option('بدون مجلد', ''));
    for (const folder of state.folders.filter(item => item.categoryId === categoryId)) {
      select.add(new Option(folder.name, folder.id));
    }
    select.value = selectedId;
  }

  async function playTrack(track) {
    const audio = byId('audio');
    if (!track.audioId) {
      showToast('هذا العنصر لا يحتوي على ملف صوتي.');
      return;
    }
    try {
      const blob = await getAudio(track.audioId);
      if (!blob) throw new Error('ملف الصوت غير موجود');
      let url = objectUrls.get(track.audioId);
      if (!url) {
        url = URL.createObjectURL(blob);
        objectUrls.set(track.audioId, url);
      }
      currentTrackId = track.id;
      audio.src = url;
      byId('playerTitle').textContent = track.title;
      byId('playerReciter').textContent = track.reciter || categoryById(track.categoryId)?.name || 'مكتبة الأنصاري';
      byId('player').hidden = false;
      await audio.play();
      updatePlaybackButton();
    } catch (error) {
      console.error(error);
      showToast('تعذر تشغيل الملف الصوتي.');
    }
  }

  function updatePlaybackButton() {
    const playing = !byId('audio').paused;
    const button = byId('togglePlayback');
    button.setAttribute('aria-label', playing ? 'إيقاف مؤقت' : 'تشغيل');
    button.replaceChildren(createIcon(playing ? 'pause' : 'play'));
  }

  function formatTime(value) {
    if (!Number.isFinite(value)) return '0:00';
    const minutes = Math.floor(value / 60);
    const seconds = Math.floor(value % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  function updateTimeline() {
    const audio = byId('audio');
    const seek = byId('seekBar');
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    seek.max = String(duration);
    seek.value = String(audio.currentTime || 0);
    seek.disabled = !duration;
    seek.style.setProperty('--progress', duration ? `${audio.currentTime / duration * 100}%` : '0%');
    byId('elapsedTime').textContent = formatTime(audio.currentTime);
    byId('durationTime').textContent = formatTime(duration);
    seek.setAttribute('aria-valuetext', `${formatTime(audio.currentTime)} من ${formatTime(duration)}`);
  }

  function changeTrack(direction) {
    if (!visibleTracks.length) return;
    const currentIndex = visibleTracks.findIndex(track => track.id === currentTrackId);
    const shuffleEnabled = byId('shuffleButton').classList.contains('active');
    let nextIndex = currentIndex < 0 ? 0 : (currentIndex + direction + visibleTracks.length) % visibleTracks.length;
    if (shuffleEnabled && visibleTracks.length > 1) {
      do {
        nextIndex = Math.floor(Math.random() * visibleTracks.length);
      } while (nextIndex === currentIndex);
    }
    playTrack(visibleTracks[nextIndex]);
  }

  function populateFolderCategory(select, selectedId) {
    select.replaceChildren();
    for (const category of state.categories) select.add(new Option(category.name, category.id));
    if (selectedId) select.value = selectedId;
  }

  function editCategory(category) {
    byId('editingCategoryId').value = category.id;
    byId('categoryNameInput').value = category.name;
    byId('categoryDialogTitle').textContent = 'تعديل قائمة';
    openDialog('categoryDialog');
  }

  function deleteCategory(id) {
    const category = categoryById(id);
    if (!category || !confirm(`حذف قائمة «${category.name}» وكل محتوياتها من هذا المتصفح؟`)) return;
    const deletedTracks = state.tracks.filter(track => track.categoryId === id);
    deletedTracks.forEach(track => deleteAudio(track.audioId));
    state.tracks = state.tracks.filter(track => track.categoryId !== id);
    state.folders = state.folders.filter(folder => folder.categoryId !== id);
    state.categories = state.categories.filter(item => item.id !== id);
    saveState();
    renderCategories();
    if (activeCategoryId === id) goHome();
  }

  function deleteTrack(track) {
    if (!confirm(`حذف «${track.title}» من هذا المتصفح؟`)) return;
    deleteAudio(track.audioId);
    state.tracks = state.tracks.filter(item => item.id !== track.id);
    saveState();
    renderCategories();
    if (activeCategoryId) renderCategoryContents();
  }

  function editFolder(folder) {
    byId('editingFolderId').value = folder.id;
    byId('folderNameInput').value = folder.name;
    populateFolderCategory(byId('folderCategoryInput'), folder.categoryId);
    byId('folderDialogTitle').textContent = 'تعديل مجلد';
    openDialog('folderDialog');
  }

  function openAdmin() {
    const panel = byId('adminPanel');
    const notice = byId('adminSignInNotice');
    const message = notice.querySelector('.form-note');
    if (firebaseAuth && !authStateReady) {
      notice.hidden = false;
      panel.hidden = true;
      message.textContent = 'جارٍ التحقق من حالة تسجيل الدخول...';
      openDialog('adminDialog');
      return;
    }
    if (firebaseAuth && !firebaseAuth.currentUser) {
      returnToAdminAfterLogin = true;
      document.querySelector('[data-mode="login"]').click();
      closeDialog('adminDialog');
      openAccount();
      return;
    }
    notice.hidden = isAdmin;
    panel.hidden = !isAdmin;
    if (!isAdmin) {
      const user = firebaseAuth?.currentUser;
      if (!firebaseAuth) message.textContent = 'تعذر تهيئة Firebase Authentication. تحقق من تحميل إعدادات Firebase والاتصال بالإنترنت.';
      else if (user) message.textContent = `الحساب مسجل، لكن UID الحالي هو ${user.uid} ولا يطابق UID المشرف المحدد.`;
      else message.textContent = 'سجّل الدخول بحساب Firebase المرتبط بمعرّف المشرف لفتح خيارات الإدارة.';
      byId('adminAccountButton').textContent = user ? 'عرض حساب المستخدم' : 'فتح حساب المستخدم';
    }
    openDialog('adminDialog');
  }

  function openAccount() {
    byId('accountError').hidden = true;
    openDialog('accountDialog');
  }

  function initializeFirebaseAuth() {
    const config = window.FIREBASE_CONFIG;
    const requiredConfig = ['apiKey', 'authDomain', 'projectId', 'appId'];
    if (!window.firebase || !config || requiredConfig.some(key => !config[key] || config[key].startsWith('YOUR_'))) return false;
    try {
      const app = window.firebase.apps.length ? window.firebase.app() : window.firebase.initializeApp(config);
      firebaseAuth = app.auth();
      firebaseAuth.onAuthStateChanged(user => {
        authStateReady = true;
        updateAccountUI(user);
      });
      return true;
    } catch (error) {
      console.error('تعذر تهيئة Firebase Authentication.', error);
      return false;
    }
  }

  function updateAccountUI(user) {
    const signedIn = Boolean(user);
    isAdmin = signedIn && user.uid === 'R789lzCBCeWDStMjQNYRSOkgaJP2';
    byId('accountForm').hidden = signedIn;
    byId('accountModes').hidden = signedIn;
    byId('userLogoutButton').hidden = !signedIn;
    const status = byId('userStatus');
    status.hidden = !signedIn;
    byId('accountInfoUsername').textContent = signedIn ? (user.displayName || 'غير محدد') : '';
    byId('accountInfoEmail').textContent = signedIn ? (user.email || '') : '';
    byId('accountEntry').textContent = signedIn ? (user.displayName || 'حسابي') : 'حسابي';
    byId('accountDialogTitle').textContent = signedIn ? 'حساب المستخدم' : (accountMode === 'register' ? 'إنشاء حساب' : 'حساب المستخدم');
    if (byId('adminDialog').open) openAdmin();
    renderCategories();
  }

  function firebaseAuthError(error) {
    const messages = {
      'auth/email-already-in-use': 'هذا البريد مسجل مسبقًا. سجّل الدخول بدلًا من إنشاء حساب جديد.',
      'auth/invalid-email': 'صيغة البريد الإلكتروني غير صحيحة.',
      'auth/invalid-credential': 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
      'auth/user-not-found': 'لا يوجد حساب بهذا البريد الإلكتروني.',
      'auth/wrong-password': 'كلمة المرور غير صحيحة.',
      'auth/weak-password': 'اختر كلمة مرور أقوى من 8 أحرف على الأقل.',
      'auth/too-many-requests': 'محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.',
      'auth/network-request-failed': 'تعذر الاتصال. تحقق من الإنترنت وحاول مجددًا.',
      'auth/operation-not-allowed': 'فعّل تسجيل البريد وكلمة المرور من إعدادات Firebase Authentication.'
    };
    return messages[error.code] || 'تعذر إكمال العملية. تحقق من إعداد Firebase ثم حاول مجددًا.';
  }

  function initialize() {
    initializeFirebaseAuth();
    const date = byId('todayDate');
    if (date) date.textContent = new Intl.DateTimeFormat('ar', { dateStyle: 'full' }).format(new Date());

    renderCategories();
    byId('menuToggle').addEventListener('click', () => openDialog('menuDialog'));
    byId('accountEntry').addEventListener('click', openAccount);
    byId('menuHome').addEventListener('click', () => { goHome(); closeDialog('menuDialog'); });
    byId('backButton').addEventListener('click', goHome);
    byId('addButton').addEventListener('click', () => openTrackForm());
    byId('addFolderButton').addEventListener('click', () => {
      byId('folderForm').reset();
      byId('editingFolderId').value = '';
      byId('folderDialogTitle').textContent = 'إضافة مجلد';
      populateFolderCategory(byId('folderCategoryInput'), activeCategoryId);
      openDialog('folderDialog');
    });
    byId('clearFolderButton').addEventListener('click', () => {
      activeFolderId = null;
      byId('categorySubtitle').textContent = 'قائمة الصوتيات';
      renderCategoryContents();
    });
    byId('menuAdminEntry').addEventListener('click', () => { closeDialog('menuDialog'); openAdmin(); });
    byId('menuAdminPanel').addEventListener('click', () => { closeDialog('menuDialog'); openAdmin(); });
    byId('newRecordingButton').addEventListener('click', () => { closeDialog('adminDialog'); openTrackForm(); });
    byId('newCategoryButton').addEventListener('click', () => {
      byId('categoryForm').reset();
      byId('editingCategoryId').value = '';
      byId('categoryDialogTitle').textContent = 'إضافة قائمة';
      openDialog('categoryDialog');
    });
    byId('logoutButton').addEventListener('click', () => {
      closeDialog('adminDialog');
      if (firebaseAuth) firebaseAuth.signOut().catch(authError => showToast(firebaseAuthError(authError)));
    });
    byId('adminAccountButton').addEventListener('click', () => {
      returnToAdminAfterLogin = true;
      closeDialog('adminDialog');
      openAccount();
    });

    document.addEventListener('click', event => {
      const closeButton = event.target.closest('[data-close]');
      if (closeButton) closeDialog(closeButton.dataset.close);
      const passwordButton = event.target.closest('.password-toggle');
      if (passwordButton) {
        const input = byId(passwordButton.dataset.target);
        if (input) {
          input.type = input.type === 'password' ? 'text' : 'password';
          passwordButton.textContent = input.type === 'password' ? 'إظهار' : 'إخفاء';
        }
      }
    });

    document.querySelectorAll('dialog').forEach(dialog => {
      dialog.addEventListener('click', event => {
        if (event.target === dialog) dialog.close();
      });
    });

    document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
      accountMode = button.dataset.mode;
      document.querySelectorAll('[data-mode]').forEach(item => item.classList.toggle('active', item === button));
      const registering = accountMode === 'register';
      byId('accountDialogTitle').textContent = registering ? 'إنشاء حساب' : 'حساب المستخدم';
      byId('accountSubmit').textContent = registering ? 'إنشاء الحساب' : 'دخول';
      byId('accountUsername').closest('.form-field').hidden = !registering;
      byId('accountUsername').required = registering;
      byId('accountPassword').autocomplete = registering ? 'new-password' : 'current-password';
      byId('confirmPasswordField').hidden = !registering;
      byId('accountPasswordConfirm').required = registering;
      byId('accountPasswordConfirm').value = '';
      byId('accountError').hidden = true;
    }));

    byId('accountForm').addEventListener('submit', async event => {
      event.preventDefault();
      const error = byId('accountError');
      if (accountMode === 'register' && byId('accountPassword').value !== byId('accountPasswordConfirm').value) {
        error.textContent = 'كلمتا المرور غير متطابقتين.';
        error.hidden = false;
        return;
      }
      if (!firebaseAuth) {
        error.textContent = 'إعداد Firebase غير مكتمل. أضف إعدادات مشروعك إلى firebase-config.js أولًا.';
        error.hidden = false;
        return;
      }
      const submit = byId('accountSubmit');
      submit.disabled = true;
      error.hidden = true;
      try {
        const email = byId('accountEmail').value.trim();
        const password = byId('accountPassword').value;
        if (accountMode === 'register') {
          const credential = await firebaseAuth.createUserWithEmailAndPassword(email, password);
          const displayName = byId('accountUsername').value.trim();
          if (displayName) await credential.user.updateProfile({ displayName });
          showToast('تم إنشاء الحساب وتسجيل الدخول.');
        } else {
          await firebaseAuth.signInWithEmailAndPassword(email, password);
          showToast('تم تسجيل الدخول.');
        }
        updateAccountUI(firebaseAuth.currentUser);
        closeDialog('accountDialog');
        if (returnToAdminAfterLogin) {
          returnToAdminAfterLogin = false;
          openAdmin();
        }
      } catch (authError) {
        error.textContent = firebaseAuthError(authError);
        error.hidden = false;
      } finally {
        submit.disabled = false;
      }
    });
    byId('userLogoutButton').addEventListener('click', async () => {
      if (!firebaseAuth) return;
      try {
        await firebaseAuth.signOut();
        showToast('تم تسجيل الخروج.');
      } catch (authError) {
        showToast(firebaseAuthError(authError));
      }
    });
    byId('categoryForm').addEventListener('submit', event => {
      event.preventDefault();
      const id = byId('editingCategoryId').value;
      const name = byId('categoryNameInput').value.trim();
      if (!name) return;
      const existing = categoryById(id);
      if (existing) existing.name = name;
      else state.categories.push({ id: makeId(), name, type: 'custom' });
      saveState();
      closeDialog('categoryDialog');
      renderCategories();
      if (activeCategoryId) renderCategoryContents();
    });

    byId('folderForm').addEventListener('submit', event => {
      event.preventDefault();
      const id = byId('editingFolderId').value;
      const name = byId('folderNameInput').value.trim();
      const categoryId = byId('folderCategoryInput').value;
      if (!name || !categoryById(categoryId)) return;
      const existing = folderById(id);
      if (existing) Object.assign(existing, { name, categoryId });
      else state.folders.push({ id: makeId(), name, categoryId });
      saveState();
      closeDialog('folderDialog');
      renderCategories();
      if (activeCategoryId) renderCategoryContents();
    });

    byId('trackForm').addEventListener('submit', async event => {
      event.preventDefault();
      const editingId = byId('editingTrackId').value;
      const existing = state.tracks.find(track => track.id === editingId);
      const file = byId('trackAudioInput').files[0];
      if (!existing && !file) {
        showToast('اختر ملفًا صوتيًا أولًا.');
        return;
      }
      let audioId = existing?.audioId || '';
      try {
        if (file) {
          audioId = makeId();
          await putAudio(audioId, file);
          if (existing?.audioId) deleteAudio(existing.audioId);
        }
      } catch (error) {
        console.error(error);
        showToast('تعذر حفظ الملف الصوتي في هذا المتصفح.');
        return;
      }
      const track = {
        id: existing?.id || makeId(),
        title: byId('trackTitleInput').value.trim(),
        description: byId('trackDescriptionInput').value.trim(),
        categoryId: byId('trackCategoryInput').value,
        folderId: byId('trackFolderInput').value,
        reciter: byId('trackReciterInput').value.trim(),
        audioId
      };
      if (existing) Object.assign(existing, track);
      else state.tracks.push(track);
      saveState();
      closeDialog('trackDialog');
      renderCategories();
      if (activeCategoryId) renderCategoryContents();
    });

    document.querySelectorAll('[data-radio]').forEach(button => button.addEventListener('click', () => {
      const type = button.dataset.radio;
      const category = state.categories.find(item => item.type === type) || state.categories[0];
      if (!category) return;
      document.querySelectorAll('[data-radio]').forEach(item => item.classList.toggle('active', item === button));
      openCategory(category.id);
    }));

    byId('featuredPlay').addEventListener('click', () => {
      const available = state.tracks.filter(track => track.audioId);
      if (!available.length) {
        showToast('أضف ملفات صوتية إلى المكتبة أولًا.');
        return;
      }
      const track = available[Math.floor(Math.random() * available.length)];
      openCategory(track.categoryId);
      playTrack(track);
    });

    byId('togglePlayback').addEventListener('click', () => {
      const audio = byId('audio');
      if (!audio.src) {
        showToast('اختر صوتًا من المكتبة أولًا.');
        return;
      }
      if (audio.paused) audio.play().catch(() => showToast('تعذر تشغيل الصوت.'));
      else audio.pause();
    });
    byId('previousButton').addEventListener('click', () => changeTrack(-1));
    byId('nextButton').addEventListener('click', () => changeTrack(1));
    byId('repeatButton').addEventListener('click', event => {
      const button = event.currentTarget;
      byId('audio').loop = !byId('audio').loop;
      button.classList.toggle('active', byId('audio').loop);
      button.setAttribute('aria-pressed', String(byId('audio').loop));
    });
    byId('shuffleButton').addEventListener('click', event => {
      const button = event.currentTarget;
      button.classList.toggle('active');
      button.setAttribute('aria-pressed', String(button.classList.contains('active')));
    });
    byId('seekBar').addEventListener('input', event => { byId('audio').currentTime = Number(event.target.value); });
    byId('audio').addEventListener('timeupdate', updateTimeline);
    byId('audio').addEventListener('durationchange', updateTimeline);
    byId('audio').addEventListener('play', updatePlaybackButton);
    byId('audio').addEventListener('pause', updatePlaybackButton);
    byId('audio').addEventListener('ended', () => {
      updatePlaybackButton();
      if (!byId('audio').loop) changeTrack(1);
    });
  }

  function openDatabase() {
    if (!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB unavailable'));
    if (!databasePromise) {
      databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(DATABASE_STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    return databasePromise;
  }

  async function putAudio(id, blob) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(DATABASE_STORE, 'readwrite');
      transaction.objectStore(DATABASE_STORE).put(blob, id);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async function getAudio(id) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = database.transaction(DATABASE_STORE).objectStore(DATABASE_STORE).get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function deleteAudio(id) {
    if (!id) return;
    const url = objectUrls.get(id);
    if (url) URL.revokeObjectURL(url);
    objectUrls.delete(id);
    try {
      const database = await openDatabase();
      const transaction = database.transaction(DATABASE_STORE, 'readwrite');
      transaction.objectStore(DATABASE_STORE).delete(id);
    } catch (error) {
      console.warn('تعذر حذف الملف الصوتي المحفوظ.', error);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
