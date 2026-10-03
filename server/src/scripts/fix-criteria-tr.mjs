import { get, run } from '../db.js';
const M = {
  TEK: ['Teknik Uygulama','İşi doğru, standarda uygun ve hızlı yapma'],
  KAL: ['Kalite','Hata oranı, termin sonrası düzeltme'],
  ZAM: ['Zamanında Teslim','Sözleşme tarihine uyum'],
  MUT: ['Müşteri Memnuniyeti','Şikâyet, geri dönüş, referans'],
  EKI: ['Ekip Çalışması','Bilgi paylaşımı, çırak yetiştirme'],
  DIS: ['Disiplin / Devam','Devam, kıyafet, kurallara uyum'],
};
for (const [code, [name, desc]] of Object.entries(M)) {
  run('UPDATE score_criteria SET name = ?, description = ? WHERE code = ?', [name, desc, code]);
}
console.log('Kriterler guncellendi:', get('SELECT COUNT(*) n FROM score_criteria')?.n);
