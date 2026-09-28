/* eslint-disable @typescript-eslint/no-explicit-any */
import XLSX from 'xlsx-js-style';
import {
  cleanString, normalise, numVal, excelSerialToDate,
  TALLY_SINGLE_ROWS, TALLY_MULTI_ROWS, TALLY_NOTE_ROW, nv4,
  classifyDocTypeFromText, classifyPortalNoteType, type DocType
} from './gst-helpers';

// ═══════════════════════════════════════════════════════════
// TALLY SCANNING & PROCESSING
// ═══════════════════════════════════════════════════════════

export interface TallyScanResult {
  hdrIdx: number;
  raw: any[][];
  headers: string[];
  singleGuesses: Record<string, number>;
  multiGuesses: Record<string, number[]>;
}

export function scanTally(wb: any): TallyScanResult {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true }) as any[][];
  let hdrIdx = -1;
  for (let i = 0; i < Math.min(20, raw.length); i++) {
    const r = raw[i];
    if (!r) continue;
    const rowStr = r.map((c: any) => String(c || '').toLowerCase()).join('|');
    const hits = ['gstin', 'gst no', 'gst num', 'gst number', 'particulars', 'party name', 'voucher', 'vou.no', 'vou. no', 'invoice', 'bill no', 'bill.no', 'date']
      .filter(kw => rowStr.includes(kw)).length;
    if (hits >= 2) { hdrIdx = i; break; }
    const anyMatch = r.some((c: any) => c && typeof c === 'string' &&
      ['Date', 'Particulars', 'GSTIN', 'Party Name', 'Bill No', 'Bill.No', 'Vou.No.', 'Vou. No.', 'GST No', 'GST Number']
        .some(kw => c.includes(kw)));
    if (anyMatch) { hdrIdx = i; break; }
  }
  if (hdrIdx === -1) throw new Error('Header row not found. Make sure the file has columns like Date, Particulars, GSTIN, Invoice No.');
  const headers = raw[hdrIdx].map((c: any) => String(c || '').trim());

  // Auto-guess single columns
  const guessCol = (names: string[]): number => {
    for (const name of names) {
      const idx = headers.findIndex((h: string) => hdrKey(h).includes(hdrKey(name)));
      if (idx >= 0) return idx;
    }
    return -1;
  };
  const guessCols = (names: string[], extMatch?: (h: string) => boolean): number[] => {
    return headers.reduce((a: number[], h: string, i: number) => {
      const byKw = names.some(n => hdrKey(h).includes(hdrKey(n)));
      const byExt = extMatch ? extMatch(h) : false;
      if (byKw || byExt) a.push(i);
      return a;
    }, []);
  };

  const singleGuesses: Record<string, number> = {};
  TALLY_SINGLE_ROWS.forEach(row => { singleGuesses[row.id] = guessCol(row.guess); });
  singleGuesses[TALLY_NOTE_ROW.id] = guessCol(TALLY_NOTE_ROW.guess);

  const multiGuesses: Record<string, number[]> = {};
  TALLY_MULTI_ROWS.forEach(row => { multiGuesses[row.id] = guessCols(row.guess, row.extMatch); });

  return { hdrIdx, raw, headers, singleGuesses, multiGuesses };
}

export interface TallyMapping {
  hdrIdx: number;
  headers: string[];
  raw: any[][];
  gstin: number;
  trade: number;
  invoice: number;
  voucher: number;
  date: number;
  taxable: number[];
  igst: number[];
  cgst: number[];
  sgst: number[];
  cess: number[];
  /** Optional column holding the voucher / document type (Option 2 only) */
  noteType?: number;
  /** When true, rows are classified as invoice / credit note / debit note */
  classifyNotes?: boolean;
}


export function processTally(m: TallyMapping) {
  const grouped: Record<string, any> = {};
  let unkCounter = 0;
  const blankGstinRows: any[] = [], blankInvoiceRows: any[] = [];
  // Row coverage audit
  let rowsSeen = 0, blankRows = 0;
  const totalRowsSkipped: any[] = [], noSupplierRows: any[] = [];

  for (let i = m.hdrIdx + 1; i < m.raw.length; i++) {
    const r = m.raw[i];
    const excelRow = i + 1; // 1-based row number as seen in Excel
    if (!r) { blankRows++; continue; }
    rowsSeen++;
    if (r.every((c: any) => c === null || c === undefined || c === '')) { blankRows++; rowsSeen--; continue; }
    const supplier = normalise(String(r[m.trade] || ''));
    const sLower = supplier.toLowerCase();
    if (sLower.includes('grand total') || sLower.includes('sub total') || sLower.includes('subtotal')) {
      totalRowsSkipped.push({ row: excelRow, value: supplier });
      continue;
    }
    if (!supplier) {
      noSupplierRows.push({ row: excelRow, invoiceNum: normalise(String(r[m.invoice] || '')), gstin: normalise(String(r[m.gstin] || '')) });
      continue;
    }

    const invoiceNum = normalise(String(r[m.invoice] || ''));
    const gstin = normalise(String(r[m.gstin] || ''));
    const voucher = m.voucher >= 0 ? normalise(String(r[m.voucher] || '')) : '';
    const hasInv = invoiceNum !== '', hasGST = gstin !== '', hasVou = voucher !== '';

    // Document type classification (Option 2 only)
    let docType: DocType = 'invoice';
    if (m.classifyNotes) {
      const noteCol = m.noteType ?? -1;
      const byText = noteCol >= 0 ? classifyDocTypeFromText(r[noteCol]) : null;
      if (byText) docType = byText;
      else {
        const rowTaxable = m.taxable.reduce((s, c) => s + numVal(r[c]), 0);
        const rowTax = [...m.igst, ...m.cgst, ...m.sgst].reduce((s, c) => s + numVal(r[c]), 0);
        if (rowTaxable < 0 || (rowTaxable === 0 && rowTax < 0)) docType = 'debit_note';
      }
    }
    const dtPrefix = docType === 'invoice' ? '' : `${docType}|||`;

    let key: string;
    if (hasInv && hasGST) key = `${dtPrefix}${invoiceNum}|||${gstin}`;
    else if (!hasGST && hasInv) key = `${dtPrefix}${invoiceNum}|||__NO_GSTIN__`;
    else if (!hasInv && hasGST) key = `${dtPrefix}__NO_INV__|||${gstin}|||V${hasVou ? voucher : 'UNK' + (++unkCounter)}`;
    else key = `${dtPrefix}__NO_INV__|||__NO_GSTIN__|||V${hasVou ? voucher : 'UNK' + (++unkCounter)}`;

    if (!hasGST && hasInv) blankGstinRows.push({ supplier, invoiceNum, gstin: '', voucher });
    if (!hasInv) blankInvoiceRows.push({ supplier, invoiceNum: '', gstin, voucher });

    if (!grouped[key]) {
      grouped[key] = {
        gstin, tradeName: supplier,
        invoiceNum: invoiceNum || '(blank)',
        invoiceDate: excelSerialToDate(r[m.date]),
        taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0,
        docType,
        _srcRows: [] as number[],
      };
    }
    grouped[key]._srcRows.push(excelRow);

    m.taxable.forEach(c => { grouped[key].taxable += numVal(r[c]); });
    m.igst.forEach(c => { grouped[key].igst += numVal(r[c]); });
    m.cgst.forEach(c => { grouped[key].cgst += numVal(r[c]); });
    m.sgst.forEach(c => { grouped[key].sgst += numVal(r[c]); });
    if (m.cess) m.cess.forEach(c => { grouped[key].cess += numVal(r[c]); });
  }
  const rows = Object.values(grouped) as any[];
  // Notes always reduce ITC in the books → normalise them to a negative sign
  if (m.classifyNotes) {
    rows.forEach(row => {
      if (row.docType === 'invoice') return;
      ['taxable', 'igst', 'cgst', 'sgst', 'cess'].forEach(k => {
        row[k] = -Math.abs(numVal(row[k]));
      });
    });
  }
  const rowsUsed = rows.reduce((s, r) => s + (r._srcRows?.length || 0), 0);
  const mergedGroups = rows.filter(r => (r._srcRows?.length || 0) > 1);
  const audit = {
    rowsRead: rowsSeen,
    blankRows,
    totalRowsSkipped,
    noSupplierRows,
    rowsUsed,
    groups: rows.length,
    invoiceGroups: rows.filter(r => (r.docType || 'invoice') === 'invoice').length,
    noteGroups: rows.filter(r => (r.docType || 'invoice') !== 'invoice').length,
    mergedGroups: mergedGroups.length,
    mergedRows: mergedGroups.reduce((s, r) => s + r._srcRows.length, 0),
    mergedSamples: mergedGroups.slice(0, 20).map(r => ({
      gstin: r.gstin, invoiceNum: r.invoiceNum, rows: r._srcRows.join(', '), count: r._srcRows.length,
    })),
  };
  return { rows, blankGstinRows, blankInvoiceRows, audit };
}



// ═══════════════════════════════════════════════════════════
// GSTR-2B SCANNING & PARSING
// ═══════════════════════════════════════════════════════════

export interface GSTRScanResult {
  hdrIdx: number;
  raw: any[][];
  allHeaders: string[];
  detected: Record<string, string | null>;
  extraCols: { gstrCol: string; tallyCol: string; include: boolean }[];
  sanityWarnings: string[];
  dataStartIdx: number;
  headerFallback: boolean;
  /** Header name of the CDNR "Note type" column (C / D), when present */
  noteTypeCol?: string | null;
  /** Sheet this scan came from */
  sheetName?: string;
}


export function scanGSTR2B(wb: any, sheetName?: string): GSTRScanResult {
  const sName = sheetName && wb.Sheets[sheetName] ? sheetName : wb.SheetNames[0];
  const ws = wb.Sheets[sName];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true }) as any[][];
  const GSTIN_RE = /^\d{2}[A-Z0-9]{13}$/;
  const isBlank = (c: any) => c === null || c === undefined || String(c).trim() === '';
  const cellStr = (c: any) => String(c ?? '').trim();
  const compact = (c: any) => cellStr(c).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const isGstin = (c: any) => GSTIN_RE.test(compact(c));
  const isNumLike = (c: any) => typeof c === 'number' || (typeof c === 'string' && /^-?[\d,]+(\.\d+)?$/.test(c.trim()));
  const isDateLike = (c: any) => c instanceof Date
    || (typeof c === 'number' && c > 30000 && c < 60000 && Number.isInteger(c))
    || /^\d{1,4}[\/.-]\d{1,2}[\/.-]\d{1,4}$/.test(cellStr(c));
  const HDR_KW = ['gstin', 'gstn', 'gst no', 'gst number', 'invoice', 'bill', 'doc no', 'document', 'note',
    'taxable', 'tax', 'supplier', 'party', 'trade', 'legal', 'name', 'particulars', 'igst', 'cgst', 'sgst',
    'integrated', 'central', 'state', 'cess', 'date', 'value', 'place', 'reverse', 'type', 'number', 'amount', 'rate'];
  const hdrScore = (row: any[] | undefined) => {
    if (!row) return 0;
    let s = 0;
    row.forEach(c => {
      if (isBlank(c) || isNumLike(c) || isGstin(c)) return;
      const t = cellStr(c).toLowerCase();
      if (HDR_KW.some(k => t.includes(k))) s++;
    });
    return s;
  };
  const dataScore = (row: any[] | undefined) => {
    if (!row) return 0;
    const vals = row.filter(c => !isBlank(c));
    if (!vals.length) return 0;
    const gstins = vals.filter(isGstin).length;
    const nums = vals.filter(isNumLike).length;
    const dates = vals.filter(isDateLike).length;
    const ids = vals.filter(c => {
      const s = cellStr(c).toUpperCase();
      return s.length >= 3 && /[A-Z]/.test(s) && /\d/.test(s) && !isGstin(c) && !isDateLike(c);
    }).length;
    const keywords = hdrScore(row);
    // GSTIN is decisive. The second branch supports custom exports with no/invalid GSTIN,
    // provided the row still looks like a transaction rather than a textual heading.
    return gstins * 6 + Math.min(nums, 4) + Math.min(dates, 1) * 2 + Math.min(ids, 2) - keywords * 2;
  };
  const isDataRow = (row: any[] | undefined) => dataScore(row) >= 6;

  // 1) Find the first transaction-like row. GSTINs with spaces/punctuation are accepted,
  // and a run of similarly-shaped custom rows can establish data even without a valid GSTIN.
  const SCAN_DEPTH = Math.min(60, raw.length);
  let dataStartIdx = -1;
  for (let i = 0; i < SCAN_DEPTH; i++) {
    if (isDataRow(raw[i])) { dataStartIdx = i; break; }
    const loose = dataScore(raw[i]) >= 4;
    const followedByData = dataScore(raw[i + 1]) >= 4 || dataScore(raw[i + 2]) >= 4;
    if (loose && followedByData && hdrScore(raw[i]) === 0) { dataStartIdx = i; break; }
  }

  // 2) Header block = contiguous header-like rows directly above data (handles 1, 2, 3+ row headers).
  let hdrRows: number[] = [];
  let headerFallback = false;
  if (dataStartIdx > 0) {
    for (let i = dataStartIdx - 1; i >= 0 && hdrRows.length < 4; i--) {
      const r = raw[i];
      const filled = r ? r.filter(c => !isBlank(c)).length : 0;
      if (filled === 0) { if (hdrRows.length) break; else continue; }
      // Never absorb a missed first transaction into a multi-row header block.
      if (dataScore(r) >= 4) break;
      // A lone title cell ("Goods and Services Tax - GSTR 2B") ends the header block
      if (filled === 1 && hdrRows.length && hdrScore(r) === 0) break;
      if (hdrScore(r) === 0 && hdrRows.length) break;
      if (hdrScore(r) === 0) continue;
      hdrRows.unshift(i);
    }
    if (!hdrRows.some(i => (raw[i] || []).some(c => cellStr(c).toLowerCase().includes('gstin of supplier')))) headerFallback = true;
  }
  // 3) No GSTIN in data (custom/blank) → pick best-scoring keyword row(s)
  if (!hdrRows.length) {
    headerFallback = true;
    let best = -1, bestS = 0;
    for (let i = 0; i < SCAN_DEPTH; i++) {
      if (dataScore(raw[i]) >= 4) continue;
      const s = hdrScore(raw[i]);
      if (s > bestS) { bestS = s; best = i; }
    }
    if (best < 0 || bestS < 2) throw new Error('Could not find a header row in the GSTR-2B sheet. Make sure it has columns like GSTIN, Invoice number and Taxable value.');
    hdrRows = [best];
    if (hdrScore(raw[best + 1]) >= 2 && !isDataRow(raw[best + 1])) hdrRows.push(best + 1);
    dataStartIdx = hdrRows[hdrRows.length - 1] + 1;
  }
  const hdr1 = hdrRows[0];

  // Build one header per column index by stacking all header rows.
  // Merged parent cells are forward-filled across blanks (only within the upper rows).
  const colLetter = (i: number) => {
    let s = '', n = i;
    do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
    return s;
  };
  const width = Math.max(...hdrRows.map(i => (raw[i] || []).length), ...raw.slice(dataStartIdx, dataStartIdx + 30).map(r => (r ? r.length : 0)));
  const layers: string[][] = hdrRows.map((ri, li) => {
    const r = raw[ri] || [];
    const isLast = li === hdrRows.length - 1;
    let carry = '';
    const out: string[] = [];
    for (let c = 0; c < width; c++) {
      const v = cellStr(r[c]);
      if (v && v.toLowerCase() !== 'null') carry = v;
      // forward-fill only parents that have children underneath
      const below = hdrRows.slice(li + 1).some(rj => !isBlank((raw[rj] || [])[c]));
      out.push(v && v.toLowerCase() !== 'null' ? v : (!isLast && below ? carry : ''));
    }
    return out;
  });
  const seen: Record<string, number> = {};
  const hdrs: string[] = [];
  const hdrFull: string[] = []; // parent + child text used for matching
  for (let c = 0; c < width; c++) {
    const parts: string[] = [];
    layers.forEach(l => { const v = l[c]; if (v && parts[parts.length - 1] !== v) parts.push(v); });
    let name = parts[parts.length - 1] || `Column ${colLetter(c)}`;
    hdrFull.push(parts.join(' ').toLowerCase());
    if (seen[name]) { seen[name]++; name = `${name} (${seen[name]})`; } else seen[name] = 1;
    hdrs.push(name);
  }

  // Column profiles from data (content-based signals)
  const sample = raw.slice(dataStartIdx, dataStartIdx + 40).filter(r => r && !r.every(isBlank));
  const prof = Array.from({ length: width }, (_, c) => {
    const vals = sample.map(r => r[c]).filter(v => !isBlank(v));
    const n = vals.length || 1;
    const strs = vals.map(v => cellStr(v).toUpperCase());
    return {
      filled: vals.length,
      gstin: vals.filter(isGstin).length / n,
      num: vals.filter(v => isNumLike(v)).length / n,
      date: vals.filter(v => v instanceof Date || (typeof v === 'number' && v > 30000 && v < 60000 && Number.isInteger(v)) || /^\d{1,4}[\/.-]\d{1,2}[\/.-]\d{1,4}$/.test(cellStr(v))).length / n,
      cd: strs.filter(s => /^(C|D|CREDIT( NOTE)?|DEBIT( NOTE)?)$/.test(s)).length / n,
      yn: strs.filter(s => /^(Y|N|YES|NO)$/.test(s)).length / n,
      alnum: strs.filter(s => /[A-Z]/.test(s) && /\d/.test(s) && !GSTIN_RE.test(s)).length / n,
      text: strs.filter(s => /[A-Z]{3,}/.test(s) && !/\d{4,}/.test(s)).length / n,
      state: strs.filter(s => /^\d{2}-/.test(s) || /^[A-Z ]+$/.test(s)).length / n,
    };
  });

  type Spec = { kw: string[]; neg?: string[]; fit: (p: typeof prof[number]) => number };
  const SPECS: Record<string, Spec> = {
    'GSTIN of supplier': { kw: ['gstin of supplier', 'supplier gstin', 'gstin', 'gstn', 'gst no', 'gst number', 'gst in'], neg: ['recipient', 'ecommerce', 'e-commerce'], fit: p => p.gstin * 3 },
    'Trade/Legal name': { kw: ['trade/legal', 'trade name', 'legal name', 'supplier name', 'party name', 'name of supplier', 'party', 'particulars', 'supplier', 'name'], neg: ['gstin'], fit: p => p.text * 1.5 - p.num },
    'Invoice number': { kw: ['invoice number', 'invoice no', 'inv no', 'note number', 'note no', 'bill no', 'document number', 'doc no', 'voucher no', 'invoice', 'note', 'number'], neg: ['date', 'value', 'type', 'gstin'], fit: p => (p.alnum + p.num * 0.5) - p.date * 2 - p.gstin * 3 },
    'Invoice type': { kw: ['invoice type', 'inv type', 'note supply type', 'supply type', 'document type'], neg: ['note type'], fit: p => p.text * 0.5 - p.num },
    'Invoice Date': { kw: ['invoice date', 'note date', 'bill date', 'document date', 'doc date', 'inv date', 'date'], neg: ['filing', 'period', 'gstr'], fit: p => p.date * 2.5 },
    'Invoice Value(₹)': { kw: ['invoice value', 'note value', 'bill value', 'document value', 'total value', 'inv value'], neg: ['taxable'], fit: p => p.num },
    'Place of supply': { kw: ['place of supply', 'pos', 'place'], fit: p => p.state * 0.5 - p.num * 0.5 },
    'Supply Attract Reverse Charge': { kw: ['reverse charge', 'rcm', 'rev charge'], fit: p => p.yn * 2 },
    'Taxable Value (₹)': { kw: ['taxable value', 'taxable amount', 'taxable amt', 'taxable', 'assessable'], fit: p => p.num },
    'Integrated Tax(₹)': { kw: ['integrated tax', 'igst'], neg: ['rate'], fit: p => p.num },
    'Central Tax(₹)': { kw: ['central tax', 'cgst'], neg: ['rate'], fit: p => p.num },
    'State/UT Tax(₹)': { kw: ['state/ut tax', 'state/ut', 'state tax', 'ut tax', 'sgst', 'utgst'], neg: ['rate', 'place'], fit: p => p.num },
    'Cess(₹)': { kw: ['cess'], neg: ['rate'], fit: p => p.num },
  };

  // Score every (field, column) pair; assign greedily by best score so no column is used twice.
  const pairs: { f: string; c: number; s: number }[] = [];
  Object.entries(SPECS).forEach(([f, sp]) => {
    for (let c = 0; c < width; c++) {
      const h = hdrFull[c];
      const leaf = hdrs[c].toLowerCase();
      let s = 0;
      if (hdrs[c] === f || cleanString(hdrs[c]) === cleanString(f)) s += 20;
      const ki = sp.kw.findIndex(k => h.includes(k));
      if (ki >= 0) s += 10 - Math.min(ki, 8) + (leaf.includes(sp.kw[ki]) ? 2 : 0);
      if (sp.neg && sp.neg.some(k => leaf.includes(k))) s -= 8;
      if (prof[c].filled) s += sp.fit(prof[c]) * 2;
      if (s >= 4) pairs.push({ f, c, s });
    }
  });
  pairs.sort((a, b) => b.s - a.s);
  const det: Record<string, string | null> = {};
  const taken = new Set<number>();
  pairs.forEach(({ f, c }) => {
    if (det[f] !== undefined || taken.has(c)) return;
    det[f] = hdrs[c]; taken.add(c);
  });
  Object.keys(SPECS).forEach(f => { if (det[f] === undefined) det[f] = null; });

  // Note type (C/D) — by header, else by content
  let noteTypeIdx = hdrs.findIndex((h, c) => /note\s*type|document\s*type|type of note/i.test(hdrFull[c]) && !taken.has(c));
  if (noteTypeIdx < 0) noteTypeIdx = prof.findIndex((p, c) => p.filled > 0 && p.cd >= 0.8 && !taken.has(c));

  const usedHdrs = new Set<string>([...Object.values(det).filter(Boolean) as string[], ...(noteTypeIdx >= 0 ? [hdrs[noteTypeIdx]] : [])]);
  const extraCols = hdrs.filter((h: string) => !usedHdrs.has(h) && !/^Column [A-Z]+( \(\d+\))?$/.test(h)).map((h: string) => ({
    gstrCol: h, tallyCol: '', include: false,
  }));

  // Sanity warnings
  const sanityWarnings: string[] = [];
  const REQUIRED_FOR_SANITY = ['GSTIN of supplier', 'Invoice number', 'Taxable Value (₹)'];
  const missingRequired = REQUIRED_FOR_SANITY.filter(c => !det[c]);
  if (missingRequired.length > 0) {
    sanityWarnings.push(`Could not auto-detect: ${missingRequired.join(', ')}. Please map them manually.`);
  }

  // Sample up to 5 data rows for plausibility checks
  const sampleStart = dataStartIdx;
  const sampleRows: any[][] = [];
  for (let i = sampleStart; i < raw.length && sampleRows.length < 5; i++) {
    const sr = raw[i];
    if (sr && !sr.every((c: any) => c === null || c === undefined || c === '')) sampleRows.push(sr);
  }

  if (sampleRows.length === 0) {
    sanityWarnings.push('No data rows were found after the header. The file may be empty or the header was detected on the wrong row.');
  } else {
    // Check GSTIN column contains GSTIN-like values
    if (det['GSTIN of supplier']) {
      const gstinColIdx = hdrs.indexOf(det['GSTIN of supplier']);
      const gstinSamples = sampleRows.map(sr => String(sr[gstinColIdx] || '').trim()).filter(Boolean);
      const GSTIN_SAMPLE_RE = /^\d{2}[A-Z0-9]{13}$/;
      const validGSTINs = gstinSamples.filter(v => GSTIN_SAMPLE_RE.test(v));
      if (gstinSamples.length > 0 && validGSTINs.length === 0) {
        sanityWarnings.push(
          `The column mapped to GSTIN of supplier contains values like "${gstinSamples[0]}" which do not look like valid GSTINs (expected 15-character format like 27AAACV0141N1ZC). This column may be mapped incorrectly.`
        );
      }
    }
    // Check Taxable Value column contains numeric values
    if (det['Taxable Value (₹)']) {
      const taxColIdx = hdrs.indexOf(det['Taxable Value (₹)']);
      const taxSamples = sampleRows.map(sr => sr[taxColIdx]).filter(v => v !== null && v !== undefined && v !== '');
      const validNums = taxSamples.filter(v => !isNaN(parseFloat(v)));
      if (taxSamples.length > 0 && validNums.length === 0) {
        sanityWarnings.push(
          `The column mapped to Taxable Value contains non-numeric values like "${taxSamples[0]}". This suggests the column mapping may be wrong.`
        );
      }
    }
    // Check Invoice Date column
    if (det['Invoice Date']) {
      const dateColIdx = hdrs.indexOf(det['Invoice Date']);
      const dateSamples = sampleRows.map(sr => sr[dateColIdx]).filter(v => v !== null && v !== undefined && v !== '');
      const validDates = dateSamples.filter(v => {
        if (typeof v === 'number' && v > 40000 && v < 50000) return true;
        if (v instanceof Date) return true;
        if (typeof v === 'string' && /\d{1,4}[\/-]\d{1,2}[\/-]\d{1,4}/.test(v)) return true;
        return false;
      });
      if (dateSamples.length > 0 && validDates.length === 0) {
        sanityWarnings.push(
          `The column mapped to Invoice Date contains values like "${dateSamples[0]}" which do not look like dates. Please verify this column is correct.`
        );
      }
    }
  }

  const noteTypeCol = noteTypeIdx >= 0 ? hdrs[noteTypeIdx] : null;

  return { hdrIdx: hdr1, raw, allHeaders: hdrs, detected: det, extraCols, sanityWarnings, dataStartIdx, headerFallback, noteTypeCol, sheetName: sName };

}

export function parseGSTR2B(scan: GSTRScanResult): any[] {
  const { raw, allHeaders: hdrs, detected, extraCols, dataStartIdx } = scan;
  const result: any[] = [];
  const STD_COLS = [
    'GSTIN of supplier', 'Trade/Legal name', 'Invoice number', 'Invoice type',
    'Invoice Date', 'Invoice Value(₹)', 'Place of supply',
    'Supply Attract Reverse Charge', 'Taxable Value (₹)',
    'Integrated Tax(₹)', 'Central Tax(₹)', 'State/UT Tax(₹)', 'Cess(₹)',
  ];

  for (let i = dataStartIdx; i < raw.length; i++) {
    const r = raw[i];
    if (!r || r.every((c: any) => c === null || c === undefined || c === '')) continue;
    const obj: Record<string, any> = {};
    hdrs.forEach((h: string, j: number) => { obj[h] = (r[j] !== null && r[j] !== undefined) ? r[j] : ''; });
    const remapped: Record<string, any> = {};
    STD_COLS.forEach(stdCol => {
      const actual = detected[stdCol];
      remapped[stdCol] = actual ? (obj[actual] !== undefined ? obj[actual] : '') : '';
    });
    extraCols.forEach(ec => { remapped[ec.gstrCol] = obj[ec.gstrCol] || ''; });
    result.push(remapped);
  }

  // Aggregate by GSTIN + Invoice Number
  const NUMERIC_COLS = ['Taxable Value (₹)', 'Integrated Tax(₹)', 'Central Tax(₹)', 'State/UT Tax(₹)', 'Cess(₹)', 'Invoice Value(₹)'];
  const grouped: Record<string, any> = {};
  const groupOrder: string[] = [];
  result.forEach(row => {
    const gstin = String(row['GSTIN of supplier'] || '').trim();
    const inv = String(row['Invoice number'] || '').trim();
    const key = gstin + '||' + inv;
    if (!grouped[key]) {
      grouped[key] = { ...row };
      groupOrder.push(key);
    } else {
      NUMERIC_COLS.forEach(col => {
        const existing = parseFloat(grouped[key][col]) || 0;
        const add = parseFloat(row[col]) || 0;
        grouped[key][col] = existing + add;
      });
    }
  });
  return groupOrder.map(k => grouped[k]);
}

/** Same as parseGSTR2B but also reports how many raw data rows were read. */
export function parseGSTR2BWithStats(scan: GSTRScanResult): { rows: any[]; rowsRead: number; blankRows: number } {
  const { raw, dataStartIdx } = scan;
  let rowsRead = 0, blankRows = 0;
  for (let i = dataStartIdx; i < raw.length; i++) {
    const r = raw[i];
    if (!r || r.every((c: any) => c === null || c === undefined || c === '')) { blankRows++; continue; }
    rowsRead++;
  }
  return { rows: parseGSTR2B(scan), rowsRead, blankRows };
}


// ═══════════════════════════════════════════════════════════
// GSTR-2B SHEET CLASSIFICATION (B2B vs B2B-CDNR) — Option 2 only
// ═══════════════════════════════════════════════════════════

export interface GSTR2BSheetMap {
  b2bSheet: string | null;
  cdnrSheet: string | null;
  amendmentSheets: string[];
  allSheets: string[];
}

export function classifyGSTR2BSheets(wb: any): GSTR2BSheetMap {
  const names: string[] = wb?.SheetNames || [];
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  let b2bSheet: string | null = null;
  let cdnrSheet: string | null = null;
  const amendmentSheets: string[] = [];

  names.forEach(n => {
    const k = norm(n);
    if (k.includes('readme') || k.includes('instruction')) return;
    const isAmend = /a$/.test(k) && (k.includes('b2b') || k.includes('cdnr'));
    if (k.includes('cdnr')) {
      if (isAmend) amendmentSheets.push(n);
      else if (!cdnrSheet) cdnrSheet = n;
    } else if (k.includes('b2b')) {
      if (isAmend) amendmentSheets.push(n);
      else if (!b2bSheet) b2bSheet = n;
    }
  });

  // Fall back to the first sheet when nothing matched (single-sheet exports)
  if (!b2bSheet && !cdnrSheet) b2bSheet = names[0] || null;
  else if (!b2bSheet) b2bSheet = null;

  return { b2bSheet, cdnrSheet, amendmentSheets, allSheets: names };
}

/** Row count (excluding fully blank rows) per sheet — used by the sheet picker. */
export function sheetRowCounts(wb: any): Record<string, number> {
  const out: Record<string, number> = {};
  (wb?.SheetNames || []).forEach((n: string) => {
    try {
      const raw = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: null, raw: true }) as any[][];
      out[n] = raw.filter(r => r && !r.every((c: any) => c === null || c === undefined || c === '')).length;
    } catch { out[n] = 0; }
  });
  return out;
}

/**
 * Parse a GSTR-2B CDNR (credit/debit note) sheet into GSTR-2B-shaped rows.
 * Sign convention: supplier credit note reduces ITC → negative amounts.
 * Supplier debit note increases ITC → positive amounts.
 */
export function parseGSTR2BNotes(scan: GSTRScanResult, noteTypeColOverride?: string | null): any[] {
  const rows = parseGSTR2B(scan);
  const { raw, allHeaders: hdrs, dataStartIdx } = scan;
  const noteTypeCol = noteTypeColOverride !== undefined ? noteTypeColOverride : scan.noteTypeCol;
  const noteIdx = noteTypeCol ? hdrs.indexOf(noteTypeCol) : -1;

  // Build a GSTIN||note-no → note type lookup from the raw rows
  const typeByKey: Record<string, DocType> = {};
  if (noteIdx >= 0) {
    const gCol = scan.detected['GSTIN of supplier'] ? hdrs.indexOf(scan.detected['GSTIN of supplier'] as string) : -1;
    const nCol = scan.detected['Invoice number'] ? hdrs.indexOf(scan.detected['Invoice number'] as string) : -1;
    for (let i = dataStartIdx; i < raw.length; i++) {
      const r = raw[i];
      if (!r) continue;
      const key = String(gCol >= 0 ? r[gCol] || '' : '').trim() + '||' + String(nCol >= 0 ? r[nCol] || '' : '').trim();
      typeByKey[key] = classifyPortalNoteType(r[noteIdx]);
    }
  }

  const AMT_COLS = ['Invoice Value(₹)', 'Taxable Value (₹)', 'Integrated Tax(₹)', 'Central Tax(₹)', 'State/UT Tax(₹)', 'Cess(₹)'];
  return rows.map(row => {
    const key = String(row['GSTIN of supplier'] || '').trim() + '||' + String(row['Invoice number'] || '').trim();
    // No note-type column at all (custom file) → infer from the sign:
    // negative amounts = credit note (ITC reduction), positive = debit note.
    const inferred: DocType = numVal(row['Taxable Value (₹)']) < 0 || numVal(row['Integrated Tax(₹)']) + numVal(row['Central Tax(₹)']) + numVal(row['State/UT Tax(₹)']) < 0
      ? 'credit_note' : (noteIdx >= 0 ? 'credit_note' : 'debit_note');
    const docType: DocType = typeByKey[key] || inferred;
    const out = { ...row, docType };
    AMT_COLS.forEach(c => {
      const v = numVal(out[c]);
      if (v === 0) { out[c] = out[c] === '' ? '' : 0; return; }
      out[c] = docType === 'debit_note' ? Math.abs(v) : -Math.abs(v);
    });
    return out;
  });
}




// ═══════════════════════════════════════════════════════════
// COMBINED FILE PARSING
// ═══════════════════════════════════════════════════════════

export function parseCombined(wb: any) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true }) as any[][];
  if (!raw || raw.length < 2) throw new Error('Pre-combined file appears empty');
  const headers = raw[0].map((c: any) => String(c || '').trim());
  const dataColIdx = headers.findIndex((h: string) => h.toUpperCase() === 'DATA');
  if (dataColIdx === -1) throw new Error('Pre-combined file must have a "DATA" column');
  const findH = (names: string[]) => headers.findIndex((h: string) => names.some(n => h.toLowerCase().includes(n.toLowerCase())));

  const iGSTIN = findH(['GSTIN of supplier', 'GSTIN']);
  const iTrade = findH(['Trade/Legal name', 'Trade Name', 'Supplier Name', 'Particulars']);
  const iInv = findH(['Invoice number', 'Invoice No', 'SupplierInvoice', 'Bill No']);
  const iInvType = findH(['Invoice type']);
  const iDate = findH(['Invoice Date', 'Date', 'Bill Date']);
  const iInvVal = findH(['Invoice Value']);
  const iPlace = findH(['Place of supply']);
  const iRC = findH(['Reverse Charge', 'Supply Attract']);
  const iTax = findH(['Taxable Value']);
  const iIGST = findH(['Integrated Tax', 'IGST']);
  const iCGST = findH(['Central Tax', 'CGST']);
  const iSGST = findH(['State/UT Tax', 'SGST']);
  const iCess = findH(['Cess']);
  if (iTax === -1) throw new Error('Could not find Taxable Value column');

  const detection = {
    headers, dataColIdx,
    gstrCount: 0, ourCount: 0,
    cols: {
      'GSTIN of supplier': { idx: iGSTIN, required: true },
      'Invoice number': { idx: iInv, required: true },
      'Invoice Date': { idx: iDate, required: true },
      'Taxable Value (₹)': { idx: iTax, required: true },
    }
  };

  const gstrRows: any[] = [], ourRows: any[] = [];
  for (let i = 1; i < raw.length; i++) {
    const r = raw[i]; if (!r) continue;
    const dataVal = String(r[dataColIdx] || '').trim();
    if (!dataVal) continue;
    const get = (idx: number) => idx >= 0 ? (r[idx] !== null && r[idx] !== undefined ? r[idx] : '') : '';
    if (dataVal === 'GSTR 2B') {
      detection.gstrCount++;
      gstrRows.push({
        'GSTIN of supplier': String(get(iGSTIN)), 'Trade/Legal name': String(get(iTrade)),
        'Invoice number': String(get(iInv)), 'Invoice type': String(get(iInvType)),
        'Invoice Date': String(get(iDate)), 'Invoice Value(₹)': get(iInvVal),
        'Place of supply': String(get(iPlace)), 'Supply Attract Reverse Charge': String(get(iRC)),
        'Taxable Value (₹)': get(iTax), 'Integrated Tax(₹)': get(iIGST),
        'Central Tax(₹)': get(iCGST), 'State/UT Tax(₹)': get(iSGST), 'Cess(₹)': get(iCess),
      });
    } else if (dataVal === 'Our Data') {
      detection.ourCount++;
      ourRows.push({
        gstin: normalise(String(get(iGSTIN))), tradeName: normalise(String(get(iTrade))),
        invoiceNum: normalise(String(get(iInv))) || '(blank)',
        invoiceDate: String(get(iDate)), taxable: numVal(get(iTax)),
        igst: numVal(get(iIGST)), cgst: numVal(get(iCGST)),
        sgst: numVal(get(iSGST)), cess: numVal(get(iCess)),
      });
    }
  }
  if (!gstrRows.length && !ourRows.length) throw new Error('No rows with DATA="GSTR 2B" or "Our Data" found.');
  return { gstrRows, ourRows, detection };
}

// Re-parse combined file with user-overridden column indices
export function reParseCombined(wb: any, colOverrides: Record<string, { idx: number; required: boolean }>, dataColIdx: number) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true }) as any[][];
  const headers = raw[0].map((c: any) => String(c || '').trim());
  const findH = (names: string[]) => headers.findIndex((h: string) => names.some(n => h.toLowerCase().includes(n.toLowerCase())));

  const iGSTIN = colOverrides['GSTIN of supplier']?.idx ?? -1;
  const iInv = colOverrides['Invoice number']?.idx ?? -1;
  const iDate = colOverrides['Invoice Date']?.idx ?? -1;
  const iTax = colOverrides['Taxable Value (₹)']?.idx ?? -1;
  const iTrade = findH(['Trade/Legal name', 'Trade Name', 'Supplier Name', 'Particulars']);
  const iInvType = findH(['Invoice type']);
  const iInvVal = findH(['Invoice Value']);
  const iPlace = findH(['Place of supply']);
  const iRC = findH(['Reverse Charge', 'Supply Attract']);
  const iIGST = findH(['Integrated Tax', 'IGST']);
  const iCGST = findH(['Central Tax', 'CGST']);
  const iSGST = findH(['State/UT Tax', 'SGST']);
  const iCess = findH(['Cess']);

  const detection = {
    headers, dataColIdx, gstrCount: 0, ourCount: 0,
    cols: { ...colOverrides },
  };

  const gstrRows: any[] = [], ourRows: any[] = [];
  for (let i = 1; i < raw.length; i++) {
    const r = raw[i]; if (!r) continue;
    const dataVal = String(r[dataColIdx] || '').trim();
    if (!dataVal) continue;
    const get = (idx: number) => idx >= 0 ? (r[idx] !== null && r[idx] !== undefined ? r[idx] : '') : '';
    if (dataVal === 'GSTR 2B') {
      detection.gstrCount++;
      gstrRows.push({
        'GSTIN of supplier': String(get(iGSTIN)), 'Trade/Legal name': String(get(iTrade)),
        'Invoice number': String(get(iInv)), 'Invoice type': String(get(iInvType)),
        'Invoice Date': String(get(iDate)), 'Invoice Value(₹)': get(iInvVal),
        'Place of supply': String(get(iPlace)), 'Supply Attract Reverse Charge': String(get(iRC)),
        'Taxable Value (₹)': get(iTax), 'Integrated Tax(₹)': get(iIGST),
        'Central Tax(₹)': get(iCGST), 'State/UT Tax(₹)': get(iSGST), 'Cess(₹)': get(iCess),
      });
    } else if (dataVal === 'Our Data') {
      detection.ourCount++;
      ourRows.push({
        gstin: normalise(String(get(iGSTIN))), tradeName: normalise(String(get(iTrade))),
        invoiceNum: normalise(String(get(iInv))) || '(blank)',
        invoiceDate: String(get(iDate)), taxable: numVal(get(iTax)),
        igst: numVal(get(iIGST)), cgst: numVal(get(iCGST)),
        sgst: numVal(get(iSGST)), cess: numVal(get(iCess)),
      });
    }
  }
  return { gstrRows, ourRows, detection };
}

// Re-parse Purchase Register with overridden column indices
export function reParsePR(wb: any, ciOverrides: Record<string, number>) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true }) as any[][];
  let hdrIdx = -1;
  for (let i = 0; i < Math.min(15, raw.length); i++) {
    if (raw[i] && raw[i].some((c: any) => {
      const s = String(c || '').toLowerCase();
      return (s.includes('bill') && s.includes('no')) || s === 'bill.no' || s === 'bill no';
    })) { hdrIdx = i; break; }
  }
  if (hdrIdx === -1) throw new Error('Header row not found in Purchase Register.');
  const ci = { ...ciOverrides };
  const gcol = (row: any[], name: string) => {
    const idx = ci[name];
    if (idx === undefined || idx < 0) return null;
    return row[idx];
  };
  const bills: Record<string, any> = {};
  const billOrder: string[] = [];
  for (let r = hdrIdx + 1; r < raw.length; r++) {
    const row = raw[r];
    if (!row || row.every((c: any) => c === null || c === undefined || c === '')) continue;
    const rawBill = String(gcol(row, 'Bill.No') || '').trim();
    if (!rawBill || rawBill === 'null') continue;
    const ck = cleanString(rawBill);
    if (!bills[ck]) {
      billOrder.push(ck);
      bills[ck] = {
        rawBill, billDate: excelSerialToDate(gcol(row, 'Bill Date')),
        party: String(gcol(row, 'Party Name') || '').trim(),
        gstin: String(gcol(row, 'GST No') || '').trim(),
        vouNo: String(gcol(row, 'Vou.No.') || '').trim(),
        tax5: 0, sgst25: 0, cgst25: 0, tax12: 0, sgst6: 0, cgst6: 0,
        tax18: 0, sgst9: 0, cgst9: 0, taxfree: 0, igst5: 0, igst12: 0, igst18: 0,
      };
    }
    const b = bills[ck];
    b.tax5 += nv4(gcol(row, 'Amt 5%')) + nv4(gcol(row, 'Amount 5%'));
    b.sgst25 += nv4(gcol(row, 'Sgst 2.5%'));
    b.cgst25 += nv4(gcol(row, 'Cgst 2.5%'));
    b.tax12 += nv4(gcol(row, 'Amt 12%')) + nv4(gcol(row, 'Amount 12%'));
    b.sgst6 += nv4(gcol(row, 'Sgst 6%'));
    b.cgst6 += nv4(gcol(row, 'Cgst 6%'));
    b.tax18 += nv4(gcol(row, 'Amt 18%')) + nv4(gcol(row, 'Amount 18%'));
    b.sgst9 += nv4(gcol(row, 'Sgst 9%'));
    b.cgst9 += nv4(gcol(row, 'Cgst 9%'));
    b.taxfree += nv4(gcol(row, 'GST AMT 0'));
    b.igst5 += nv4(gcol(row, 'Igst 5%'));
    b.igst12 += nv4(gcol(row, 'Igst 12%'));
    b.igst18 += nv4(gcol(row, 'Igst 18%'));
  }
  const rawHdr = raw[hdrIdx];
  const rawRows: any[] = [];
  for (let rr = hdrIdx + 1; rr < raw.length; rr++) {
    const rrow = raw[rr];
    if (!rrow || rrow.every((c: any) => c === null || c === undefined || c === '')) continue;
    const rb = String(rrow[ci['Bill.No']] || '').trim();
    rawRows.push({ cells: rrow, billKey: rb ? cleanString(rb) : null });
  }
  return { bills, billOrder, rawHdr, rawRows, ci };
}

// Re-parse Tally4 with overridden column indices
export function reParseTally4(wb: any, colOverrides: Record<string, number>) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true }) as any[][];
  let hdrIdx = -1;
  for (let i = 0; i < Math.min(20, raw.length); i++) {
    const r = raw[i]; if (!r) continue;
    const rowStr = r.map((c: any) => String(c || '').toLowerCase()).join('|');
    const hits = ['gstin', 'particulars', 'voucher', 'invoice', 'date'].filter(kw => rowStr.includes(kw)).length;
    if (hits >= 2) { hdrIdx = i; break; }
  }
  if (hdrIdx === -1) throw new Error('Header row not found in Tally file.');
  const hdrs = raw[hdrIdx].map((c: any) => String(c || '').trim().toLowerCase());
  const cols = { ...colOverrides };
  const gc = (row: any[], col: number) => col >= 0 ? row[col] : null;
  const tally: Record<string, any> = {};
  const tallyOrder: string[] = [];
  for (let r = hdrIdx + 1; r < raw.length; r++) {
    const row = raw[r];
    if (!row || row.every((c: any) => c === null || c === undefined || c === '')) continue;
    const party = normalise(String(gc(row, cols.party) || ''));
    if (!party) continue;
    const pl = party.toLowerCase();
    if (pl.includes('grand total') || pl.includes('subtotal') || pl.includes('sub total')) continue;
    const rawInv = String(gc(row, cols.invoice) || '').trim();
    if (!rawInv || rawInv === 'null') continue;
    const ck = cleanString(rawInv);
    if (!tally[ck]) {
      tallyOrder.push(ck);
      tally[ck] = {
        rawInv, invoiceDate: excelSerialToDate(gc(row, cols.date)), party,
        gstin: normalise(String(gc(row, cols.gstin) || '')),
        voucher: String(gc(row, cols.voucher) || ''),
        _tax12: 0, _cgst6: 0, _sgst6: 0, _tax5: 0, _cgst25: 0, _sgst25: 0,
        _tax18: 0, _cgst9: 0, _sgst9: 0, _igst12: 0, _taxfree: 0, _igst5: 0,
      };
    }
    const t = tally[ck];
    t._tax12 += nv4(gc(row, cols.tax12)); t._cgst6 += nv4(gc(row, cols.cgst6)); t._sgst6 += nv4(gc(row, cols.sgst6));
    t._tax5 += nv4(gc(row, cols.tax5)); t._cgst25 += nv4(gc(row, cols.cgst25)); t._sgst25 += nv4(gc(row, cols.sgst25));
    t._tax18 += nv4(gc(row, cols.tax18)); t._cgst9 += nv4(gc(row, cols.cgst9)); t._sgst9 += nv4(gc(row, cols.sgst9));
    t._igst12 += nv4(gc(row, cols.igst12)); t._taxfree += nv4(gc(row, cols.taxfree)); t._igst5 += nv4(gc(row, cols.igst5));
  }
  const rawHdr = raw[hdrIdx];
  const rawRows: any[] = [];
  for (let rr = hdrIdx + 1; rr < raw.length; rr++) {
    const rrow = raw[rr];
    if (!rrow || rrow.every((c: any) => c === null || c === undefined || c === '')) continue;
    const rawInv2 = String(cols.invoice >= 0 ? rrow[cols.invoice] : '').trim();
    rawRows.push({ cells: rrow, billKey: rawInv2 ? cleanString(rawInv2) : null });
  }
  return { tally, tallyOrder, rawHdr, rawRows, detectedCols: cols, hdrs };
}

// ═══════════════════════════════════════════════════════════
// PURCHASE REGISTER & TALLY4 PARSING (Option 4)
// ═══════════════════════════════════════════════════════════

export function parsePurchaseRegister(wb: any) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true }) as any[][];
  let hdrIdx = -1;
  for (let i = 0; i < Math.min(15, raw.length); i++) {
    if (raw[i] && raw[i].some((c: any) => {
      const s = String(c || '').toLowerCase();
      return (s.includes('bill') && s.includes('no')) || s === 'bill.no' || s === 'bill no';
    })) { hdrIdx = i; break; }
  }
  if (hdrIdx === -1) throw new Error('Header row not found in Purchase Register. Expected "Bill.No" column.');

  const hdrs = raw[hdrIdx].map((c: any) => String(c || '').trim().toLowerCase());
  const ci: Record<string, number> = {};
  hdrs.forEach((h: string, idx: number) => {
    if (h.includes('bill') && h.includes('no')) ci['Bill.No'] = idx;
    if (h.includes('bill') && h.includes('date')) ci['Bill Date'] = idx;
    if (h.includes('vou') && h.includes('date')) ci['Vou Date'] = idx;
    if (h === 'vou.no.' || h === 'vou no') ci['Vou.No.'] = idx;
    if (h.includes('party')) ci['Party Name'] = idx;
    if (h.includes('gst') && h.includes('no')) ci['GST No'] = idx;
    if (h === 'gst amt 0') ci['GST AMT 0'] = idx;
    if (h === 'amt 5%') ci['Amt 5%'] = idx;
    if (h === 'sgst 2.5%') ci['Sgst 2.5%'] = idx;
    if (h === 'cgst 2.5%') ci['Cgst 2.5%'] = idx;
    if (h === 'amt 12%') ci['Amt 12%'] = idx;
    if (h === 'sgst 6%') ci['Sgst 6%'] = idx;
    if (h === 'cgst 6%') ci['Cgst 6%'] = idx;
    if (h === 'amt 18%') ci['Amt 18%'] = idx;
    if (h === 'sgst 9%') ci['Sgst 9%'] = idx;
    if (h === 'cgst 9%') ci['Cgst 9%'] = idx;
    if (h === 'amt 28%') ci['Amt 28%'] = idx;
    if (h === 'amount 5%') ci['Amount 5%'] = idx;
    if (h === 'igst 5%') ci['Igst 5%'] = idx;
    if (h === 'amount 12%') ci['Amount 12%'] = idx;
    if (h === 'igst 12%') ci['Igst 12%'] = idx;
    if (h === 'amount 18%') ci['Amount 18%'] = idx;
    if (h === 'igst 18%') ci['Igst 18%'] = idx;
    if (h === 'amount 28%') ci['Amount 28%'] = idx;
    if (h === 'igst 28%') ci['Igst 28%'] = idx;
    if (h === 'net amt' || h === 'net amount') ci['Net Amt'] = idx;
  });

  const gcol = (row: any[], name: string) => {
    const idx = ci[name];
    if (idx === undefined || idx < 0) return null;
    return row[idx];
  };

  const bills: Record<string, any> = {};
  const billOrder: string[] = [];
  for (let r = hdrIdx + 1; r < raw.length; r++) {
    const row = raw[r];
    if (!row || row.every((c: any) => c === null || c === undefined || c === '')) continue;
    const rawBill = String(gcol(row, 'Bill.No') || '').trim();
    if (!rawBill || rawBill === 'null') continue;
    const ck = cleanString(rawBill);
    if (!bills[ck]) {
      billOrder.push(ck);
      bills[ck] = {
        rawBill, billDate: excelSerialToDate(gcol(row, 'Bill Date')),
        party: String(gcol(row, 'Party Name') || '').trim(),
        gstin: String(gcol(row, 'GST No') || '').trim(),
        vouNo: String(gcol(row, 'Vou.No.') || '').trim(),
        tax5: 0, sgst25: 0, cgst25: 0, tax12: 0, sgst6: 0, cgst6: 0,
        tax18: 0, sgst9: 0, cgst9: 0, taxfree: 0, igst5: 0, igst12: 0, igst18: 0,
      };
    }
    const b = bills[ck];
    b.tax5 += nv4(gcol(row, 'Amt 5%')) + nv4(gcol(row, 'Amount 5%'));
    b.sgst25 += nv4(gcol(row, 'Sgst 2.5%'));
    b.cgst25 += nv4(gcol(row, 'Cgst 2.5%'));
    b.tax12 += nv4(gcol(row, 'Amt 12%')) + nv4(gcol(row, 'Amount 12%'));
    b.sgst6 += nv4(gcol(row, 'Sgst 6%'));
    b.cgst6 += nv4(gcol(row, 'Cgst 6%'));
    b.tax18 += nv4(gcol(row, 'Amt 18%')) + nv4(gcol(row, 'Amount 18%'));
    b.sgst9 += nv4(gcol(row, 'Sgst 9%'));
    b.cgst9 += nv4(gcol(row, 'Cgst 9%'));
    b.taxfree += nv4(gcol(row, 'GST AMT 0'));
    b.igst5 += nv4(gcol(row, 'Igst 5%'));
    b.igst12 += nv4(gcol(row, 'Igst 12%'));
    b.igst18 += nv4(gcol(row, 'Igst 18%'));
  }

  const rawHdr = raw[hdrIdx];
  const rawRows: any[] = [];
  for (let rr = hdrIdx + 1; rr < raw.length; rr++) {
    const rrow = raw[rr];
    if (!rrow || rrow.every((c: any) => c === null || c === undefined || c === '')) continue;
    const rb = String(rrow[ci['Bill.No']] || '').trim();
    rawRows.push({ cells: rrow, billKey: rb ? cleanString(rb) : null });
  }
  return { bills, billOrder, rawHdr, rawRows, ci };
}

export function parseTally4(wb: any) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true }) as any[][];
  let hdrIdx = -1;
  for (let i = 0; i < Math.min(20, raw.length); i++) {
    const r = raw[i]; if (!r) continue;
    const rowStr = r.map((c: any) => String(c || '').toLowerCase()).join('|');
    const hits = ['gstin', 'particulars', 'voucher', 'invoice', 'date'].filter(kw => rowStr.includes(kw)).length;
    if (hits >= 2) { hdrIdx = i; break; }
  }
  if (hdrIdx === -1) throw new Error('Header row not found in Tally file.');

  const hdrs = raw[hdrIdx].map((c: any) => String(c || '').trim().toLowerCase());
  const fi = (keywords: string[]) => {
    for (const kw of keywords) {
      for (let h = 0; h < hdrs.length; h++) { if (hdrs[h].includes(kw.toLowerCase())) return h; }
    }
    return -1;
  };

  const cols: Record<string, number> = {
    date: fi(['date']), party: fi(['particulars', 'party name', 'supplier']),
    voucher: fi(['voucher no']), invoice: fi(['supplierinvoice', 'supplier invoice', 'invoice no']),
    gstin: fi(['gstin']),
    tax12: fi(['purchase @12%', 'purchase@12%']), cgst6: fi(['cgst @ 6%', 'cgst@6%', 'cgst 6%']),
    sgst6: fi(['sgst @6%', 'sgst@6%', 'sgst 6%']), tax5: fi(['purchase @5%', 'purchase@5%']),
    cgst25: fi(['cgst@2.5%', 'cgst 2.5%']), sgst25: fi(['sgst@2.5%', 'sgst 2.5%']),
    tax18: fi(['purchase @18%', 'purchase@18%']), cgst9: fi(['cgst 9%']), sgst9: fi(['sgst 9%']),
    igst12: fi(['igst 12%']), taxfree: fi(['purchase tax free', 'tax free']),
    igst5: fi(['igst   5%', 'igst 5%', 'igst5%']),
  };

  const tally: Record<string, any> = {};
  const tallyOrder: string[] = [];
  const gc = (row: any[], col: number) => col >= 0 ? row[col] : null;

  for (let r = hdrIdx + 1; r < raw.length; r++) {
    const row = raw[r];
    if (!row || row.every((c: any) => c === null || c === undefined || c === '')) continue;
    const party = normalise(String(gc(row, cols.party) || ''));
    if (!party) continue;
    const pl = party.toLowerCase();
    if (pl.includes('grand total') || pl.includes('subtotal') || pl.includes('sub total')) continue;
    const rawInv = String(gc(row, cols.invoice) || '').trim();
    if (!rawInv || rawInv === 'null') continue;
    const ck = cleanString(rawInv);
    if (!tally[ck]) {
      tallyOrder.push(ck);
      tally[ck] = {
        rawInv, invoiceDate: excelSerialToDate(gc(row, cols.date)), party,
        gstin: normalise(String(gc(row, cols.gstin) || '')),
        voucher: String(gc(row, cols.voucher) || ''),
        _tax12: 0, _cgst6: 0, _sgst6: 0, _tax5: 0, _cgst25: 0, _sgst25: 0,
        _tax18: 0, _cgst9: 0, _sgst9: 0, _igst12: 0, _taxfree: 0, _igst5: 0,
      };
    }
    const t = tally[ck];
    t._tax12 += nv4(gc(row, cols.tax12)); t._cgst6 += nv4(gc(row, cols.cgst6)); t._sgst6 += nv4(gc(row, cols.sgst6));
    t._tax5 += nv4(gc(row, cols.tax5)); t._cgst25 += nv4(gc(row, cols.cgst25)); t._sgst25 += nv4(gc(row, cols.sgst25));
    t._tax18 += nv4(gc(row, cols.tax18)); t._cgst9 += nv4(gc(row, cols.cgst9)); t._sgst9 += nv4(gc(row, cols.sgst9));
    t._igst12 += nv4(gc(row, cols.igst12)); t._taxfree += nv4(gc(row, cols.taxfree)); t._igst5 += nv4(gc(row, cols.igst5));
  }

  const rawHdr = raw[hdrIdx];
  const rawRows: any[] = [];
  for (let rr = hdrIdx + 1; rr < raw.length; rr++) {
    const rrow = raw[rr];
    if (!rrow || rrow.every((c: any) => c === null || c === undefined || c === '')) continue;
    const rawInv2 = String(cols.invoice >= 0 ? rrow[cols.invoice] : '').trim();
    rawRows.push({ cells: rrow, billKey: rawInv2 ? cleanString(rawInv2) : null });
  }
  return { tally, tallyOrder, rawHdr, rawRows, detectedCols: cols, hdrs };
}
