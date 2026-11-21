/* Momento language: every page in the world's ten most spoken languages plus Cantonese and Indonesian.
   The short interface phrases (navigation, buttons, settings) are in the table below; everything else (page copy,
   help, messages, the privacy policy) is in assets/i18n/<code>.js, built from i18n-src/ by i18n-src/build.mjs.
   What people type themselves (album names, captions, names) is never translated.

   How it works: every piece of interface text is written in English in the pages and scripts. This file
   swaps any text node, aria-label, placeholder, title or data-text that exactly matches a phrase below,
   both for the page as it loads and for anything the scripts add later (a MutationObserver). Text with no
   entry is left as it is, so nothing breaks when a new string has no translation yet.

   The choice is kept in localStorage ('momento-lang'); changing it in Settings reloads the page.
   Add a phrase: put its English text as the key and the eleven translations in LANG order (after English). */
(() => {
  const KEY = 'momento-lang';
  // English first, then the order every row below follows
  const LANGS = [
    { code: 'en', html: 'en', name: 'English', en: 'English' },
    { code: 'zh', html: 'zh-Hans', name: '中文（普通话）', en: 'Mandarin Chinese' },
    { code: 'hi', html: 'hi', name: 'हिन्दी', en: 'Hindi' },
    { code: 'es', html: 'es', name: 'Español', en: 'Spanish' },
    { code: 'ar', html: 'ar', name: 'العربية', en: 'Arabic' },
    { code: 'fr', html: 'fr', name: 'Français', en: 'French' },
    { code: 'bn', html: 'bn', name: 'বাংলা', en: 'Bengali' },
    { code: 'pt', html: 'pt', name: 'Português', en: 'Portuguese' },
    { code: 'ru', html: 'ru', name: 'Русский', en: 'Russian' },
    { code: 'ur', html: 'ur', name: 'اردو', en: 'Urdu' },
    { code: 'yue', html: 'zh-Hant-HK', name: '粵語（廣東話）', en: 'Cantonese' },
    { code: 'id', html: 'id', name: 'Bahasa Indonesia', en: 'Indonesian' },
  ];
  let lang = 'en';
  try { lang = localStorage.getItem(KEY) || 'en'; } catch (e) {}
  lang = new URLSearchParams(location.search).get('lang') || lang;   // ?lang=hi tries a language without saving it
  let idx = LANGS.findIndex((l) => l.code === lang);
  if (idx < 0) { idx = 0; lang = 'en'; }

  const M = (window.Momento ||= {});
  M.i18n = {
    langs: LANGS,
    get: () => lang,
    set(code) {
      if (!LANGS.some((l) => l.code === code) || code === lang) return;
      try { localStorage.setItem(KEY, code); } catch (e) {}
      location.reload();
    },
    t: (s) => s,
  };
  document.documentElement.lang = LANGS[idx].html;
  if (!idx) return;   // English: nothing to swap

  //            zh            hi              es               ar             fr               bn             pt               ru               ur             yue            id
  const D = {
    // ---- Navigation, header and footer ----
    'Home': ['首页', 'होम', 'Inicio', 'الرئيسية', 'Accueil', 'হোম', 'Início', 'Главная', 'ہوم', '首頁', 'Beranda'],
    'My albums': ['我的相册', 'मेरे एल्बम', 'Mis álbumes', 'ألبوماتي', 'Mes albums', 'আমার অ্যালবাম', 'Meus álbuns', 'Мои альбомы', 'میرے البم', '我嘅相簿', 'Album saya'],
    'Social': ['社交', 'सोशल', 'Social', 'اجتماعي', 'Social', 'সোশ্যাল', 'Social', 'Общение', 'سوشل', '社交', 'Sosial'],
    'Settings': ['设置', 'सेटिंग्स', 'Ajustes', 'الإعدادات', 'Paramètres', 'সেটিংস', 'Configurações', 'Настройки', 'ترتیبات', '設定', 'Pengaturan'],
    'FAQ': ['常见问题', 'सामान्य प्रश्न', 'Preguntas frecuentes', 'الأسئلة الشائعة', 'FAQ', 'সাধারণ প্রশ্ন', 'Perguntas frequentes', 'Вопросы и ответы', 'عام سوالات', '常見問題', 'Tanya jawab'],
    'How it works': ['使用方法', 'यह कैसे काम करता है', 'Cómo funciona', 'كيف يعمل', 'Comment ça marche', 'এটি কীভাবে কাজ করে', 'Como funciona', 'Как это работает', 'یہ کیسے کام کرتا ہے', '點樣用', 'Cara kerja'],
    'Features': ['功能', 'सुविधाएँ', 'Funciones', 'الميزات', 'Fonctionnalités', 'বৈশিষ্ট্য', 'Recursos', 'Возможности', 'خصوصیات', '功能', 'Fitur'],
    'Help': ['帮助', 'मदद', 'Ayuda', 'المساعدة', 'Aide', 'সাহায্য', 'Ajuda', 'Помощь', 'مدد', '幫助', 'Bantuan'],
    'Help and support': ['帮助与支持', 'मदद और सहायता', 'Ayuda y soporte', 'المساعدة والدعم', 'Aide et assistance', 'সাহায্য ও সহায়তা', 'Ajuda e suporte', 'Помощь и поддержка', 'مدد اور معاونت', '幫助同支援', 'Bantuan dan dukungan'],
    'Account settings': ['账户设置', 'खाता सेटिंग्स', 'Ajustes de la cuenta', 'إعدادات الحساب', 'Paramètres du compte', 'অ্যাকাউন্ট সেটিংস', 'Configurações da conta', 'Настройки аккаунта', 'اکاؤنٹ کی ترتیبات', '帳戶設定', 'Pengaturan akun'],
    'Log in': ['登录', 'लॉग इन करें', 'Iniciar sesión', 'تسجيل الدخول', 'Se connecter', 'লগ ইন', 'Entrar', 'Войти', 'لاگ ان', '登入', 'Masuk'],
    'Sign up': ['注册', 'साइन अप करें', 'Registrarse', 'إنشاء حساب', "S'inscrire", 'সাইন আপ', 'Cadastrar-se', 'Регистрация', 'سائن اپ', '註冊', 'Daftar'],
    'Log out': ['退出登录', 'लॉग आउट करें', 'Cerrar sesión', 'تسجيل الخروج', 'Se déconnecter', 'লগ আউট', 'Sair', 'Выйти', 'لاگ آؤٹ', '登出', 'Keluar'],
    'Privacy policy': ['隐私政策', 'गोपनीयता नीति', 'Política de privacidad', 'سياسة الخصوصية', 'Politique de confidentialité', 'গোপনীয়তা নীতি', 'Política de privacidade', 'Политика конфиденциальности', 'رازداری کی پالیسی', '私隱政策', 'Kebijakan privasi'],
    'Contact support': ['联系客服', 'सहायता से संपर्क करें', 'Contactar con soporte', 'اتصل بالدعم', "Contacter l'assistance", 'সহায়তায় যোগাযোগ', 'Falar com o suporte', 'Связаться с поддержкой', 'معاونت سے رابطہ', '聯絡支援', 'Hubungi dukungan'],
    'Contact us': ['联系我们', 'हमसे संपर्क करें', 'Contáctanos', 'اتصل بنا', 'Nous contacter', 'যোগাযোগ করুন', 'Fale conosco', 'Связаться с нами', 'ہم سے رابطہ کریں', '聯絡我哋', 'Hubungi kami'],
    'Email support': ['邮件联系客服', 'ईमेल सहायता', 'Soporte por correo', 'الدعم عبر البريد', 'Assistance par e-mail', 'ইমেল সহায়তা', 'Suporte por e-mail', 'Поддержка по почте', 'ای میل معاونت', '電郵支援', 'Dukungan email'],
    'Product': ['产品', 'उत्पाद', 'Producto', 'المنتج', 'Produit', 'পণ্য', 'Produto', 'Продукт', 'پروڈکٹ', '產品', 'Produk'],
    'Your albums': ['你的相册', 'आपके एल्बम', 'Tus álbumes', 'ألبوماتك', 'Vos albums', 'আপনার অ্যালবাম', 'Seus álbuns', 'Ваши альбомы', 'آپ کے البم', '你嘅相簿', 'Album Anda'],
    'Events': ['活动', 'इवेंट', 'Eventos', 'الفعاليات', 'Événements', 'ইভেন্ট', 'Eventos', 'События', 'ایونٹس', '活動', 'Acara'],
    'Groups': ['群组', 'समूह', 'Grupos', 'المجموعات', 'Groupes', 'গ্রুপ', 'Grupos', 'Группы', 'گروپس', '群組', 'Grup'],
    'Host a public event': ['举办公开活动', 'सार्वजनिक इवेंट होस्ट करें', 'Organiza un evento público', 'استضف فعالية عامة', 'Organiser un événement public', 'পাবলিক ইভেন্ট আয়োজন করুন', 'Organize um evento público', 'Провести открытое событие', 'عوامی ایونٹ کی میزبانی کریں', '舉辦公開活動', 'Adakan acara publik'],
    'Event alerts': ['活动提醒', 'इवेंट अलर्ट', 'Alertas de eventos', 'تنبيهات الفعاليات', "Alertes d'événements", 'ইভেন্ট সতর্কতা', 'Alertas de eventos', 'Оповещения о событиях', 'ایونٹ الرٹس', '活動提示', 'Peringatan acara'],
    'Join with a code': ['用代码加入', 'कोड से जुड़ें', 'Unirse con un código', 'انضم برمز', 'Rejoindre avec un code', 'কোড দিয়ে যোগ দিন', 'Entrar com um código', 'Присоединиться по коду', 'کوڈ سے شامل ہوں', '用代碼加入', 'Gabung dengan kode'],
    'Events near you': ['你附近的活动', 'आपके पास के इवेंट', 'Eventos cerca de ti', 'فعاليات بالقرب منك', 'Événements près de vous', 'আপনার কাছের ইভেন্ট', 'Eventos perto de você', 'События рядом', 'آپ کے قریب ایونٹس', '你附近嘅活動', 'Acara di dekat Anda'],
    'Appearance': ['外观', 'रूप-रंग', 'Apariencia', 'المظهر', 'Apparence', 'চেহারা', 'Aparência', 'Оформление', 'ظاہری شکل', '外觀', 'Tampilan'],
    'Language': ['语言', 'भाषा', 'Idioma', 'اللغة', 'Langue', 'ভাষা', 'Idioma', 'Язык', 'زبان', '語言', 'Bahasa'],
    'Activity': ['动态', 'गतिविधि', 'Actividad', 'النشاط', 'Activité', 'কার্যকলাপ', 'Atividade', 'Активность', 'سرگرمی', '動態', 'Aktivitas'],
    'Mark all read': ['全部标为已读', 'सभी को पढ़ा हुआ मानें', 'Marcar todo como leído', 'تعليم الكل كمقروء', 'Tout marquer comme lu', 'সব পড়া হয়েছে চিহ্নিত করুন', 'Marcar tudo como lido', 'Отметить всё прочитанным', 'سب کو پڑھا ہوا نشان زد کریں', '全部標示為已讀', 'Tandai semua sudah dibaca'],
    'Notifications': ['通知', 'सूचनाएँ', 'Notificaciones', 'الإشعارات', 'Notifications', 'বিজ্ঞপ্তি', 'Notificações', 'Уведомления', 'اطلاعات', '通知', 'Notifikasi'],

    // ---- Common actions ----
    'Close': ['关闭', 'बंद करें', 'Cerrar', 'إغلاق', 'Fermer', 'বন্ধ করুন', 'Fechar', 'Закрыть', 'بند کریں', '關閉', 'Tutup'],
    'Cancel': ['取消', 'रद्द करें', 'Cancelar', 'إلغاء', 'Annuler', 'বাতিল', 'Cancelar', 'Отмена', 'منسوخ کریں', '取消', 'Batal'],
    'Done': ['完成', 'हो गया', 'Listo', 'تم', 'Terminé', 'সম্পন্ন', 'Concluído', 'Готово', 'ہو گیا', '完成', 'Selesai'],
    'Save': ['保存', 'सहेजें', 'Guardar', 'حفظ', 'Enregistrer', 'সংরক্ষণ', 'Salvar', 'Сохранить', 'محفوظ کریں', '儲存', 'Simpan'],
    'Save changes': ['保存更改', 'बदलाव सहेजें', 'Guardar cambios', 'حفظ التغييرات', 'Enregistrer les modifications', 'পরিবর্তন সংরক্ষণ', 'Salvar alterações', 'Сохранить изменения', 'تبدیلیاں محفوظ کریں', '儲存更改', 'Simpan perubahan'],
    'Next': ['下一步', 'आगे', 'Siguiente', 'التالي', 'Suivant', 'পরবর্তী', 'Próximo', 'Далее', 'اگلا', '下一步', 'Berikutnya'],
    'Back': ['返回', 'वापस', 'Atrás', 'رجوع', 'Retour', 'ফিরে যান', 'Voltar', 'Назад', 'واپس', '返回', 'Kembali'],
    'Continue': ['继续', 'जारी रखें', 'Continuar', 'متابعة', 'Continuer', 'চালিয়ে যান', 'Continuar', 'Продолжить', 'جاری رکھیں', '繼續', 'Lanjutkan'],
    'Change': ['更改', 'बदलें', 'Cambiar', 'تغيير', 'Modifier', 'পরিবর্তন', 'Alterar', 'Изменить', 'تبدیل کریں', '更改', 'Ubah'],
    'Remove': ['移除', 'हटाएँ', 'Quitar', 'إزالة', 'Retirer', 'সরান', 'Remover', 'Убрать', 'ہٹائیں', '移除', 'Hapus'],
    'Allow': ['允许', 'अनुमति दें', 'Permitir', 'السماح', 'Autoriser', 'অনুমতি দিন', 'Permitir', 'Разрешить', 'اجازت دیں', '允許', 'Izinkan'],
    'Select': ['选择', 'चुनें', 'Seleccionar', 'تحديد', 'Sélectionner', 'নির্বাচন', 'Selecionar', 'Выбрать', 'منتخب کریں', '揀選', 'Pilih'],
    'Select all': ['全选', 'सभी चुनें', 'Seleccionar todo', 'تحديد الكل', 'Tout sélectionner', 'সব নির্বাচন', 'Selecionar tudo', 'Выбрать все', 'سب منتخب کریں', '全選', 'Pilih semua'],
    'Select photos': ['选择照片', 'फ़ोटो चुनें', 'Seleccionar fotos', 'تحديد الصور', 'Sélectionner des photos', 'ছবি নির্বাচন', 'Selecionar fotos', 'Выбрать фото', 'تصاویر منتخب کریں', '揀相', 'Pilih foto'],
    'Delete': ['删除', 'हटाएँ', 'Eliminar', 'حذف', 'Supprimer', 'মুছুন', 'Excluir', 'Удалить', 'حذف کریں', '刪除', 'Hapus'],
    'Download': ['下载', 'डाउनलोड', 'Descargar', 'تنزيل', 'Télécharger', 'ডাউনলোড', 'Baixar', 'Скачать', 'ڈاؤن لوڈ', '下載', 'Unduh'],
    'Download all': ['全部下载', 'सभी डाउनलोड करें', 'Descargar todo', 'تنزيل الكل', 'Tout télécharger', 'সব ডাউনলোড', 'Baixar tudo', 'Скачать все', 'سب ڈاؤن لوڈ کریں', '全部下載', 'Unduh semua'],
    'Hide': ['隐藏', 'छिपाएँ', 'Ocultar', 'إخفاء', 'Masquer', 'লুকান', 'Ocultar', 'Скрыть', 'چھپائیں', '隱藏', 'Sembunyikan'],
    'Share': ['分享', 'शेयर करें', 'Compartir', 'مشاركة', 'Partager', 'শেয়ার', 'Compartilhar', 'Поделиться', 'شیئر کریں', '分享', 'Bagikan'],
    'Copy link': ['复制链接', 'लिंक कॉपी करें', 'Copiar enlace', 'نسخ الرابط', 'Copier le lien', 'লিংক কপি', 'Copiar link', 'Копировать ссылку', 'لنک کاپی کریں', '複製連結', 'Salin tautan'],
    'Copy code': ['复制代码', 'कोड कॉपी करें', 'Copiar código', 'نسخ الرمز', 'Copier le code', 'কোড কপি', 'Copiar código', 'Копировать код', 'کوڈ کاپی کریں', '複製代碼', 'Salin kode'],
    'Show QR code': ['显示二维码', 'QR कोड दिखाएँ', 'Mostrar código QR', 'عرض رمز QR', 'Afficher le code QR', 'QR কোড দেখান', 'Mostrar código QR', 'Показать QR-код', 'QR کوڈ دکھائیں', '顯示二維碼', 'Tampilkan kode QR'],
    'Loading…': ['加载中…', 'लोड हो रहा है…', 'Cargando…', 'جارٍ التحميل…', 'Chargement…', 'লোড হচ্ছে…', 'Carregando…', 'Загрузка…', 'لوڈ ہو رہا ہے…', '載入中…', 'Memuat…'],
    'Checking…': ['检查中…', 'जाँच हो रही है…', 'Comprobando…', 'جارٍ التحقق…', 'Vérification…', 'যাচাই হচ্ছে…', 'Verificando…', 'Проверка…', 'جانچ ہو رہی ہے…', '檢查緊…', 'Memeriksa…'],
    'Try again': ['重试', 'फिर से कोशिश करें', 'Reintentar', 'حاول مرة أخرى', 'Réessayer', 'আবার চেষ্টা করুন', 'Tentar de novo', 'Повторить', 'دوبارہ کوشش کریں', '再試一次', 'Coba lagi'],
    'New': ['新', 'नया', 'Nuevo', 'جديد', 'Nouveau', 'নতুন', 'Novo', 'Новое', 'نیا', '新', 'Baru'],
    'Earlier': ['更早', 'पहले', 'Antes', 'سابقًا', 'Plus tôt', 'আগে', 'Antes', 'Ранее', 'پہلے', '較早', 'Sebelumnya'],
    'Album': ['相册', 'एल्बम', 'Álbum', 'ألبوم', 'Album', 'অ্যালবাম', 'Álbum', 'Альбом', 'البم', '相簿', 'Album'],
    'Event': ['活动', 'इवेंट', 'Evento', 'فعالية', 'Événement', 'ইভেন্ট', 'Evento', 'Событие', 'ایونٹ', '活動', 'Acara'],
    'Albums': ['相册', 'एल्बम', 'Álbumes', 'الألبومات', 'Albums', 'অ্যালবাম', 'Álbuns', 'Альбомы', 'البمز', '相簿', 'Album'],
    'People': ['成员', 'लोग', 'Personas', 'الأشخاص', 'Personnes', 'লোকজন', 'Pessoas', 'Люди', 'لوگ', '成員', 'Orang'],

    // ---- Light or dark ----
    'Light or dark': ['浅色或深色', 'लाइट या डार्क', 'Claro u oscuro', 'فاتح أو داكن', 'Clair ou sombre', 'লাইট বা ডার্ক', 'Claro ou escuro', 'Светлая или тёмная', 'لائٹ یا ڈارک', '淺色定深色', 'Terang atau gelap'],
    'Light': ['浅色', 'लाइट', 'Claro', 'فاتح', 'Clair', 'লাইট', 'Claro', 'Светлая', 'لائٹ', '淺色', 'Terang'],
    'Dark': ['深色', 'डार्क', 'Oscuro', 'داكن', 'Sombre', 'ডার্ক', 'Escuro', 'Тёмная', 'ڈارک', '深色', 'Gelap'],
    'System': ['跟随系统', 'सिस्टम', 'Sistema', 'النظام', 'Système', 'সিস্টেম', 'Sistema', 'Системная', 'سسٹم', '跟系統', 'Sistem'],
    'System follows your device’s own setting.': ['“跟随系统”会使用你设备自己的设置。', 'सिस्टम आपके डिवाइस की अपनी सेटिंग का पालन करता है।', 'Sistema sigue el ajuste de tu dispositivo.', 'يتبع خيار النظام إعداد جهازك.', 'Système suit le réglage de votre appareil.', 'সিস্টেম আপনার ডিভাইসের নিজস্ব সেটিং অনুসরণ করে।', 'Sistema segue a configuração do seu aparelho.', 'Системная следует настройке вашего устройства.', 'سسٹم آپ کے آلے کی اپنی ترتیب پر چلتا ہے۔', '「跟系統」會用你部機自己嘅設定。', 'Sistem mengikuti pengaturan perangkat Anda.'],

    // ---- My albums ----
    'Create an album': ['创建相册', 'एल्बम बनाएँ', 'Crear un álbum', 'أنشئ ألبومًا', 'Créer un album', 'অ্যালবাম তৈরি করুন', 'Criar um álbum', 'Создать альбом', 'البم بنائیں', '建立相簿', 'Buat album'],
    'New album': ['新建相册', 'नया एल्बम', 'Nuevo álbum', 'ألبوم جديد', 'Nouvel album', 'নতুন অ্যালবাম', 'Novo álbum', 'Новый альбом', 'نیا البم', '新相簿', 'Album baru'],
    'Join an album': ['加入相册', 'एल्बम से जुड़ें', 'Unirse a un álbum', 'انضم إلى ألبوم', 'Rejoindre un album', 'অ্যালবামে যোগ দিন', 'Entrar em um álbum', 'Присоединиться к альбому', 'البم میں شامل ہوں', '加入相簿', 'Gabung ke album'],
    'Open album': ['打开相册', 'एल्बम खोलें', 'Abrir álbum', 'افتح الألبوم', "Ouvrir l'album", 'অ্যালবাম খুলুন', 'Abrir álbum', 'Открыть альбом', 'البم کھولیں', '打開相簿', 'Buka album'],
    'Add your photos': ['添加你的照片', 'अपनी फ़ोटो जोड़ें', 'Añade tus fotos', 'أضف صورك', 'Ajoutez vos photos', 'আপনার ছবি যোগ করুন', 'Adicione suas fotos', 'Добавьте свои фото', 'اپنی تصاویر شامل کریں', '加你嘅相', 'Tambahkan foto Anda'],
    'Add photos': ['添加照片', 'फ़ोटो जोड़ें', 'Añadir fotos', 'إضافة صور', 'Ajouter des photos', 'ছবি যোগ করুন', 'Adicionar fotos', 'Добавить фото', 'تصاویر شامل کریں', '加相', 'Tambah foto'],
    'Waiting on you': ['等你处理', 'आपका इंतज़ार', 'Pendiente de ti', 'بانتظارك', 'En attente de vous', 'আপনার অপেক্ষায়', 'Aguardando você', 'Ждут вас', 'آپ کا انتظار', '等緊你', 'Menunggu Anda'],
    'All': ['全部', 'सभी', 'Todos', 'الكل', 'Tous', 'সব', 'Todos', 'Все', 'سب', '全部', 'Semua'],
    'Hosting': ['我主办的', 'होस्टिंग', 'Organizo', 'أستضيفها', "J'organise", 'আয়োজক', 'Organizo', 'Мои', 'میزبانی', '我主辦嘅', 'Saya adakan'],
    'Joined': ['已加入', 'जुड़े हुए', 'Unidos', 'انضممت إليها', 'Rejoints', 'যোগ দেওয়া', 'Participo', 'Участвую', 'شامل', '已加入', 'Diikuti'],
    'Bookmarked': ['已收藏', 'बुकमार्क', 'Guardados', 'المحفوظة', 'Favoris', 'বুকমার্ক', 'Favoritos', 'Закладки', 'بک مارک', '已收藏', 'Ditandai'],
    'Saved albums': ['收藏的相册', 'सहेजे गए एल्बम', 'Álbumes guardados', 'الألبومات المحفوظة', 'Albums enregistrés', 'সংরক্ষিত অ্যালবাম', 'Álbuns salvos', 'Сохранённые альбомы', 'محفوظ البم', '收藏咗嘅相簿', 'Album tersimpan'],
    'Bookmarked photos': ['收藏的照片', 'बुकमार्क की गई फ़ोटो', 'Fotos guardadas', 'الصور المحفوظة', 'Photos favorites', 'বুকমার্ক করা ছবি', 'Fotos favoritas', 'Фото в закладках', 'بک مارک کی گئی تصاویر', '收藏咗嘅相', 'Foto yang ditandai'],
    'Nothing bookmarked yet': ['还没有收藏', 'अभी कुछ भी बुकमार्क नहीं', 'Aún no hay nada guardado', 'لا يوجد شيء محفوظ بعد', 'Aucun favori pour le moment', 'এখনও কিছু বুকমার্ক করা হয়নি', 'Nenhum favorito ainda', 'Закладок пока нет', 'ابھی کچھ بک مارک نہیں', '未有收藏', 'Belum ada yang ditandai'],
    'No albums match': ['没有匹配的相册', 'कोई एल्बम मेल नहीं खाता', 'Ningún álbum coincide', 'لا توجد ألبومات مطابقة', 'Aucun album ne correspond', 'কোনো অ্যালবাম মেলেনি', 'Nenhum álbum encontrado', 'Нет подходящих альбомов', 'کوئی البم نہیں ملا', '冇相符嘅相簿', 'Tidak ada album yang cocok'],
    'Clear search': ['清除搜索', 'खोज साफ़ करें', 'Borrar búsqueda', 'مسح البحث', 'Effacer la recherche', 'অনুসন্ধান মুছুন', 'Limpar busca', 'Очистить поиск', 'تلاش صاف کریں', '清除搜尋', 'Hapus pencarian'],
    'Find an album or place': ['查找相册或地点', 'एल्बम या जगह खोजें', 'Busca un álbum o lugar', 'ابحث عن ألبوم أو مكان', 'Trouver un album ou un lieu', 'অ্যালবাম বা জায়গা খুঁজুন', 'Encontre um álbum ou lugar', 'Найти альбом или место', 'البم یا جگہ تلاش کریں', '搵相簿或者地方', 'Cari album atau tempat'],
    'Just added': ['刚刚添加', 'अभी जोड़ी गईं', 'Recién añadidas', 'أُضيفت للتو', 'Ajoutées récemment', 'সদ্য যোগ করা', 'Recém-adicionadas', 'Только что добавлены', 'ابھی شامل کی گئیں', '啱啱加咗', 'Baru ditambahkan'],
    'Recently deleted': ['最近删除', 'हाल ही में हटाई गईं', 'Eliminadas recientemente', 'المحذوفة مؤخرًا', 'Supprimées récemment', 'সম্প্রতি মুছে ফেলা', 'Excluídas recentemente', 'Недавно удалённые', 'حال ہی میں حذف شدہ', '最近刪除', 'Baru dihapus'],
    'Album settings': ['相册设置', 'एल्बम सेटिंग्स', 'Ajustes del álbum', 'إعدادات الألبوم', "Paramètres de l'album", 'অ্যালবাম সেটিংস', 'Configurações do álbum', 'Настройки альбома', 'البم کی ترتیبات', '相簿設定', 'Pengaturan album'],
    'Share album': ['分享相册', 'एल्बम शेयर करें', 'Compartir álbum', 'مشاركة الألبوم', "Partager l'album", 'অ্যালবাম শেয়ার', 'Compartilhar álbum', 'Поделиться альбомом', 'البم شیئر کریں', '分享相簿', 'Bagikan album'],
    'Save album': ['收藏相册', 'एल्बम सहेजें', 'Guardar álbum', 'حفظ الألبوم', "Enregistrer l'album", 'অ্যালবাম সংরক্ষণ', 'Salvar álbum', 'Сохранить альбом', 'البم محفوظ کریں', '收藏相簿', 'Simpan album'],
    'Hidden by you': ['你隐藏的', 'आपके द्वारा छिपाई गईं', 'Ocultas por ti', 'أخفيتها أنت', 'Masquées par vous', 'আপনার লুকানো', 'Ocultadas por você', 'Скрытые вами', 'آپ کی چھپائی گئی', '你隱藏咗嘅', 'Anda sembunyikan'],
    'Delete album': ['删除相册', 'एल्बम हटाएँ', 'Eliminar álbum', 'حذف الألبوم', "Supprimer l'album", 'অ্যালবাম মুছুন', 'Excluir álbum', 'Удалить альбом', 'البم حذف کریں', '刪除相簿', 'Hapus album'],
    'Delete this album': ['删除此相册', 'यह एल्बम हटाएँ', 'Eliminar este álbum', 'حذف هذا الألبوم', 'Supprimer cet album', 'এই অ্যালবাম মুছুন', 'Excluir este álbum', 'Удалить этот альбом', 'یہ البم حذف کریں', '刪除呢個相簿', 'Hapus album ini'],
    'Mute this album': ['将此相册设为静音', 'इस एल्बम को म्यूट करें', 'Silenciar este álbum', 'كتم هذا الألبوم', 'Mettre cet album en sourdine', 'এই অ্যালবাম মিউট করুন', 'Silenciar este álbum', 'Отключить уведомления альбома', 'اس البم کو خاموش کریں', '將呢個相簿靜音', 'Bisukan album ini'],
    'Scroll to see more photos': ['滚动查看更多照片', 'और फ़ोटो देखने के लिए स्क्रॉल करें', 'Desplázate para ver más fotos', 'مرّر لرؤية المزيد من الصور', 'Faites défiler pour voir plus de photos', 'আরও ছবি দেখতে স্ক্রল করুন', 'Role para ver mais fotos', 'Прокрутите, чтобы увидеть больше фото', 'مزید تصاویر دیکھنے کے لیے اسکرول کریں', '碌落去睇更多相', 'Gulir untuk melihat foto lainnya'],
    'Uploading': ['上传中', 'अपलोड हो रहा है', 'Subiendo', 'جارٍ الرفع', 'Envoi en cours', 'আপলোড হচ্ছে', 'Enviando', 'Загрузка', 'اپ لوڈ ہو رہا ہے', '上載緊', 'Mengunggah'],
    'No photos yet': ['还没有照片', 'अभी कोई फ़ोटो नहीं', 'Aún no hay fotos', 'لا توجد صور بعد', 'Pas encore de photos', 'এখনও কোনো ছবি নেই', 'Nenhuma foto ainda', 'Фото пока нет', 'ابھی کوئی تصویر نہیں', '未有相', 'Belum ada foto'],
    'No albums yet': ['还没有相册', 'अभी कोई एल्बम नहीं', 'Aún no hay álbumes', 'لا توجد ألبومات بعد', "Pas encore d'albums", 'এখনও কোনো অ্যালবাম নেই', 'Nenhum álbum ainda', 'Альбомов пока нет', 'ابھی کوئی البم نہیں', '未有相簿', 'Belum ada album'],
    'Your albums will live here': ['你的相册会显示在这里', 'आपके एल्बम यहाँ रहेंगे', 'Tus álbumes vivirán aquí', 'ستظهر ألبوماتك هنا', 'Vos albums apparaîtront ici', 'আপনার অ্যালবাম এখানে থাকবে', 'Seus álbuns ficarão aqui', 'Здесь будут ваши альбомы', 'آپ کے البم یہاں ہوں گے', '你嘅相簿會喺度', 'Album Anda akan ada di sini'],
    'Live now': ['正在进行', 'अभी लाइव', 'En directo', 'مباشر الآن', 'En direct', 'এখন লাইভ', 'Ao vivo', 'Сейчас идёт', 'ابھی لائیو', '進行緊', 'Sedang berlangsung'],
    'Full quality': ['原画质', 'पूरी क्वालिटी', 'Calidad completa', 'جودة كاملة', 'Qualité maximale', 'পূর্ণ মান', 'Qualidade total', 'Полное качество', 'مکمل معیار', '原畫質', 'Kualitas penuh'],
    'Show all photos': ['显示所有照片', 'सभी फ़ोटो दिखाएँ', 'Mostrar todas las fotos', 'عرض كل الصور', 'Afficher toutes les photos', 'সব ছবি দেখান', 'Mostrar todas as fotos', 'Показать все фото', 'تمام تصاویر دکھائیں', '顯示所有相', 'Tampilkan semua foto'],
    'Recover': ['恢复', 'वापस लाएँ', 'Recuperar', 'استعادة', 'Récupérer', 'পুনরুদ্ধার', 'Recuperar', 'Восстановить', 'بحال کریں', '還原', 'Pulihkan'],
    'Delete forever': ['永久删除', 'हमेशा के लिए हटाएँ', 'Eliminar para siempre', 'حذف نهائي', 'Supprimer définitivement', 'চিরতরে মুছুন', 'Excluir para sempre', 'Удалить навсегда', 'ہمیشہ کے لیے حذف کریں', '永久刪除', 'Hapus selamanya'],
    'Show again': ['重新显示', 'फिर से दिखाएँ', 'Mostrar de nuevo', 'إظهار مجددًا', 'Afficher à nouveau', 'আবার দেখান', 'Mostrar de novo', 'Показать снова', 'دوبارہ دکھائیں', '再顯示', 'Tampilkan lagi'],
    'Album code': ['相册代码', 'एल्बम कोड', 'Código del álbum', 'رمز الألبوم', "Code de l'album", 'অ্যালবাম কোড', 'Código do álbum', 'Код альбома', 'البم کوڈ', '相簿代碼', 'Kode album'],
    'Album name': ['相册名称', 'एल्बम का नाम', 'Nombre del álbum', 'اسم الألبوم', "Nom de l'album", 'অ্যালবামের নাম', 'Nome do álbum', 'Название альбома', 'البم کا نام', '相簿名稱', 'Nama album'],
    'Date': ['日期', 'तारीख', 'Fecha', 'التاريخ', 'Date', 'তারিখ', 'Data', 'Дата', 'تاریخ', '日期', 'Tanggal'],
    'Guest code': ['访客代码', 'मेहमान कोड', 'Código de invitado', 'رمز الضيف', 'Code invité', 'অতিথি কোড', 'Código de convidado', 'Код для гостей', 'مہمان کوڈ', '訪客代碼', 'Kode tamu'],
    'Invite link': ['邀请链接', 'आमंत्रण लिंक', 'Enlace de invitación', 'رابط الدعوة', "Lien d'invitation", 'আমন্ত্রণ লিংক', 'Link de convite', 'Ссылка-приглашение', 'دعوتی لنک', '邀請連結', 'Tautan undangan'],
    'View album': ['查看相册', 'एल्बम देखें', 'Ver álbum', 'عرض الألبوم', "Voir l'album", 'অ্যালবাম দেখুন', 'Ver álbum', 'Смотреть альбом', 'البم دیکھیں', '睇相簿', 'Lihat album'],
    'Album created': ['相册已创建', 'एल्बम बन गया', 'Álbum creado', 'تم إنشاء الألبوم', 'Album créé', 'অ্যালবাম তৈরি হয়েছে', 'Álbum criado', 'Альбом создан', 'البم بن گیا', '相簿已建立', 'Album dibuat'],

    // ---- Photo viewer and reactions ----
    'React': ['回应', 'प्रतिक्रिया दें', 'Reaccionar', 'تفاعل', 'Réagir', 'প্রতিক্রিয়া', 'Reagir', 'Реакция', 'ردعمل دیں', '回應', 'Beri reaksi'],
    'Reacted': ['已回应', 'प्रतिक्रिया दी', 'Reaccionaste', 'تفاعلت', 'Réagi', 'প্রতিক্রিয়া দিয়েছেন', 'Reagiu', 'Вы отреагировали', 'ردعمل دیا', '已回應', 'Sudah bereaksi'],
    'Reactions': ['回应', 'प्रतिक्रियाएँ', 'Reacciones', 'التفاعلات', 'Réactions', 'প্রতিক্রিয়া', 'Reações', 'Реакции', 'ردعمل', '回應', 'Reaksi'],
    'Choose a reaction': ['选择回应', 'प्रतिक्रिया चुनें', 'Elige una reacción', 'اختر تفاعلًا', 'Choisissez une réaction', 'একটি প্রতিক্রিয়া বেছে নিন', 'Escolha uma reação', 'Выберите реакцию', 'ردعمل چنیں', '揀個回應', 'Pilih reaksi'],
    'Who reacted': ['谁回应了', 'किसने प्रतिक्रिया दी', 'Quién reaccionó', 'من تفاعل', 'Qui a réagi', 'কে প্রতিক্রিয়া দিয়েছে', 'Quem reagiu', 'Кто отреагировал', 'کس نے ردعمل دیا', '邊個回應咗', 'Siapa yang bereaksi'],
    'No one yet.': ['还没有人。', 'अभी कोई नहीं।', 'Nadie todavía.', 'لا أحد بعد.', "Personne pour l'instant.", 'এখনও কেউ নেই।', 'Ninguém ainda.', 'Пока никого.', 'ابھی کوئی نہیں۔', '未有人。', 'Belum ada.'],
    'You': ['你', 'आप', 'Tú', 'أنت', 'Vous', 'আপনি', 'Você', 'Вы', 'آپ', '你', 'Anda'],
    'Album cover': ['相册封面', 'एल्बम कवर', 'Portada del álbum', 'غلاف الألبوم', "Couverture de l'album", 'অ্যালবাম কভার', 'Capa do álbum', 'Обложка альбома', 'البم کور', '相簿封面', 'Sampul album'],
    'Take a photo': ['拍照', 'फ़ोटो लें', 'Hacer una foto', 'التقط صورة', 'Prendre une photo', 'ছবি তুলুন', 'Tirar uma foto', 'Сделать фото', 'تصویر لیں', '影相', 'Ambil foto'],
    'Previous photo': ['上一张', 'पिछली फ़ोटो', 'Foto anterior', 'الصورة السابقة', 'Photo précédente', 'আগের ছবি', 'Foto anterior', 'Предыдущее фото', 'پچھلی تصویر', '上一張相', 'Foto sebelumnya'],
    'Next photo': ['下一张', 'अगली फ़ोटो', 'Foto siguiente', 'الصورة التالية', 'Photo suivante', 'পরের ছবি', 'Próxima foto', 'Следующее фото', 'اگلی تصویر', '下一張相', 'Foto berikutnya'],
    'Click to zoom in. Double-click to react with a ❤️': ['单击放大。双击送上 ❤️', 'ज़ूम करने के लिए क्लिक करें। ❤️ देने के लिए डबल-क्लिक करें', 'Haz clic para ampliar. Doble clic para reaccionar con un ❤️', 'انقر للتكبير. انقر مرتين للتفاعل بـ ❤️', 'Cliquez pour zoomer. Double-cliquez pour réagir avec un ❤️', 'জুম করতে ক্লিক করুন। ❤️ দিতে ডাবল-ক্লিক করুন', 'Clique para ampliar. Clique duas vezes para reagir com ❤️', 'Нажмите, чтобы увеличить. Дважды — чтобы поставить ❤️', 'زوم کرنے کے لیے کلک کریں۔ ❤️ دینے کے لیے ڈبل کلک کریں', '撳一下放大。撳兩下送個 ❤️', 'Klik untuk memperbesar. Klik dua kali untuk memberi ❤️'],
    'All photos': ['所有照片', 'सभी फ़ोटो', 'Todas las fotos', 'كل الصور', 'Toutes les photos', 'সব ছবি', 'Todas as fotos', 'Все фото', 'تمام تصاویر', '所有相', 'Semua foto'],

    // ---- Settings ----
    'Everything saves by itself as you change it.': ['所有更改都会自动保存。', 'आप जो भी बदलते हैं, वह अपने आप सहेज लिया जाता है।', 'Todo se guarda solo al cambiarlo.', 'يُحفظ كل شيء تلقائيًا عند تغييره.', 'Tout est enregistré automatiquement.', 'আপনি যা বদলান তা নিজে থেকেই সংরক্ষিত হয়।', 'Tudo é salvo automaticamente.', 'Все изменения сохраняются автоматически.', 'آپ جو بھی بدلیں وہ خود بخود محفوظ ہو جاتا ہے۔', '改完會自動儲存。', 'Semua perubahan tersimpan otomatis.'],
    'Your details': ['你的资料', 'आपकी जानकारी', 'Tus datos', 'بياناتك', 'Vos informations', 'আপনার তথ্য', 'Seus dados', 'Ваши данные', 'آپ کی تفصیلات', '你嘅資料', 'Data Anda'],
    'Profile photo': ['头像', 'प्रोफ़ाइल फ़ोटो', 'Foto de perfil', 'صورة الملف الشخصي', 'Photo de profil', 'প্রোফাইল ছবি', 'Foto de perfil', 'Фото профиля', 'پروفائل تصویر', '頭像', 'Foto profil'],
    'Add photo': ['添加照片', 'फ़ोटो जोड़ें', 'Añadir foto', 'إضافة صورة', 'Ajouter une photo', 'ছবি যোগ করুন', 'Adicionar foto', 'Добавить фото', 'تصویر شامل کریں', '加相', 'Tambah foto'],
    'Shown beside your name in groups and albums': ['显示在群组和相册中你的名字旁边', 'समूहों और एल्बम में आपके नाम के पास दिखती है', 'Se muestra junto a tu nombre en grupos y álbumes', 'تظهر بجانب اسمك في المجموعات والألبومات', 'Affichée à côté de votre nom dans les groupes et albums', 'গ্রুপ ও অ্যালবামে আপনার নামের পাশে দেখা যায়', 'Aparece ao lado do seu nome em grupos e álbuns', 'Показывается рядом с вашим именем в группах и альбомах', 'گروپس اور البمز میں آپ کے نام کے ساتھ دکھائی دیتی ہے', '喺群組同相簿入面顯示喺你個名隔籬', 'Ditampilkan di samping nama Anda di grup dan album'],
    'Name': ['名字', 'नाम', 'Nombre', 'الاسم', 'Nom', 'নাম', 'Nome', 'Имя', 'نام', '名', 'Nama'],
    'Your name': ['你的名字', 'आपका नाम', 'Tu nombre', 'اسمك', 'Votre nom', 'আপনার নাম', 'Seu nome', 'Ваше имя', 'آپ کا نام', '你個名', 'Nama Anda'],
    'Save name': ['保存名字', 'नाम सहेजें', 'Guardar nombre', 'حفظ الاسم', 'Enregistrer le nom', 'নাম সংরক্ষণ', 'Salvar nome', 'Сохранить имя', 'نام محفوظ کریں', '儲存名', 'Simpan nama'],
    'Email': ['邮箱', 'ईमेल', 'Correo', 'البريد الإلكتروني', 'E-mail', 'ইমেল', 'E-mail', 'Почта', 'ای میل', '電郵', 'Email'],
    'New email': ['新邮箱', 'नया ईमेल', 'Correo nuevo', 'البريد الجديد', 'Nouvel e-mail', 'নতুন ইমেল', 'Novo e-mail', 'Новая почта', 'نیا ای میل', '新電郵', 'Email baru'],
    'Change email': ['更改邮箱', 'ईमेल बदलें', 'Cambiar correo', 'تغيير البريد', "Modifier l'e-mail", 'ইমেল পরিবর্তন', 'Alterar e-mail', 'Сменить почту', 'ای میل تبدیل کریں', '更改電郵', 'Ubah email'],
    'Password': ['密码', 'पासवर्ड', 'Contraseña', 'كلمة المرور', 'Mot de passe', 'পাসওয়ার্ড', 'Senha', 'Пароль', 'پاس ورڈ', '密碼', 'Kata sandi'],
    'Your password': ['你的密码', 'आपका पासवर्ड', 'Tu contraseña', 'كلمة مرورك', 'Votre mot de passe', 'আপনার পাসওয়ার্ড', 'Sua senha', 'Ваш пароль', 'آپ کا پاس ورڈ', '你嘅密碼', 'Kata sandi Anda'],
    'Current password': ['当前密码', 'मौजूदा पासवर्ड', 'Contraseña actual', 'كلمة المرور الحالية', 'Mot de passe actuel', 'বর্তমান পাসওয়ার্ড', 'Senha atual', 'Текущий пароль', 'موجودہ پاس ورڈ', '而家嘅密碼', 'Kata sandi saat ini'],
    'New password': ['新密码', 'नया पासवर्ड', 'Contraseña nueva', 'كلمة المرور الجديدة', 'Nouveau mot de passe', 'নতুন পাসওয়ার্ড', 'Nova senha', 'Новый пароль', 'نیا پاس ورڈ', '新密碼', 'Kata sandi baru'],
    'New password again': ['再次输入新密码', 'नया पासवर्ड फिर से', 'Repite la contraseña nueva', 'كلمة المرور الجديدة مرة أخرى', 'Nouveau mot de passe, encore', 'আবার নতুন পাসওয়ার্ড', 'Nova senha de novo', 'Новый пароль ещё раз', 'نیا پاس ورڈ دوبارہ', '再輸入新密碼', 'Ulangi kata sandi baru'],
    'Change password': ['更改密码', 'पासवर्ड बदलें', 'Cambiar contraseña', 'تغيير كلمة المرور', 'Modifier le mot de passe', 'পাসওয়ার্ড পরিবর্তন', 'Alterar senha', 'Сменить пароль', 'پاس ورڈ تبدیل کریں', '更改密碼', 'Ubah kata sandi'],
    'Choose a new password': ['设置新密码', 'नया पासवर्ड चुनें', 'Elige una contraseña nueva', 'اختر كلمة مرور جديدة', 'Choisissez un nouveau mot de passe', 'নতুন পাসওয়ার্ড বেছে নিন', 'Escolha uma nova senha', 'Придумайте новый пароль', 'نیا پاس ورڈ چنیں', '揀個新密碼', 'Pilih kata sandi baru'],
    'Send code': ['发送验证码', 'कोड भेजें', 'Enviar código', 'إرسال الرمز', 'Envoyer le code', 'কোড পাঠান', 'Enviar código', 'Отправить код', 'کوڈ بھیجیں', '發送代碼', 'Kirim kode'],
    'Send a new code': ['重新发送验证码', 'नया कोड भेजें', 'Enviar un código nuevo', 'إرسال رمز جديد', 'Envoyer un nouveau code', 'নতুন কোড পাঠান', 'Enviar um novo código', 'Отправить новый код', 'نیا کوڈ بھیجیں', '再發送新代碼', 'Kirim kode baru'],
    'Send the link again': ['重新发送链接', 'लिंक फिर से भेजें', 'Enviar el enlace de nuevo', 'إعادة إرسال الرابط', 'Renvoyer le lien', 'লিংক আবার পাঠান', 'Reenviar o link', 'Отправить ссылку снова', 'لنک دوبارہ بھیجیں', '再發送連結', 'Kirim ulang tautan'],
    '6-digit code': ['6 位验证码', '6 अंकों का कोड', 'Código de 6 dígitos', 'رمز من 6 أرقام', 'Code à 6 chiffres', '৬ অঙ্কের কোড', 'Código de 6 dígitos', '6-значный код', '6 ہندسوں کا کوڈ', '6 位代碼', 'Kode 6 digit'],
    'Public events near me': ['我附近的公开活动', 'मेरे पास के सार्वजनिक इवेंट', 'Eventos públicos cerca de mí', 'الفعاليات العامة بالقرب مني', 'Événements publics près de moi', 'আমার কাছের পাবলিক ইভেন্ট', 'Eventos públicos perto de mim', 'Открытые события рядом', 'میرے قریب عوامی ایونٹس', '我附近嘅公開活動', 'Acara publik di dekat saya'],
    'Activity on my public albums': ['我的公开相册动态', 'मेरे सार्वजनिक एल्बम पर गतिविधि', 'Actividad en mis álbumes públicos', 'النشاط في ألبوماتي العامة', 'Activité sur mes albums publics', 'আমার পাবলিক অ্যালবামে কার্যকলাপ', 'Atividade nos meus álbuns públicos', 'Активность в моих открытых альбомах', 'میرے عوامی البمز پر سرگرمی', '我公開相簿嘅動態', 'Aktivitas di album publik saya'],
    'Permissions on this device': ['此设备上的权限', 'इस डिवाइस पर अनुमतियाँ', 'Permisos en este dispositivo', 'الأذونات على هذا الجهاز', 'Autorisations sur cet appareil', 'এই ডিভাইসে অনুমতি', 'Permissões neste aparelho', 'Разрешения на этом устройстве', 'اس آلے پر اجازتیں', '呢部機嘅權限', 'Izin di perangkat ini'],
    'Camera': ['相机', 'कैमरा', 'Cámara', 'الكاميرا', 'Appareil photo', 'ক্যামেরা', 'Câmera', 'Камера', 'کیمرہ', '相機', 'Kamera'],
    'Location': ['位置', 'लोकेशन', 'Ubicación', 'الموقع', 'Position', 'লোকেশন', 'Localização', 'Геопозиция', 'مقام', '位置', 'Lokasi'],
    'Taking photos and scanning QR codes': ['拍照和扫描二维码', 'फ़ोटो लेना और QR कोड स्कैन करना', 'Hacer fotos y escanear códigos QR', 'التقاط الصور ومسح رموز QR', 'Prendre des photos et scanner des codes QR', 'ছবি তোলা ও QR কোড স্ক্যান করা', 'Tirar fotos e ler códigos QR', 'Съёмка фото и сканирование QR-кодов', 'تصاویر لینا اور QR کوڈ اسکین کرنا', '影相同掃二維碼', 'Mengambil foto dan memindai kode QR'],
    'Alerts for public events near you': ['你附近公开活动的提醒', 'आपके पास के सार्वजनिक इवेंट के अलर्ट', 'Alertas de eventos públicos cerca de ti', 'تنبيهات للفعاليات العامة بالقرب منك', 'Alertes pour les événements publics près de vous', 'আপনার কাছের পাবলিক ইভেন্টের সতর্কতা', 'Alertas de eventos públicos perto de você', 'Оповещения об открытых событиях рядом', 'آپ کے قریب عوامی ایونٹس کے الرٹس', '你附近公開活動嘅提示', 'Peringatan untuk acara publik di dekat Anda'],
    'Allowed': ['已允许', 'अनुमति है', 'Permitido', 'مسموح', 'Autorisé', 'অনুমতি আছে', 'Permitido', 'Разрешено', 'اجازت ہے', '已允許', 'Diizinkan'],
    'Blocked': ['已阻止', 'ब्लॉक है', 'Bloqueado', 'محظور', 'Bloqué', 'ব্লক করা', 'Bloqueado', 'Заблокировано', 'بلاک ہے', '已封鎖', 'Diblokir'],
    'Not asked yet': ['尚未询问', 'अभी पूछा नहीं गया', 'Aún no se ha pedido', 'لم يُطلب بعد', 'Pas encore demandé', 'এখনও চাওয়া হয়নি', 'Ainda não pedido', 'Ещё не запрашивалось', 'ابھی پوچھا نہیں گیا', '未問過', 'Belum diminta'],
    'Not available in this browser': ['此浏览器不支持', 'इस ब्राउज़र में उपलब्ध नहीं', 'No disponible en este navegador', 'غير متاح في هذا المتصفح', 'Indisponible dans ce navigateur', 'এই ব্রাউজারে নেই', 'Indisponível neste navegador', 'Недоступно в этом браузере', 'اس براؤزر میں دستیاب نہیں', '呢個瀏覽器用唔到', 'Tidak tersedia di browser ini'],
    'Checking you’re at the event, finding events nearby': ['确认你在活动现场，查找附近的活动', 'यह जाँचना कि आप इवेंट पर हैं, पास के इवेंट ढूँढना', 'Comprobar que estás en el evento y buscar eventos cercanos', 'التحقق من وجودك في الفعالية والعثور على فعاليات قريبة', "Vérifier que vous êtes à l'événement, trouver des événements proches", 'আপনি ইভেন্টে আছেন কিনা যাচাই, কাছের ইভেন্ট খোঁজা', 'Confirmar que você está no evento e achar eventos por perto', 'Проверка, что вы на событии, и поиск событий рядом', 'یہ جانچنا کہ آپ ایونٹ پر ہیں، قریبی ایونٹس تلاش کرنا', '確認你喺活動現場，搵附近嘅活動', 'Memastikan Anda di lokasi acara, mencari acara terdekat'],
    'Tells me when I’m inside a public event’s zone. Needs location': ['当我进入公开活动区域时提醒我。需要位置权限', 'जब मैं किसी सार्वजनिक इवेंट के ज़ोन में होता हूँ तो बताता है। लोकेशन चाहिए', 'Me avisa cuando estoy en la zona de un evento público. Necesita ubicación', 'ينبهني عندما أكون داخل منطقة فعالية عامة. يتطلب الموقع', "Me prévient quand je suis dans la zone d'un événement public. Nécessite la position", 'পাবলিক ইভেন্টের জোনে থাকলে জানায়। লোকেশন লাগবে', 'Avisa quando estou na área de um evento público. Precisa da localização', 'Сообщает, когда я в зоне открытого события. Нужна геопозиция', 'جب میں کسی عوامی ایونٹ کے زون میں ہوں تو بتاتا ہے۔ مقام درکار ہے', '我入咗公開活動範圍就通知我。要用位置', 'Memberi tahu saat saya berada di zona acara publik. Perlu lokasi'],
    'A small dot when someone joins or adds photos. Never a pop-up': ['有人加入或添加照片时显示一个小圆点，不会弹窗', 'कोई जुड़ने या फ़ोटो जोड़ने पर एक छोटा बिंदु। कभी पॉप-अप नहीं', 'Un puntito cuando alguien se une o añade fotos. Nunca una ventana emergente', 'نقطة صغيرة عندما ينضم أحد أو يضيف صورًا. بلا نوافذ منبثقة', "Un petit point quand quelqu'un rejoint ou ajoute des photos. Jamais de pop-up", 'কেউ যোগ দিলে বা ছবি যোগ করলে একটি ছোট বিন্দু। কখনো পপ-আপ নয়', 'Um pontinho quando alguém entra ou adiciona fotos. Nunca um pop-up', 'Маленькая точка, когда кто-то присоединяется или добавляет фото. Без всплывающих окон', 'کوئی شامل ہو یا تصاویر جوڑے تو ایک چھوٹا نقطہ۔ کبھی پاپ اپ نہیں', '有人加入或者加相就出一個小點，唔會彈窗', 'Titik kecil saat seseorang bergabung atau menambah foto. Tanpa pop-up'],
    'Event alerts are saved on this device. Activity follows your account.': ['活动提醒保存在此设备上，动态设置跟随你的账户。', 'इवेंट अलर्ट इस डिवाइस पर सहेजे जाते हैं। गतिविधि आपके खाते के साथ रहती है।', 'Las alertas de eventos se guardan en este dispositivo. La actividad va con tu cuenta.', 'تُحفظ تنبيهات الفعاليات على هذا الجهاز. ويتبع النشاط حسابك.', "Les alertes d'événements sont enregistrées sur cet appareil. L'activité suit votre compte.", 'ইভেন্ট সতর্কতা এই ডিভাইসে সংরক্ষিত থাকে। কার্যকলাপ আপনার অ্যাকাউন্টের সাথে থাকে।', 'Os alertas de eventos ficam neste aparelho. A atividade acompanha sua conta.', 'Оповещения о событиях хранятся на этом устройстве. Активность привязана к аккаунту.', 'ایونٹ الرٹس اس آلے پر محفوظ ہوتے ہیں۔ سرگرمی آپ کے اکاؤنٹ کے ساتھ رہتی ہے۔', '活動提示儲存喺呢部機。動態跟你嘅帳戶。', 'Peringatan acara disimpan di perangkat ini. Aktivitas mengikuti akun Anda.'],
    'Space on this device': ['此设备上的空间', 'इस डिवाइस पर जगह', 'Espacio en este dispositivo', 'المساحة على هذا الجهاز', 'Espace sur cet appareil', 'এই ডিভাইসে জায়গা', 'Espaço neste aparelho', 'Место на этом устройстве', 'اس آلے پر جگہ', '呢部機嘅空間', 'Ruang di perangkat ini'],
    'Free up space': ['释放空间', 'जगह खाली करें', 'Liberar espacio', 'إخلاء مساحة', "Libérer de l'espace", 'জায়গা খালি করুন', 'Liberar espaço', 'Освободить место', 'جگہ خالی کریں', '釋放空間', 'Kosongkan ruang'],
    'Delete my account': ['删除我的账户', 'मेरा खाता हटाएँ', 'Eliminar mi cuenta', 'حذف حسابي', 'Supprimer mon compte', 'আমার অ্যাকাউন্ট মুছুন', 'Excluir minha conta', 'Удалить мой аккаунт', 'میرا اکاؤنٹ حذف کریں', '刪除我嘅帳戶', 'Hapus akun saya'],
    'Your password, to confirm': ['输入密码以确认', 'पुष्टि के लिए आपका पासवर्ड', 'Tu contraseña, para confirmar', 'كلمة مرورك للتأكيد', 'Votre mot de passe, pour confirmer', 'নিশ্চিত করতে আপনার পাসওয়ার্ড', 'Sua senha, para confirmar', 'Ваш пароль для подтверждения', 'تصدیق کے لیے آپ کا پاس ورڈ', '輸入密碼確認', 'Kata sandi Anda, untuk konfirmasi'],

    // ---- Social and joining ----
    'Join album': ['加入相册', 'एल्बम से जुड़ें', 'Unirse al álbum', 'انضم إلى الألبوم', "Rejoindre l'album", 'অ্যালবামে যোগ দিন', 'Entrar no álbum', 'Присоединиться', 'البم میں شامل ہوں', '加入相簿', 'Gabung ke album'],
    'Or scan the host’s QR code': ['或扫描主办人的二维码', 'या होस्ट का QR कोड स्कैन करें', 'O escanea el código QR del anfitrión', 'أو امسح رمز QR الخاص بالمضيف', "Ou scannez le code QR de l'organisateur", 'অথবা আয়োজকের QR কোড স্ক্যান করুন', 'Ou leia o código QR do anfitrião', 'Или отсканируйте QR-код организатора', 'یا میزبان کا QR کوڈ اسکین کریں', '或者掃主辦人嘅二維碼', 'Atau pindai kode QR penyelenggara'],
    'Scan a QR code': ['扫描二维码', 'QR कोड स्कैन करें', 'Escanear un código QR', 'امسح رمز QR', 'Scanner un code QR', 'QR কোড স্ক্যান করুন', 'Ler um código QR', 'Сканировать QR-код', 'QR کوڈ اسکین کریں', '掃二維碼', 'Pindai kode QR'],
    'Your join requests': ['你的加入申请', 'आपके जुड़ने के अनुरोध', 'Tus solicitudes para unirte', 'طلبات الانضمام الخاصة بك', "Vos demandes d'adhésion", 'আপনার যোগদানের অনুরোধ', 'Seus pedidos de entrada', 'Ваши заявки', 'آپ کی شمولیت کی درخواستیں', '你嘅加入申請', 'Permintaan bergabung Anda'],
    'Your groups': ['你的群组', 'आपके समूह', 'Tus grupos', 'مجموعاتك', 'Vos groupes', 'আপনার গ্রুপ', 'Seus grupos', 'Ваши группы', 'آپ کے گروپس', '你嘅群組', 'Grup Anda'],
    'Make a group': ['创建群组', 'समूह बनाएँ', 'Crear un grupo', 'أنشئ مجموعة', 'Créer un groupe', 'গ্রুপ বানান', 'Criar um grupo', 'Создать группу', 'گروپ بنائیں', '開群組', 'Buat grup'],
    'New group': ['新建群组', 'नया समूह', 'Nuevo grupo', 'مجموعة جديدة', 'Nouveau groupe', 'নতুন গ্রুপ', 'Novo grupo', 'Новая группа', 'نیا گروپ', '新群組', 'Grup baru'],
    'Join group': ['加入群组', 'समूह से जुड़ें', 'Unirse al grupo', 'انضم إلى المجموعة', 'Rejoindre le groupe', 'গ্রুপে যোগ দিন', 'Entrar no grupo', 'Вступить в группу', 'گروپ میں شامل ہوں', '加入群組', 'Gabung ke grup'],
    'Leave group': ['退出群组', 'समूह छोड़ें', 'Salir del grupo', 'مغادرة المجموعة', 'Quitter le groupe', 'গ্রুপ ছাড়ুন', 'Sair do grupo', 'Покинуть группу', 'گروپ چھوڑیں', '退出群組', 'Keluar dari grup'],
    'Rename group': ['重命名群组', 'समूह का नाम बदलें', 'Cambiar nombre del grupo', 'إعادة تسمية المجموعة', 'Renommer le groupe', 'গ্রুপের নাম বদলান', 'Renomear grupo', 'Переименовать группу', 'گروپ کا نام بدلیں', '改群組名', 'Ganti nama grup'],
    'Delete group': ['删除群组', 'समूह हटाएँ', 'Eliminar grupo', 'حذف المجموعة', 'Supprimer le groupe', 'গ্রুপ মুছুন', 'Excluir grupo', 'Удалить группу', 'گروپ حذف کریں', '刪除群組', 'Hapus grup'],
    'Decline': ['拒绝', 'अस्वीकार करें', 'Rechazar', 'رفض', 'Refuser', 'প্রত্যাখ্যান', 'Recusar', 'Отклонить', 'مسترد کریں', '拒絕', 'Tolak'],

    // ---- Support and sign-in ----
    'How can we help?': ['需要什么帮助？', 'हम कैसे मदद कर सकते हैं?', '¿Cómo podemos ayudarte?', 'كيف يمكننا المساعدة؟', 'Comment pouvons-nous vous aider ?', 'আমরা কীভাবে সাহায্য করতে পারি?', 'Como podemos ajudar?', 'Чем можем помочь?', 'ہم کیسے مدد کر سکتے ہیں؟', '有咩可以幫你？', 'Ada yang bisa kami bantu?'],
    'Quick answers': ['快速解答', 'झटपट जवाब', 'Respuestas rápidas', 'إجابات سريعة', 'Réponses rapides', 'দ্রুত উত্তর', 'Respostas rápidas', 'Быстрые ответы', 'فوری جوابات', '快速解答', 'Jawaban cepat'],
    'Questions': ['问题', 'सवाल', 'Preguntas', 'الأسئلة', 'Questions', 'প্রশ্ন', 'Perguntas', 'Вопросы', 'سوالات', '問題', 'Pertanyaan'],
    'Send us a message': ['给我们留言', 'हमें संदेश भेजें', 'Envíanos un mensaje', 'أرسل لنا رسالة', 'Envoyez-nous un message', 'আমাদের বার্তা পাঠান', 'Envie uma mensagem', 'Напишите нам', 'ہمیں پیغام بھیجیں', '傳訊息畀我哋', 'Kirimi kami pesan'],
    'Your message': ['你的留言', 'आपका संदेश', 'Tu mensaje', 'رسالتك', 'Votre message', 'আপনার বার্তা', 'Sua mensagem', 'Ваше сообщение', 'آپ کا پیغام', '你嘅訊息', 'Pesan Anda'],
    'Send message': ['发送', 'संदेश भेजें', 'Enviar mensaje', 'إرسال الرسالة', 'Envoyer le message', 'বার্তা পাঠান', 'Enviar mensagem', 'Отправить', 'پیغام بھیجیں', '發送訊息', 'Kirim pesan'],
    'Message sent': ['已发送', 'संदेश भेज दिया गया', 'Mensaje enviado', 'تم إرسال الرسالة', 'Message envoyé', 'বার্তা পাঠানো হয়েছে', 'Mensagem enviada', 'Сообщение отправлено', 'پیغام بھیج دیا گیا', '訊息已發送', 'Pesan terkirim'],
    'Create your account': ['创建你的账户', 'अपना खाता बनाएँ', 'Crea tu cuenta', 'أنشئ حسابك', 'Créez votre compte', 'আপনার অ্যাকাউন্ট তৈরি করুন', 'Crie sua conta', 'Создайте аккаунт', 'اپنا اکاؤنٹ بنائیں', '建立你嘅帳戶', 'Buat akun Anda'],
    'Create account': ['创建账户', 'खाता बनाएँ', 'Crear cuenta', 'إنشاء حساب', 'Créer un compte', 'অ্যাকাউন্ট তৈরি', 'Criar conta', 'Создать аккаунт', 'اکاؤنٹ بنائیں', '建立帳戶', 'Buat akun'],
    'Continue with Google': ['使用 Google 继续', 'Google से जारी रखें', 'Continuar con Google', 'المتابعة باستخدام Google', 'Continuer avec Google', 'Google দিয়ে চালিয়ে যান', 'Continuar com o Google', 'Продолжить с Google', 'Google کے ساتھ جاری رکھیں', '用 Google 繼續', 'Lanjutkan dengan Google'],
    'or use your email': ['或使用邮箱', 'या अपना ईमेल इस्तेमाल करें', 'o usa tu correo', 'أو استخدم بريدك الإلكتروني', 'ou utilisez votre e-mail', 'অথবা আপনার ইমেল ব্যবহার করুন', 'ou use seu e-mail', 'или используйте почту', 'یا اپنا ای میل استعمال کریں', '或者用電郵', 'atau gunakan email Anda'],
    'Forgot your password?': ['忘记密码？', 'पासवर्ड भूल गए?', '¿Olvidaste tu contraseña?', 'هل نسيت كلمة المرور؟', 'Mot de passe oublié ?', 'পাসওয়ার্ড ভুলে গেছেন?', 'Esqueceu sua senha?', 'Забыли пароль?', 'پاس ورڈ بھول گئے؟', '唔記得密碼？', 'Lupa kata sandi?'],
  };
  // "On" / "Off" next to switches are drawn by CSS; it reads these two variables when they're set
  const ONOFF = { zh: ['开', '关'], hi: ['चालू', 'बंद'], es: ['Sí', 'No'], ar: ['تشغيل', 'إيقاف'], fr: ['Oui', 'Non'], bn: ['চালু', 'বন্ধ'],
    pt: ['Sim', 'Não'], ru: ['Вкл', 'Выкл'], ur: ['آن', 'آف'], yue: ['開', '關'], id: ['Aktif', 'Mati'] }[lang];
  if (ONOFF) { document.documentElement.style.setProperty('--t-on', JSON.stringify(ONOFF[0])); document.documentElement.style.setProperty('--t-off', JSON.stringify(ONOFF[1])); }

  // Dates the scripts write in English ("24 October", "Tue 19 Nov, 21:00") come out in this language instead,
  // keeping Western digits so the number placeholders below still match
  const LOC = LANGS[idx].html + '-u-nu-latn';
  for (const name of ['toLocaleDateString', 'toLocaleString', 'toLocaleTimeString']) {
    const orig = Date.prototype[name];
    Date.prototype[name] = function (locales, options) { return orig.call(this, !locales || /^en\b/.test(String(locales)) ? LOC : locales, options); };
  }

  /* Longer copy (page text, help, messages) lives in one file per language, assets/i18n/<code>.js, so a
     visitor only downloads their own language. Those files call Momento.i18n.add({ 'English': 'Translation' }).
     Keys can use three kinds of placeholder:
       %1, %2 …  numbers, in the order they appear in the English ("%1 photos from %2 guests")
       {0}, {1} … the tags inside a sentence, in order (a line break, a <b>, a link): "Only the people{0}who were
                  there". Each tag is kept as it is and moved to wherever its {n} sits in the translation; the
                  text inside it is translated on its own.
       $1, $2 …  any other words the page fills in (a name, an email, a date): "Album found: $1. Joining…".
                  Keep these few; every one is tried against text that matched nothing else. */
  const X = {}, PAT = [];
  const esc = (s) => s.replace(/[.*+?^()|[\]\\{}]/g, '\\$&');
  M.i18n.add = (o) => {
    for (const [k, v] of Object.entries(o)) {
      if (/\$\d/.test(k)) PAT.push([new RegExp('^' + esc(k).replace(/\\?\$(\d)/g, '(?<v$1>.+?)') + '$'), v]);
      else X[k] = v;
    }
  };
  const base = (document.currentScript?.src || 'assets/i18n.js').replace(/i18n\.js(\?.*)?$/, '');
  document.write(`<script src="${base}i18n/${lang}.js"><\/script>`);

  /* Scripts that are taller than Latin text. The pages are tuned for Latin letters: button labels roll inside a
     1.3em window and big headings sit at a line-height near 1, so Arabic and Urdu dots, and Hindi and Bengali marks
     above the line, poke out of the window or collide with the next line. */
  const TALL = { ar: 1.85, ur: 2, hi: 1.6, bn: 1.6 }[lang];
  const RTL = lang === 'ar' || lang === 'ur';
  if (TALL) {
    document.write(`<style id="i18n-script-fit">
      .btn-label, .roll > span { height: ${TALL}em !important; }
      h1, h2, h3, h4 { line-height: ${RTL ? 1.45 : 1.3} !important; padding-block: .06em; }
      p, li, small, label, summary, dd, figcaption { line-height: ${RTL ? 1.9 : 1.75}; }
    </style>`);
  }
  // Arabic and Urdu sentences read right to left. The layout stays as it is, so each translated sentence is wrapped
  // in a right-to-left embedding: names and numbers inside it land in the right place, its box doesn't move.
  const RLE = '‫', PDF = '‬';
  const embed = (t) => (RTL && !t.startsWith(RLE) ? RLE + t + PDF : t);

  // Testing: ?i18n-audit lists every string the page shows that has no translation, in <html data-i18n-missing>
  const audit = /[?&]i18n-audit\b/.test(location.search) ? new Set() : null;
  const miss = (s) => { if (audit && /[A-Za-z]{2}/.test(s)) audit.add(s); };
  const done = new Set();   // what we've written, so the audit doesn't list our own translations

  const col = idx - 1;
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const find = (k) => { const row = D[k]; return row ? row[col] : X[k] ?? null; };
  // Whole string in, translated string out (same surrounding spaces), or null when there's no entry
  function lookup(s, depth = 0) {
    const raw = s.replace(/\r\n?/g, '\n').replace(/[‫‬]/g, '').trim();
    if (!raw) return null;
    const key = norm(raw);
    let t = find(raw) ?? find(key);
    if (t === null && raw.includes('\n')) {            // data-text="line one&#10;line two"
      const v = find(raw.split('\n').map(norm).join('{0}'));
      if (v !== null) t = v.replace('{0}', '\n');
    }
    if (t === null) {                                  // numbers: "18 photos from 9 guests"
      const nums = [];
      const k = key.replace(/\{\d+\}|\d+(?:[.,:]\d+)*/g, (n) => (n[0] === '{' ? n : '%' + nums.push(n)));
      if (nums.length) { const v = find(k); if (v !== null) t = v.replace(/%(\d)/g, (_, i) => nums[i - 1] ?? ''); }
    }
    if (t === null) {                                  // filled-in words: "Album found: AB12CD. Joining…"
      for (const [re, v] of PAT) { const m = key.match(re); if (m) { t = v.replace(/\$(\d)/g, (_, i) => { const w = m.groups['v' + i] ?? ''; return (depth < 2 && lookup(w, depth + 1)?.trim()) || w; }); break; } }
    }
    if (t === null) { if (!depth && !done.has(key)) miss(key); return null; }
    if (audit) [t, ...t.split(/\{\d+\}/)].forEach((p) => done.add(norm(p)));
    const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0];
    return lead + t + (trail === s ? '' : trail);
  }
  M.i18n.t = (s) => lookup(String(s)) ?? s;

  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'NOSCRIPT']);
  const INLINE = new Set(['B', 'STRONG', 'EM', 'I', 'SPAN', 'A', 'BR', 'SMALL', 'MARK', 'TIME', 'ABBR', 'SUP', 'SUB', 'U', 'S', 'BDI', 'OUTPUT', 'LABEL', 'BUTTON']);
  const ATTRS = ['aria-label', 'placeholder', 'title', 'data-text'];
  const skipped = (el) => !el || SKIP.has(el.nodeName) || el.closest?.('[data-no-i18n], [contenteditable="true"]');
  // A sentence broken up by tags: "<b>4</b> of <b>9</b> guests can join" is looked up as "{0} of {1} guests can join"
  function doMixed(el) {
    if (el.nodeType !== 1 || skipped(el)) return false;
    const kids = [...el.childNodes];
    let words = false, tags = 0, tpl = '';
    for (const n of kids) {
      if (n.nodeType === 3) { tpl += n.nodeValue; if (/\p{L}/u.test(n.nodeValue)) words = true; }
      else if (n.nodeType === 1) {
        // Only plain inline tags (a name, a line break, a slot a script fills in later); an icon or a block
        // inside means it isn't one sentence
        if (!INLINE.has(n.nodeName) || n.querySelector('div,p,ul,ol,li,svg,img,button,input,h1,h2,h3,h4')) return false;
        tpl += `{${tags++}}`;
      } else if (n.nodeType !== 8) return false;
    }
    if (!tags || !words) return false;
    const t = lookup(tpl.replace(/\s+/g, ' '));
    if (t === null) return false;
    const els = kids.filter((n) => n.nodeType === 1), used = new Set(), out = [];
    for (const part of t.trim().split(/(\{\d+\})/)) {
      const m = part.match(/^\{(\d+)\}$/);
      if (m && els[m[1]]) { out.push(els[m[1]]); used.add(+m[1]); }
      else if (part) out.push(document.createTextNode(part));
    }
    els.forEach((e, i) => { if (!used.has(i)) out.push(e); });
    if (RTL) { out.unshift(document.createTextNode(RLE)); out.push(document.createTextNode(PDF)); }
    // Already in this form (a phrase whose translation reads the same, or one done before): leave it. Replacing
    // it anyway is a change the observer below sees, which runs this again, and the page never settles
    const shape = (list) => list.filter((n) => n.nodeType !== 8).map((n) => (n.nodeType === 3 ? n.nodeValue : ' ' + els.indexOf(n))).join('');
    if (shape(out) === shape(kids)) return false;
    el.replaceChildren(...out);
    return true;
  }
  function doText(node) {
    if (skipped(node.parentElement)) return;
    const next = lookup(node.nodeValue);
    if (next === null) return;
    const v = RTL ? next.replace(/^(\s*)([\s\S]*?)(\s*)$/, (_, a, t, b) => a + embed(t) + b) : next;
    if (v !== node.nodeValue) node.nodeValue = v;
  }
  function doAttrs(el) {
    if (SKIP.has(el.nodeName) || el.closest('[data-no-i18n]')) return;
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (!v) continue;
      const next = lookup(v);
      if (next !== null && next !== v) el.setAttribute(a, next);
    }
  }
  function walk(root) {
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1) return;
    if (SKIP.has(root.nodeName)) { doAttrs(root); return; }
    const els = [root, ...root.querySelectorAll('*')];
    els.forEach((el) => { doAttrs(el); if (!SKIP.has(el.nodeName)) doMixed(el); });
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) doText(n);
  }
  // Page text as the parser adds it, and whatever the scripts add or rewrite later
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') { if (!doMixed(r.target.parentElement || {})) doText(r.target); }
      else if (r.type === 'attributes') doAttrs(r.target);
      else { if (!doMixed(r.target)) doMixed(r.target.parentElement || {}); r.addedNodes.forEach(walk); }
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  // The title in the tab: "My albums | Momento"
  const title = () => {
    const whole = lookup(document.title);
    if (whole !== null) { document.title = whole; return; }
    const [head, ...rest] = document.title.split(' | '); const t = lookup(head); if (t !== null) document.title = [t, ...rest].join(' | ');
  };
  document.addEventListener('DOMContentLoaded', () => {
    walk(document.body); title();
    if (audit) setTimeout(() => { walk(document.body); document.documentElement.dataset.i18nMissing = JSON.stringify([...audit]); }, 2500);
    // Widths measured before the swap (sliding pills, centred strips) re-measure on resize
    requestAnimationFrame(() => dispatchEvent(new Event('resize')));
  });
})();
