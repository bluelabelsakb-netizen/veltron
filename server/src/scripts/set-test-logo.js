/**
 * TEST LOGOSU OLUSTURUR
 * Excel gomulimini dogrulamak icin gecici bir PNG uretir ve firma profiline yazar.
 *
 * Kullanim:
 *   node src/scripts/set-test-logo.js           -> 320x96 PNG yazar
 *   node src/scripts/set-test-logo.js --clear   -> logoyu siler
 *
 * NOT: Sunucu kapaliyken calistirin.
 */
import zlib from 'node:zlib';
import { get, run } from '../db.js';

// 320x96, mavi zemin + beyaz "V" harfi (pikselel, bagimlilik gerektirmez).
function makePng(w = 320, h = 96) {
  const px = (x, y) => {
    // Arka plan: mavi (#1D4ED8)
    let r = 0x1d, g = 0x4e, b = 0xd8;
    // Sol ust kose yuvarlak (beyaz) "V" isareti
    const vx = Math.abs(x - w * 0.34) < 13;
    const insideV = vx && y > h * 0.22 && y < h * 0.78;
    const slant = insideV && Math.abs(x - (w * 0.34 + (y - h * 0.22) * 0.32)) < 9;
    const slant2 = insideV && Math.abs(x - (w * 0.34 - (y - h * 0.22) * 0.32)) < 9;
    if (slant || slant2) return [255, 255, 255];
    // Sag tarafta acik gri dikdortgen (marka alani)
    if (x > w * 0.52 && x < w * 0.92 && y > h * 0.3 && y < h * 0.44) {
      return [0xbf, 0xdb, 0xfe];
    }
    if (x > w * 0.52 && x < w * 0.78 && y > h * 0.52 && y < h * 0.66) {
      return [0x93, 0xc5, 0xfd];
    }
    return [r, g, b];
  };

  const raw = Buffer.alloc((w * 3 + 1) * h);
  let o = 0;
  for (let y = 0; y < h; y += 1) {
    raw[o] = 0; // filter: none
    o += 1;
    for (let x = 0; x < w; x += 1) {
      const [r, g, b] = px(x, y);
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
      o += 3;
    }
  }

  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: truecolor
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let TABLE = null;
function crc32(buf) {
  if (!TABLE) {
    TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLE[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i += 1) crc = (crc >>> 8) ^ TABLE[(crc ^ buf[i]) & 0xff];
  return crc ^ -1;
}

if (process.argv.includes('--clear')) {
  run('UPDATE company_profile SET logo = NULL WHERE id = 1');
  console.log('Logo silindi.');
} else {
  const png = makePng();
  const dataUrl = `data:image/png;base64,${png.toString('base64')}`;
  const exists = get('SELECT id FROM company_profile WHERE id = 1');
  if (!exists) {
    run("INSERT INTO company_profile (id, name) VALUES (1, 'Veltron')");
  }
  run('UPDATE company_profile SET logo = ? WHERE id = 1', [dataUrl]);
  console.log(`Logo yazildi: 320x96 PNG, ${Math.round(dataUrl.length / 1024)} KB base64`);
}
