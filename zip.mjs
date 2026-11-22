const uint32Max = 0xffffffff;
const encoder = new TextEncoder();
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) {
    value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return value;
});

async function crc32(file) {
  let value = uint32Max;
  for await (const chunk of file.stream()) {
    for (const byte of chunk) value = (value >>> 8) ^ crcTable[(value ^ byte) & 255];
  }
  return (value ^ uint32Max) >>> 0;
}

function header(length, signature) {
  const view = new DataView(new ArrayBuffer(length));
  view.setUint32(0, signature, true);
  return view;
}

function setEntry(view, offset, file, crc, name) {
  const date = new Date(file.lastModified);
  const year = Math.min(2107, Math.max(1980, date.getFullYear()));
  const timeBits = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const dateBits = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  view.setUint16(offset, 20, true);
  view.setUint16(offset + 2, 0x0800, true);
  view.setUint16(offset + 6, timeBits, true);
  view.setUint16(offset + 8, dateBits, true);
  view.setUint32(offset + 10, crc, true);
  view.setUint32(offset + 14, file.size, true);
  view.setUint32(offset + 18, file.size, true);
  view.setUint16(offset + 22, name.length, true);
}

export async function makeZip(entries, onProgress = () => {}) {
  const named = entries.map(entry => ({ ...entry, name: encoder.encode(entry.name) }));
  const size = named.reduce((sum, entry) => sum + entry.file.size + 76 + entry.name.length * 2, 22);
  if (named.length >= 65535 || size >= uint32Max || named.some(entry => entry.name.length > 65535)) {
    throw new Error('ZIP 한 건에 담을 수 있는 크기를 초과했어요. 파일을 나누어 내려받아 주세요.');
  }

  const files = [];
  const directory = [];
  let offset = 0;
  let directorySize = 0;
  for (const [index, { file, name }] of named.entries()) {
    const crc = await crc32(file);
    const local = header(30, 0x04034b50);
    setEntry(local, 4, file, crc, name);
    files.push(local.buffer, name, file);

    const central = header(46, 0x02014b50);
    central.setUint16(4, 20, true);
    setEntry(central, 6, file, crc, name);
    central.setUint32(42, offset, true);
    directory.push(central.buffer, name);
    offset += 30 + name.length + file.size;
    directorySize += 46 + name.length;
    onProgress(index + 1, named.length);
  }

  const end = header(22, 0x06054b50);
  end.setUint16(8, named.length, true);
  end.setUint16(10, named.length, true);
  end.setUint32(12, directorySize, true);
  end.setUint32(16, offset, true);
  return new Blob(files.concat(directory, end.buffer), { type: 'application/zip' });
}
