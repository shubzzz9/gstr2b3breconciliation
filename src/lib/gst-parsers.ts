/* eslint-disable @typescript-eslint/no-explicit-any */
import XLSX from 'xlsx-js-style';
import {
  cleanString, normalise, numVal, excelSerialToDate,
  TALLY_SINGLE_ROWS, TALLY_MULTI_ROWS, nv4
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
      const idx = headers.findIndex((h: string) => h.toLowerCase().includes(name.toLowerCase()));
      if (idx >= 0) return idx;
    }
    return -1;
  };
  const guessCols = (names: string[], extMatch?: (h: string) => boolean): number[] => {
    return headers.reduce((a: number[], h: string, i: number) => {
      const byKw = names.some(n => h.toLowerCase().includes(n.toLowerCase()));
      const byExt = extMatch ? extMatch(h) : false;
      if (byKw || byExt) a.push(i);
      return a;
    }, []);
  };

  const singleGuesses: Record<string, number> = {};
  TALLY_SINGLE_ROWS.forEach(row => { singleGuesses[row.id] = guessCol(row.guess); });

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
}

export function processTally(m: TallyMapping) {
  const grouped: Record<string, any> = {};
  let unkCounter = 0;
  const blankGstinRows: any[] = [], blankInvoiceRows: any[] = [];

  for (let i = m.hdrIdx + 1; i < m.raw.length; i++) {
    const r = m.raw[i];
    if (!r) continue;
    if (r.every((c: any) => c === null || c === undefined || c === '')) continue;
    const supplier = normalise(String(r[m.trade] || ''));
    if (!supplier || supplier.toLowerCase().includes('grand total') ||
        supplier.toLowerCase().includes('sub total') || supplier.toLowerCase().includes('subtotal')) continue;

    const invoiceNum = normalise(String(r[m.invoice] || ''));
    const gstin = normalise(String(r[m.gstin] || ''));
    const voucher = m.voucher >= 0 ? normalise(String(r[m.voucher] || '')) : '';
    const hasInv = invoiceNum !== '', hasGST = gstin !== '', hasVou = voucher !== '';

    let key: string;
    if (hasInv && hasGST) key = `${invoiceNum}|||${gstin}`;
    else if (!hasGST && hasInv) key = `${invoiceNum}|||__NO_GSTIN__`;
    else if (!hasInv && hasGST) key = `__NO_INV__|||${gstin}|||V${hasVou ? voucher : 'UNK' + (++unkCounter)}`;
    else key = `__NO_INV__|||__NO_GSTIN__|||V${hasVou ? voucher : 'UNK' + (++unkCounter)}`;

    if (!hasGST && hasInv) blankGstinRows.push({ supplier, invoiceNum, gstin: '', voucher });
    if (!hasInv) blankInvoiceRows.push({ supplier, invoiceNum: '', gstin, voucher });

    if (!grouped[key]) {
      grouped[key] = {
        gstin, tradeName: supplier,
        invoiceNum: invoiceNum || '(blank)',
        invoiceDate: excelSerialToDate(r[m.date]),
        taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0,
      };
    }
    m.taxable.forEach(c => { grouped[key].taxable += numVal(r[c]); });
    m.igst.forEach(c => { grouped[key].igst += numVal(r[c]); });
    m.cgst.forEach(c => { grouped[key].cgst += numVal(r[c]); });
    m.sgst.forEach(c => { grouped[key].sgst += numVal(r[c]); });
    if (m.cess) m.cess.forEach(c => { grouped[key].cess += numVal(r[c]); });
  }
  return { rows: Object.values(grouped), blankGstinRows, blankInvoiceRows };
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
}

export function scanGSTR2B(wb: any): GSTRScanResult {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true }) as any[][];
  let hdr1 = -1;
  let headerFallback = false;

  for (let i = 0; i < Math.min(15, raw.length); i++) {
    if (raw[i] && raw[i].some((c: any) => c && String(c).toLowerCase().includes('gstin of supplier'))) { hdr1 = i; break; }
  }
  if (hdr1 === -1) {
    for (let i = 0; i < Math.min(20, raw.length); i++) {
      if (!raw[i]) continue;
      const rowStr = raw[i].map((c: any) => String(c || '').toLowerCase()).join('|');
      const hits = ['gstin', 'invoice', 'taxable', 'supplier'].filter(kw => rowStr.includes(kw)).length;
      if (hits >= 2) { hdr1 = i; headerFallback = true; break; }
    }
  }
  if (hdr1 === -1) {
    for (let i = 0; i < Math.min(20, raw.length); i++) {
      if (raw[i] && raw[i].some((c: any) => c && (String(c).toLowerCase().includes('gstin') || String(c).toLowerCase().includes('gstn')))) {
        hdr1 = i; headerFallback = true; break;
      }
    }
  }
  if (hdr1 === -1) throw new Error('Could not find header row in GSTR-2B file. Expected "GSTIN of supplier" column.');

  const r1 = raw[hdr1], r2 = raw[hdr1 + 1] || [];
  const GSTIN_RE = /^\d{2}[A-Z0-9]{13}$/;
  const r2FirstVal = String((r2 as any[]).find((c: any) => c != null && String(c).trim() !== '') || '').trim();
  const r1IsStandaloneHeader = GSTIN_RE.test(r2FirstVal);
  const dataStartIdx = hdr1 + (r1IsStandaloneHeader ? 1 : 2);

  const hdrs = r1.map((h: any, i: number) => {
    const sub = r2[i];
    const useSubRow = !r1IsStandaloneHeader && sub && String(sub).trim() && String(sub) !== 'null';
    return useSubRow ? String(sub).trim() : String(h || '').trim();
  }).filter((h: string) => h);

  const GSTR_FUZZY_KW: Record<string, string[]> = {
    'GSTIN of supplier': ['gstin of supplier', 'gstin of supp', 'gstin', 'gst no', 'gst num'],
    'Trade/Legal name': ['trade', 'legal name', 'supplier name', 'party name', 'particulars'],
    'Invoice number': ['invoice no', 'invoice num', 'bill no', 'bill num'],
    'Invoice type': ['invoice type', 'inv type'],
    'Invoice Date': ['invoice date', 'bill date', 'inv date'],
    'Invoice Value(₹)': ['invoice value', 'inv value', 'bill value', 'inv val'],
    'Place of supply': ['place of supply', 'place of supp'],
    'Supply Attract Reverse Charge': ['reverse charge', 'rev charge'],
    'Taxable Value (₹)': ['taxable value', 'taxable amt', 'taxable amount'],
    'Integrated Tax(₹)': ['integrated tax', 'igst'],
    'Central Tax(₹)': ['central tax', 'cgst'],
    'State/UT Tax(₹)': ['state/ut', 'sgst', 'ut tax'],
    'Cess(₹)': ['cess'],
  };

  const STD_COLS = [
    'GSTIN of supplier', 'Trade/Legal name', 'Invoice number', 'Invoice type',
    'Invoice Date', 'Invoice Value(₹)', 'Place of supply',
    'Supply Attract Reverse Charge', 'Taxable Value (₹)',
    'Integrated Tax(₹)', 'Central Tax(₹)', 'State/UT Tax(₹)', 'Cess(₹)',
  ];

  const det: Record<string, string | null> = {};
  STD_COLS.forEach(expected => {
    let found = hdrs.find((h: string) => h === expected);
    if (!found) found = hdrs.find((h: string) => cleanString(h) === cleanString(expected));
    if (!found) found = hdrs.find((h: string) => h.toLowerCase().includes(expected.toLowerCase().slice(0, 8)));
    if (!found) {
      const kws = GSTR_FUZZY_KW[expected] || [];
      found = hdrs.find((h: string) => kws.some(kw => h.toLowerCase().includes(kw)));
    }
    det[expected] = found || null;
  });

  const usedHdrs = new Set(Object.values(det).filter(Boolean));
  const extraCols = hdrs.filter((h: string) => !usedHdrs.has(h)).map((h: string) => ({
    gstrCol: h, tallyCol: '', include: false,
  }));

  // Sanity warnings
  const sanityWarnings: string[] = [];
  const REQUIRED_FOR_SANITY = ['GSTIN of supplier', 'Invoice number', 'Taxable Value (₹)'];
  const missingRequired = REQUIRED_FOR_SANITY.filter(c => !det[c]);
  if (missingRequired.length > 0) {
    sanityWarnings.push(`Could not auto-detect: ${missingRequired.join(', ')}. Please map them manually.`);
  }

  return { hdrIdx: hdr1, raw, allHeaders: hdrs, detected: det, extraCols, sanityWarnings, dataStartIdx, headerFallback };
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
    if (h === 'amount 5%') ci['Amount 5%'] = idx;
    if (h === 'igst 5%') ci['Igst 5%'] = idx;
    if (h === 'amount 12%') ci['Amount 12%'] = idx;
    if (h === 'igst 12%') ci['Igst 12%'] = idx;
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
    b.tax18 += nv4(gcol(row, 'Amt 18%'));
    b.sgst9 += nv4(gcol(row, 'Sgst 9%'));
    b.cgst9 += nv4(gcol(row, 'Cgst 9%'));
    b.taxfree += nv4(gcol(row, 'GST AMT 0'));
    b.igst5 += nv4(gcol(row, 'Igst 5%'));
    b.igst12 += nv4(gcol(row, 'Igst 12%'));
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
