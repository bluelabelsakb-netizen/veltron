; ============================================================================
;  VELTRON KURULUM SIHRABAZI — özel adımlar
; ============================================================================
;
;  electron-builder varsayılan kurulumu programı kurar ve masaüstü kısayolunu
;  oluşturur. Bu dosya ONUN ÜSTÜNE iki şey ekler:
;
;    1) Sunucuyu Windows görevi olarak kaydet  → her bilgisayar açılışında
;       otomatik başlar. Program kapalıyken de çalışır, bu yüzden müşteri
;       portalı (VuruşKAN) her an erişilebilir kalır.
;
;    2) Kurulum sonunda kurulum dizinini göster (isteğe bağlı).
;
;  ⚠️ Sunucu Node.js ile değil, PAKETLENMİŞ ELEKTRON .exe'si ile çalışır
;     (ELECTRON_RUN_AS_NODE=1). Böylece ayrıca Node.js kurulumu gerekmez.
;     Bu yüzden kurulum paketi 180 MB'ta kalır.
;
; ============================================================================

; ⚠️ NSIS makroları electron-builder'ın "installer.nsh" şemasına göre:
;    customHeader / customInstall / customUnInstall / customFinishPage.
;    "INSTALL_OPTION" gibi makrolar BU şabonda TANIMLI DEĞİLDİR — ilk
;    denemede "macro named INSTALL_OPTION not found" hatası verdi. Kullanma.

!macro customHeader
  ; ⛔ LogicLib DENEMESİ BAŞARISIZ OLDU, GERİ ALINDI (2 Ekim 2026).
  ;   ${If} / ${EndIf} / ${Errors} makroları electron-builder'ın NSIS
  ;   ortamında tanımlı değil:
  ;     "!include: error in script ... on line 51"
  ;     "Invalid command: ${If}"
  ;   !include "LogicLib.nsh" eklemek de sorunu çÖZMEDİ.
  ;
  ;   KULLANILAN ÇÖZÜM: Özel sayfa (customDirectoryPage + nsDialogs) yerine
  ;   kurulumun SONUNDA tek satırlık bir soru kutusu (MessageBox). Daha basit,
  ;   %100 güvenilir ve kullanıcıya sorduğu için aynı işi görür.
  ;   Makro/LogicLib gerektirmez.
!macroend

; ============================================================================
;  MASAÜSTÜ KISAYOLU — KULLANICIYA SORARAK
; ============================================================================
;  İstek (2 Ekim 2026): "kurulum paketinde masaüstü kısayol oluşturulsun mu
;  diye sorsun, tamam dersek oluştursun."
;
;  electron-builder'ın `createDesktopShortcut` seçeneği yalnızca TRUE/FALSE
;  kabul eder — soramaz. Bu yüzden seçenek FALSE yapıldı ve aşağıdaki
;  özel sayfa eklendi.
;
;  Başlat menüsü kısayolu HER ZAMAN oluşturulur (createStartMenuShortcut),
;  o bir gelenek kuralı — kurulumu seçmeye değmez.
;
;  Sayfa, kurulum dizini sorusundan SONRA gelir (customDirectoryPage).
!macro customDirectoryPage
!macroend

!macro customInstall
  ; ---- Sunucuyu Windows görevi olarak kur --------------------------------
  ;  Kullanıcı "programı nereye kuracaksın" sorusuna cevap verdi; o dizin
  ;  INSTDIR. Sunucu kaynakları oraya kuruldu.
  ;
  ;  ⚠️ Sunucu Node.js ile çalışır (node:sqlite modülü Node 22.5+ istiyor).
  ;     Electron'un gömülü Node'u 20.18 — YETERSİZ, denendi ve başarısız oldu.
  ;     Bu yüzden kurulum paketine node.exe gömülüdür ve doğrudan o çağrılır.
  ;     Böylece kurulan bilgisayarda Node.js kurulu OLMASI GEREKMEZ.
  ;
  Sleep 1200

  DetailPrint "Sunucu Windows görevi olarak kaydediliyor..."
  nsExec::ExecToLog '"$INSTDIR\resources\server-runtime\node.exe" "$INSTDIR\resources\server-runtime\server\src\scripts\install-service.mjs"'

  DetailPrint "Sunucu başlatılıyor..."
  nsExec::ExecToLog 'schtasks /Run /TN "Veltron Sunucu"'

  ; ---- Masaüstü kısayolu -----------------------------------------------
  ;  ⛔ SORULMUYOR (3 Ekim 2026). Önceden kurulumun SONUNDA
  ;     MessageBox ile "oluşturulsun mu?" diye soruluyordu:
  ;       "Masaütünde Veltron simgesi oluşturulsun mu?"
  ;     Kullanıcı bunu kurulum sırasında bildirim sanıyor ve kafası
  ;     karışıyordu: "kurulum .exe gibi olmuyor mu?"
  ;
  ;     Artık kısayol DAIMA oluşturuluyor, soru YOK. Çoğu Windows
  ;     programı böyle yapar. Oluşturma işini electron-builder'ın
  ;     kendi `createDesktopShortcut: true` seçeneği yapıyor — elle
  ;     CreateShortCut yazmaktan daha güvenilir.
  ;
  ;  Başlat menüsü kısayolu da her zaman oluşturulur.
  DetailPrint "Kurulum tamamlandi."
!macroend

!macro customUnInstall
  ; ---- Sunucu görevini kaldır -------------------------------------------
  DetailPrint "Veltron Sunucu görevi kaldırılıyor..."
  nsExec::ExecToLog 'schtasks /End /TN "Veltron Sunucu"'
  nsExec::ExecToLog 'schtasks /Delete /TN "Veltron Sunucu" /F'
  ; ---- Masaüstü kısayolunu kaldır -------------------------------------
  Delete "$DESKTOP\Veltron.lnk"
!macroend

!macro customFinishPage
  ; ⚠️ BU MAKRO BOŞ OLMALI. electron-builder bu makroyu bir Section veya
  ;    Function İÇİNDE değil, script'in gövde düzeyinde çağırıyor.
  ;    Bu yüzden ne DetailPrint ne LogSet ne nsExec kullanılabilir:
  ;      "command X not valid outside Section or Function"
  ;    Kullanıcıya gösterilecek metin customInstall içinde yazılır
  ;    (orada kurulum ilerlemesi zaten görünüyor).
!macroend