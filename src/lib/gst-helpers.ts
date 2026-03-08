/* eslint-disable @typescript-eslint/no-explicit-any */
// ═══════════════════════════════════════════════════════════
// GST RECONCILIATION TOOL — HELPER FUNCTIONS & CONSTANTS
// ═══════════════════════════════════════════════════════════

export const GSTR_STD_COLS = [
  'GSTIN of supplier', 'Trade/Legal name', 'Invoice number', 'Invoice type',
  'Invoice Date', 'Invoice Value(₹)', 'Place of supply',
  'Supply Attract Reverse Charge', 'Taxable Value (₹)',
  'Integrated Tax(₹)', 'Central Tax(₹)', 'State/UT Tax(₹)', 'Cess(₹)',
];

export const TALLY_SINGLE_ROWS = [
  { id: 'gstin', label: 'GSTIN Column', required: true, guess: ['gstin', 'gst no', 'gst num', 'gst number'] },
  { id: 'trade', label: 'Supplier / Party Name', required: true, guess: ['particulars', 'party name', 'supplier', 'trade'] },
  { id: 'invoice', label: 'Invoice / Bill Number', required: true, guess: ['supplierinvoice', 'supplier invoice', 'invoice no', 'bill no', 'bill.no'] },
  { id: 'voucher', label: 'Voucher Number (optional)', required: false, guess: ['voucher no', 'voucher number', 'vou no', 'vou.no'] },
  { id: 'date', label: 'Date Column', required: true, guess: ['date', 'bill date', 'invoice date'] },
];

export const TALLY_MULTI_ROWS = [
  { id: 'taxable', label: 'Taxable Value columns', required: true, guess: ['taxable', 'purchase @', 'purchase@'], extMatch: (h: string) => /purchase\s*@/i.test(h) || /amount\s*\d+%/i.test(h) },
  { id: 'igst', label: 'IGST columns', required: false, guess: ['igst', 'integrated'] },
  { id: 'cgst', label: 'CGST columns', required: false, guess: ['cgst', 'central tax'] },
  { id: 'sgst', label: 'SGST columns', required: false, guess: ['sgst', 'state', 'ut tax'] },
  { id: 'cess', label: 'Cess columns', required: false, guess: ['cess'] },
];

export const AUDIT_FIELDS = [
  { label: 'Taxable @5%', prKey: 'tax5', tallyKey: '_tax5' },
  { label: 'SGST 2.5%', prKey: 'sgst25', tallyKey: '_sgst25' },
  { label: 'CGST 2.5%', prKey: 'cgst25', tallyKey: '_cgst25' },
  { label: 'Taxable @12%', prKey: 'tax12', tallyKey: '_tax12' },
  { label: 'SGST 6%', prKey: 'sgst6', tallyKey: '_sgst6' },
  { label: 'CGST 6%', prKey: 'cgst6', tallyKey: '_cgst6' },
  { label: 'Taxable @18%', prKey: 'tax18', tallyKey: '_tax18' },
  { label: 'SGST 9%', prKey: 'sgst9', tallyKey: '_sgst9' },
  { label: 'CGST 9%', prKey: 'cgst9', tallyKey: '_cgst9' },
  { label: 'Tax Free', prKey: 'taxfree', tallyKey: '_taxfree' },
  { label: 'IGST 5%', prKey: 'igst5', tallyKey: '_igst5' },
  { label: 'IGST 12%', prKey: 'igst12', tallyKey: '_igst12' },
];

export function cleanString(s: any): string {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function normalise(v: any): string {
  const s = String(v || '').replace(/_x000D_/gi, '').replace(/\n/g, '').replace(/\r/g, '').trim();
  if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'nan' || s === '(blank)') return '';
  return s;
}

export function numVal(v: any): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(v);
  return (isNaN(n) || !isFinite(n)) ? 0 : n;
}

export function safeVal(v: any): any {
  return (v === null || v === undefined || v === '') ? '' : v;
}

export function safeNum(v: any): any {
  if (v === null || v === undefined || v === '') return '';
  const n = parseFloat(v);
  return (isNaN(n) || !isFinite(n)) ? '' : n;
}

export function isLeapYear(year: number): boolean {
  if (year === 1900) return false;
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

export function excelSerialToDate(v: any): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'string' && v.trim() && isNaN(Number(v))) return v.trim();
  if (v instanceof Date) {
    const day = v.getUTCDate().toString().padStart(2, '0');
    const month = (v.getUTCMonth() + 1).toString().padStart(2, '0');
    const year = v.getUTCFullYear();
    return `${day}/${month}/${year}`;
  }
  const serial = Math.floor(Number(v));
  if (!isNaN(serial) && serial > 0) {
    let remainingDays = serial;
    let year = 1900;
    const daysInMonth = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (serial > 59) remainingDays -= 1;
    while (true) {
      const diy = isLeapYear(year) ? 366 : 365;
      if (remainingDays <= diy) break;
      remainingDays -= diy;
      year++;
    }
    let month = 1, day = 1;
    for (let m = 1; m <= 12; m++) {
      let dim = daysInMonth[m];
      if (m === 2 && isLeapYear(year)) dim = 29;
      if (remainingDays <= dim) { month = m; day = remainingDays; break; }
      remainingDays -= dim;
    }
    return `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;
  }
  return String(v);
}

export function dateStringToSerial(dateStr: any): number | null {
  if (!dateStr || dateStr === '') return null;
  const match = String(dateStr).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const day = parseInt(match[1]);
  const month = parseInt(match[2]);
  const year = parseInt(match[3]);
  let serial = 0;
  const daysInMonth = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  for (let yr = 1900; yr < year; yr++) serial += isLeapYear(yr) ? 366 : 365;
  for (let mn = 1; mn < month; mn++) {
    serial += daysInMonth[mn];
    if (mn === 2 && isLeapYear(year)) serial += 1;
  }
  serial += day;
  if (year > 1900 || (year === 1900 && month > 2)) serial += 1;
  return serial;
}

export function colLetter(idx: number): string {
  let s = '', n = idx;
  while (n >= 0) { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; }
  return s;
}

export function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function invSimilarity(inv1: any, inv2: any): { score: number; reason: string } {
  const s1 = String(inv1 || '').trim().toUpperCase();
  const s2 = String(inv2 || '').trim().toUpperCase();
  if (!s1 || !s2) return { score: 0, reason: '' };
  if (s1 === s2) return { score: 100, reason: 'Exact match' };
  if (s1.includes(s2)) return { score: 90, reason: 'GSTR-2B has extra prefix/suffix' };
  if (s2.includes(s1)) return { score: 90, reason: 'Our data has extra prefix/suffix' };
  const nums1 = s1.match(/\d+/g) || [];
  const nums2 = s2.match(/\d+/g) || [];
  if (nums1.length && nums2.length) {
    const last1 = nums1[nums1.length - 1];
    const last2 = nums2[nums2.length - 1];
    if (last1 === last2 && last1.length >= 3) return { score: 80, reason: 'Core number matches, prefix differs' };
    const stripped1 = last1.replace(/^0+/, '');
    const stripped2 = last2.replace(/^0+/, '');
    if (stripped1 === stripped2 && stripped1.length >= 2) return { score: 85, reason: 'Extra leading zeros in invoice number' };
  }
  let common = 0;
  const len = Math.min(s1.length, s2.length);
  for (let i = 0; i < len; i++) if (s1[i] === s2[i]) common++;
  const ratio = common / Math.max(s1.length, s2.length) * 100;
  return ratio >= 60 ? { score: Math.round(ratio), reason: 'Character similarity' } : { score: Math.round(ratio), reason: '' };
}

export function nv4(v: any): number {
  const n = parseFloat(v);
  return (isNaN(n) || !isFinite(n)) ? 0 : n;
}
