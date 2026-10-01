/**
 * TELEGRAM TEST — Sunucu üzerinden gerçek mesaj gönderir.
 * Bildirim katmanı çalışıyor mu diye kontrol.
 */
import 'dotenv/config';
import { telegramGonder, telegramAktif } from '../utils/bildirim.js';

console.log('=== TELEGRAM DURUMU ===');
console.log(`  Aktif      : ${telegramAktif() ? 'EVET' : 'HAYIR'}`);
console.log(`  Token      : ${process.env.TELEGRAM_BOT_TOKEN ? 'var' : 'yok'}`);
console.log(`  Chat ID    : ${process.env.TELEGRAM_CHAT_ID || 'yok'}`);
console.log('');

if (!telegramAktif()) {
  console.log('⛔ Ayarlanmamış. .env dosyasını kontrol et.');
  process.exit(1);
}

console.log('=== TEST MESAJI GONDERILIYOR ===');
const ok = await telegramGonder(
  '✅ *Veltron Telegram Bildirimi Çalışıyor*\n\n' +
    'Bu mesajı aldıysan bildirimler hazır.\n\n' +
    'Şimdi şunu yapabilirsin:\n' +
    '• Bir personel şifresini unutursa giriş ekranından talep bırakır\n' +
    '• Talep anında buraya düşer\n' +
    '• Sen *Yönetim → Şifre Talepleri* ekranından onaylarsın\n' +
    '• Sistem geçici şifre üretir, kullanıcı değiştirmeye zorlanır\n\n' +
    'Süre: ' + new Date().toLocaleString('tr-TR')
);

console.log('');
if (ok) {
  console.log('✅ MESAJ GÖNDERİLDİ — telefonunu kontrol et.');
} else {
  console.log('⛔ Gönderilemedi. Token veya chat id hatalı olabilir.');
}