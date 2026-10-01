/**
 * TEST ARTLIKLARINI TEMIZLER
 * Portal/payroll testlerinin biraktigi gecici hesap ve musteri kayitlarini siler.
 *
 * Kullanim: node src/scripts/purge-test-users.mjs
 * NOT: Sunucu kapaliyken calistirin (veritabani kilidi olmamali).
 */
import { query, run, tx } from '../db.js';

const USER_PATTERNS = [
  'test_portal%',
  'test_nocust_%',
  'test_badrole_%',
  'test%',
];
const CUSTOMER_PATTERNS = ['PortalTest_%', 'PortalTest_Diger_%'];

let users = 0;
let customers = 0;

tx(() => {
  for (const p of USER_PATTERNS) {
    const rows = query('SELECT id FROM users WHERE username LIKE ?', [p]);
    for (const r of rows) {
      run('DELETE FROM users WHERE id = ?', [r.id]);
      users += 1;
    }
  }
  for (const p of CUSTOMER_PATTERNS) {
    const rows = query('SELECT id FROM customers WHERE company LIKE ?', [p]);
    for (const r of rows) {
      run('DELETE FROM customers WHERE id = ?', [r.id]);
      customers += 1;
    }
  }
});

console.log('');
console.log('Silinen test hesabi  : ' + users);
console.log('Silinen test musteri : ' + customers);
console.log('');
