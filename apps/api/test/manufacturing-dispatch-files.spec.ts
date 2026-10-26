import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import * as XLSX from 'xlsx';
import { dispatchJpeg } from './fixtures/dispatch-jpeg';
import {
  DISPATCH_DOCUMENT_MAX_BYTES, DispatchDocumentFile, dispatchDocumentPath, storeDispatchDocument, validateDispatchDocument,
} from '../src/modules/manufacturing/manufacturing-dispatch-files';

const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY9kAAAAASUVORK5CYII=', 'base64');
const incoming = (originalname: string, mimetype: string, buffer: Buffer): DispatchDocumentFile => ({ originalname, mimetype, buffer });

// Build a ZIP fixture independently of the validator, including deflated XML and central-directory offsets.
function archive(entries: Record<string, string>) {
  const localParts: Buffer[] = []; const centralParts: Buffer[] = [];
  let offset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const filename = Buffer.from(name); const data = Buffer.from(value); const compressed = deflateRawSync(data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    localParts.push(local, filename, compressed); centralParts.push(central, filename);
    offset += local.length + filename.length + compressed.length;
  }
  const directory = Buffer.concat(centralParts); const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(Object.keys(entries).length, 8); end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, directory, end]);
}

const wordEntries = {
  '[Content_Types].xml': '<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  '_rels/.rels': '<Relationships/>',
  'word/document.xml': '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>',
};
const wordMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const excelMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

test('dispatch documents validate PDF content and sanitize names without changing safe extensions', () => {
  const result = validateDispatchDocument(incoming('C:\\cliente\\..\\Guía\r\n"salida".PDF', 'application/pdf', pdf));
  assert.equal(result.filename, 'Guía_salida_.pdf'); assert.equal(result.extension, '.pdf');
  assert.equal(result.mimeType, 'application/pdf'); assert.equal(result.size, pdf.length);
  assert.equal(validateDispatchDocument(incoming('remisión.pdf', 'application/octet-stream', pdf)).mimeType, 'application/pdf');
  assert.ok(validateDispatchDocument(incoming(`${'a'.repeat(300)}.pdf`, 'application/pdf', pdf)).filename.length <= 200);
  assert.throws(() => validateDispatchDocument(incoming('remisión.html', 'application/pdf', pdf)), /Formato/);
  assert.throws(() => validateDispatchDocument(incoming('remisión.pdf', 'text/html', pdf)), /Formato/);
  assert.throws(() => validateDispatchDocument(incoming('remisión.pdf', 'application/pdf', Buffer.from('<!doctype html><html>falso</html>'))), /Formato/);
  assert.throws(() => validateDispatchDocument(incoming('remisión.pdf', 'application/pdf', Buffer.from('%PDF-1.7\ntruncado'))), /Formato/);
});

test('Office uploads require the expected ZIP entries and reject malformed, disguised or unsafe archives', () => {
  const word = archive(wordEntries);
  assert.equal(validateDispatchDocument(incoming('manual.docx', wordMime, word)).extension, '.docx');
  const longWord = archive({ ...wordEntries, 'word/document.xml': `<w:document><w:body>${'Texto de revisión '.repeat(70000)}</w:body></w:document>` });
  assert.equal(validateDispatchDocument(incoming('manual-extenso.docx', wordMime, longWord)).extension, '.docx');
  const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Bulto', 'Peso'], [1, 12]]), 'Empaque');
  const excel = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true });
  assert.equal(validateDispatchDocument(incoming('empaque.xlsx', excelMime, excel)).extension, '.xlsx');
  assert.throws(() => validateDispatchDocument(incoming('manual.xlsx', excelMime, word)), /Formato/);
  assert.throws(() => validateDispatchDocument(incoming('manual.docx', excelMime, word)), /Formato/);
  assert.throws(() => validateDispatchDocument(incoming('manual.docx', wordMime, archive({ 'otro.txt': 'No es un documento' }))), /Formato/);
  assert.throws(() => validateDispatchDocument(incoming('manual.docx', wordMime, archive({ ...wordEntries, '../fuera.txt': 'no' }))), /Formato/);
  assert.throws(() => validateDispatchDocument(incoming('manual.docx', wordMime, archive({ ...wordEntries, 'word/vbaProject.bin': 'macro' }))), /Formato/);
  assert.throws(() => validateDispatchDocument(incoming('manual.docx', wordMime, archive({ ...wordEntries, 'word/document.xml': '<html>falso</html>' }))), /Formato/);
  assert.throws(() => validateDispatchDocument(incoming('manual.docx', wordMime, word.subarray(0, word.length - 10))), /Formato/);
  const encrypted = Buffer.from(word); encrypted.writeUInt16LE(1, 6);
  assert.throws(() => validateDispatchDocument(incoming('manual.docx', wordMime, encrypted)), /Formato/);
});

test('legacy Word and Excel use the OLE signature and matching declared types', () => {
  const ole = Buffer.alloc(512); Buffer.from('d0cf11e0a1b11ae1', 'hex').copy(ole);
  assert.equal(validateDispatchDocument(incoming('manual.doc', 'application/msword', ole)).extension, '.doc');
  assert.equal(validateDispatchDocument(incoming('empaque.xls', 'application/vnd.ms-excel', ole)).extension, '.xls');
  assert.throws(() => validateDispatchDocument(incoming('manual.doc', 'application/vnd.ms-excel', ole)), /Formato/);
  assert.throws(() => validateDispatchDocument(incoming('manual.doc', 'application/msword', ole.subarray(0, 8))), /Formato/);
  assert.throws(() => validateDispatchDocument(incoming('empaque.xls', 'application/vnd.ms-excel', pdf)), /Formato/);
});

test('CSV and TXT accept UTF-8 while rejecting binary, invalid encoding, HTML, SVG and scripts', () => {
  assert.equal(validateDispatchDocument(incoming('lista.csv', 'application/vnd.ms-excel', Buffer.from('\ufeffNombre,Cantidad\r\nSensor óptico,2'))).mimeType, 'text/csv');
  assert.equal(validateDispatchDocument(incoming('nota.txt', 'text/plain; charset=utf-8', Buffer.from('Revisión eléctrica\nLista de empaque\tOK'))).mimeType, 'text/plain');
  for (const bytes of [Buffer.from([0xff, 0xfe, 0x00]), Buffer.from('binario\x00'), Buffer.from('<html>página</html>'), Buffer.from('<svg/>'), Buffer.from('<script>alert(1)</script>'), Buffer.from('#!/bin/sh\nexit 1'), Buffer.from('  \n')]) {
    assert.throws(() => validateDispatchDocument(incoming('falso.txt', 'text/plain', bytes)), /Formato/);
  }
});

test('image attachments require matching MIME, extension and supported signatures', () => {
  assert.equal(validateDispatchDocument(incoming('bulto.png', 'image/png', png)).mimeType, 'image/png');
  assert.equal(validateDispatchDocument(incoming('placa.jpeg', 'image/jpeg', dispatchJpeg)).extension, '.jpeg');
  const webp = Buffer.alloc(24); webp.write('RIFF'); webp.writeUInt32LE(16, 4); webp.write('WEBPVP8L', 8);
  assert.equal(validateDispatchDocument(incoming('placa.webp', 'image/webp', webp)).mimeType, 'image/webp');
  assert.throws(() => validateDispatchDocument(incoming('bulto.jpg', 'image/jpeg', png)), /Formato/);
  assert.throws(() => validateDispatchDocument(incoming('bulto.png', 'image/jpeg', png)), /Formato/);
  assert.throws(() => validateDispatchDocument(incoming('bulto.png', 'image/png', png.subarray(0, 24))), /Formato/);
  assert.throws(() => validateDispatchDocument(incoming('bulto.svg', 'image/svg+xml', Buffer.from('<svg/>'))), /Formato/);
});

test('JPEG photos accept camera MIME aliases, uppercase names and trailing bytes with canonical metadata', () => {
  for (const mime of ['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/x-jpeg', 'IMAGE/JPG; charset=binary', '', 'application/octet-stream']) {
    for (const filename of ['anclaje.JPG', 'placa.JPEG']) {
      const photo = Buffer.concat([dispatchJpeg, Buffer.from([0, 0, 0, 32])]);
      const result = validateDispatchDocument(incoming(filename, mime, photo));
      assert.equal(result.mimeType, 'image/jpeg');
      assert.equal(result.filename, filename.toLowerCase());
      assert.equal(result.size, photo.length);
    }
  }
  assert.throws(() => validateDispatchDocument(incoming('falso.jpg', 'image/jpg', png)), /Formato/);
  assert.throws(() => validateDispatchDocument(incoming('falso.jpg', 'image/jpeg', Buffer.from('000000186674797068656963', 'hex'))), /Formato/);
  assert.throws(() => validateDispatchDocument(incoming('placa.jpg', 'image/png', dispatchJpeg)), /Formato/);
});

test('JPEG validation follows segments and scans instead of trusting a thumbnail or a truncated end marker', () => {
  const validate = (buffer: Buffer) => validateDispatchDocument(incoming('placa.jpg', 'image/jpeg', buffer));
  assert.throws(() => validate(Buffer.from('ffd8ffdb00040000ffd9', 'hex')), /Formato/, 'a marker prefix alone is not an image');
  assert.throws(() => validate(dispatchJpeg.subarray(0, dispatchJpeg.length - 2)), /Formato/, 'the main image must end');
  assert.throws(() => validate(Buffer.from('ffd8ffe1ffff0000ffd9', 'hex')), /Formato/, 'a segment cannot extend past the file');
  const metadataWithThumbnailEnd = Buffer.from('ffe10008ffd900000000', 'hex');
  const withMetadata = Buffer.concat([dispatchJpeg.subarray(0, 2), metadataWithThumbnailEnd, dispatchJpeg.subarray(2)]);
  assert.equal(validate(withMetadata).mimeType, 'image/jpeg');
  assert.throws(() => validate(withMetadata.subarray(0, withMetadata.length - 2)), /Formato/, 'EOI inside metadata must not hide a truncated main image');
  const scanAt = dispatchJpeg.indexOf(Buffer.from('ffda', 'hex'));
  assert.ok(scanAt > 0);
  const truncatedScanHeader = Buffer.from(dispatchJpeg); truncatedScanHeader.writeUInt16BE(0xffff, scanAt + 2);
  assert.throws(() => validate(truncatedScanHeader), /Formato/);
  const noFrame = Buffer.from(dispatchJpeg); noFrame[noFrame.indexOf(Buffer.from('ffc0', 'hex')) + 1] = 0xe1;
  assert.throws(() => validate(noFrame), /Formato/, 'a scan must have an image frame');
});

test('JPEG marker traversal supports stuffed entropy, restart markers and multiple progressive scans', () => {
  // Keep real frame and scan headers, and exercise marker traversal independently of pixel decoding.
  const frameAt = dispatchJpeg.indexOf(Buffer.from('ffc0', 'hex'));
  const scanAt = dispatchJpeg.indexOf(Buffer.from('ffda', 'hex'));
  const scanEnd = scanAt + 2 + dispatchJpeg.readUInt16BE(scanAt + 2);
  const header = Buffer.from(dispatchJpeg.subarray(0, scanEnd)); header[frameAt + 1] = 0xc2;
  const repeatedScan = dispatchJpeg.subarray(scanAt, scanEnd);
  const photo = Buffer.concat([header, Buffer.from('11ff0022ffd033', 'hex'), repeatedScan, Buffer.from('44ffd9', 'hex')]);
  assert.equal(validateDispatchDocument(incoming('progresiva.jpg', 'image/pjpeg', photo)).mimeType, 'image/jpeg');
  assert.throws(() => validateDispatchDocument(incoming('vacía.jpg', 'image/jpeg', Buffer.concat([header, Buffer.from('ffd9', 'hex')]))), /Formato/);
});

test('document size limit is inclusive and invalid storage keys never resolve a filesystem path', () => {
  assert.throws(() => validateDispatchDocument(), /Selecciona/);
  assert.throws(() => validateDispatchDocument(incoming('vacío.pdf', 'application/pdf', Buffer.alloc(0))), /Selecciona/);
  const maximum = Buffer.alloc(DISPATCH_DOCUMENT_MAX_BYTES, ' '); pdf.copy(maximum); Buffer.from('%%EOF').copy(maximum, maximum.length - 5);
  assert.equal(validateDispatchDocument(incoming('grande.pdf', 'application/pdf', maximum)).size, DISPATCH_DOCUMENT_MAX_BYTES);
  assert.throws(() => validateDispatchDocument(incoming('grande.pdf', 'application/pdf', Buffer.alloc(DISPATCH_DOCUMENT_MAX_BYTES + 1))), /20 MB/);
  for (const key of ['../../fuera.pdf', '/tmp/fuera.pdf', '00000000-0000-0000-0000-000000000000.pdf', 'not-a-uuid.pdf', '00f00000-0000-4000-8000-000000000000.html']) assert.throws(() => dispatchDocumentPath(key), /inválido/);
});

test('stored documents have random private names, preserve bytes and do not overwrite each other', async () => {
  const root = await fs.mkdtemp(join(tmpdir(), 'dispatch-files-test-'));
  const previous = process.env.ATTACHMENTS_DIR; process.env.ATTACHMENTS_DIR = root;
  try {
    const first = await storeDispatchDocument(incoming('guía.pdf', 'application/pdf', pdf));
    const second = await storeDispatchDocument(incoming('guía.pdf', 'application/pdf', pdf));
    assert.notEqual(first.storageKey, second.storageKey); assert.notEqual(first.storageKey, first.filename);
    assert.equal(first.filename, 'guía.pdf'); assert.equal(first.size, pdf.length);
    assert.equal(dispatchDocumentPath(first.storageKey), join(root, 'dispatch-documents', first.storageKey));
    assert.deepEqual(await fs.readFile(dispatchDocumentPath(first.storageKey)), pdf);
    assert.equal((await fs.stat(dispatchDocumentPath(first.storageKey))).mode & 0o777, 0o600);
    await assert.rejects(() => storeDispatchDocument(incoming('falso.exe', 'application/pdf', pdf)), /Formato/);
    assert.equal((await fs.readdir(join(root, 'dispatch-documents'))).length, 2);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    if (previous === undefined) delete process.env.ATTACHMENTS_DIR; else process.env.ATTACHMENTS_DIR = previous;
  }
});

test('a failed write removes only its partially created document', async (context) => {
  const root = await fs.mkdtemp(join(tmpdir(), 'dispatch-files-failure-'));
  const previous = process.env.ATTACHMENTS_DIR; process.env.ATTACHMENTS_DIR = root;
  const write = fs.writeFile.bind(fs);
  context.mock.method(fs, 'writeFile', async (...args: Parameters<typeof fs.writeFile>) => { await write(...args); throw new Error('Simulated disk failure'); });
  try {
    await assert.rejects(() => storeDispatchDocument(incoming('guía.pdf', 'application/pdf', pdf)), /Simulated disk failure/);
    assert.deepEqual(await fs.readdir(join(root, 'dispatch-documents')), []);
  } finally {
    context.mock.restoreAll(); await fs.rm(root, { recursive: true, force: true });
    if (previous === undefined) delete process.env.ATTACHMENTS_DIR; else process.env.ATTACHMENTS_DIR = previous;
  }
});
