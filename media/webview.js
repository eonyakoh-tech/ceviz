// @ts-nocheck
console.log("CEVIZ: webview script loaded");

// ── i18n ────────────────────────────────────────────────────────────────────
const I18N = {
    ko: {
        brand:"🌰 나만의 AI",connecting:"연결 중...",connectedOllama:"PN40 연결됨 · Ollama ✓",
        connected:"PN40 연결됨",offline:"서버 연결 안됨",sessions:"세션",thinking:"생각 중...",
        inputPh:"무엇을 만들어 드릴까요?",inputPhEn:"모든 언어로 입력하세요 — 영어 튜터 활성",
        offlineBanner:"📡 서버 오프라인 — 캐시 응답 사용 중",reconnected:"✅ 서버 연결 복구됨",
        tabSoti:"🎛️ Soti",tabSkill:"⚡ Skill",
        skillAll:"전체",skillGame:"🎮 게임",skillDoc:"📄 문서",skillCode:"💻 코드",
        skillResearch:"🔍 리서치",skillMedia:"🎬 미디어",
        skillNew:"+ 추가",skillImport:"↓ 가져오기",skillExport:"↑ 내보내기",
        skillEmpty:"⚡ 스킬이 없습니다\n+ 추가 버튼으로 만들어보세요",
        skillFormNew:"새 스킬",skillFormEdit:"스킬 편집",
        labelName:"스킬 이름",labelCat:"카테고리",labelDesc:"설명",
        labelTags:"태그 (쉼표로 구분)",labelPrompt:"AI 프롬프트 템플릿",
        phName:"예: 게임 시나리오 작가",phDesc:"이 스킬이 하는 일을 간단히 설명",
        phTags:"예: 게임, 스토리, 시나리오",phPrompt:"AI에게 전달할 시스템 프롬프트...",
        cancel:"취소",save:"저장",
        newChat:"＋ 새 채팅",continueIn:"계속하기",
        modeLocal:"Local",modeCopilot:"Claude CLI",modeCloud:"Cloud",modeHybrid:"Hybrid",
        vaultTitle:"🧠 지식 신경망",vaultCfg:"경로 변경",
        vaultSearchPh:"🔍 노트 검색...",vaultBtn:"검색",vaultEmpty:"검색어를 입력하세요",
        vaultLoading:"로드 중...",
        projChange:"전환 ▸",projModalTitle:"📁 프로젝트",projNewPh:"새 프로젝트 이름...",projCreate:"+ 생성",
        orchRun:"▶ 오케스트레이션 실행",orchStop:"■ Stop",orchAdd:"＋ 에이전트 추가",
        orchDesc:"멀티 에이전트 팀 구성 계획을 입력하면 실시간으로 오케스트레이션합니다.",
        tokenLabel:"🔢 토큰 사용량:",
        ttlProject:"프로젝트 관리",ttlBrain:"지식 신경망 동기화",ttlSoti:"Soti-Skill 대시보드",
        ttlSkillBtn:"Skill CRUD",ttlSettings:"AI 엔진 설정",ttlEnglish:"영어 튜터 모드",
        ttlLang:"언어 선택",ttlMic:"음성 입력 (한국어/영어)",ttlStop:"전송 취소 (Stop)",
        ttlEvo:"자기 개발 시스템",evoTitle:"📈 CEVIZ 자기 개발 시스템",evoHistLabel:"📋 개발 이력",
        ttlHelp:"사용 설명서",helpTitle:"📖 CEVIZ 사용 설명서",helpSearch:"섹션 검색... (Ctrl+F)",helpClose:"닫기",
        helpSecs:["🚀 시작하기","⭐ 주요 기능","💬 채팅 모드","📈 자기 개발","📡 RSS Feed","📄 기술 백서","🔧 모델 관리","🧠 Vault 연동","⌨️ 단축키","❓ FAQ","🔨 트러블슈팅","🖥️ 환경 정보"],
        langSelectTitle:"언어 선택",langSelectHint:"사용할 언어를 선택하세요",langSave:"확인",
    },
    en: {
        brand:"🌰 My AI",connecting:"Connecting...",connectedOllama:"PN40 Connected · Ollama ✓",
        connected:"PN40 Connected",offline:"Server offline",sessions:"Sessions",thinking:"Thinking...",
        inputPh:"What can I create for you?",inputPhEn:"Type in any language — English tutor active",
        offlineBanner:"📡 Server offline — using cached response",reconnected:"✅ Server connection restored",
        tabSoti:"🎛️ Soti",tabSkill:"⚡ Skill",
        skillAll:"All",skillGame:"🎮 Game",skillDoc:"📄 Document",skillCode:"💻 Code",
        skillResearch:"🔍 Research",skillMedia:"🎬 Media",
        skillNew:"+ Add",skillImport:"↓ Import",skillExport:"↑ Export",
        skillEmpty:"⚡ No skills yet\nUse + Add to create one",
        skillFormNew:"New Skill",skillFormEdit:"Edit Skill",
        labelName:"Skill Name",labelCat:"Category",labelDesc:"Description",
        labelTags:"Tags (comma separated)",labelPrompt:"AI Prompt Template",
        phName:"e.g. Game Scenario Writer",phDesc:"Brief description of what this skill does",
        phTags:"e.g. game, story, scenario",phPrompt:"System prompt to send to AI...",
        cancel:"Cancel",save:"Save",
        newChat:"＋ New Chat Session",continueIn:"Continue In",
        modeLocal:"Local",modeCopilot:"Claude CLI",modeCloud:"Cloud",modeHybrid:"Hybrid",
        vaultTitle:"🧠 Knowledge Network",vaultCfg:"Change Path",
        vaultSearchPh:"🔍 Search notes...",vaultBtn:"Search",vaultEmpty:"Enter a search term",
        vaultLoading:"Loading...",
        projChange:"Switch ▸",projModalTitle:"📁 Projects",projNewPh:"New project name...",projCreate:"+ Create",
        orchRun:"▶ Run Orchestration",orchStop:"■ Stop",orchAdd:"＋ Add Agent",
        orchDesc:"Enter a multi-agent team plan to orchestrate in real-time.",
        tokenLabel:"🔢 Token usage:",
        ttlProject:"Manage Projects",ttlBrain:"Sync Knowledge Network",ttlSoti:"Soti-Skill Dashboard",
        ttlSkillBtn:"Skill CRUD",ttlSettings:"AI Engine Settings",ttlEnglish:"English Tutor Mode",
        ttlLang:"Select Language",ttlMic:"Voice Input (KO/EN)",ttlStop:"Cancel (Stop)",
        ttlEvo:"Self-Development System",evoTitle:"📈 CEVIZ Self-Development System",evoHistLabel:"📋 Dev History",
        ttlHelp:"User Manual",helpTitle:"📖 CEVIZ User Manual",helpSearch:"Search sections... (Ctrl+F)",helpClose:"Close",
        helpSecs:["🚀 Getting Started","⭐ Key Features","💬 Chat Modes","📈 Self-Development","📡 RSS Feed","📄 Whitepaper","🔧 Model Mgmt","🧠 Vault","⌨️ Shortcuts","❓ FAQ","🔨 Troubleshoot","🖥️ Environment"],
        langSelectTitle:"Select Language",langSelectHint:"Choose your preferred language",langSave:"Confirm",
    },
    tr: {
        brand:"🌰 AI Yaratıcım",connecting:"Bağlanıyor...",connectedOllama:"PN40 Bağlandı · Ollama ✓",
        connected:"PN40 Bağlandı",offline:"Sunucu bağlantısı yok",sessions:"Oturumlar",thinking:"Düşünüyor...",
        inputPh:"Sizin için ne oluşturabilirim?",inputPhEn:"Herhangi bir dilde yazın — İngilizce öğretmeni aktif",
        offlineBanner:"📡 Sunucu çevrimdışı — önbellek yanıtı kullanılıyor",reconnected:"✅ Sunucu bağlantısı yeniden kuruldu",
        tabSoti:"🎛️ Soti",tabSkill:"⚡ Beceri",
        skillAll:"Tümü",skillGame:"🎮 Oyun",skillDoc:"📄 Belge",skillCode:"💻 Kod",
        skillResearch:"🔍 Araştırma",skillMedia:"🎬 Medya",
        skillNew:"+ Ekle",skillImport:"↓ İçe aktar",skillExport:"↑ Dışa aktar",
        skillEmpty:"⚡ Henüz beceri yok\n+ Ekle ile oluşturun",
        skillFormNew:"Yeni Beceri",skillFormEdit:"Beceriyi Düzenle",
        labelName:"Beceri Adı",labelCat:"Kategori",labelDesc:"Açıklama",
        labelTags:"Etiketler (virgülle ayırın)",labelPrompt:"AI Prompt Şablonu",
        phName:"örn. Oyun Senaryo Yazarı",phDesc:"Bu becerinin ne yaptığını kısaca açıklayın",
        phTags:"örn. oyun, hikaye, senaryo",phPrompt:"AI'ya gönderilecek sistem promptu...",
        cancel:"İptal",save:"Kaydet",
        newChat:"＋ Yeni Sohbet",continueIn:"Devam Et",
        modeLocal:"Yerel",modeCopilot:"Claude CLI",modeCloud:"Bulut",modeHybrid:"Hibrit",
        vaultTitle:"🧠 Bilgi Ağı",vaultCfg:"Yolu Değiştir",
        vaultSearchPh:"🔍 Not ara...",vaultBtn:"Ara",vaultEmpty:"Bir arama terimi girin",
        vaultLoading:"Yükleniyor...",
        projChange:"Geçiş ▸",projModalTitle:"📁 Projeler",projNewPh:"Yeni proje adı...",projCreate:"+ Oluştur",
        orchRun:"▶ Orkestrasyon Başlat",orchStop:"■ Durdur",orchAdd:"＋ Ajan Ekle",
        orchDesc:"Gerçek zamanlı orkestrasyon için çok ajanlı takım planı girin.",
        tokenLabel:"🔢 Token kullanımı:",
        ttlProject:"Projeleri Yönet",ttlBrain:"Bilgi Ağını Senkronize Et",ttlSoti:"Soti-Skill Panosu",
        ttlSkillBtn:"Beceri CRUD",ttlSettings:"AI Motor Ayarları",ttlEnglish:"İngilizce Öğretmeni",
        ttlLang:"Dil Seç",ttlMic:"Sesli Giriş",ttlStop:"İptal (Durdur)",
        ttlEvo:"Kendini Geliştirme Sistemi",evoTitle:"📈 CEVIZ Kendini Geliştirme Sistemi",evoHistLabel:"📋 Geliştirme Geçmişi",
        ttlHelp:"Kullanım Kılavuzu",helpTitle:"📖 CEVIZ Kullanım Kılavuzu",helpSearch:"Bölüm ara... (Ctrl+F)",helpClose:"Kapat",
        helpSecs:["🚀 Başlarken","⭐ Temel Özellikler","💬 Sohbet Modu","📈 Kendini Geliştir","📡 RSS Feed","📄 Teknik Belge","🔧 Model Yönetimi","🧠 Vault","⌨️ Kısayollar","❓ SSS","🔨 Sorun Giderme","🖥️ Ortam Bilgisi"],
        langSelectTitle:"Dil Seçin",langSelectHint:"Tercih ettiğiniz dili seçin",langSave:"Onayla",
    },
    ar: {
        brand:"🌰 إبداعاتي الذكية",connecting:"جارٍ الاتصال...",connectedOllama:"PN40 متصل · Ollama ✓",
        connected:"PN40 متصل",offline:"الخادم غير متصل",sessions:"الجلسات",thinking:"يفكر...",
        inputPh:"ماذا يمكنني أن أصنع لك؟",inputPhEn:"اكتب بأي لغة — المعلم الإنجليزي نشط",
        offlineBanner:"📡 الخادم غير متصل — استخدام الاستجابة المخزنة",reconnected:"✅ تم استعادة اتصال الخادم",
        tabSoti:"🎛️ Soti",tabSkill:"⚡ مهارة",
        skillAll:"الكل",skillGame:"🎮 ألعاب",skillDoc:"📄 وثيقة",skillCode:"💻 كود",
        skillResearch:"🔍 بحث",skillMedia:"🎬 وسائط",
        skillNew:"+ إضافة",skillImport:"↓ استيراد",skillExport:"↑ تصدير",
        skillEmpty:"⚡ لا توجد مهارات بعد\nاستخدم + إضافة لإنشاء واحدة",
        skillFormNew:"مهارة جديدة",skillFormEdit:"تعديل المهارة",
        labelName:"اسم المهارة",labelCat:"الفئة",labelDesc:"الوصف",
        labelTags:"العلامات (مفصولة بفاصلة)",labelPrompt:"قالب موجّه الذكاء الاصطناعي",
        phName:"مثال: كاتب سيناريو ألعاب",phDesc:"وصف موجز لما تفعله هذه المهارة",
        phTags:"مثال: لعبة، قصة، سيناريو",phPrompt:"موجّه النظام للذكاء الاصطناعي...",
        cancel:"إلغاء",save:"حفظ",
        newChat:"＋ محادثة جديدة",continueIn:"المتابعة في",
        modeLocal:"محلي",modeCopilot:"Claude CLI",modeCloud:"سحابي",modeHybrid:"هجين",
        vaultTitle:"🧠 شبكة المعرفة",vaultCfg:"تغيير المسار",
        vaultSearchPh:"🔍 بحث في الملاحظات...",vaultBtn:"بحث",vaultEmpty:"أدخل مصطلح بحث",
        vaultLoading:"جارٍ التحميل...",
        projChange:"تبديل ▸",projModalTitle:"📁 المشاريع",projNewPh:"اسم المشروع الجديد...",projCreate:"+ إنشاء",
        orchRun:"▶ تشغيل التنسيق",orchStop:"■ إيقاف",orchAdd:"＋ إضافة وكيل",
        orchDesc:"أدخل خطة فريق متعدد الوكلاء للتنسيق في الوقت الفعلي.",
        tokenLabel:"🔢 استخدام الرموز:",
        ttlProject:"إدارة المشاريع",ttlBrain:"مزامنة شبكة المعرفة",ttlSoti:"لوحة Soti-Skill",
        ttlSkillBtn:"CRUD المهارات",ttlSettings:"إعدادات محرك الذكاء الاصطناعي",ttlEnglish:"معلم الإنجليزية",
        ttlLang:"اختر اللغة",ttlMic:"الإدخال الصوتي",ttlStop:"إلغاء (إيقاف)",
        ttlEvo:"نظام التطوير الذاتي",evoTitle:"📈 CEVIZ نظام التطوير الذاتي",evoHistLabel:"📋 سجل التطوير",
        ttlHelp:"دليل المستخدم",helpTitle:"📖 CEVIZ دليل المستخدم",helpSearch:"بحث في الأقسام... (Ctrl+F)",helpClose:"إغلاق",
        helpSecs:["🚀 البدء","⭐ الميزات","💬 أوضاع الدردشة","📈 التطوير الذاتي","📡 RSS","📄 الورقة البيضاء","🔧 النماذج","🧠 Vault","⌨️ الاختصارات","❓ الأسئلة","🔨 الاستكشاف","🖥️ البيئة"],
        langSelectTitle:"اختر اللغة",langSelectHint:"اختر لغتك المفضلة",langSave:"تأكيد",
    },
    fa: {
        brand:"🌰 خلاقیت‌های هوش مصنوعی",connecting:"در حال اتصال...",connectedOllama:"PN40 متصل · Ollama ✓",
        connected:"PN40 متصل",offline:"سرور آفلاین",sessions:"نشست‌ها",thinking:"در حال فکر...",
        inputPh:"چه چیزی برای شما بسازم؟",inputPhEn:"به هر زبانی بنویسید — معلم انگلیسی فعال است",
        offlineBanner:"📡 سرور آفلاین — استفاده از پاسخ کش‌شده",reconnected:"✅ اتصال سرور بازیابی شد",
        tabSoti:"🎛️ سوتی",tabSkill:"⚡ مهارت",
        skillAll:"همه",skillGame:"🎮 بازی",skillDoc:"📄 سند",skillCode:"💻 کد",
        skillResearch:"🔍 تحقیق",skillMedia:"🎬 رسانه",
        skillNew:"+ افزودن",skillImport:"↓ وارد کردن",skillExport:"↑ صادر کردن",
        skillEmpty:"⚡ هنوز مهارتی وجود ندارد\nبا + افزودن بسازید",
        skillFormNew:"مهارت جدید",skillFormEdit:"ویرایش مهارت",
        labelName:"نام مهارت",labelCat:"دسته‌بندی",labelDesc:"توضیحات",
        labelTags:"برچسب‌ها (با کاما جدا کنید)",labelPrompt:"قالب پرامپت هوش مصنوعی",
        phName:"مثال: نویسنده سناریوی بازی",phDesc:"توضیح کوتاهی از کارکرد این مهارت",
        phTags:"مثال: بازی، داستان، سناریو",phPrompt:"پرامپت سیستم برای هوش مصنوعی...",
        cancel:"لغو",save:"ذخیره",
        newChat:"＋ چت جدید",continueIn:"ادامه در",
        modeLocal:"محلی",modeCopilot:"Claude CLI",modeCloud:"ابری",modeHybrid:"ترکیبی",
        vaultTitle:"🧠 شبکه دانش",vaultCfg:"تغییر مسیر",
        vaultSearchPh:"🔍 جستجوی یادداشت...",vaultBtn:"جستجو",vaultEmpty:"یک کلمه جستجو وارد کنید",
        vaultLoading:"در حال بارگذاری...",
        projChange:"تغییر ▸",projModalTitle:"📁 پروژه‌ها",projNewPh:"نام پروژه جدید...",projCreate:"+ ایجاد",
        orchRun:"▶ اجرای هماهنگ‌سازی",orchStop:"■ توقف",orchAdd:"＋ افزودن عامل",
        orchDesc:"برنامه تیم چندعاملی را برای هماهنگ‌سازی بلادرنگ وارد کنید.",
        tokenLabel:"🔢 مصرف توکن:",
        ttlProject:"مدیریت پروژه‌ها",ttlBrain:"همگام‌سازی شبکه دانش",ttlSoti:"داشبورد Soti-Skill",
        ttlSkillBtn:"CRUD مهارت",ttlSettings:"تنظیمات موتور هوش مصنوعی",ttlEnglish:"معلم انگلیسی",
        ttlLang:"انتخاب زبان",ttlMic:"ورودی صوتی",ttlStop:"لغو (توقف)",
        ttlEvo:"سیستم خودتوسعه",evoTitle:"📈 CEVIZ سیستم خودتوسعه",evoHistLabel:"📋 تاریخچه توسعه",
        ttlHelp:"راهنمای کاربر",helpTitle:"📖 CEVIZ راهنمای کاربر",helpSearch:"جستجوی بخش... (Ctrl+F)",helpClose:"بستن",
        helpSecs:["🚀 شروع","⭐ ویژگی‌ها","💬 حالت چت","📈 خودتوسعه","📡 RSS","📄 کاغذ سفید","🔧 مدل","🧠 Vault","⌨️ میانبرها","❓ پرسش‌ها","🔨 عیب‌یابی","🖥️ محیط"],
        langSelectTitle:"انتخاب زبان",langSelectHint:"زبان مورد نظر خود را انتخاب کنید",langSave:"تأیید",
    },
    ru: {
        brand:"🌰 Мои ИИ-творения",connecting:"Подключение...",connectedOllama:"PN40 подключён · Ollama ✓",
        connected:"PN40 подключён",offline:"Сервер недоступен",sessions:"Сессии",thinking:"Думаю...",
        inputPh:"Что мне для вас создать?",inputPhEn:"Пишите на любом языке — репетитор английского активен",
        offlineBanner:"📡 Сервер недоступен — используется кешированный ответ",reconnected:"✅ Соединение с сервером восстановлено",
        tabSoti:"🎛️ Soti",tabSkill:"⚡ Навык",
        skillAll:"Все",skillGame:"🎮 Игра",skillDoc:"📄 Документ",skillCode:"💻 Код",
        skillResearch:"🔍 Исследование",skillMedia:"🎬 Медиа",
        skillNew:"+ Добавить",skillImport:"↓ Импорт",skillExport:"↑ Экспорт",
        skillEmpty:"⚡ Навыков нет\nИспользуйте + Добавить для создания",
        skillFormNew:"Новый навык",skillFormEdit:"Редактировать навык",
        labelName:"Название навыка",labelCat:"Категория",labelDesc:"Описание",
        labelTags:"Теги (через запятую)",labelPrompt:"Шаблон промпта ИИ",
        phName:"напр. Автор игровых сценариев",phDesc:"Краткое описание навыка",
        phTags:"напр. игра, история, сценарий",phPrompt:"Системный промпт для ИИ...",
        cancel:"Отмена",save:"Сохранить",
        newChat:"＋ Новый чат",continueIn:"Продолжить в",
        modeLocal:"Локальный",modeCopilot:"Claude CLI",modeCloud:"Облако",modeHybrid:"Гибрид",
        vaultTitle:"🧠 База знаний",vaultCfg:"Изменить путь",
        vaultSearchPh:"🔍 Поиск заметок...",vaultBtn:"Найти",vaultEmpty:"Введите поисковый запрос",
        vaultLoading:"Загрузка...",
        projChange:"Переключить ▸",projModalTitle:"📁 Проекты",projNewPh:"Название нового проекта...",projCreate:"+ Создать",
        orchRun:"▶ Запустить оркестрацию",orchStop:"■ Стоп",orchAdd:"＋ Добавить агента",
        orchDesc:"Введите план многоагентной команды для оркестрации в реальном времени.",
        tokenLabel:"🔢 Использование токенов:",
        ttlProject:"Управление проектами",ttlBrain:"Синхронизация базы знаний",ttlSoti:"Панель Soti-Skill",
        ttlSkillBtn:"CRUD навыков",ttlSettings:"Настройки движка ИИ",ttlEnglish:"Репетитор английского",
        ttlLang:"Выбор языка",ttlMic:"Голосовой ввод",ttlStop:"Отмена (Стоп)",
        ttlEvo:"Система Саморазвития",evoTitle:"📈 CEVIZ Система Саморазвития",evoHistLabel:"📋 История разработки",
        ttlHelp:"Руководство пользователя",helpTitle:"📖 CEVIZ Руководство пользователя",helpSearch:"Поиск по разделам... (Ctrl+F)",helpClose:"Закрыть",
        helpSecs:["🚀 Начало работы","⭐ Функции","💬 Режим чата","📈 Саморазвитие","📡 RSS","📄 Белая книга","🔧 Модели","🧠 Vault","⌨️ Горячие клавиши","❓ FAQ","🔨 Устранение","🖥️ Среда"],
        langSelectTitle:"Выбор языка",langSelectHint:"Выберите предпочитаемый язык",langSave:"Подтвердить",
    },
};

let lang = "ko";
function t(key) { return (I18N[lang] || I18N.ko)[key] ?? I18N.ko[key] ?? key; }

function applyI18n(l) {
    lang = l || "ko";
    const rtl = lang === "ar" || lang === "fa";
    document.documentElement.lang = lang;
    document.body.dir = rtl ? "rtl" : "ltr";

    const s = (id, key, attr) => {
        const el = document.getElementById(id);
        if (!el) { return; }
        if (attr === "ph") { el.placeholder = t(key); }
        else if (attr === "title") { el.title = t(key); }
        else { el.textContent = t(key); }
    };
    const q = (sel, key, attr) => {
        const el = document.querySelector(sel);
        if (!el) { return; }
        if (attr === "ph") { el.placeholder = t(key); }
        else if (attr === "title") { el.title = t(key); }
        else { el.textContent = t(key); }
    };

    // Header
    q(".brand", "brand");
    s("offlineBanner", "offlineBanner");
    q(".proj-bar-change", "projChange");
    s("projBtn", "ttlProject", "title");
    s("brainBtn", "ttlBrain", "title");
    s("soticBtn", "ttlSoti", "title");
    s("skillBtn", "ttlSkillBtn", "title");
    s("gearBtn", "ttlSettings", "title");
    s("enBtn", "ttlEnglish", "title");
    s("langBtn", "ttlLang", "title");
    s("micBtn", "ttlMic", "title");
    s("stopBtn", "ttlStop", "title");
    s("evoBtn", "ttlEvo", "title");
    s("evoTitleSpan", "evoTitle");
    s("helpBtn", "ttlHelp", "title");
    s("helpTitleSpan", "helpTitle");
    s("helpSearchInput", "helpSearch", "ph");
    s("helpCloseBtn", "helpClose");
    const helpSecLabels = (I18N[lang] || I18N.ko).helpSecs;
    helpSecLabels.forEach((label, i) => {
        const btn = document.getElementById("helpNav" + (i + 1));
        if (btn) { btn.textContent = label; }
    });

    // Session
    q(".sess-label", "sessions");

    // Tabs
    s("dashTab", "tabSoti");
    s("skillTab", "tabSkill");

    // Input placeholder
    s("promptInput", englishMode ? "inputPhEn" : "inputPh", "ph");

    // Token bar (preserve count span)
    const tb = document.getElementById("tokenBar");
    if (tb) {
        const cnt = (document.getElementById("tokenCount") || {}).textContent || "0";
        tb.innerHTML = t("tokenLabel") + " <span id='tokenCount'>" + cnt + "</span> tokens";
    }

    // Vault
    q(".vault-title", "vaultTitle");
    s("vaultCfgBtn", "vaultCfg");
    s("vaultSearchInput", "vaultSearchPh", "ph");
    s("vaultSearchBtn", "vaultBtn");
    q("#vaultResults .vault-empty", "vaultEmpty");

    // Dashboard
    s("orchRun", "orchRun");
    s("orchStop", "orchStop");
    s("orchAddAgent", "orchAdd");
    q("#dashArea > div:nth-child(2)", "orchDesc");

    // Skill category buttons
    const catKeys = { all:"skillAll", game:"skillGame", document:"skillDoc",
                      code:"skillCode", research:"skillResearch", media:"skillMedia" };
    document.querySelectorAll(".cat-btn[data-cat]").forEach(btn => {
        if (catKeys[btn.dataset.cat]) { btn.textContent = t(catKeys[btn.dataset.cat]); }
    });

    // Skill IO buttons + new
    s("skillImportBtn", "skillImport");
    s("skillExportBtn", "skillExport");
    s("skillNewBtn", "skillNew");

    // Skill form
    s("sfLabelName", "labelName");
    s("sfLabelCat", "labelCat");
    s("sfLabelDesc", "labelDesc");
    s("sfLabelTags", "labelTags");
    s("sfLabelPrompt", "labelPrompt");
    s("sfName", "phName", "ph");
    s("sfDesc", "phDesc", "ph");
    s("sfTags", "phTags", "ph");
    s("sfPrompt", "phPrompt", "ph");
    s("sfCancel", "cancel");
    s("sfSave", "save");

    // Skill select options
    const optKeys = { game:"skillGame", document:"skillDoc", code:"skillCode",
                      research:"skillResearch", media:"skillMedia" };
    document.querySelectorAll("#sfCategory option").forEach(opt => {
        if (optKeys[opt.value]) { opt.textContent = t(optKeys[opt.value]); }
    });

    // Skill empty
    const se = document.querySelector(".skill-empty");
    if (se) { se.innerHTML = t("skillEmpty").replace("\n", "<br>"); }

    // Mode dropdown
    q("#newChatItem > span:first-child", "newChat");
    q(".drop-continue", "continueIn");
    document.querySelectorAll("[data-i18n-cat]").forEach(el => {
        const key = "mode" + el.dataset.i18nCat.charAt(0).toUpperCase() + el.dataset.i18nCat.slice(1);
        el.textContent = t(key);
    });

    // Project modal
    q("#projOverlay .proj-modal-hdr span", "projModalTitle");
    s("projNewInput", "projNewPh", "ph");
    s("projNewBtn", "projCreate");

    // Language modal labels
    s("langModalTitle", "langSelectTitle");
    s("langModalHint", "langSelectHint");
    s("langConfirm", "langSave");
    // Mark selected lang option
    document.querySelectorAll(".lang-opt").forEach(btn => {
        btn.classList.toggle("lang-opt-sel", btn.dataset.lang === lang);
    });
}
// ─────────────────────────────────────────────────────────────────────────────

const vscode = acquireVsCodeApi();
let mode = "hybrid", model = "gemma3:1b", englishMode = false;
let sessions = [], curId = "", totalTokens = 0;
let lastCloudContent = null;
let thinkEl = null;
let pendingLearnBtn = null;
let skills = [], skillFilter = 'all', editingSkillId = null;
let vaultOpen = false;
let currentProject = "";
let projModalOpen = false;
let injectedCode = null; // { code, fileName, language, lineStart, lineEnd }

// ── Phase 22: 라우팅 상태 ──────────────────────────────────────────────────
let _classifyPending = null; // { domainKey, provider, model, allDomains, showAll }
let _apiKeyStatuses = [
    { provider: "anthropic", isSet: false, isValid: null },
    { provider: "gemini",    isSet: false, isValid: null },
];
let _domainConfigs = [];
let _routingEnabled = true;
let _routingThreshold = 0.60;
let _tokenUsage = { today: { costUsd: 0, tokens: 0 }, monthly: { costUsd: 0, tokens: 0 } };
let _cloudModels = { anthropic: [], gemini: [] };

window.addEventListener("load", () => {
    console.log("CEVIZ: load fired, sending ready");
    vscode.postMessage({ type: "ready" });
});

window.addEventListener("message", e => {
    const m = e.data;
    console.log("CEVIZ: webview recv ->", m.type);
    switch (m.type) {
        case "sync":
            sessions = m.sessions; curId = m.currentId;
            mode = m.mode; model = m.model;
            englishMode = m.englishMode; totalTokens = m.totalTokens;
            applyI18n(m.language || lang);
            renderSessions(); renderChat(); updateModeLabel(); updateTokenBarVisibility();
            document.getElementById("enBtn").classList.toggle("on", englishMode);
            document.getElementById("enBadge").style.display = englishMode ? "inline" : "none";
            if (m.currentProject) { currentProject = m.currentProject; updateProjBar(); }
            const wsBadge = document.getElementById("wsBadge");
            if (wsBadge) { wsBadge.textContent = m.workspace ? "· " + m.workspace : ""; }
            if (m.firstRun) { openLangModal(true); }
            break;
        case "serverStatus": {
            const ollamaOk = m.data && (m.data.ollama || m.data.ollama_running || m.data.ollama_status === "ok");
            const connected = !!m.data;
            document.getElementById("dot").classList.toggle("ok", connected);
            document.getElementById("statusTxt").textContent = ollamaOk
                ? t("connectedOllama") : (connected ? t("connected") : t("offline"));
            break;
        }
        case "models":
            updateLocalModels(m.list);
            break;
        case "userMsg":
            hideThink(); appendMsg("user", m.content);
            break;
        case "thinking":
            showThink();
            break;
        case "requestCanceled":
            hideThink();
            appendMsg("assistant", "⏹ 요청이 취소되었습니다.", "system", 0);
            break;
        case "assistantMsg":
            hideThink();
            appendMsg("assistant", m.content, m.agent, m.tier, m.engine, m.isCloud, m.tokenUsage, m.ragDocs, m.domain, m.costUsd);
            if (m.isCloud && m.tokenUsage) {
                totalTokens = m.totalTokens || totalTokens;
                document.getElementById("tokenCount").textContent = totalTokens;
            }
            if (m.isCloud) { lastCloudContent = m.content; }
            if (m.totalCostToday !== undefined) {
                const costEl = document.getElementById("todayCostBadge");
                if (costEl) {
                    costEl.textContent = "· $" + m.totalCostToday.toFixed(4) + " 오늘";
                    costEl.style.display = "inline";
                }
            }
            updateTokenBarVisibility();
            break;
        case "learnComplete":
            if (pendingLearnBtn) {
                pendingLearnBtn.disabled = false;
                pendingLearnBtn.textContent = m.success ? "✅ RAG 저장됨" : "❌ 재시도";
                pendingLearnBtn = null;
            }
            break;
        case "openDashboard":
            switchTab("dash");
            break;
        case "englishMode":
            englishMode = m.enabled;
            document.getElementById("enBtn").classList.toggle("on", englishMode);
            document.getElementById("enBadge").style.display = englishMode ? "inline" : "none";
            document.getElementById("promptInput").placeholder = englishMode
                ? "Type in any language — English tutor active" : "무엇을 만들어 드릴까요?";
            break;
        case "orchStatus":
            if (m.status === "error") {
                orchAddErrorCard(m.msg || "알 수 없는 오류");
            }
            break;
        case "orchResult":
            renderOrchResult(m.result);
            break;
        case "orchEvent":
            handleOrchEvent(m.data);
            break;
        case "skillsSync":
            skills = m.skills || [];
            renderSkills();
            break;
        case "skillSaved":
            skills = m.skills || [];
            renderSkills();
            closeSkillForm();
            break;
        case "skillDeleted":
            skills = m.skills || [];
            renderSkills();
            break;
        case "vaultInfo":
            renderVaultInfo(m);
            break;
        case "vaultDetect":
            renderVaultDetect(m.paths);
            break;
        case "vaultSearchResult":
            renderVaultResults(m.results, m.error);
            break;
        case "projectsList":
            renderProjList(m.projects, m.current);
            break;
        case "projectCreated":
            currentProject = m.name;
            closeProjModal();
            updateProjBar();
            document.getElementById("projNewBtn").disabled = false;
            document.getElementById("projNewBtn").textContent = "+ 생성";
            appendMsg("assistant",
                `✅ 프로젝트 "${m.name}" 생성됨.\n~/ceviz/projects/${m.name}/CONTEXT.md 자동 생성 완료.`,
                "system", 0);
            break;
        case "projectLoaded":
            currentProject = m.name;
            closeProjModal();
            updateProjBar();
            if (m.inProgress || m.lastLog) {
                const what = m.inProgress || m.lastLog;
                appendMsg("assistant",
                    `📁 프로젝트 "${m.name}" 복원됨.\n지난번에 "${what}" 작업까지 기록되어 있습니다. 이어서 진행할까요?`,
                    "system", 0);
            }
            break;
        case "contextUpdated":
            showCtxToast("✅ CONTEXT.md 자동 업데이트: " + (m.items || []).join(", ").slice(0, 50));
            break;
        case "injectCode":
            setInjectedCode(m);
            break;
        case "claudeStart":
            hideThink();
            beginStreamMsg();
            break;
        case "claudeChunk":
            appendStreamChunk(m.text);
            break;
        case "claudeEnd":
            finalizeStreamMsg(m.agent, m.engine, m.duration);
            break;
        case "offlineStatus":
            handleOfflineStatus(m.online);
            break;
        case "importResult":
            showCtxToast((m.ok ? "✅ " : "❌ ") + m.msg);
            break;
        case "ragStats":
            updateRagStats(m.stats);
            break;

        case "wizardInfo":
            {
                const spinEl  = document.getElementById("wizConnSpin");
                const msgEl   = document.getElementById("wizConnMsg");
                if (m.ok) {
                    _wizInstalledModels = m.installedModels || [];
                    if (spinEl) { spinEl.classList.add("hidden"); }
                    if (msgEl) {
                        msgEl.textContent = "✅ PN40 연결됨 · " + _wizInstalledModels.length + "개 모델 설치됨";
                        msgEl.style.color = "#4ec9b0";
                    }
                    const secEl   = document.getElementById("wizInstalledSection");
                    const chipsEl = document.getElementById("wizInstalledChips");
                    if (secEl && chipsEl) {
                        chipsEl.innerHTML = _wizInstalledModels
                            .map(im => '<span class="wiz-inst-chip">' + im + '</span>').join("");
                        secEl.style.display = _wizInstalledModels.length > 0 ? "" : "none";
                    }
                    const nextEl = document.getElementById("wizStep2Next");
                    if (nextEl) { nextEl.disabled = false; }
                    renderModelMgrList(_wizInstalledModels);
                } else {
                    if (spinEl) { spinEl.classList.add("hidden"); }
                    if (msgEl) {
                        msgEl.textContent = "❌ 연결 실패: " + (m.error || "알 수 없는 오류");
                        msgEl.style.color = "var(--vscode-errorForeground)";
                    }
                    const retryEl = document.getElementById("wizStep2Retry");
                    if (retryEl) { retryEl.style.display = ""; }
                }
            }
            break;

        case "wizardInstallProgress":
            {
                const name = _wizInstallQueue[_wizInstallIdx];
                if (!name) { break; }
                const sid      = _wizSafeId(name);
                const statusEl = document.getElementById("wizInstStatus_" + sid);
                const fillEl   = document.getElementById("wizProgFill_"   + sid);
                if (statusEl) { statusEl.textContent = m.data.status || ""; }
                if (fillEl && m.data.total && m.data.completed) {
                    const pct = Math.round(m.data.completed / m.data.total * 100);
                    fillEl.style.width = Math.min(pct, 100) + "%";
                }
            }
            break;

        case "wizardInstallDone":
            {
                const name = _wizInstallQueue[_wizInstallIdx];
                if (name) {
                    const sid      = _wizSafeId(name);
                    const statusEl = document.getElementById("wizInstStatus_" + sid);
                    const fillEl   = document.getElementById("wizProgFill_"   + sid);
                    if (statusEl) { statusEl.textContent = "✅ 완료"; statusEl.style.color = "#4ec9b0"; }
                    if (fillEl)   { fillEl.style.width = "100%"; }
                }
                _wizInstallIdx++;
                wizInstallNext();
            }
            break;

        case "wizardInstallError":
            {
                const name = _wizInstallQueue[_wizInstallIdx];
                if (name) {
                    const sid      = _wizSafeId(name);
                    const statusEl = document.getElementById("wizInstStatus_" + sid);
                    if (statusEl) {
                        statusEl.textContent = "❌ " + (m.msg || "설치 실패");
                        statusEl.style.color = "var(--vscode-errorForeground)";
                    }
                }
                _wizInstallIdx++;
                wizInstallNext();
            }
            break;

        case "wizardDeleteDone":
            showCtxToast("✅ 모델 삭제 완료: " + m.name);
            vscode.postMessage({ type: "wizardGetInfo" });
            break;

        case "wizardDeleteError":
            showCtxToast("❌ 삭제 실패: " + (m.msg || m.name));
            vscode.postMessage({ type: "wizardGetInfo" });
            break;

        case "openWizard":
            openWizard();
            break;

        case "openModelManager":
            openModelMgr();
            break;

        // Phase 20: 자가 진화
        case "evoFilePicked":
        case "evoAbsorbDone":
        case "evoProposing":
        case "evoPromptProposal":
        case "evoPromptApplied":
        case "evoPromptRolledBack":
        case "evoDetecting":
        case "evoModelDetected":
        case "evoAutoRejected":
        case "evoCodeProposal":
        case "evoCompiling":
        case "evoCodeApplied":
        case "evoCodeCanceled":
        case "evoCodeRolledBack":
        case "evoHistory":
        case "evoError":
            handleEvoMessage(m);
            break;

        case "rssFeeds":
            renderRssFeeds(m.feeds);
            break;

        case "rssNotifications":
            renderRssNotifications(m.notifications, m.total);
            break;

        case "rssFeedSaved":
            rssCloseForm();
            showCtxToast("✅ 구독이 추가되었습니다.");
            break;

        case "rssFetchStatus":
            {
                const btn = document.getElementById("rssFetchNowBtn");
                if (m.status === "running") {
                    if (btn) { btn.disabled = true; btn.textContent = "⏳ 수집 중..."; }
                } else if (m.status === "triggered") {
                    showCtxToast("✅ PN40 수집 시작됨 — 약 30초 후 확인하세요.");
                    if (btn) { btn.disabled = false; btn.textContent = "↻ 지금 갱신"; }
                } else {
                    showCtxToast("❌ 갱신 실패: " + (m.msg || "오류"));
                    if (btn) { btn.disabled = false; btn.textContent = "↻ 지금 갱신"; }
                }
            }
            break;

        case "rssError":
            showCtxToast("❌ RSS 오류: " + (m.msg || "알 수 없는 오류"));
            break;

        // ── Phase 22: Multi-Cloud AI Domain Routing ──────────────────────────

        case "classifyConfirm":
            hideThink();
            _openClassifyDialog(m);
            break;

        case "routingAuto":
            hideThink();
            _appendRoutingInfo("auto", m);
            showThink();
            break;

        case "routingFallback":
            hideThink();
            _appendRoutingInfo("fallback", m);
            showThink();
            break;

        case "cloudChatError":
            hideThink();
            appendMsg("assistant", m.msg || "Cloud AI 오류가 발생했습니다.", "system", 0);
            break;

        case "apiKeyStatuses":
            _apiKeyStatuses = m.statuses || _apiKeyStatuses;
            _renderApiKeyStatuses();
            break;

        case "apiKeyResult":
            _onApiKeyResult(m);
            break;

        case "apiKeyValidating":
            _setApiKeyValidatingState(m.provider, true);
            break;

        case "domainConfigs":
            _domainConfigs = m.domains || [];
            _renderDomainTable();
            break;

        case "routingConfig":
            _routingEnabled = m.enabled;
            _routingThreshold = m.threshold;
            _tokenUsage.dailyLimit   = m.dailyTokenLimit;
            _tokenUsage.monthlyLimit = m.monthlyTokenLimit;
            _apiKeyStatuses = m.apiKeyStatuses || _apiKeyStatuses;
            _renderRoutingSettings();
            _renderApiKeyStatuses();
            break;

        case "tokenUsage":
            _tokenUsage = m;
            _renderTokenUsage();
            break;

        case "cloudModels":
            for (const r of (m.results || [])) {
                _cloudModels[r.provider] = r.models;
            }
            _renderCloudModelDropdowns();
            showCtxToast("☁️ 클라우드 모델 목록 갱신 완료");
            break;
    }
});

function renderSessions() {
    const list = document.getElementById("sessList");
    list.innerHTML = "";
    [...sessions].reverse().forEach(s => {
        const el = document.createElement("div");
        el.className = "sitem" + (s.id === curId ? " cur" : "");
        el.textContent = s.title || "New Session";
        el.onclick = () => { curId = s.id; vscode.postMessage({ type: "switchSession", id: s.id }); };
        list.appendChild(el);
    });
}

function renderChat() {
    const area = document.getElementById("chatArea");
    area.innerHTML = "";
    const s = sessions.find(x => x.id === curId);
    if (!s) { return; }
    s.messages.forEach(m => appendMsg(m.role, m.content, m.agent, m.tier, m.engine, m.tier === 2, m.tokenUsage, m.ragDocs, m.domain, m.costUsd));
}

function appendMsg(role, content, agent, tier, engine, isCloud, tokenUsage, ragDocs, domain, costUsd) {
    const area = document.getElementById("chatArea");
    const div = document.createElement("div");
    div.className = "msg " + role;
    const bub = document.createElement("div");
    bub.className = "bubble";
    bub.textContent = content;
    if (role === "user") {
        bub.title = "클릭하여 수정";
        bub.onclick = () => {
            const inp = document.getElementById("promptInput");
            inp.value = content;
            inp.style.height = "auto";
            inp.style.height = Math.min(inp.scrollHeight, 100) + "px";
            inp.focus();
        };
    }
    div.appendChild(bub);
    if (role === "assistant") {
        const meta = document.createElement("div");
        meta.className = "meta";
        let metaTxt = (agent || "")
            + (tier !== undefined ? " · Tier" + tier : "")
            + (engine ? " · " + engine : "")
            + (tokenUsage ? " · ~" + tokenUsage + " tokens" : "")
            + (costUsd   ? " · $" + costUsd.toFixed(4) : "");
        if (ragDocs > 0) {
            const domainLabel = domain ? ` (${domain})` : "";
            metaTxt += ` · 📚 ${ragDocs}개 기억${domainLabel}`;
        }
        meta.textContent = metaTxt;
        div.appendChild(meta);
        if (ragDocs > 0) {
            div.classList.add("rag-hit");
        }
        if (isCloud && content) {
            const lb = document.createElement("button");
            lb.className = "learn-btn";
            lb.textContent = "📚 RAG에 저장";
            lb.title = "Cloud AI 처리 방식을 Local 모델에 단방향 학습";
            lb.onclick = () => { pendingLearnBtn = lb; lb.disabled = true; lb.textContent = "저장 중... (최대 5분)"; vscode.postMessage({ type: "learnFromCloud", response: content }); };
            meta.appendChild(lb);
        }
    }
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
}

// ── CLAUDE CLI 스트리밍 버블 ───────────────────────────────────────────────
let _streamDiv = null;
let _streamBubble = null;

function beginStreamMsg() {
    const area = document.getElementById("chatArea");
    _streamDiv = document.createElement("div");
    _streamDiv.className = "msg assistant";
    _streamBubble = document.createElement("div");
    _streamBubble.className = "bubble";
    _streamBubble.textContent = "";
    _streamDiv.appendChild(_streamBubble);
    area.appendChild(_streamDiv);
    area.scrollTop = area.scrollHeight;
}

function appendStreamChunk(text) {
    if (!_streamBubble) { return; }
    _streamBubble.textContent += text;
    const area = document.getElementById("chatArea");
    area.scrollTop = area.scrollHeight;
}

function finalizeStreamMsg(agent, engine, duration) {
    if (!_streamDiv) { return; }
    const meta = document.createElement("div");
    meta.className = "meta";
    const dStr = duration ? " · " + (duration / 1000).toFixed(1) + "s" : "";
    meta.textContent = (agent || "Claude CLI") + (engine ? " · " + engine : "") + dStr;
    _streamDiv.appendChild(meta);
    _streamDiv = null;
    _streamBubble = null;
}
// ─────────────────────────────────────────────────────────────────────────────

function showThink() {
    const area = document.getElementById("chatArea");
    thinkEl = document.createElement("div");
    thinkEl.className = "think";
    thinkEl.innerHTML = "<span></span><span></span><span></span>";
    area.appendChild(thinkEl);
    area.scrollTop = area.scrollHeight;
    document.getElementById("sendBtn").style.display = "none";
    document.getElementById("stopBtn").classList.add("visible");
    document.getElementById("promptInput").disabled = true;
}
function hideThink() {
    if (thinkEl) { thinkEl.remove(); thinkEl = null; }
    document.getElementById("sendBtn").style.display = "";
    document.getElementById("stopBtn").classList.remove("visible");
    document.getElementById("promptInput").disabled = false;
}

function updateModeLabel() {
    const modeNames = { local: "Local", cloud: "Cloud", hybrid: "Hybrid", copilot: "Claude CLI" };
    const modelInfo = {
        "gemma3:1b":  { name: "Gemma 3 1B",  bg: "#1e3a5f", col: "#7ec8e3", ch: "✦" },
        "gemma4:e2b": { name: "Gemma 4 E2B", bg: "#1e3a5f", col: "#7ec8e3", ch: "✦" },
        "gemma4:e4b": { name: "Gemma 4 E4B", bg: "#1e3a5f", col: "#7ec8e3", ch: "✦" },
        "claude":     { name: "Claude",       bg: "#2d1b4e", col: "#c586c0", ch: "✳" },
        "claude-cli": { name: "Claude CLI",   bg: "#1a2a3e", col: "#569cd6", ch: "⊕" }
    };
    const mName = modeNames[mode] || "Hybrid";
    const m = modelInfo[model] || { name: model, bg: "#1e3a5f", col: "#7ec8e3", ch: "✦" };
    const iStyle = "display:inline-flex;align-items:center;justify-content:center;width:12px;height:12px;border-radius:2px;background:" + m.bg + ";color:" + m.col + ";font-size:8px;vertical-align:middle;margin:0 2px";
    document.getElementById("modeBtnLabel").innerHTML = mName + " &middot; <span style='" + iStyle + "'>" + m.ch + "</span>" + m.name;
    document.querySelectorAll(".drop-item").forEach(el => {
        el.classList.toggle("selected", el.dataset.mode === mode && el.dataset.model === model);
    });
}

function updateTokenBarVisibility() {
    const bar = document.getElementById("tokenBar");
    if (mode === "cloud" || totalTokens > 0) {
        document.getElementById("tokenCount").textContent = totalTokens;
        bar.classList.add("show");
    } else {
        bar.classList.remove("show");
    }
}

function updateRagStats(stats) {
    const box  = document.getElementById("ragStatsBox");
    const grid = document.getElementById("ragStatsGrid");
    if (!box || !grid || !stats || stats.error) { return; }
    box.style.display = "block";
    const domains = { game_dev: "🎮 game_dev", english: "🇺🇸 english", general: "💬 general" };
    grid.innerHTML = Object.entries(domains).map(([key, label]) => {
        const n = stats[key] ?? 0;
        const bar = Math.min(100, n * 2);
        return `<div class="rag-stat-row">
            <span class="rag-stat-label">${label}</span>
            <div class="rag-bar-wrap"><div class="rag-bar" style="width:${bar}%"></div></div>
            <span class="rag-stat-count">${n}개</span>
        </div>`;
    }).join("");
    document.querySelectorAll(".rag-reset-btn").forEach(btn => {
        btn.onclick = () => {
            if (!confirm(`'${btn.dataset.domain}' 컬렉션을 초기화하시겠습니까?`)) { return; }
            vscode.postMessage({ type: "ragReset", domain: btn.dataset.domain });
        };
    });
}

function handleOfflineStatus(online) {
    const banner = document.getElementById("offlineBanner");
    if (!banner) { return; }
    if (online) {
        banner.classList.remove("show");
        showCtxToast(t("reconnected"));
    } else {
        banner.classList.add("show");
    }
}

function updateLocalModels(list) {
    // reserved for dynamic local model injection
}

function sendPrompt() {
    const inp = document.getElementById("promptInput");
    const p = inp.value.trim();
    if (!p && !injectedCode) { return; }
    let finalPrompt = p;
    if (injectedCode) {
        const ref = `[코드 참조: ${injectedCode.fileName} L${injectedCode.lineStart}-${injectedCode.lineEnd} | ${injectedCode.language}]\n\`\`\`${injectedCode.language}\n${injectedCode.code}\n\`\`\``;
        finalPrompt = p ? ref + "\n\n" + p : ref;
        clearInjectedCode();
    }
    inp.value = ""; inp.style.height = "auto";
    vscode.postMessage({ type: "sendPrompt", prompt: finalPrompt, mode, model });
}

function closeVaultPanel() {
    if (!vaultOpen) { return; }
    vaultOpen = false;
    document.getElementById("brainBtn").classList.remove("on");
    document.getElementById("vaultPanel").classList.remove("show");
}

function switchTab(tab) {
    closeVaultPanel();
    const isChat  = tab === "chat";
    const isDash  = tab === "dash";
    const isSkill = tab === "skill";
    const isRss   = tab === "rss";
    document.getElementById("chatTab").classList.toggle("on", isChat);
    document.getElementById("dashTab").classList.toggle("on", isDash);
    document.getElementById("skillTab").classList.toggle("on", isSkill);
    document.getElementById("rssTab").classList.toggle("on", isRss);
    document.getElementById("chatArea").style.display = isChat ? "flex" : "none";
    document.getElementById("dashArea").classList.toggle("show", isDash);
    document.getElementById("skillArea").classList.toggle("show", isSkill);
    document.getElementById("rssArea").classList.toggle("show", isRss);
    document.getElementById("soticBtn").classList.toggle("on", isDash);
    document.getElementById("skillBtn").classList.toggle("on", isSkill);
}

/* ── SKILL CRUD ── */
function renderSkills() {
    const list = document.getElementById("skillList");
    const filtered = skillFilter === "all" ? skills : skills.filter(s => s.category === skillFilter);
    if (filtered.length === 0) {
        list.innerHTML = '<div class="skill-empty">⚡ 스킬이 없습니다<br>+ 추가 버튼으로 만들어보세요</div>';
        return;
    }
    const catEmoji = { game:"🎮", document:"📄", code:"💻", research:"🔍", media:"🎬" };
    list.innerHTML = "";
    filtered.forEach(sk => {
        const div = document.createElement("div");
        div.className = "skill-card";
        const tags = (sk.tags || []).map(t => `<span class="sk-tag">${t}</span>`).join("");
        div.innerHTML = `
          <div class="sk-head">
            <span class="sk-name">${sk.name}</span>
            <span class="sk-cat">${catEmoji[sk.category] || "⚡"} ${sk.category}</span>
          </div>
          ${sk.description ? `<div class="sk-desc">${sk.description}</div>` : ""}
          ${tags ? `<div class="sk-tags">${tags}</div>` : ""}
          <div class="sk-foot">
            <span class="sk-uses">사용 ${sk.uses || 0}회</span>
            <button class="sk-edit">편집</button>
            <button class="sk-del">삭제</button>
          </div>`;
        list.appendChild(div);
        // CSP 준수: innerHTML onclick 대신 addEventListener 사용
        div.querySelector(".sk-edit").addEventListener("click", () => showSkillForm(sk.id));
        const delBtn = div.querySelector(".sk-del");
        delBtn.addEventListener("click", () => {
            if (delBtn.dataset.confirming === "1") {
                vscode.postMessage({ type: "deleteSkill", id: sk.id });
            } else {
                delBtn.dataset.confirming = "1";
                delBtn.textContent = "확인?";
                delBtn.classList.add("confirm");
                setTimeout(() => {
                    if (delBtn.dataset.confirming === "1") {
                        delBtn.dataset.confirming = "";
                        delBtn.textContent = "삭제";
                        delBtn.classList.remove("confirm");
                    }
                }, 2500);
            }
        });
    });
}

function showSkillForm(id) {
    editingSkillId = id || null;
    const wrap = document.getElementById("skillFormWrap");
    wrap.style.display = "";
    document.getElementById("skillFormTitle").textContent = id ? t("skillFormEdit") : t("skillFormNew");
    if (id) {
        const sk = skills.find(s => s.id === id);
        if (!sk) { return; }
        document.getElementById("sfName").value = sk.name || "";
        document.getElementById("sfCategory").value = sk.category || "game";
        document.getElementById("sfDesc").value = sk.description || "";
        document.getElementById("sfTags").value = (sk.tags || []).join(", ");
        document.getElementById("sfPrompt").value = sk.promptTemplate || "";
    } else {
        document.getElementById("sfName").value = "";
        document.getElementById("sfCategory").value = "game";
        document.getElementById("sfDesc").value = "";
        document.getElementById("sfTags").value = "";
        document.getElementById("sfPrompt").value = "";
    }
    document.getElementById("sfName").focus();
}

function closeSkillForm() {
    document.getElementById("skillFormWrap").style.display = "none";
    editingSkillId = null;
}

function saveSkill() {
    const name = document.getElementById("sfName").value.trim();
    if (!name) { document.getElementById("sfName").focus(); return; }
    const existing = editingSkillId ? skills.find(s => s.id === editingSkillId) : null;
    const skill = {
        id: editingSkillId || Date.now().toString(),
        name,
        category: document.getElementById("sfCategory").value,
        description: document.getElementById("sfDesc").value.trim(),
        tags: document.getElementById("sfTags").value.split(",").map(t => t.trim()).filter(Boolean),
        promptTemplate: document.getElementById("sfPrompt").value.trim(),
        uses: existing ? (existing.uses || 0) : 0,
        createdAt: existing ? existing.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    vscode.postMessage({ type: "saveSkill", skill, isEdit: !!editingSkillId });
}


function flashBtn(id) {
    const btn = document.getElementById(id);
    btn.classList.remove("flash");
    void btn.offsetWidth;
    btn.classList.add("flash");
    btn.addEventListener("animationend", () => btn.classList.remove("flash"), { once: true });
}

function renderOrchResult(raw) {
    const cards = document.getElementById("agentCards");
    try {
        const data = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || "{}");
        const agents = data.agents || [];
        cards.innerHTML = "";
        agents.forEach(a => {
            const c = document.createElement("div");
            c.className = "agent-card";
            c.innerHTML = '<div class="agent-name">' + a.name + " — " + a.role + "</div>" +
                '<div style="margin-top:4px;font-size:11px">' + a.result + "</div>" +
                '<div class="progress"><div class="progress-inner" style="width:100%"></div></div>';
            cards.appendChild(c);
        });
        if (data.final) {
            const f = document.createElement("div");
            f.className = "agent-card";
            f.style.borderLeft = "3px solid var(--vscode-focusBorder)";
            f.innerHTML = '<div class="agent-name">✅ 최종 결과</div><div style="margin-top:4px;font-size:11px">' + data.final + "</div>";
            cards.appendChild(f);
        }
    } catch (_) {
        cards.innerHTML = '<div class="agent-card"><div class="agent-name">결과</div><div style="margin-top:4px;font-size:11px">' + raw + "</div></div>";
    }
}

// 이벤트 바인딩
document.getElementById("sendBtn").onclick = sendPrompt;
document.getElementById("promptInput").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendPrompt(); }
});
document.getElementById("promptInput").addEventListener("input", function() {
    this.style.height = "auto";
    this.style.height = Math.min(this.scrollHeight, 238) + "px";
});
document.getElementById("newSessBtn").onclick = () => vscode.postMessage({ type: "newSession" });
document.getElementById("chatTab").onclick = () => switchTab("chat");
document.getElementById("dashTab").onclick = () => switchTab("dash");
document.getElementById("skillTab").onclick = () => { switchTab("skill"); vscode.postMessage({ type: "getSkills" }); };
document.getElementById("rssTab").onclick = () => {
    switchTab("rss");
    vscode.postMessage({ type: "rssGetFeeds" });
    vscode.postMessage({ type: "rssGetNotifications" });
};
document.getElementById("soticBtn").onclick = () => switchTab("dash");
document.getElementById("stopBtn").onclick = () => vscode.postMessage({ type: "cancelPrompt" });
document.getElementById("newChatItem").onclick = () => { vscode.postMessage({ type: "newSession" }); closeDropdown(); };

document.getElementById("sessToggle").onclick = () => {
    const list = document.getElementById("sessList");
    const isOpen = list.classList.toggle("open");
    document.getElementById("sessToggle").textContent = isOpen ? "▼" : "▶";
    document.getElementById("sessToggle").title = isOpen ? "세션 목록 접기" : "세션 목록 펼치기";
};

document.getElementById("modeBtn").onclick = () => {
    console.log("CEVIZ: modeBtn clicked");
    const menu = document.getElementById("dropMenu");
    if (menu.classList.contains("show")) { menu.classList.remove("show"); return; }
    const r = document.getElementById("modeBtn").getBoundingClientRect();
    menu.style.left = r.left + "px";
    menu.style.bottom = (window.innerHeight - r.top + 4) + "px";
    menu.classList.add("show");
};
document.querySelectorAll(".drop-item").forEach(el => {
    el.onclick = () => {
        mode = el.dataset.mode;
        model = el.dataset.model;
        vscode.postMessage({ type: "changeMode", mode, model });
        updateModeLabel();
        updateTokenBarVisibility();
        closeDropdown();
    };
});
function closeDropdown() { document.getElementById("dropMenu").classList.remove("show"); }
document.addEventListener("click", e => {
    if (!document.getElementById("modeDrop").contains(e.target)) {
        closeDropdown();
    }
});

document.getElementById("enBtn").onclick = () => vscode.postMessage({ type: "toggleEnglish" });
document.getElementById("gearBtn").onclick = () => { flashBtn("gearBtn"); vscode.postMessage({ type: "settings" }); };
document.getElementById("brainBtn").onclick = () => {
    if (vaultOpen) {
        closeVaultPanel();
        document.getElementById("chatArea").style.display = "flex";
        return;
    }
    // vault 패널 열기 — chat tab으로 강제 이동
    closeVaultPanel();
    document.getElementById("chatTab").classList.add("on");
    document.getElementById("dashTab").classList.remove("on");
    document.getElementById("skillTab").classList.remove("on");
    document.getElementById("rssTab").classList.remove("on");
    document.getElementById("dashArea").classList.remove("show");
    document.getElementById("skillArea").classList.remove("show");
    document.getElementById("rssArea").classList.remove("show");
    document.getElementById("chatArea").style.display = "none";
    document.getElementById("vaultPanel").classList.add("show");
    document.getElementById("brainBtn").classList.add("on");
    vaultOpen = true;
    vscode.postMessage({ type: "vaultGetInfo" });
    vscode.postMessage({ type: "ready" }); // RAG 통계 포함 재조회
    setTimeout(() => document.getElementById("vaultSearchInput").focus(), 80);
};

document.getElementById("vaultClose").onclick = () => {
    closeVaultPanel();
    document.getElementById("chatArea").style.display = "flex";
};

document.getElementById("vaultCfgBtn").onclick = () => {
    vscode.postMessage({ type: "vaultOpenSettings" });
};

function doVaultSearch() {
    const kw = document.getElementById("vaultSearchInput").value.trim();
    if (!kw) { return; }
    const area = document.getElementById("vaultResults");
    area.innerHTML = "";
    const loading = document.createElement("div");
    loading.className = "vault-empty";
    loading.textContent = "검색 중...";
    area.appendChild(loading);
    vscode.postMessage({ type: "vaultSearch", keyword: kw });
}

document.getElementById("vaultSearchBtn").onclick = doVaultSearch;
document.getElementById("vaultSearchInput").addEventListener("keydown", e => {
    if (e.key === "Enter") { doVaultSearch(); }
});

function renderVaultInfo(info) {
    const pathEl = document.getElementById("vaultPath");
    const countEl = document.getElementById("vaultCount");
    if (!info.configured) {
        pathEl.textContent = "경로 미설정 — 아래 [경로 변경]에서 vaultPath를 입력하세요";
        countEl.textContent = "";
    } else {
        pathEl.textContent = info.path + (info.error ? " ⚠️" : "");
        countEl.textContent = "노트 " + (info.count || 0) + "개 · " + (info.lastSync || "");
        // clear any leftover detect UI
        document.getElementById("vaultResults").innerHTML = '<div class="vault-empty">검색어를 입력하세요</div>';
    }
}

function renderVaultDetect(paths) {
    const pathEl = document.getElementById("vaultPath");
    const countEl = document.getElementById("vaultCount");
    const area = document.getElementById("vaultResults");

    pathEl.textContent = "🔍 Vault 자동 감지됨";
    countEl.textContent = paths.length + "개 후보";

    area.innerHTML = "";

    const header = document.createElement("div");
    header.className = "vault-empty";
    header.style.marginBottom = "6px";
    header.textContent = paths.length === 1
        ? "아래 Vault를 사용하시겠습니까?"
        : "사용할 Obsidian Vault를 선택하세요:";
    area.appendChild(header);

    paths.forEach(p => {
        const div = document.createElement("div");
        div.className = "vault-result";
        div.style.cursor = "pointer";

        const nameSpan = document.createElement("span");
        nameSpan.className = "vault-file";
        const parts = p.replace(/\/+$/, "").split("/");
        nameSpan.textContent = "📁 " + (parts[parts.length - 1] || p);

        const pathSpan = document.createElement("span");
        pathSpan.className = "vault-preview";
        pathSpan.textContent = p;

        const useBtn = document.createElement("button");
        useBtn.className = "vault-cfg-btn";
        useBtn.textContent = "이 Vault 사용";
        useBtn.style.marginTop = "4px";
        useBtn.onclick = (e) => {
            e.stopPropagation();
            useBtn.disabled = true;
            useBtn.textContent = "저장 중...";
            vscode.postMessage({ type: "vaultSelectDetected", path: p });
        };

        div.appendChild(nameSpan);
        div.appendChild(pathSpan);
        div.appendChild(useBtn);
        div.onclick = () => {
            useBtn.disabled = true;
            useBtn.textContent = "저장 중...";
            vscode.postMessage({ type: "vaultSelectDetected", path: p });
        };
        area.appendChild(div);
    });

    if (paths.length > 1) {
        const skipDiv = document.createElement("div");
        skipDiv.style.textAlign = "center";
        skipDiv.style.marginTop = "6px";
        const skipBtn = document.createElement("button");
        skipBtn.className = "vault-cfg-btn";
        skipBtn.textContent = "직접 입력";
        skipBtn.onclick = () => vscode.postMessage({ type: "vaultOpenSettings" });
        skipDiv.appendChild(skipBtn);
        area.appendChild(skipDiv);
    }
}

function renderVaultResults(results, error) {
    const area = document.getElementById("vaultResults");
    area.innerHTML = "";
    if (error) {
        const el = document.createElement("div");
        el.className = "vault-empty";
        el.textContent = "❌ " + error;
        area.appendChild(el);
        return;
    }
    if (!results || results.length === 0) {
        const el = document.createElement("div");
        el.className = "vault-empty";
        el.textContent = "검색 결과 없음";
        area.appendChild(el);
        return;
    }
    results.forEach(r => {
        const div = document.createElement("div");
        div.className = "vault-result";
        const fnSpan = document.createElement("span");
        fnSpan.className = "vault-file";
        fnSpan.textContent = "📄 " + r.file;
        const pvSpan = document.createElement("span");
        pvSpan.className = "vault-preview";
        pvSpan.textContent = (r.matches || []).slice(0, 2).join(" · ").slice(0, 120);
        div.appendChild(fnSpan);
        div.appendChild(pvSpan);
        div.onclick = () => {
            const inp = document.getElementById("promptInput");
            const ref = "\n\n[참조: " + r.file + "]\n" + (r.matches || []).join("\n");
            inp.value = (inp.value.trim() + ref).trim();
            inp.style.height = "auto";
            inp.style.height = Math.min(inp.scrollHeight, 238) + "px";
            closeVaultPanel();
            document.getElementById("chatArea").style.display = "flex";
            inp.focus();
            appendMsg("assistant", "🧠 참조됨: " + r.file, "vault", 0);
        };
        area.appendChild(div);
    });
}
document.getElementById("skillBtn").onclick = () => {
    switchTab("skill");
    vscode.postMessage({ type: "getSkills" });
};
document.getElementById("skillNewBtn").onclick = () => showSkillForm(null);
document.getElementById("skillExportBtn").onclick = () => vscode.postMessage({ type: "exportSkills" });
document.getElementById("skillImportBtn").onclick = () => vscode.postMessage({ type: "importSkills" });
document.getElementById("skillFormClose").onclick = closeSkillForm;
document.getElementById("sfCancel").onclick = closeSkillForm;
document.getElementById("sfSave").onclick = saveSkill;
document.querySelectorAll(".cat-btn").forEach(btn => {
    btn.onclick = () => {
        skillFilter = btn.dataset.cat;
        document.querySelectorAll(".cat-btn").forEach(b => b.classList.toggle("on", b === btn));
        renderSkills();
    };
});
document.getElementById("orchRun").onclick = () => {
    const plan = document.getElementById("orchPlan").value.trim();
    if (!plan) { return; }
    document.getElementById("orchRun").disabled = true;
    document.getElementById("orchRun").textContent = "⏳ 실행 중...";
    document.getElementById("orchStop").classList.add("visible");
    document.getElementById("agentCards").innerHTML = "";
    orchStartTime = Date.now();
    vscode.postMessage({ type: "orchSubmit", plan });
};
document.getElementById("orchStop").onclick = () => {
    vscode.postMessage({ type: "cancelOrch" });
};
document.getElementById("orchAddAgent").onclick = () => {
    const ta = document.getElementById("orchPlan");
    const lines = ta.value.trimEnd().split("\n");
    const count = lines.filter(l => /^[-•]/.test(l.trim())).length + 1;
    ta.value = ta.value.trimEnd() + "\n- 에이전트" + count + ": 역할 이름 — 담당 작업을 여기에 입력";
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 180) + "px";
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
};

// ── ORCHESTRATION REAL-TIME ────────────────────────────────────────────────

let orchStartTime = 0;
const orchAgentCards = {};  // index → DOM element

function handleOrchEvent(data) {
    const cards = document.getElementById("agentCards");
    switch (data.type) {
        case "start":
            orchAgentCards._goal = data.goal;
            cards.innerHTML = "";
            const headerDiv = document.createElement("div");
            headerDiv.className = "orch-header";
            headerDiv.innerHTML =
                '<span class="orch-goal">' + escHtml(data.goal) + '</span>' +
                '<span class="orch-badge">' + data.count + '개 에이전트</span>';
            cards.appendChild(headerDiv);
            break;

        case "queued":
            orchAgentCards[data.index] = orchCreateCard(data.index, data.name, data.task, "queued");
            cards.appendChild(orchAgentCards[data.index]);
            break;

        case "agent_start":
            orchUpdateCard(data.index, "running");
            break;

        case "agent_done":
            orchUpdateCard(data.index, "done", data.result, data.elapsed);
            break;

        case "agent_error":
            orchUpdateCard(data.index, "error", data.error || "오류 발생");
            break;

        case "review_start":
            const reviewCard = document.createElement("div");
            reviewCard.className = "agent-card orch-review";
            reviewCard.id = "orchReviewCard";
            reviewCard.innerHTML = '<div class="agent-name">🔄 결과 통합 중...</div>' +
                '<div class="progress"><div class="progress-inner orch-anim"></div></div>';
            cards.appendChild(reviewCard);
            break;

        case "done":
            const rc = document.getElementById("orchReviewCard");
            if (rc) { rc.remove(); }
            orchRenderFinal(data.final, data.task_id);
            orchResetControls();
            break;

        case "error":
            orchAddErrorCard(data.message);
            orchResetControls();
            break;
    }
}

function orchResetControls() {
    document.getElementById("orchRun").disabled = false;
    document.getElementById("orchRun").textContent = "▶ 오케스트레이션 실행";
    document.getElementById("orchStop").classList.remove("visible");
}

function orchCreateCard(index, name, task, status) {
    const div = document.createElement("div");
    div.className = "agent-card orch-card-" + status;
    div.id = "orchCard-" + index;

    const nameLine = document.createElement("div");
    nameLine.className = "agent-name";
    nameLine.innerHTML =
        '<span class="orch-status-dot dot-' + status + '"></span>' +
        '<span class="orch-agent-label">' + escHtml(name) + '</span>' +
        '<span class="orch-timer" id="orchTimer-' + index + '"></span>';

    // ✏️ 편집 버튼
    const editBtn = document.createElement("button");
    editBtn.className = "orch-card-btn orch-edit-btn";
    editBtn.textContent = "✏️";
    editBtn.title = "에이전트 역할 편집";
    editBtn.onclick = () => orchEditAgentInPlan(index, name, task);

    // 🗑️ 삭제 버튼
    const delBtn = document.createElement("button");
    delBtn.className = "orch-card-btn orch-del-btn";
    delBtn.textContent = "🗑️";
    delBtn.title = "에이전트 삭제";
    delBtn.onclick = () => {
        if (delBtn.dataset.confirm === "1") {
            orchRemoveAgentFromPlan(index, name);
            div.remove();
        } else {
            delBtn.dataset.confirm = "1";
            delBtn.textContent = "확인?";
            setTimeout(() => { delBtn.dataset.confirm = ""; delBtn.textContent = "🗑️"; }, 2500);
        }
    };

    nameLine.appendChild(editBtn);
    nameLine.appendChild(delBtn);

    const taskDiv = document.createElement("div");
    taskDiv.className = "orch-task";
    taskDiv.textContent = task;

    const progress = document.createElement("div");
    progress.className = "progress";
    progress.innerHTML = '<div class="progress-inner" id="orchBar-' + index + '" style="width:0"></div>';

    const result = document.createElement("div");
    result.className = "orch-result";
    result.id = "orchResult-" + index;
    result.style.display = "none";

    div.appendChild(nameLine);
    div.appendChild(taskDiv);
    div.appendChild(progress);
    div.appendChild(result);
    return div;
}

function orchEditAgentInPlan(index, name, task) {
    const ta = document.getElementById("orchPlan");
    const lines = ta.value.split("\n");
    // 해당 에이전트 라인 찾기 (이름 또는 index로)
    let found = -1;
    let agentCount = 0;
    for (let i = 0; i < lines.length; i++) {
        if (/^[-•*]/.test(lines[i].trim())) {
            if (agentCount === index) { found = i; break; }
            agentCount++;
        }
    }
    if (found >= 0) {
        // 해당 라인 선택
        const start = lines.slice(0, found).join("\n").length + (found > 0 ? 1 : 0);
        const end = start + lines[found].length;
        ta.focus();
        ta.setSelectionRange(start, end);
    } else {
        ta.focus();
    }
    // Soti 탭의 orchPlan으로 포커스
    document.getElementById("orchPlan").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function orchRemoveAgentFromPlan(index, name) {
    const ta = document.getElementById("orchPlan");
    const lines = ta.value.split("\n");
    let agentCount = 0;
    const newLines = lines.filter(line => {
        if (/^[-•*]/.test(line.trim())) {
            if (agentCount === index) { agentCount++; return false; }
            agentCount++;
        }
        return true;
    });
    ta.value = newLines.join("\n");
}

function orchUpdateCard(index, status, result, elapsed) {
    const card = orchAgentCards[index];
    if (!card) { return; }
    card.className = "agent-card orch-card-" + status;
    const dot = card.querySelector(".orch-status-dot");
    if (dot) { dot.className = "orch-status-dot dot-" + status; }
    const bar = document.getElementById("orchBar-" + index);
    if (bar) {
        bar.style.width = status === "done" ? "100%" : status === "running" ? "60%" : "0";
        if (status === "running") { bar.classList.add("orch-anim"); }
        else { bar.classList.remove("orch-anim"); }
    }
    const timer = document.getElementById("orchTimer-" + index);
    if (timer && elapsed !== undefined) { timer.textContent = " · " + elapsed + "s"; }
    if (result !== undefined) {
        const resEl = document.getElementById("orchResult-" + index);
        if (resEl) {
            resEl.style.display = "";
            resEl.textContent = result;
        }
    }
}

function orchRenderFinal(final, taskId) {
    const cards = document.getElementById("agentCards");
    const elapsed = orchStartTime ? ((Date.now() - orchStartTime) / 1000).toFixed(1) : "?";
    const div = document.createElement("div");
    div.className = "agent-card orch-final";
    const pre = document.createElement("pre");
    pre.className = "orch-final-text";
    pre.textContent = final;
    const meta = document.createElement("div");
    meta.className = "orch-meta";
    meta.textContent = "task_id: " + taskId + " · 총 소요: " + elapsed + "s";
    const sendBtn = document.createElement("button");
    sendBtn.className = "orch-send-btn";
    sendBtn.textContent = "💬 채팅으로 전달";
    sendBtn.onclick = () => {
        switchTab("chat");
        const inp = document.getElementById("promptInput");
        inp.value = final;
        inp.style.height = "auto";
        inp.style.height = Math.min(inp.scrollHeight, 238) + "px";
        inp.focus();
    };
    const hdr = document.createElement("div");
    hdr.className = "agent-name";
    hdr.textContent = "✅ 최종 결과";
    div.appendChild(hdr);
    div.appendChild(pre);
    div.appendChild(meta);
    div.appendChild(sendBtn);
    cards.appendChild(div);
    cards.scrollTop = cards.scrollHeight;
}

function orchAddErrorCard(msg) {
    const cards = document.getElementById("agentCards");
    const div = document.createElement("div");
    div.className = "agent-card orch-error";
    div.innerHTML = '<div class="agent-name">❌ 오류</div><div class="orch-task">' + escHtml(msg) + '</div>';
    cards.appendChild(div);
}

function escHtml(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

document.addEventListener("keydown", e => {
    if (e.ctrlKey && e.key === "n") { e.preventDefault(); vscode.postMessage({ type: "newSession" }); }
    if (e.key === "Escape" && projModalOpen) { closeProjModal(); }
});

// ── CODE CONTEXT ─────────────────────────────────────────────────────────

function setInjectedCode(data) {
    injectedCode = data;
    const box = document.getElementById("codeCtx");
    const badge = document.getElementById("codeCtxBadge");
    const preview = document.getElementById("codeCtxPreview");
    badge.textContent = `📎 ${data.fileName}  L${data.lineStart}–${data.lineEnd}  [${data.language}]`;
    if (data.truncated) { badge.textContent += "  ⚠️ truncated"; }
    // 미리보기: 최대 5줄
    const lines = data.code.split("\n").slice(0, 5);
    preview.textContent = lines.join("\n") + (data.code.split("\n").length > 5 ? "\n…" : "");
    box.classList.add("show");
    document.getElementById("promptInput").focus();
}

function clearInjectedCode() {
    injectedCode = null;
    document.getElementById("codeCtx").classList.remove("show");
    document.getElementById("codeCtxPreview").textContent = "";
    vscode.postMessage({ type: "clearCodeContext" });
}

document.getElementById("codeCtxClear").onclick = clearInjectedCode;

// ── PROJECT ───────────────────────────────────────────────────────────────

function openProjModal() {
    projModalOpen = true;
    document.getElementById("projOverlay").classList.add("show");
    document.getElementById("projNewInput").value = "";
    document.getElementById("projNewBtn").disabled = false;
    document.getElementById("projNewBtn").textContent = "+ 생성";
    vscode.postMessage({ type: "projectList" });
}

function closeProjModal() {
    projModalOpen = false;
    document.getElementById("projOverlay").classList.remove("show");
}

function updateProjBar() {
    const bar = document.getElementById("projBar");
    if (currentProject) {
        document.getElementById("projBarLabel").textContent = currentProject;
        bar.style.display = "flex";
    } else {
        bar.style.display = "none";
    }
}

function renderProjList(projects, current) {
    const list = document.getElementById("projList");
    list.innerHTML = "";
    if (!projects || projects.length === 0) {
        list.innerHTML = '<div class="proj-list-empty">프로젝트가 없습니다<br>아래에서 새로 생성하세요</div>';
        return;
    }
    projects.forEach(p => {
        const div = document.createElement("div");
        div.className = "proj-item" + (p.name === current ? " cur" : "");
        const nameSpan = document.createElement("span");
        nameSpan.textContent = "📁 " + p.name;
        nameSpan.style.flex = "1";
        const dateSpan = document.createElement("span");
        dateSpan.className = "proj-item-date";
        if (p.lastActive) { dateSpan.textContent = p.lastActive.slice(0, 10); }
        div.appendChild(nameSpan);
        div.appendChild(dateSpan);
        div.onclick = () => vscode.postMessage({ type: "projectSelect", name: p.name });
        list.appendChild(div);
    });
}

function showCtxToast(msg) {
    const el = document.getElementById("ctxToast");
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 3000);
}

function createProject() {
    const name = document.getElementById("projNewInput").value.trim();
    if (!name) { document.getElementById("projNewInput").focus(); return; }
    const btn = document.getElementById("projNewBtn");
    btn.disabled = true;
    btn.textContent = "생성 중...";
    vscode.postMessage({ type: "projectNew", name });
}

document.getElementById("projBtn").onclick = openProjModal;
document.getElementById("projBar").onclick = openProjModal;
document.getElementById("projModalClose").onclick = closeProjModal;
document.getElementById("projOverlay").onclick = e => {
    if (e.target === document.getElementById("projOverlay")) { closeProjModal(); }
};
document.getElementById("projNewBtn").onclick = createProject;
document.getElementById("projNewInput").addEventListener("keydown", e => {
    if (e.key === "Enter") { createProject(); }
    if (e.key === "Escape") { closeProjModal(); }
});

// ── 음성 입력 (Web Speech API) ────────────────────────────────────────────────
let _recognition = null;
let _isListening = false;

(function initSpeech() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const micBtn = document.getElementById("micBtn");
    if (!SpeechRecognition) {
        micBtn.title = "이 환경에서 음성 입력이 지원되지 않습니다";
        micBtn.style.opacity = "0.3";
        micBtn.disabled = true;
        return;
    }
    _recognition = new SpeechRecognition();
    _recognition.continuous = false;
    _recognition.interimResults = true;

    _recognition.onstart = () => {
        _isListening = true;
        micBtn.classList.add("mic-on");
        micBtn.title = "듣는 중... (클릭하여 중지)";
    };

    _recognition.onresult = (e) => {
        let interim = "", final = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
            const t = e.results[i][0].transcript;
            if (e.results[i].isFinal) { final += t; } else { interim += t; }
        }
        const inp = document.getElementById("promptInput");
        const base = inp.dataset.speechBase || inp.value;
        inp.value = base + (final || interim);
        if (final) { inp.dataset.speechBase = ""; }
        inp.style.height = "auto";
        inp.style.height = Math.min(inp.scrollHeight, 120) + "px";
    };

    _recognition.onend = () => {
        _isListening = false;
        micBtn.classList.remove("mic-on");
        micBtn.title = "음성 입력 (한국어/영어)";
        const inp = document.getElementById("promptInput");
        delete inp.dataset.speechBase;
    };

    _recognition.onerror = (e) => {
        _isListening = false;
        micBtn.classList.remove("mic-on");
        if (e.error !== "aborted") { showCtxToast("🎙 음성 오류: " + e.error); }
    };

    micBtn.onclick = () => {
        if (_isListening) {
            _recognition.stop();
        } else {
            _recognition.lang = englishMode ? "en-US" : "ko-KR";
            const inp = document.getElementById("promptInput");
            inp.dataset.speechBase = inp.value;
            _recognition.start();
        }
    };
})();
// ─────────────────────────────────────────────────────────────────────────────

// ── 언어 선택 모달 ─────────────────────────────────────────────────────────────
let _pendingLang = lang;
let _isFirstRun = false;

function openLangModal(firstRun) {
    _isFirstRun = !!firstRun;
    _pendingLang = lang;
    applyI18n(lang); // refresh modal labels
    document.getElementById("langOverlay").classList.add("show");
}

function closeLangModal() {
    if (_isFirstRun) { return; } // cannot close without selecting on first run
    document.getElementById("langOverlay").classList.remove("show");
}

document.querySelectorAll(".lang-opt").forEach(btn => {
    btn.addEventListener("click", () => {
        _pendingLang = btn.dataset.lang;
        document.querySelectorAll(".lang-opt").forEach(b => b.classList.toggle("lang-opt-sel", b === btn));
    });
});

document.getElementById("langConfirm").addEventListener("click", () => {
    if (!_pendingLang) { return; }
    vscode.postMessage({ type: "setLanguage", lang: _pendingLang });
    applyI18n(_pendingLang);
    document.getElementById("langOverlay").classList.remove("show");
    _isFirstRun = false;
});

document.getElementById("langOverlay").addEventListener("click", e => {
    if (e.target === document.getElementById("langOverlay")) { closeLangModal(); }
});

document.getElementById("langBtn").addEventListener("click", () => openLangModal(false));

// ─────────────────────────────────────────────────────────────────────────────
// ── 설치 마법사 & 모델 관리 ──────────────────────────────────────────────────

const WIZARD_MODELS = [
    { name: "gemma3:1b",        size: "815MB",  label: "Gemma 3 1B",       tag: "빠름 · 기본값",   rec: false },
    { name: "gemma3:4b",        size: "2.5GB",  label: "Gemma 3 4B",       tag: "권장 ⭐",          rec: true  },
    { name: "gemma3:12b",       size: "7.4GB",  label: "Gemma 3 12B",      tag: "고성능",           rec: false },
    { name: "gemma3:27b",       size: "15GB",   label: "Gemma 3 27B",      tag: "최고 성능",        rec: false },
    { name: "nomic-embed-text", size: "274MB",  label: "nomic-embed-text", tag: "RAG 필수",         rec: true,
      tooltip: "RAG 육성 시스템 작동에 필수" },
    { name: "qwen2.5:3b",            size: "2.0GB",  label: "Qwen 2.5 3B",           tag: "다국어",                  rec: false },
    { name: "llama3.2:3b",           size: "2.0GB",  label: "Llama 3.2 3B",          tag: "영어 강함",               rec: false },
    { name: "qwen2.5-coder:1.5b",   size: "986MB",  label: "Qwen2.5-Coder 1.5B",    tag: "💻 코딩 특화 · PN40 권장", rec: false,
      tooltip: "코드 생성·리뷰·디버깅에 최적화. 경량으로 PN40 서버 전용 권장." },
    { name: "qwen2.5-coder:3b",     size: "1.9GB",  label: "Qwen2.5-Coder 3B",      tag: "💻 코딩 특화 · T480s 권장", rec: false,
      tooltip: "코드 생성·리뷰·디버깅에 최적화. T480s 클라이언트 로컬 실행 권장." },
];

let _wizInstalledModels = [];
let _wizInstallQueue    = [];
let _wizInstallIdx      = 0;

function _wizSafeId(name) { return name.replace(/[^a-zA-Z0-9]/g, "_"); }

function wizGoTo(step) {
    for (let i = 1; i <= 5; i++) {
        const stepEl = document.getElementById("wizStep" + i);
        const dotEl  = document.getElementById("wizDot"  + i);
        if (stepEl) { stepEl.style.display = (i === step) ? "" : "none"; }
        if (dotEl) {
            dotEl.classList.toggle("active", i === step);
            dotEl.classList.toggle("done",   i < step);
        }
    }
}

function openWizard() {
    document.getElementById("wizOverlay").classList.add("show");
    wizGoTo(1);
    _wizInstallQueue = [];
    _wizInstallIdx   = 0;
}

function closeWizard() {
    document.getElementById("wizOverlay").classList.remove("show");
}

function wizCheckServer() {
    const spinEl  = document.getElementById("wizConnSpin");
    const msgEl   = document.getElementById("wizConnMsg");
    const nextEl  = document.getElementById("wizStep2Next");
    const retryEl = document.getElementById("wizStep2Retry");
    const secEl   = document.getElementById("wizInstalledSection");
    spinEl.classList.remove("hidden");
    msgEl.textContent = "PN40 연결 중...";
    msgEl.style.color = "";
    nextEl.disabled = true;
    retryEl.style.display = "none";
    secEl.style.display = "none";
    vscode.postMessage({ type: "wizardGetInfo" });
}

function wizRenderModelList() {
    const listEl = document.getElementById("wizModelList");
    listEl.innerHTML = WIZARD_MODELS.map(m => {
        const installed = _wizInstalledModels.some(im =>
            im === m.name || im.startsWith(m.name + ":"));
        const tooltipAttr = m.tooltip ? ' title="' + m.tooltip + '"' : "";
        return '<label class="wiz-model-item"' + tooltipAttr + '>' +
            '<input type="checkbox" class="wiz-model-cb" data-model="' + m.name + '"' +
            (installed ? " checked" : "") + '>' +
            '<div class="wiz-model-info">' +
              '<span class="wiz-model-name">' + m.label + '</span>' +
              '<span class="wiz-model-size">' + m.size + '</span>' +
            '</div>' +
            '<div class="wiz-model-badges">' +
              '<span class="wiz-model-tag' + (m.rec ? " rec" : "") + '">' + m.tag + '</span>' +
              (installed ? '<span class="wiz-inst-badge">✓ 설치됨</span>' : "") +
            '</div>' +
        '</label>';
    }).join("");
}

function wizRenderInstallList() {
    const listEl = document.getElementById("wizInstallList");
    listEl.innerHTML = _wizInstallQueue.map(name => {
        const sid = _wizSafeId(name);
        return '<div class="wiz-inst-item" id="wizInstItem_' + sid + '">' +
            '<div class="wiz-inst-name">' + name + '</div>' +
            '<div class="wiz-inst-status" id="wizInstStatus_' + sid + '">대기 중...</div>' +
            '<div class="wiz-prog-bar"><div class="wiz-prog-fill" id="wizProgFill_' + sid + '" style="width:0%"></div></div>' +
        '</div>';
    }).join("");
}

function wizInstallNext() {
    if (_wizInstallIdx >= _wizInstallQueue.length) {
        wizGoTo(5);
        renderWizCompleteList();
        return;
    }
    const name     = _wizInstallQueue[_wizInstallIdx];
    const sid      = _wizSafeId(name);
    const statusEl = document.getElementById("wizInstStatus_" + sid);
    if (statusEl) { statusEl.textContent = "시작 중..."; }
    vscode.postMessage({ type: "wizardInstallModel", name });
}

function renderWizCompleteList() {
    const listEl = document.getElementById("wizCompleteList");
    if (_wizInstallQueue.length === 0) {
        listEl.innerHTML = '<div class="wiz-complete-note">선택한 모델이 이미 모두 설치되어 있습니다.</div>';
    } else {
        listEl.innerHTML = '<div class="wiz-complete-note">설치 작업 완료:</div>' +
            _wizInstallQueue.map(m => '<div class="wiz-complete-item">✅ ' + m + '</div>').join("");
    }
}

// ── 모델 관리 ─────────────────────────────────────────────────────────────────

function openModelMgr() {
    document.getElementById("modelMgrOverlay").classList.add("show");
    document.getElementById("modelMgrBody").innerHTML = '<div class="modelmgr-loading">로드 중...</div>';
    vscode.postMessage({ type: "wizardGetInfo" });
}

function closeModelMgr() {
    document.getElementById("modelMgrOverlay").classList.remove("show");
}

function renderModelMgrList(models) {
    const bodyEl = document.getElementById("modelMgrBody");
    if (!bodyEl) { return; }
    if (!models || models.length === 0) {
        bodyEl.innerHTML = '<div class="modelmgr-empty">설치된 모델이 없습니다</div>';
        return;
    }
    bodyEl.innerHTML = models.map(m =>
        '<div class="modelmgr-item">' +
            '<span class="modelmgr-name">' + m + '</span>' +
            '<button class="modelmgr-del-btn" data-model="' + m + '" title="삭제">🗑</button>' +
        '</div>'
    ).join("");
    bodyEl.querySelectorAll(".modelmgr-del-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            if (!confirm('"' + btn.dataset.model + '" 모델을 삭제하시겠습니까?\n(이 작업은 되돌릴 수 없습니다)')) { return; }
            btn.disabled = true;
            btn.textContent = "...";
            vscode.postMessage({ type: "wizardDeleteModel", name: btn.dataset.model });
        });
    });
}

// ── 이벤트 바인딩 ──────────────────────────────────────────────────────────────

document.getElementById("wizCloseBtn").addEventListener("click", closeWizard);
document.getElementById("wizOverlay").addEventListener("click", e => {
    if (e.target === document.getElementById("wizOverlay")) { closeWizard(); }
});

// Step 1
document.getElementById("wizStartBtn").addEventListener("click", () => {
    wizGoTo(2);
    wizCheckServer();
});

// Step 2
document.getElementById("wizStep2Back").addEventListener("click",  () => wizGoTo(1));
document.getElementById("wizStep2Retry").addEventListener("click", wizCheckServer);
document.getElementById("wizStep2Next").addEventListener("click",  () => {
    wizGoTo(3);
    wizRenderModelList();
});

// Step 3
document.getElementById("wizStep3Back").addEventListener("click", () => wizGoTo(2));
document.getElementById("wizRecBtn").addEventListener("click", () => {
    document.querySelectorAll(".wiz-model-cb").forEach(cb => {
        const m = WIZARD_MODELS.find(mo => mo.name === cb.dataset.model);
        cb.checked = !!(m && m.rec);
    });
});
document.getElementById("wizStep3Next").addEventListener("click", () => {
    _wizInstallQueue = [];
    document.querySelectorAll(".wiz-model-cb:checked").forEach(cb => {
        const name = cb.dataset.model;
        const alreadyInstalled = _wizInstalledModels.some(im =>
            im === name || im.startsWith(name + ":"));
        if (!alreadyInstalled) { _wizInstallQueue.push(name); }
    });
    if (_wizInstallQueue.length === 0) {
        wizGoTo(5);
        renderWizCompleteList();
        return;
    }
    wizGoTo(4);
    wizRenderInstallList();
    _wizInstallIdx = 0;
    wizInstallNext();
});

// Step 4
document.getElementById("wizStep4Cancel").addEventListener("click", () => {
    vscode.postMessage({ type: "wizardCancelInstall" });
});

// Step 5
document.getElementById("wizDoneBtn").addEventListener("click",    closeWizard);
document.getElementById("wizModelMgrBtn").addEventListener("click", () => {
    closeWizard();
    openModelMgr();
});

// 모델 관리
document.getElementById("modelMgrCloseBtn").addEventListener("click", closeModelMgr);
document.getElementById("modelMgrOverlay").addEventListener("click", e => {
    if (e.target === document.getElementById("modelMgrOverlay")) { closeModelMgr(); }
});
document.getElementById("modelMgrWizBtn").addEventListener("click", () => {
    closeModelMgr();
    openWizard();
});

// ─────────────────────────────────────────────────────────────────────────────
// ── RSS 피드 ─────────────────────────────────────────────────────────────────

const PLATFORM_ICON = { youtube: "🎬", reddit: "💬", blog: "📝" };

function renderRssFeeds(feeds) {
    const listEl = document.getElementById("rssFeedList");
    if (!feeds || feeds.length === 0) {
        listEl.innerHTML = '<div class="rss-empty">구독 중인 피드가 없습니다.<br>+ 구독 추가로 시작하세요.</div>';
        return;
    }
    listEl.innerHTML = feeds.map(f => {
        const icon = PLATFORM_ICON[f.platform] || "📡";
        const lastFetched = f.lastFetched
            ? new Date(f.lastFetched).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
            : "미갱신";
        const isWp = f.mode === "whitepaper";
        return '<div class="rss-feed-item">' +
            '<span class="rss-feed-icon">' + icon + '</span>' +
            '<div class="rss-feed-info">' +
              '<div class="rss-feed-name">' + escapeHtml(f.name || f.url) + '</div>' +
              '<div class="rss-feed-meta">' + escapeHtml(f.platform) + ' · ' + lastFetched + '</div>' +
            '</div>' +
            '<div class="rss-feed-actions">' +
              '<span class="rss-interval-chip">' + f.interval + '</span>' +
              '<span class="rss-mode-chip' + (isWp ? ' wp' : '') + '">' +
                (isWp ? '📋' : '📄') +
              '</span>' +
              '<button class="rss-del-btn" data-id="' + f.id + '" title="구독 해제">✕</button>' +
            '</div>' +
        '</div>';
    }).join("");
    listEl.querySelectorAll(".rss-del-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            if (!confirm('"' + btn.closest(".rss-feed-item").querySelector(".rss-feed-name").textContent + '" 구독을 해제하시겠습니까?\n(수집된 .md 파일은 유지됩니다)')) { return; }
            vscode.postMessage({ type: "rssDeleteFeed", id: btn.dataset.id });
        });
    });
}

function renderRssNotifications(notifs, total) {
    const badge  = document.getElementById("rssNotifBadge");
    const sec    = document.getElementById("rssNotifSection");
    const listEl = document.getElementById("rssNotifList");
    const label  = document.getElementById("rssNotifLabel");

    if (!notifs || notifs.length === 0) {
        if (badge)  { badge.style.display = "none"; }
        if (sec)    { sec.style.display = "none"; }
        return;
    }
    if (badge)  { badge.textContent = total; badge.style.display = ""; }
    if (label)  { label.textContent = "새 항목 " + total + "개"; }
    if (sec)    { sec.style.display = ""; }
    if (!listEl) { return; }

    listEl.innerHTML = notifs.slice(0, 10).map(n =>
        '<div class="rss-notif-item" data-path="' + escapeHtml(n.relPath) + '">' +
            '<span class="rss-notif-src">' + escapeHtml(n.feedName || "RSS") + '</span>' +
            '<span class="rss-notif-title">' + escapeHtml(n.title) + '</span>' +
            '<span class="rss-notif-open" title="VS Code에서 열기">📂</span>' +
        '</div>'
    ).join("");

    listEl.querySelectorAll(".rss-notif-item").forEach(row => {
        row.addEventListener("click", () => {
            vscode.postMessage({ type: "rssOpenFile", relPath: row.dataset.path });
        });
    });
}

function escapeHtml(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function rssOpenForm() {
    document.getElementById("rssFormWrap").style.display = "";
    document.getElementById("rssFeedUrl").value = "";
    document.getElementById("rssFeedName").value = "";
    document.getElementById("rssFormNote").textContent = "";
    document.getElementById("rssFeedUrl").focus();
}

function rssCloseForm() {
    document.getElementById("rssFormWrap").style.display = "none";
    document.getElementById("rssFormSave").disabled = false;
    document.getElementById("rssFormSave").textContent = "구독 시작";
}

// ── RSS 이벤트 바인딩 ────────────────────────────────────────────────────────

document.getElementById("rssAddBtn").addEventListener("click", rssOpenForm);
document.getElementById("rssFormClose").addEventListener("click", rssCloseForm);
document.getElementById("rssFormCancel").addEventListener("click", rssCloseForm);

document.getElementById("rssPlatform").addEventListener("change", () => {
    const plat = document.getElementById("rssPlatform").value;
    const note = document.getElementById("rssFormNote");
    if (plat === "youtube") {
        note.textContent = "예: https://youtube.com/@channelname  또는  https://youtube.com/channel/UCxxx";
    } else if (plat === "reddit") {
        note.textContent = "예: https://www.reddit.com/r/MachineLearning/.rss";
    } else {
        note.textContent = "RSS/Atom 피드 URL을 직접 입력하세요.";
    }
});

document.getElementById("rssFormSave").addEventListener("click", () => {
    const url  = document.getElementById("rssFeedUrl").value.trim();
    const name = document.getElementById("rssFeedName").value.trim();
    const plat = document.getElementById("rssPlatform").value;
    const note = document.getElementById("rssFormNote");
    const sel  = document.getElementById("rssIntervalSel");
    const interval = sel ? sel.value : "1h";

    const modeRadio = document.querySelector('input[name="rssFeedMode"]:checked');
    const mode = modeRadio ? modeRadio.value : "summary";

    if (!url) { note.textContent = "❌ URL을 입력하세요."; return; }
    if (!/^https?:\/\//i.test(url)) {
        note.textContent = "❌ http(s) URL만 허용됩니다.";
        return;
    }
    const saveBtn = document.getElementById("rssFormSave");
    saveBtn.disabled = true;
    saveBtn.textContent = "저장 중...";
    note.textContent = "";
    vscode.postMessage({ type: "rssAddFeed", platform: plat, url, name, interval, mode });
});

// 기술 백서 선택 시 안내 표시
document.querySelectorAll('input[name="rssFeedMode"]').forEach(radio => {
    radio.addEventListener("change", () => {
        const noteEl = document.getElementById("rssModeNote");
        if (noteEl) { noteEl.style.display = radio.value === "whitepaper" ? "" : "none"; }
    });
});

document.getElementById("rssFetchNowBtn").addEventListener("click", () => {
    vscode.postMessage({ type: "rssFetchNow" });
});

document.getElementById("rssAckAllBtn").addEventListener("click", () => {
    vscode.postMessage({ type: "rssAckAll" });
});

// ─────────────────────────────────────────────────────────────────────────────
// ── 자가 진화 시스템 (Phase 20) ────────────────────────────────────────────────

let _evoPendingProposedText = "";
let _evoPendingExplanation  = "";

function openEvo() {
    document.getElementById("evoOverlay").classList.add("show");
    vscode.postMessage({ type: "evoGetHistory" });
}

function closeEvo() {
    document.getElementById("evoOverlay").classList.remove("show");
}

function evoSwitchTab(tab) {
    ["A","B","C","D"].forEach(t => {
        document.getElementById("evoTab"  + t).classList.toggle("on", t === tab);
        document.getElementById("evoPanel" + t).style.display = t === tab ? "" : "none";
    });
}

function evoSetResult(elId, html, ok) {
    const el = document.getElementById(elId);
    if (!el) { return; }
    el.innerHTML = '<span style="color:' + (ok ? "#4ec9b0" : "var(--vscode-errorForeground)") + '">' + html + '</span>';
}

// ── 탭 이벤트 ──────────────────────────────────────────────────────────────
["A","B","C","D"].forEach(t => {
    document.getElementById("evoTab" + t).addEventListener("click", () => evoSwitchTab(t));
});

document.getElementById("evoBtn").addEventListener("click", openEvo);
document.getElementById("evoCloseBtn").addEventListener("click", closeEvo);
document.getElementById("evoOverlay").addEventListener("click", e => {
    if (e.target === document.getElementById("evoOverlay")) { closeEvo(); }
});

// ── A단계: RAG 흡수 ────────────────────────────────────────────────────────

document.getElementById("evoPickFileBtn").addEventListener("click", () => {
    vscode.postMessage({ type: "evoPickFile" });
});

document.getElementById("evoAbsorbBtn").addEventListener("click", () => {
    const collection = document.getElementById("evoCollection").value;
    const content    = document.getElementById("evoPreviewBody").textContent;
    const filePath   = document.getElementById("evoPreviewFname").dataset.path || "";
    document.getElementById("evoAbsorbBtn").disabled = true;
    document.getElementById("evoAbsorbBtn").textContent = "학습 중... (최대 5분)";
    vscode.postMessage({ type: "evoAbsorb", content, filePath, collection });
});

// ── B단계: 시스템 프롬프트 ─────────────────────────────────────────────────

document.getElementById("evoProposePromptBtn").addEventListener("click", () => {
    document.getElementById("evoDiffArea").style.display = "none";
    vscode.postMessage({ type: "evoProposePrompt" });
    document.getElementById("evoProposePromptBtn").disabled = true;
    document.getElementById("evoProposePromptBtn").textContent = "분석 중... (최대 5분)";
});

document.getElementById("evoApplyPromptBtn").addEventListener("click", () => {
    if (!_evoPendingProposedText) { return; }
    vscode.postMessage({
        type: "evoApplyPrompt",
        proposedText: _evoPendingProposedText,
        explanation: _evoPendingExplanation
    });
});

document.getElementById("evoRejectPromptBtn").addEventListener("click", () => {
    document.getElementById("evoDiffArea").style.display = "none";
    _evoPendingProposedText = "";
    evoSetResult("evoPromptResult", "거부됨.", false);
});

document.getElementById("evoRollbackPromptBtn").addEventListener("click", () => {
    if (!confirm("이전 시스템 프롬프트로 롤백하시겠습니까?")) { return; }
    vscode.postMessage({ type: "evoRollbackPrompt" });
});

// ── C단계: 모델 감지 ───────────────────────────────────────────────────────

document.getElementById("evoDetectModelBtn").addEventListener("click", () => {
    const text = document.getElementById("evoModelScanText").value.trim();
    if (!text) { evoSetResult("evoModelList", "텍스트를 입력하세요.", false); return; }
    document.getElementById("evoDetectModelBtn").disabled = true;
    document.getElementById("evoDetectModelBtn").textContent = "감지 중... (최대 5분)";
    vscode.postMessage({ type: "evoDetectModel", text });
});

// ── D단계: 코드 수정 ───────────────────────────────────────────────────────

document.getElementById("evoProposeCodeBtn").addEventListener("click", () => {
    const oldCode     = document.getElementById("evoCodeOldText").value.trim();
    const description = document.getElementById("evoCodeDescText").value.trim();
    const targetFile  = document.getElementById("evoTargetFile").value;
    if (!oldCode || !description) {
        evoSetResult("evoCodeResult", "기존 코드와 설명을 모두 입력하세요.", false);
        return;
    }
    document.getElementById("evoCodeProposalArea").style.display = "none";
    document.getElementById("evoProposeCodeBtn").disabled = true;
    document.getElementById("evoProposeCodeBtn").textContent = "제안 중... (최대 5분)";
    vscode.postMessage({ type: "evoProposeCode", oldCode, description, targetFile });
});

document.getElementById("evoApplyCodeBtn").addEventListener("click", () => {
    const description = document.getElementById("evoCodeDescText").value.trim();
    vscode.postMessage({ type: "evoApplyCode", description });
});

document.getElementById("evoRejectCodeBtn").addEventListener("click", () => {
    document.getElementById("evoCodeProposalArea").style.display = "none";
    evoSetResult("evoCodeResult", "거부됨.", false);
});

document.getElementById("evoRollbackCodeBtn").addEventListener("click", () => {
    if (!confirm("extension-ui 브랜치로 복귀하시겠습니까?")) { return; }
    vscode.postMessage({ type: "evoRollbackCode" });
});

document.getElementById("evoHistBtn").addEventListener("click", () => {
    const hist = document.getElementById("evoHistContent");
    if (hist.style.display === "none") {
        hist.style.display = "";
        document.getElementById("evoHistBtn").textContent = t("evoHistLabel") + " ▴";
        vscode.postMessage({ type: "evoGetHistory" });
    } else {
        hist.style.display = "none";
        document.getElementById("evoHistBtn").textContent = t("evoHistLabel") + " ▾";
    }
});

// ── 진화 메시지 핸들러 (message 이벤트와 별개로 함수만 정의) ─────────────────

function handleEvoMessage(m) {
    switch (m.type) {
        case "evoFilePicked":
            {
                const fname = document.getElementById("evoPreviewFname");
                fname.textContent = m.filePath.split("/").pop() + " (" + (m.size / 1024).toFixed(1) + " KB)";
                fname.dataset.path = m.filePath;
                document.getElementById("evoPreviewBody").textContent = m.preview + (m.size > 600 ? "\n…" : "");
                document.getElementById("evoFilePreview").style.display = "";
                document.getElementById("evoAbsorbBtn").disabled = false;
                document.getElementById("evoAbsorbBtn").textContent = "✅ 이 백서를 학습할까요?";
                evoSetResult("evoAbsorbResult", "", true);
            }
            break;

        case "evoAbsorbDone":
            {
                const note = m.fallback ? " (RAG 엔진 없음, 파일 저장)" : "";
                evoSetResult("evoAbsorbResult",
                    `✅ 학습 완료 — ${m.collection} 컬렉션, ${m.chunks}청크${note}`, true);
                document.getElementById("evoFilePreview").style.display = "none";
                document.getElementById("evoAbsorbBtn").disabled = false;
                document.getElementById("evoAbsorbBtn").textContent = "✅ 이 백서를 학습할까요?";
            }
            break;

        case "evoProposing":
            break;

        case "evoPromptProposal":
            {
                _evoPendingProposedText = m.proposedText;
                _evoPendingExplanation  = m.explanation || "";
                document.getElementById("evoDiff").textContent = m.proposedText;
                document.getElementById("evoDiffExplain").textContent = m.explanation || "";
                document.getElementById("evoDiffArea").style.display = "";
                const curArea = document.getElementById("evoCurrentPromptArea");
                if (m.current) {
                    document.getElementById("evoCurrentPrompt").textContent = m.current;
                    curArea.style.display = "";
                } else {
                    curArea.style.display = "none";
                }
                const btn = document.getElementById("evoProposePromptBtn");
                btn.disabled = false; btn.textContent = "🔍 프롬프트 갱신 제안";
            }
            break;

        case "evoPromptApplied":
            {
                document.getElementById("evoDiffArea").style.display = "none";
                document.getElementById("evoCurrentPrompt").textContent = m.current;
                document.getElementById("evoCurrentPromptArea").style.display = "";
                evoSetResult("evoPromptResult",
                    `✅ 프롬프트 적용됨 (이력 ${m.historyLen}개)`, true);
                _evoPendingProposedText = "";
            }
            break;

        case "evoPromptRolledBack":
            {
                if (m.current) {
                    document.getElementById("evoCurrentPrompt").textContent = m.current;
                    document.getElementById("evoCurrentPromptArea").style.display = "";
                } else {
                    document.getElementById("evoCurrentPromptArea").style.display = "none";
                }
                evoSetResult("evoPromptResult",
                    `↩ 롤백 완료 (남은 이력 ${m.historyLen}개)`, true);
            }
            break;

        case "evoDetecting":
            break;

        case "evoModelDetected":
            {
                const listEl = document.getElementById("evoModelList");
                const btn    = document.getElementById("evoDetectModelBtn");
                btn.disabled = false; btn.textContent = "🔍 모델 감지";
                if (!m.models || m.models.length === 0) {
                    listEl.innerHTML = '<div class="evo-desc">감지된 모델 없음</div>';
                    return;
                }
                listEl.innerHTML = m.models.map(mo =>
                    '<div class="evo-model-item">' +
                        '<span class="evo-model-name">' + escapeHtml(mo.name) + '</span>' +
                        '<span class="evo-model-size">≈' + (mo.size_gb_est || "?") + ' GB</span>' +
                        '<button class="evo-install-btn" data-model="' + escapeHtml(mo.name) + '">' +
                          '설치 마법사 →</button>' +
                    '</div>'
                ).join("");
                listEl.querySelectorAll(".evo-install-btn").forEach(btn => {
                    btn.addEventListener("click", () => {
                        vscode.postMessage({ type: "evoTriggerInstall" });
                        closeEvo();
                    });
                });
            }
            break;

        case "evoAutoRejected":
            {
                const btn = document.getElementById("evoProposeCodeBtn");
                btn.disabled = false; btn.textContent = "💡 코드 변경 제안";
                evoSetResult("evoCodeResult",
                    "🚫 자동 거부: " + escapeHtml(m.reason), false);
            }
            break;

        case "evoCodeProposal":
            {
                const btn = document.getElementById("evoProposeCodeBtn");
                btn.disabled = false; btn.textContent = "💡 코드 변경 제안";
                document.getElementById("evoCodeDiff").textContent = m.newCode;
                document.getElementById("evoCodeExplain").textContent = m.explanation || "";
                document.getElementById("evoCodeProposalArea").style.display = "";
                evoSetResult("evoCodeResult", "", true);
            }
            break;

        case "evoCompiling":
            evoSetResult("evoCodeResult", "⚙️ 컴파일 검증 중...", true);
            break;

        case "evoCodeApplied":
            {
                document.getElementById("evoCodeProposalArea").style.display = "none";
                const branchInfo = document.getElementById("evoBranchInfo");
                branchInfo.innerHTML =
                    '브랜치: <code>' + escapeHtml(m.branch) + '</code><br>' +
                    '파일: <code>' + escapeHtml(m.targetFile) + '</code>';
                document.getElementById("evoBranchArea").style.display = "";
                evoSetResult("evoCodeResult",
                    "✅ 적용됨. 며칠 사용 후 main으로 머지하세요.", true);
            }
            break;

        case "evoCodeCanceled":
            evoSetResult("evoCodeResult", "취소됨.", false);
            break;

        case "evoCodeRolledBack":
            document.getElementById("evoBranchArea").style.display = "none";
            evoSetResult("evoCodeResult", "↩ extension-ui 복귀 완료", true);
            break;

        case "evoHistory":
            document.getElementById("evoHistContent").textContent = m.content;
            break;

        case "evoError":
            {
                ["evoAbsorbResult","evoPromptResult","evoCodeResult"].forEach(id => {
                    const el = document.getElementById(id);
                    if (el && el.closest(".evo-panel").style.display !== "none") {
                        evoSetResult(id, "❌ " + escapeHtml(m.msg), false);
                    }
                });
                const evoModelList = document.getElementById("evoModelList");
                if (evoModelList) { evoModelList.innerHTML = '<span style="color:var(--vscode-errorForeground)">❌ ' + escapeHtml(m.msg) + '</span>'; }
                const btn = document.getElementById("evoProposeCodeBtn");
                if (btn) { btn.disabled = false; btn.textContent = "💡 코드 변경 제안"; }
                const propBtn = document.getElementById("evoProposePromptBtn");
                if (propBtn) { propBtn.disabled = false; propBtn.textContent = "🔍 프롬프트 갱신 제안"; }
                const detectBtn = document.getElementById("evoDetectModelBtn");
                if (detectBtn) { detectBtn.disabled = false; detectBtn.textContent = "🔍 모델 감지"; }
            }
            break;
    }
}

document.getElementById("rssIntervalSel").addEventListener("change", () => {
    const interval = document.getElementById("rssIntervalSel").value;
    vscode.postMessage({ type: "rssUpdateSettings", settings: { interval } });
    showCtxToast("✅ 갱신 주기 변경됨: " + interval + " — PN40 timer에 반영해주세요.");
});
// ─────────────────────────────────────────────────────────────────────────────
// ── 사용 설명서 (Phase 21) ────────────────────────────────────────────────────

let _helpActiveSec = 0;

function openHelp() {
    document.getElementById("helpOverlay").classList.add("show");
    helpSwitchSec(0);
    document.getElementById("helpSearchInput").value = "";
}

function closeHelp() {
    document.getElementById("helpOverlay").classList.remove("show");
}

function helpSwitchSec(idx) {
    _helpActiveSec = idx;
    document.querySelectorAll(".help-sec").forEach((s, i) => s.classList.toggle("on", i === idx));
    document.querySelectorAll(".help-nav-btn").forEach((b, i) => b.classList.toggle("on", i === idx));
    document.getElementById("helpSearchInput").value = "";
}

function helpDoSearch(query) {
    const q = query.trim().toLowerCase();
    const secs = document.querySelectorAll(".help-sec");
    const navBtns = document.querySelectorAll(".help-nav-btn");
    if (!q) {
        secs.forEach((s, i) => s.classList.toggle("on", i === _helpActiveSec));
        navBtns.forEach((b, i) => b.classList.toggle("on", i === _helpActiveSec));
        return;
    }
    let anyMatch = false;
    secs.forEach((sec, i) => {
        const match = sec.textContent.toLowerCase().includes(q);
        sec.classList.toggle("on", match);
        if (navBtns[i]) { navBtns[i].classList.toggle("on", match); }
        if (match) { anyMatch = true; }
    });
    if (!anyMatch) {
        secs[0].classList.add("on");
        if (navBtns[0]) { navBtns[0].classList.add("on"); }
    }
}

document.getElementById("helpBtn").addEventListener("click", openHelp);
document.getElementById("helpCloseBtn").addEventListener("click", closeHelp);
document.getElementById("helpOverlay").addEventListener("click", e => {
    if (e.target === document.getElementById("helpOverlay")) { closeHelp(); }
});

document.getElementById("helpSearchInput").addEventListener("input", e => {
    helpDoSearch(e.target.value);
});

document.querySelectorAll(".help-nav-btn").forEach((btn, i) => {
    btn.addEventListener("click", () => helpSwitchSec(i));
});

document.addEventListener("keydown", e => {
    const overlay = document.getElementById("helpOverlay");
    if (!overlay.classList.contains("show")) { return; }
    if (e.ctrlKey && e.key === "f") {
        e.preventDefault();
        document.getElementById("helpSearchInput").focus();
    }
    if (e.key === "Escape") { closeHelp(); }
});

// ─────────────────────────────────────────────────────────────────────────────
// ── Phase 22: Multi-Cloud AI Domain Routing UI ───────────────────────────────

// ── 도메인 분류 확인 다이얼로그 ────────────────────────────────────────────────

function _openClassifyDialog(data) {
    _classifyPending = {
        top:          data.domain,
        confidence:   data.confidence,
        alternatives: data.alternatives || [],
        allDomains:   data.allDomains   || [],
        selectedKey:  data.domain,
        showAll:      false,
    };

    let overlay = document.getElementById("classifyOverlay");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "classifyOverlay";
        overlay.className = "classify-overlay";
        document.body.appendChild(overlay);
        overlay.addEventListener("click", e => {
            if (e.target === overlay) { _cancelClassify(); }
        });
    }

    _renderClassifyDialog(overlay);
    overlay.classList.add("show");
}

function _renderClassifyDialog(overlay) {
    const p = _classifyPending;
    if (!p) { return; }

    // 표시할 도메인 목록 구성
    const topThree = [
        { key: p.top, confidence: p.confidence, isTop: true },
        ...p.alternatives.slice(0, 2).map(a => ({ key: a.domain, confidence: a.confidence, isTop: false })),
    ];
    const showList = p.showAll ? p.allDomains : topThree;

    const optionsHtml = showList.map(item => {
        const cfg  = p.allDomains.find(d => d.key === item.key) || { key: item.key, displayName: item.key };
        const pct  = item.confidence !== undefined ? Math.round(item.confidence * 100) : null;
        const sel  = p.selectedKey === item.key;
        const star = !p.showAll && item.isTop ? "<span class='classify-star'>★</span> " : "";
        const pctTxt = pct !== null ? `<span class='classify-pct'>(신뢰도 ${pct}%)</span>` : "";
        return `<div class="classify-opt${sel ? " sel" : ""}" data-key="${item.key}">
            <span class="classify-check">${sel ? "●" : "○"}</span>
            ${star}<span class="classify-name">${cfg.displayName || item.key}</span>${pctTxt}
        </div>`;
    }).join("");

    const moreBtn = p.showAll
        ? ""
        : `<div class="classify-more-row"><button class="classify-more-btn" onclick="_classifyShowAll()">기타 도메인 보기...</button></div>`;

    overlay.innerHTML = `
        <div class="classify-dialog">
            <div class="classify-title">🤔 어느 도메인의 질문인가요?</div>
            <p class="classify-sub">다음 중 가장 가까운 도메인을 선택해주세요:</p>
            <div class="classify-opts" id="classifyOpts">${optionsHtml}</div>
            ${moreBtn}
            <div class="classify-learn-row">
                <label><input type="checkbox" id="classifyLearnChk"> 이 선택을 학습 (다음에는 자동 분류)</label>
            </div>
            <div class="classify-btn-row">
                <button class="classify-ok" onclick="_confirmClassify()">확인</button>
                <button class="classify-cancel" onclick="_cancelClassify()">취소 (기본 모델 사용)</button>
            </div>
        </div>`;

    overlay.querySelectorAll(".classify-opt").forEach(el => {
        el.addEventListener("click", () => {
            _classifyPending.selectedKey = el.dataset.key;
            _renderClassifyDialog(overlay);
        });
    });
}

function _classifyShowAll() {
    if (!_classifyPending) { return; }
    _classifyPending.showAll = true;
    const overlay = document.getElementById("classifyOverlay");
    if (overlay) { _renderClassifyDialog(overlay); }
}

function _confirmClassify() {
    const p = _classifyPending;
    if (!p) { return; }
    const domain = p.allDomains.find(d => d.key === p.selectedKey);
    if (!domain) { _cancelClassify(); return; }

    // 선택된 도메인의 매핑에서 provider/model 결정
    const domainCfg = _domainConfigs.find(d => d.key === p.selectedKey);
    let provider = "anthropic";
    let model    = "claude-sonnet-4-6";
    if (domainCfg) {
        // 상태가 valid인 provider 우선
        const anthropicOk = _apiKeyStatuses.find(s => s.provider === "anthropic")?.isSet;
        const geminiOk    = _apiKeyStatuses.find(s => s.provider === "gemini")?.isSet;
        if (anthropicOk) {
            provider = "anthropic";
            model    = domainCfg.modelMapping?.anthropic || "claude-sonnet-4-6";
        } else if (geminiOk) {
            provider = "gemini";
            model    = domainCfg.modelMapping?.gemini || "gemini-2.0-flash";
        }
    }

    const learn = document.getElementById("classifyLearnChk")?.checked || false;

    document.getElementById("classifyOverlay")?.classList.remove("show");
    _classifyPending = null;

    vscode.postMessage({
        type:               "classifyConfirmed",
        domainKey:          p.selectedKey,
        provider,
        model,
        learn,
        extractedKeywords:  [], // 서버 측에서 추출 (작업 7)
    });
}

function _cancelClassify() {
    document.getElementById("classifyOverlay")?.classList.remove("show");
    _classifyPending = null;
    // 기본 PN40 모드로 폴백 — 마지막 userMsg는 이미 표시됨
    appendMsg("assistant", "_(분류 취소됨 — PN40 기본 모드로 응답합니다)_", "system", 0);
}

// ── 라우팅 알림 인포 버블 ────────────────────────────────────────────────────

function _appendRoutingInfo(kind, data) {
    const area = document.getElementById("chatArea");
    if (!area) { return; }
    const div = document.createElement("div");
    div.className = "routing-info " + kind;
    if (kind === "auto") {
        const pct = Math.round((data.confidence || 0) * 100);
        div.textContent = `⚡ 자동 라우팅: ${data.domain} → ${data.provider === "anthropic" ? "Claude" : "Gemini"} ${data.model} (신뢰도 ${pct}%)`;
    } else {
        div.textContent = `⚠️ ${data.reason || "폴백"}`;
    }
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
}

// ── API 키 상태 렌더링 ───────────────────────────────────────────────────────

function _renderApiKeyStatuses() {
    for (const s of _apiKeyStatuses) {
        const row   = document.getElementById(`apiKeyRow-${s.provider}`);
        const badge = document.getElementById(`apiKeyBadge-${s.provider}`);
        const valBtn = document.getElementById(`apiKeyValBtn-${s.provider}`);
        if (!row || !badge) { continue; }

        if (!s.isSet) {
            badge.textContent = "⬜ 미설정";
            badge.className   = "akey-badge unset";
        } else if (s.isValid === null) {
            badge.textContent = "🔘 저장됨 (미검증)";
            badge.className   = "akey-badge saved";
        } else if (s.isValid) {
            badge.textContent = "✅ 유효";
            badge.className   = "akey-badge valid";
        } else {
            badge.textContent = "❌ 무효";
            badge.className   = "akey-badge invalid";
        }
        if (valBtn) { valBtn.disabled = false; }
    }
}

function _setApiKeyValidatingState(provider, validating) {
    const badge  = document.getElementById(`apiKeyBadge-${provider}`);
    const valBtn = document.getElementById(`apiKeyValBtn-${provider}`);
    if (badge)  { badge.textContent = "⏳ 검증 중..."; badge.className = "akey-badge validating"; }
    if (valBtn) { valBtn.disabled = validating; }
}

function _onApiKeyResult(m) {
    _setApiKeyValidatingState(m.provider, false);
    const row = document.getElementById(`apiKeyRow-${m.provider}`);
    const inp = document.getElementById(`apiKeyInp-${m.provider}`);
    if (inp && m.ok) { inp.value = ""; inp.placeholder = m.masked || "저장됨"; }
    showCtxToast(m.msg || (m.ok ? "✅ 저장 완료" : "❌ 오류"));
}

// ── 도메인 설정 테이블 렌더링 ────────────────────────────────────────────────

function _renderDomainTable() {
    const tbody = document.getElementById("domainTableBody");
    if (!tbody) { return; }
    tbody.innerHTML = "";
    for (const d of _domainConfigs) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><label class="toggle-lbl">
                <input type="checkbox" class="domain-toggle" data-key="${d.key}" ${d.enabled ? "checked" : ""}>
                <span class="toggle-track"></span>
            </label></td>
            <td>${d.displayName}</td>
            <td><span class="domain-kw-preview">${d.keywords.slice(0, 5).map(k => k.word).join(", ")}</span></td>
            <td>
                <select class="domain-model-sel" data-key="${d.key}" data-prov="anthropic">
                    ${_modelOptions("anthropic", d.modelMapping.anthropic)}
                </select>
            </td>
            <td>
                <select class="domain-model-sel" data-key="${d.key}" data-prov="gemini">
                    ${_modelOptions("gemini", d.modelMapping.gemini)}
                </select>
            </td>
            <td>
                <button class="domain-kw-btn" data-key="${d.key}">키워드</button>
                ${!d.isBuiltin ? `<button class="domain-del-btn" data-key="${d.key}">삭제</button>` : ""}
            </td>`;
        tbody.appendChild(tr);
    }

    tbody.querySelectorAll(".domain-toggle").forEach(el => {
        el.addEventListener("change", () => {
            vscode.postMessage({ type: "domainToggle", key: el.dataset.key, enabled: el.checked });
        });
    });
    tbody.querySelectorAll(".domain-model-sel").forEach(el => {
        el.addEventListener("change", () => {
            vscode.postMessage({ type: "domainMappingUpdate", key: el.dataset.key, provider: el.dataset.prov, model: el.value });
        });
    });
    tbody.querySelectorAll(".domain-kw-btn").forEach(el => {
        el.addEventListener("click", () => _openKeywordEditor(el.dataset.key));
    });
    tbody.querySelectorAll(".domain-del-btn").forEach(el => {
        el.addEventListener("click", () => {
            if (confirm(`도메인 '${el.dataset.key}'를 완전히 삭제합니다. 복구 불가.`)) {
                vscode.postMessage({ type: "domainDelete", key: el.dataset.key });
            }
        });
    });
}

function _modelOptions(provider, selected) {
    const builtin = {
        anthropic: ["claude-opus-4-7","claude-opus-4-6","claude-sonnet-4-6","claude-haiku-4-5"],
        gemini:    ["gemini-2.5-pro","gemini-2.5-flash","gemini-2.0-flash","gemini-1.5-pro","gemini-1.5-flash"],
    };
    const list = _cloudModels[provider]?.length ? _cloudModels[provider] : builtin[provider];
    return list.map(m => `<option value="${m}" ${m === selected ? "selected" : ""}>${m}</option>`).join("");
}

function _renderCloudModelDropdowns() {
    document.querySelectorAll(".domain-model-sel").forEach(el => {
        const cur = el.value;
        el.innerHTML = _modelOptions(el.dataset.prov, cur);
    });
}

// ── 키워드 편집기 ─────────────────────────────────────────────────────────────

function _openKeywordEditor(domainKey) {
    const d = _domainConfigs.find(x => x.key === domainKey);
    if (!d) { return; }
    const kwText = d.keywords.map(k => k.word).join(", ");
    const input = prompt(`[${d.displayName}] 키워드 편집\n쉼표로 구분하여 입력 (최대 50개):\n`, kwText);
    if (input === null) { return; }
    const words = input.split(",").map(w => w.trim()).filter(w => w);
    const keywords = words.slice(0, 50).map((word, i) => ({
        word, weight: 1.0, learned: d.keywords[i]?.learned || false
    }));
    vscode.postMessage({ type: "domainUpdateKeywords", key: domainKey, keywords });
}

// ── 라우팅 설정 렌더링 ────────────────────────────────────────────────────────

function _renderRoutingSettings() {
    const tog = document.getElementById("routingEnabledTog");
    const thr = document.getElementById("routingThresholdSlider");
    const thrVal = document.getElementById("routingThresholdVal");
    if (tog) { tog.checked = _routingEnabled; }
    if (thr) { thr.value = Math.round(_routingThreshold * 100); }
    if (thrVal) { thrVal.textContent = Math.round(_routingThreshold * 100) + "%"; }
}

// ── 토큰 사용량 렌더링 ────────────────────────────────────────────────────────

function _renderTokenUsage() {
    const el = document.getElementById("tokenUsageSummary");
    if (!el) { return; }
    const today   = _tokenUsage.today   || { costUsd: 0, inputTokens: 0, outputTokens: 0 };
    const monthly = _tokenUsage.monthly || { costUsd: 0, inputTokens: 0, outputTokens: 0 };
    const todayTokens   = (today.inputTokens   || 0) + (today.outputTokens   || 0);
    const monthlyTokens = (monthly.inputTokens || 0) + (monthly.outputTokens || 0);
    el.innerHTML = `
        <div class="usage-row"><span>오늘</span><span>${todayTokens.toLocaleString()} tokens / $${today.costUsd.toFixed(4)}</span></div>
        <div class="usage-row"><span>이번 달</span><span>${monthlyTokens.toLocaleString()} tokens / $${monthly.costUsd.toFixed(4)}</span></div>`;

    // 7일 미니 바 차트
    const daily7 = _tokenUsage.daily7 || [];
    const barEl  = document.getElementById("tokenUsageBar");
    if (barEl && daily7.length) {
        const max = Math.max(...daily7.map(d => d.tokens), 1);
        barEl.innerHTML = daily7.map(d => {
            const h = Math.round((d.tokens / max) * 32);
            const label = d.date.slice(5); // MM-DD
            return `<div class="usage-bar-col"><div class="usage-bar-fill" style="height:${h}px" title="${d.date}: ${d.tokens.toLocaleString()} tokens ($${d.costUsd.toFixed(4)})"></div><div class="usage-bar-label">${label}</div></div>`;
        }).join("");
    }
}

// ── Cloud AI 설정 탭 초기화 ──────────────────────────────────────────────────

function _initCloudTab() {
    vscode.postMessage({ type: "routingGetConfig" });
    vscode.postMessage({ type: "domainGetAll" });
    vscode.postMessage({ type: "tokenUsageGet" });
    vscode.postMessage({ type: "apiKeyGetStatus" });
}

// ── Esc 키로 분류 다이얼로그 닫기 ───────────────────────────────────────────

document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
        const overlay = document.getElementById("classifyOverlay");
        if (overlay?.classList.contains("show")) { _cancelClassify(); }
    }
});
