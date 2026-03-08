/* eslint-disable @typescript-eslint/no-explicit-any */
import XLSX from 'xlsx-js-style';
import { safeVal, safeNum, stamp, dateStringToSerial, GSTR_STD_COLS, numVal, AUDIT_FIELDS, cleanString, excelSerialToDate } from './gst-helpers';

// ═══════════════════════════════════════════════════════════
// STYLED HEADER & SHEET HELPERS — exact port from original
// ═══════════════════════════════════════════════════════════

const HDR_STYLE: any = {
  fill: { fgColor: { rgb: '1E3A5F' } },
  font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
  alignment: { horizontal: 'center' as const, vertical: 'center' as const, wrapText: true },
  border: {
    top: { style: 'thin', color: { rgb: 'FFFFFF' } },
    bottom: { style: 'thin', color: { rgb: 'FFFFFF' } },
    left: { style: 'thin', color: { rgb: 'FFFFFF' } },
    right: { style: 'thin', color: { rgb: 'FFFFFF' } },
  },
};

const COL_WIDTHS: Record<string, number> = {
  'GSTIN': 17, 'Trade': 22, 'Supplier': 22, 'Invoice number': 17, 'Invoice No': 17,
  'Invoice Date': 14, 'Invoice type': 14, 'Invoice Value': 14, 'Place': 18,
  'Reverse': 14, 'Taxable': 14, 'Integrated': 12, 'Central': 12, 'State': 12,
  'Cess': 10, 'DATA': 10, 'Remarks': 38, 'Diagnosis': 52, 'Action': 42, 'Count': 8,
  'Confidence': 12, 'Likely Reason': 38, 'GSTR-2B Invoice': 22, 'Our Data Invoice': 22,
};

function getColWidth(name: string): number {
  for (const [k, w] of Object.entries(COL_WIDTHS)) { if (name.includes(k)) return w; }
  return 16;
}

function applyHeaderStyle(ws: any, colNames: string[]) {
  if (!colNames || !colNames.length) return;
  ws['!cols'] = colNames.map((n: string) => ({ wch: getColWidth(n) }));
  ws['!rows'] = [{ hpt: 28 }];
  colNames.forEach((name: string, ci: number) => {
    const addr = XLSX.utils.encode_cell({ r: 0, c: ci });
    if (ws[addr]) ws[addr].s = HDR_STYLE;
    else ws[addr] = { t: 's', v: name, s: HDR_STYLE };
  });
  const lastCol = XLSX.utils.encode_col(colNames.length - 1);
  ws['!autofilter'] = { ref: `A1:${lastCol}1` };
}

function makeStyledSheet(rows: any[], colOrder?: string[]) {
  if (!rows || !rows.length) return XLSX.utils.aoa_to_sheet([colOrder || ['(No data)']]);
  const keys = colOrder || Object.keys(rows[0]);

  const dateColIndices: number[] = [];
  keys.forEach((k, i) => { if (k.toLowerCase().includes('date')) dateColIndices.push(i); });

  const aoa: any[][] = [keys];
  rows.forEach(r => aoa.push(keys.map((k, ki) => {
    const v = r[k];
    if (v === null || v === undefined) return '';
    if (dateColIndices.includes(ki)) return '';
    return v;
  })));

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  applyHeaderStyle(ws, keys);

  // BASE CELL STYLE
  const BASE_CELL: any = {
    font: { sz: 11, color: { rgb: '1A1A1A' } },
    alignment: { vertical: 'top', horizontal: 'left', wrapText: true },
  };
  const BASE_CELL_NUM: any = {
    font: { sz: 11, color: { rgb: '1A1A1A' } },
    alignment: { vertical: 'top', horizontal: 'right', wrapText: false },
  };
  const NUM_KW = ['Value', 'IGST', 'CGST', 'SGST', 'Tax', 'Cess', 'Diff', 'ITC', 'Count', 'Confidence Score'];
  rows.forEach((row, ri) => {
    keys.forEach((k, ci) => {
      const addr = XLSX.utils.encode_cell({ r: ri + 1, c: ci });
      const isNum = NUM_KW.some(kw => k.includes(kw));
      const existing = ws[addr];
      const v = existing ? existing.v : (row[k] === null || row[k] === undefined ? '' : row[k]);
      ws[addr] = { t: existing ? existing.t : 's', v: v, s: isNum ? BASE_CELL_NUM : BASE_CELL };
    });
  });

  // DIAGNOSIS STYLE
  const DIAG_STYLE: any = {
    fill: { fgColor: { rgb: 'FFFDE7' }, type: 'pattern', patternType: 'solid' },
    font: { sz: 11, color: { rgb: '333333' } },
    alignment: { vertical: 'top', wrapText: true },
    border: { top: { style: 'thin', color: { rgb: 'E8E8C0' } }, bottom: { style: 'thin', color: { rgb: 'E8E8C0' } },
              left: { style: 'thin', color: { rgb: 'D4D490' } }, right: { style: 'thin', color: { rgb: 'D4D490' } } },
  };
  const diagColIdx = keys.indexOf('Diagnosis');
  if (diagColIdx >= 0) {
    rows.forEach((row, ri) => {
      const addr = XLSX.utils.encode_cell({ r: ri + 1, c: diagColIdx });
      const v = row[keys[diagColIdx]];
      ws[addr] = { t: 's', v: String(v === null || v === undefined ? '' : v), s: DIAG_STYLE };
    });
  }

  // DATE CELLS
  rows.forEach((row, ri) => {
    dateColIndices.forEach(ci => {
      const addr = XLSX.utils.encode_cell({ r: ri + 1, c: ci });
      const val = row[keys[ci]];
      const serial = dateStringToSerial(val);
      if (serial !== null) {
        ws[addr] = { t: 'n', v: serial, z: 'dd/mm/yyyy', s: BASE_CELL };
      } else {
        ws[addr] = { t: 's', v: String(val || ''), s: BASE_CELL };
      }
    });
  });

  // NUMERIC ZEROS
  const numKeys = ['Invoice Value(₹)', 'Taxable Value (₹)', 'Integrated Tax(₹)',
                   'Central Tax(₹)', 'State/UT Tax(₹)', 'Cess(₹)',
                   'Taxable Value', 'IGST', 'CGST', 'SGST'];
  rows.forEach((row, ri) => {
    keys.forEach((k, ci) => {
      const addr = XLSX.utils.encode_cell({ r: ri + 1, c: ci });
      const val = row[k];
      if (numKeys.some(nk => k.includes(nk.split('(')[0].trim()))) {
        if (val === 0 || val === '0' || val === 0.0) {
          ws[addr] = { t: 'n', v: 0, s: BASE_CELL_NUM };
        }
      }
    });
  });

  // ROW HEIGHTS
  if (rows && rows.length) {
    const rowsArr: any[] = [{ hpt: 28 }];
    rows.forEach((row) => {
      let maxLines = 1;
      keys.forEach((k, ci) => {
        if (dateColIndices.includes(ci)) return;
        if (NUM_KW.some(kw => k.includes(kw))) return;
        const txt = String(row[k] === null || row[k] === undefined ? '' : row[k]);
        if (!txt) return;
        const colMeta = ws['!cols'] && ws['!cols'][ci];
        const wch = colMeta && colMeta.wch ? colMeta.wch : 16;
        const lines = Math.ceil(txt.length / wch);
        if (lines > maxLines) maxLines = lines;
      });
      rowsArr.push({ hpt: Math.max(20, maxLines * 15 + 4) });
    });
    ws['!rows'] = rowsArr;
  }
  return ws;
}

// ═══════════════════════════════════════════════════════════
// FILE 1: GSTR-2B FORMAT
// ═══════════════════════════════════════════════════════════

export function downloadFile1(tallyData: any[]) {
  if (!tallyData) return;
  const cols = ['GSTIN of supplier', 'Trade/Legal name', 'Invoice number', 'Invoice Date',
    'Sum of Taxable Value (₹)', 'Sum of Integrated Tax(₹)', 'Sum of Central Tax(₹)', 'Sum of State/UT Tax(₹)'];
  const rows = tallyData.map(r => ({
    'GSTIN of supplier': safeVal(r.gstin), 'Trade/Legal name': safeVal(r.tradeName),
    'Invoice number': safeVal(r.invoiceNum), 'Invoice Date': safeVal(r.invoiceDate),
    'Sum of Taxable Value (₹)': r.taxable, 'Sum of Integrated Tax(₹)': r.igst,
    'Sum of Central Tax(₹)': r.cgst, 'Sum of State/UT Tax(₹)': r.sgst,
  }));
  const ws = makeStyledSheet(rows, cols);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'GSTR-2B Format');
  XLSX.writeFile(wb, 'Tally_GSTR2B_Format_' + stamp() + '.xlsx');
}

// ═══════════════════════════════════════════════════════════
// FILE 2: RECONCILIATION OUTPUT + REMARKS GUIDE
// ═══════════════════════════════════════════════════════════

export function downloadFile2(recoRows: any[], extraCols: any[] = []) {
  if (!recoRows) return;
  const cols = [...GSTR_STD_COLS, ...extraCols.filter(e => e.include).map(e => e.gstrCol), 'DATA', 'Remarks'];
  const ws = makeStyledSheet(recoRows, cols);
  ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Reconciliation_Output');

  // Remarks Legend sheet
  const legendRows = [
    { 'Remark': 'Matched', 'What it means': 'Invoice found in both GSTR-2B and your accounts. GSTIN, invoice number, and all tax figures match exactly.', 'Action Required': 'None. This invoice is fully reconciled.', 'See in Mismatch File': '—' },
    { 'Remark': 'Fig Not Matched', 'What it means': 'Invoice found in both GSTR-2B and your accounts, but the taxable value or tax amounts differ between the two.', 'Action Required': 'Check whether the difference is a minor rounding (can be ignored) or a real mismatch. Correct in accounts if needed.', 'See in Mismatch File': 'Sheet: Fig Not Matched' },
    { 'Remark': 'Not in our data', 'What it means': 'This invoice exists in GSTR-2B (supplier has filed it) but is missing from your accounts entirely.', 'Action Required': 'Check if the bill was physically received. If yes, add purchase entry in accounts and re-run reconciliation.', 'See in Mismatch File': 'Sheet: Not In Our Data' },
    { 'Remark': 'Not in our data — GSTIN Mismatch', 'What it means': 'Invoice exists in both GSTR-2B and accounts but appears as unmatched because the GSTIN is recorded differently in each.', 'Action Required': 'Correct the GSTIN in your accounts/Tally to match what is in GSTR-2B.', 'See in Mismatch File': 'Sheet: GSTIN Mismatches' },
    { 'Remark': 'Not in GSTR 2B', 'What it means': 'This invoice is in your accounts but NOT in GSTR-2B. The supplier may not have filed GSTR-1 yet, so ITC may not be claimable.', 'Action Required': 'Follow up with supplier to file GSTR-1. Do not claim ITC for this invoice until it appears in GSTR-2B.', 'See in Mismatch File': 'Sheet: Not In GSTR 2B (ITC Risk)' },
    { 'Remark': 'Not in GSTR 2B — GSTIN Mismatch', 'What it means': 'Invoice appears unmatched because GSTIN differs between accounts and GSTR-2B.', 'Action Required': 'Correct GSTIN in accounts to match GSTR-2B.', 'See in Mismatch File': 'Sheet: GSTIN Mismatches' },
    { 'Remark': 'Possible Match — Invoice No. differs', 'What it means': 'Invoice numbers are different in GSTR-2B and accounts, but all other details (GSTIN, amounts) are similar. Likely the same bill recorded differently.', 'Action Required': 'Verify with the supplier. If same bill, correct the invoice number in accounts to match GSTR-2B.', 'See in Mismatch File': 'Sheet: Possible Matches' },
  ];
  const legendCols = ['Remark', 'What it means', 'Action Required', 'See in Mismatch File'];
  const wsLegend = makeStyledSheet(legendRows, legendCols);
  wsLegend['!cols'] = [{ wch: 32 }, { wch: 55 }, { wch: 55 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, wsLegend, 'Remarks Guide');

  XLSX.writeFile(wb, 'GST_Reconciliation_' + stamp() + '.xlsx');
}

// ═══════════════════════════════════════════════════════════
// FILE 3: MISMATCH DIAGNOSIS — exact port with all 7 sheets
// ═══════════════════════════════════════════════════════════

export function downloadFile3(diagData: any, recoRows: any[], possibleMatchPairs: any[]) {
  if (!diagData) return;
  const wb = XLSX.utils.book_new();

  // ── SHEET 1: Not In Our Data
  const diagCols1 = ['GSTIN (GSTR-2B)', 'Supplier', 'Invoice Number', 'Invoice Date', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Diagnosis'];
  const ws1 = makeStyledSheet(
    diagData.notInOurData.length ? diagData.notInOurData
      : [{ 'GSTIN (GSTR-2B)': '', 'Supplier': 'No unmatched GSTR-2B rows', 'Invoice Number': '', 'Invoice Date': '', 'Taxable Value': '', 'IGST': '', 'CGST': '', 'SGST': '', 'Diagnosis': '' }],
    diagCols1);
  ws1['!cols'] = [{ wch: 17 }, { wch: 22 }, { wch: 17 }, { wch: 12 }, { wch: 13 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 22 }];
  ws1['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
  XLSX.utils.book_append_sheet(wb, ws1, 'Not In Our Data');

  // ── SHEET 2: Not In GSTR 2B (ITC Risk) — supplier-grouped
  const mergedCols = ['Supplier Name', 'GSTIN', 'No. of Invoices', 'Invoice No.', 'Invoice Date',
    'Taxable Value (Rs.)', 'IGST (Rs.)', 'CGST (Rs.)', 'SGST (Rs.)', 'ITC Blocked (Rs.)',
    'Diagnosis', '% of Total  (█=5%)'];
  let gstr2bWs: any;
  if (diagData.notInGSTR2B.length) {
    const supMap: Record<string, any> = {};
    diagData.notInGSTR2B.forEach((r: any) => {
      const sup = (r['Supplier'] || r['GSTIN (Tally)'] || '').trim();
      const gstin = r['GSTIN (Tally)'] || '';
      if (!supMap[sup]) supMap[sup] = { supplier: sup, gstin, itc: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, invoices: [] };
      supMap[sup].itc += numVal(r['IGST']) + numVal(r['CGST']) + numVal(r['SGST']);
      supMap[sup].taxable += numVal(r['Taxable Value']);
      supMap[sup].igst += numVal(r['IGST']);
      supMap[sup].cgst += numVal(r['CGST']);
      supMap[sup].sgst += numVal(r['SGST']);
      supMap[sup].invoices.push(r);
    });
    const sortedSups = Object.values(supMap).sort((a: any, b: any) => b.itc - a.itc);
    const totalITC = sortedSups.reduce((a: number, s: any) => a + s.itc, 0);
    const mergedAoa: any[][] = [mergedCols];
    const rowMeta: string[] = [];
    sortedSups.forEach((s: any) => {
      const pct = totalITC > 0 ? Math.round(s.itc / totalITC * 1000) / 10 : 0;
      const barLen = Math.max(0, Math.round(pct / 5));
      let bar = ''; for (let b = 0; b < barLen; b++) bar += '█';
      mergedAoa.push([s.supplier, s.gstin, s.invoices.length, '', '', Math.round(s.taxable * 100) / 100, Math.round(s.igst * 100) / 100, Math.round(s.cgst * 100) / 100, Math.round(s.sgst * 100) / 100, Math.round(s.itc * 100) / 100, '', pct.toFixed(1) + '%  ' + bar]);
      rowMeta.push('supplier');
      s.invoices.forEach((r: any) => {
        const itcRow = Math.round((numVal(r['IGST']) + numVal(r['CGST']) + numVal(r['SGST'])) * 100) / 100;
        mergedAoa.push(['', '', '', r['Invoice Number'] || '', r['Invoice Date'] || '', numVal(r['Taxable Value']), numVal(r['IGST']), numVal(r['CGST']), numVal(r['SGST']), itcRow, r['Diagnosis'] || 'Invoice may not be filed by supplier in GSTR-1 yet', '']);
        rowMeta.push('invoice');
      });
    });
    gstr2bWs = XLSX.utils.aoa_to_sheet(mergedAoa);

    const G2B_HDR_S: any = { fill: { fgColor: { rgb: '1E3A5F' } }, font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: { top: { style: 'thin', color: { rgb: 'FFFFFF' } }, bottom: { style: 'thin', color: { rgb: 'FFFFFF' } }, left: { style: 'thin', color: { rgb: 'FFFFFF' } }, right: { style: 'thin', color: { rgb: 'FFFFFF' } } } };
    const SUP_S: any = { fill: { fgColor: { rgb: 'D6E4F0' } }, font: { bold: true, sz: 11, color: { rgb: '1A1A2E' } }, alignment: { vertical: 'top', wrapText: false }, border: { top: { style: 'medium', color: { rgb: '1E3A5F' } }, bottom: { style: 'thin', color: { rgb: '1E3A5F' } }, left: { style: 'thin', color: { rgb: 'BBBBBB' } }, right: { style: 'thin', color: { rgb: 'BBBBBB' } } } };
    const SUP_S_WRAP: any = { ...SUP_S, alignment: { vertical: 'top', wrapText: true } };
    const INV_S: any = { fill: { fgColor: { rgb: 'FFFFFF' } }, font: { sz: 11, color: { rgb: '333333' } }, alignment: { vertical: 'top', wrapText: true }, border: { top: { style: 'thin', color: { rgb: 'E0E0E0' } }, bottom: { style: 'thin', color: { rgb: 'E0E0E0' } }, left: { style: 'thin', color: { rgb: 'E0E0E0' } }, right: { style: 'thin', color: { rgb: 'E0E0E0' } } } };
    const DIAG_S_G2B: any = { fill: { fgColor: { rgb: 'FFFDE7' }, type: 'pattern', patternType: 'solid' }, font: { sz: 11, color: { rgb: '333333' } }, alignment: { vertical: 'top', wrapText: true }, border: { top: { style: 'thin', color: { rgb: 'E8E8C0' } }, bottom: { style: 'thin', color: { rgb: 'E8E8C0' } }, left: { style: 'thin', color: { rgb: 'D4D490' } }, right: { style: 'thin', color: { rgb: 'D4D490' } } } };
    const numC = [5, 6, 7, 8, 9];

    mergedCols.forEach((_, ci) => {
      const addr = XLSX.utils.encode_cell({ r: 0, c: ci });
      if (gstr2bWs[addr]) gstr2bWs[addr].s = G2B_HDR_S;
      else gstr2bWs[addr] = { t: 's', v: mergedCols[ci], s: G2B_HDR_S };
    });
    rowMeta.forEach((type, ri) => {
      const sheetRow = ri + 1;
      const baseS = type === 'supplier' ? SUP_S : INV_S;
      mergedCols.forEach((_, ci) => {
        const addr = XLSX.utils.encode_cell({ r: sheetRow, c: ci });
        const isNum = numC.indexOf(ci) >= 0;
        if (type === 'invoice' && ci === 10) {
          const dv = gstr2bWs[addr] ? gstr2bWs[addr].v : '';
          gstr2bWs[addr] = { t: 's', v: String(dv || ''), s: DIAG_S_G2B };
          return;
        }
        if (type === 'supplier' && ci === 0) {
          const sv = gstr2bWs[addr] ? gstr2bWs[addr].v : '';
          gstr2bWs[addr] = { t: 's', v: String(sv || ''), s: SUP_S_WRAP };
          return;
        }
        const s = { ...baseS };
        if (isNum) Object.assign(s, { alignment: { ...(baseS.alignment || {}), horizontal: 'right' } });
        if (gstr2bWs[addr]) {
          gstr2bWs[addr].s = s;
          if (isNum && typeof gstr2bWs[addr].v === 'number') gstr2bWs[addr].t = 'n';
        } else {
          gstr2bWs[addr] = { t: 's', v: '', s };
        }
      });
    });
    const g2bRH: any[] = [{ hpt: 28 }];
    const aoaData = mergedAoa.slice(1);
    rowMeta.forEach((t, i) => {
      if (t === 'supplier') {
        const supTxt = String(aoaData[i] && aoaData[i][0] ? aoaData[i][0] : '');
        const lines = supTxt.length > 0 ? Math.ceil(supTxt.length / 22) : 1;
        g2bRH.push({ hpt: Math.max(20, lines * 15 + 4) });
      } else {
        const diagTxt = String(aoaData[i] && aoaData[i][10] ? aoaData[i][10] : '');
        const lines = diagTxt.length > 0 ? Math.ceil(diagTxt.length / 22) : 1;
        g2bRH.push({ hpt: Math.max(20, lines * 15 + 4) });
      }
    });
    gstr2bWs['!rows'] = g2bRH;
    gstr2bWs['!cols'] = [{ wch: 22 }, { wch: 17 }, { wch: 10 }, { wch: 17 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 22 }, { wch: 16 }];
    gstr2bWs['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
    gstr2bWs['!autofilter'] = { ref: 'A1:L1' };
  } else {
    gstr2bWs = XLSX.utils.aoa_to_sheet([mergedCols, ['No supplier pending rows', '', '', '', '', 0, 0, 0, 0, 0, '', '']]);
    gstr2bWs['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
  }
  XLSX.utils.book_append_sheet(wb, gstr2bWs, 'Not In GSTR 2B (ITC Risk)');

  // ── SHEET 3: GSTIN Mismatches
  const gstinCols = ['Source', 'GSTIN (GSTR-2B)', 'GSTIN (Tally)', 'Supplier', 'Invoice Number', 'Invoice Date', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Diagnosis', 'Correct the Tally/Accounts GSTIN to'];
  const ws3 = makeStyledSheet(
    diagData.gstinMismatches.length ? diagData.gstinMismatches
      : [{ 'Source': '', 'GSTIN (GSTR-2B)': '', 'GSTIN (Tally)': '', 'Supplier': 'No GSTIN mismatch rows found', 'Invoice Number': '', 'Invoice Date': '', 'Taxable Value': '', 'IGST': '', 'CGST': '', 'SGST': '', 'Diagnosis': '', 'Correct the Tally/Accounts GSTIN to': '' }],
    gstinCols);
  ws3['!cols'] = [{ wch: 12 }, { wch: 17 }, { wch: 17 }, { wch: 22 }, { wch: 17 }, { wch: 12 }, { wch: 13 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 22 }, { wch: 17 }];
  ws3['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
  XLSX.utils.book_append_sheet(wb, ws3, 'GSTIN Mismatches');

  // ── SHEET 4: Possible Matches
  const pmCols = ['Confidence', 'Likely Reason', 'GSTIN of Supplier', 'Supplier Name',
    'GSTR-2B Invoice No.', 'Our Data Invoice No.',
    'Invoice Date (GSTR-2B)', 'Invoice Date (Our Data)',
    'Taxable (GSTR 2B)', 'Taxable (Our Data)', 'Taxable Difference',
    'IGST (GSTR 2B)', 'IGST (Our Data)',
    'CGST (GSTR 2B)', 'CGST (Our Data)',
    'SGST (GSTR 2B)', 'SGST (Our Data)'];
  const pmRows = possibleMatchPairs.length
    ? possibleMatchPairs.sort((a: any, b: any) => b.sim.score - a.sim.score).map((p: any) => {
        const g = p.gRow, o = p.oRow;
        const taxG = numVal(g['Taxable Value (₹)']), taxO = numVal(o['Taxable Value (₹)']);
        const score = p.sim.score;
        return {
          'Confidence': score >= 85 ? 'High' : score >= 70 ? 'Medium' : 'Low',
          'Likely Reason': p.sim.reason,
          'GSTIN of Supplier': g['GSTIN of supplier'] || '',
          'Supplier Name': g['Trade/Legal name'] || o['Trade/Legal name'] || '',
          'GSTR-2B Invoice No.': g['Invoice number'] || '',
          'Our Data Invoice No.': o['Invoice number'] || '',
          'Invoice Date (GSTR-2B)': g['Invoice Date'] || '',
          'Invoice Date (Our Data)': o['Invoice Date'] || '',
          'Taxable (GSTR 2B)': taxG,
          'Taxable (Our Data)': taxO,
          'Taxable Difference': Math.round((taxG - taxO) * 100) / 100,
          'IGST (GSTR 2B)': numVal(g['Integrated Tax(₹)']),
          'IGST (Our Data)': numVal(o['Integrated Tax(₹)']),
          'CGST (GSTR 2B)': numVal(g['Central Tax(₹)']),
          'CGST (Our Data)': numVal(o['Central Tax(₹)']),
          'SGST (GSTR 2B)': numVal(g['State/UT Tax(₹)']),
          'SGST (Our Data)': numVal(o['State/UT Tax(₹)']),
        };
      })
    : [{ 'Confidence': '', 'Likely Reason': 'No possible matches found', 'GSTIN of Supplier': '', 'Supplier Name': '', 'GSTR-2B Invoice No.': '', 'Our Data Invoice No.': '', 'Invoice Date (GSTR-2B)': '', 'Invoice Date (Our Data)': '', 'Taxable (GSTR 2B)': '', 'Taxable (Our Data)': '', 'Taxable Difference': '', 'IGST (GSTR 2B)': '', 'IGST (Our Data)': '', 'CGST (GSTR 2B)': '', 'CGST (Our Data)': '', 'SGST (GSTR 2B)': '', 'SGST (Our Data)': '' }];
  const ws5 = makeStyledSheet(pmRows, pmCols);
  ws5['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
  // Yellow on Taxable Difference > 10
  const tdColIdx = pmCols.indexOf('Taxable Difference');
  pmRows.forEach((row: any, ri: number) => {
    const diff = numVal(row['Taxable Difference']);
    if (Math.abs(diff) > 10) {
      const addr = XLSX.utils.encode_cell({ r: ri + 1, c: tdColIdx });
      if (ws5[addr]) ws5[addr].s = { ...(ws5[addr].s || {}), fill: { fgColor: { rgb: 'FFFF00' }, type: 'pattern', patternType: 'solid' } };
    }
  });
  // Highlight Confidence and Likely Reason
  const PM_HIGHLIGHT: any = { fill: { fgColor: { rgb: 'FFFDE7' }, type: 'pattern', patternType: 'solid' }, font: { sz: 11, color: { rgb: '333333' } }, alignment: { vertical: 'top', wrapText: true }, border: { top: { style: 'thin', color: { rgb: 'E8E8C0' } }, bottom: { style: 'thin', color: { rgb: 'E8E8C0' } }, left: { style: 'thin', color: { rgb: 'D4D490' } }, right: { style: 'thin', color: { rgb: 'D4D490' } } } };
  const pmHighlightCols = [pmCols.indexOf('Confidence'), pmCols.indexOf('Likely Reason')];
  pmRows.forEach((row: any, ri: number) => {
    pmHighlightCols.forEach(ci => {
      if (ci < 0) return;
      const addr = XLSX.utils.encode_cell({ r: ri + 1, c: ci });
      const v = row[pmCols[ci]];
      ws5[addr] = { t: 's', v: String(v === null || v === undefined ? '' : v), s: PM_HIGHLIGHT };
    });
  });
  ws5['!cols'] = [{ wch: 10 }, { wch: 22 }, { wch: 17 }, { wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws5, 'Possible Matches');

  // ── SHEET 5: Fig Not Matched Diagnosis
  const figCols = ['Diagnosis', 'Supplier', 'GSTIN', 'Invoice Number', 'Invoice Date',
    'Taxable Value (GSTR-2B)', 'Taxable Value (Accounts)', 'Taxable Difference',
    'IGST Diff (+ = Add to books / - = Reduce in books)', 'CGST Diff (+ = Add to books / - = Reduce in books)', 'SGST Diff (+ = Add to books / - = Reduce in books)', 'Net ITC Difference (Rs.)'];
  const figData = (diagData.figNotMatched && diagData.figNotMatched.length) ? diagData.figNotMatched
    : [{ 'Diagnosis': 'No Fig Not Matched rows found', 'Supplier': '', 'GSTIN': '', 'Invoice Number': '', 'Invoice Date': '', 'Taxable Value (GSTR-2B)': 0, 'Taxable Value (Accounts)': 0, 'Taxable Difference': 0, 'IGST Diff (+ = Add to books / - = Reduce in books)': 0, 'CGST Diff (+ = Add to books / - = Reduce in books)': 0, 'SGST Diff (+ = Add to books / - = Reduce in books)': 0, 'Net ITC Difference (Rs.)': 0 }];
  const ws6 = makeStyledSheet(figData, figCols);
  ws6['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
  ws6['!cols'] = [{ wch: 22 }, { wch: 22 }, { wch: 17 }, { wch: 17 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 13 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 13 }];
  XLSX.utils.book_append_sheet(wb, ws6, 'Fig Not Matched');

  // ── SHEET 6: Summary
  const catTotals: Record<string, any> = {
    'Not In Our Data': { count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, action: 'Check if bill received — add to accounts if yes' },
    'Not In GSTR 2B': { count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, action: 'Follow up with supplier to file GSTR-1' },
    'GSTIN Mismatch (GSTR-2B)': { count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, action: 'Correct GSTIN in accounts to match GSTR-2B' },
    'GSTIN Mismatch (Tally)': { count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, action: 'Correct GSTIN in accounts to match GSTR-2B' },
    'Possible Match': { count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, action: 'Verify invoice no. with supplier and correct' },
    'Fig Not Matched': { count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, action: 'See Fig Not Matched Diagnosis sheet' },
  };
  diagData.notInOurData.forEach((r: any) => { const c = catTotals['Not In Our Data']; c.count++; c.taxable += numVal(r['Taxable Value']); c.igst += numVal(r['IGST']); c.cgst += numVal(r['CGST']); c.sgst += numVal(r['SGST']); });
  diagData.notInGSTR2B.forEach((r: any) => { const c = catTotals['Not In GSTR 2B']; c.count++; c.taxable += numVal(r['Taxable Value']); c.igst += numVal(r['IGST']); c.cgst += numVal(r['CGST']); c.sgst += numVal(r['SGST']); });
  diagData.gstinMismatches.forEach((r: any) => { const key = r['Source'] === 'GSTR-2B side' ? 'GSTIN Mismatch (GSTR-2B)' : 'GSTIN Mismatch (Tally)'; const c = catTotals[key]; c.count++; c.taxable += numVal(r['Taxable Value']); c.igst += numVal(r['IGST']); c.cgst += numVal(r['CGST']); c.sgst += numVal(r['SGST']); });
  possibleMatchPairs.forEach((p: any) => { const c = catTotals['Possible Match']; c.count++; c.taxable += numVal(p.gRow['Taxable Value (₹)']); c.igst += numVal(p.gRow['Integrated Tax(₹)']); c.cgst += numVal(p.gRow['Central Tax(₹)']); c.sgst += numVal(p.gRow['State/UT Tax(₹)']); });
  if (diagData.figNotMatched) diagData.figNotMatched.forEach((r: any) => { const c = catTotals['Fig Not Matched']; c.count++; c.taxable += Math.abs(numVal(r['Taxable Difference'])); c.igst += Math.abs(numVal(r['IGST Diff (+ = Add to books / - = Reduce in books)'])); c.cgst += Math.abs(numVal(r['CGST Diff (+ = Add to books / - = Reduce in books)'])); c.sgst += Math.abs(numVal(r['SGST Diff (+ = Add to books / - = Reduce in books)'])); });

  const summaryRows = Object.entries(catTotals).filter(([, v]) => v.count > 0).map(([cat, v]) => ({
    'Category': cat, 'Count': v.count, 'Taxable Value (Rs.)': Math.round(v.taxable * 100) / 100,
    'IGST (Rs.)': Math.round(v.igst * 100) / 100, 'CGST (Rs.)': Math.round(v.cgst * 100) / 100,
    'SGST (Rs.)': Math.round(v.sgst * 100) / 100, 'ITC at Risk (Rs.)': Math.round((v.igst + v.cgst + v.sgst) * 100) / 100,
    'Recommended Action': v.action,
  }));

  const SUM_COLS = ['Category', 'Count', 'Taxable Value (Rs.)', 'IGST (Rs.)', 'CGST (Rs.)', 'SGST (Rs.)', 'ITC at Risk (Rs.)', 'Recommended Action'];
  const CAT_COLOURS: Record<string, any> = {
    'Not In Our Data': { bg: 'FFF3E0', fg: 'BF360C', border: 'FFCCBC' },
    'Not In GSTR 2B': { bg: 'E3F2FD', fg: '0D47A1', border: 'BBDEFB' },
    'GSTIN Mismatch (GSTR-2B)': { bg: 'F3E5F5', fg: '4A148C', border: 'E1BEE7' },
    'GSTIN Mismatch (Tally)': { bg: 'FCE4EC', fg: '880E4F', border: 'F8BBD0' },
    'Possible Match': { bg: 'E0F2F1', fg: '004D40', border: 'B2DFDB' },
    'Fig Not Matched': { bg: 'FFF8E1', fg: 'E65100', border: 'FFECB3' },
  };
  const DEFAULT_CAT_COLOUR = { bg: 'F5F5F5', fg: '212121', border: 'E0E0E0' };
  const SUM_HDR: any = { fill: { fgColor: { rgb: '1E3A5F' } }, font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: { top: { style: 'thin', color: { rgb: 'FFFFFF' } }, bottom: { style: 'thin', color: { rgb: 'FFFFFF' } }, left: { style: 'thin', color: { rgb: 'FFFFFF' } }, right: { style: 'thin', color: { rgb: 'FFFFFF' } } } };
  const sumAoa: any[][] = [SUM_COLS];
  const sumMeta: string[] = [];
  if (summaryRows.length) {
    summaryRows.forEach(r => { sumAoa.push([r['Category'], r['Count'], r['Taxable Value (Rs.)'], r['IGST (Rs.)'], r['CGST (Rs.)'], r['SGST (Rs.)'], r['ITC at Risk (Rs.)'], r['Recommended Action']]); sumMeta.push(r['Category']); });
  } else {
    sumAoa.push(['No issues found — all invoices reconciled', 0, 0, 0, 0, 0, 0, '']); sumMeta.push('');
  }
  const ws8 = XLSX.utils.aoa_to_sheet(sumAoa);
  SUM_COLS.forEach((_, ci) => { const addr = XLSX.utils.encode_cell({ r: 0, c: ci }); if (ws8[addr]) ws8[addr].s = SUM_HDR; else ws8[addr] = { t: 's', v: SUM_COLS[ci], s: SUM_HDR }; });
  const sumNumCols = [1, 2, 3, 4, 5, 6];
  sumMeta.forEach((cat, ri) => {
    const cl = CAT_COLOURS[cat] || DEFAULT_CAT_COLOUR;
    const ROW_S: any = { fill: { fgColor: { rgb: cl.bg }, type: 'pattern', patternType: 'solid' }, font: { sz: 11, color: { rgb: cl.fg }, bold: false }, alignment: { vertical: 'top', wrapText: true }, border: { top: { style: 'thin', color: { rgb: cl.border } }, bottom: { style: 'thin', color: { rgb: cl.border } }, left: { style: 'thin', color: { rgb: cl.border } }, right: { style: 'thin', color: { rgb: cl.border } } } };
    const ROW_S_NUM = { ...ROW_S, alignment: { vertical: 'top', horizontal: 'right', wrapText: false } };
    const ROW_S_CAT = { ...ROW_S, font: { sz: 11, color: { rgb: cl.fg }, bold: true } };
    SUM_COLS.forEach((_, ci) => {
      const addr = XLSX.utils.encode_cell({ r: ri + 1, c: ci });
      const isNum = sumNumCols.indexOf(ci) >= 0;
      const s = ci === 0 ? ROW_S_CAT : (isNum ? ROW_S_NUM : ROW_S);
      const existing = ws8[addr];
      if (existing) { existing.s = s; if (isNum && typeof existing.v === 'number') existing.t = 'n'; }
      else { ws8[addr] = { t: 's', v: '', s }; }
    });
  });
  const sumRH: any[] = [{ hpt: 28 }];
  sumMeta.forEach(() => { sumRH.push({ hpt: 24 }); });
  ws8['!rows'] = sumRH;
  ws8['!cols'] = [{ wch: 26 }, { wch: 8 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 42 }];
  ws8['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
  ws8['!autofilter'] = { ref: 'A1:H1' };
  XLSX.utils.book_append_sheet(wb, ws8, 'Summary');

  XLSX.writeFile(wb, 'GST_Mismatch_Diagnosis_' + stamp() + '.xlsx');
}

// ═══════════════════════════════════════════════════════════
// FILE 4: PR vs TALLY AUDIT — exact port with coloured raw sheets + hyperlinks
// ═══════════════════════════════════════════════════════════

export function downloadPRTallyAudit(auditResult: any, prFileName?: string, tallyFileName?: string) {
  const wb = XLSX.utils.book_new();
  const { prRows, tallyRows } = auditResult;

  const prStatus: Record<string, string> = {};
  prRows.forEach((r: any) => { prStatus[r.ck] = r.status; });
  const tallyStatus: Record<string, string> = {};
  tallyRows.forEach((r: any) => { tallyStatus[r.ck] = r.status; });

  const F_RED = { fgColor: { rgb: 'FFCDD2' } };
  const F_YELLOW = { fgColor: { rgb: 'FFF9C4' } };
  const F_GREEN = { fgColor: { rgb: 'C8E6C9' } };
  const F_BLUE = { fgColor: { rgb: 'BBDEFB' } };
  const F_NONE = { fgColor: { rgb: 'FFFFFF' } };
  const F_HDR = { fgColor: { rgb: '1E3A5F' } };

  function fillForPR(ck: string) {
    const s = prStatus[ck];
    if (s === 'MISSING_IN_TALLY') return F_RED;
    if (s === 'MISMATCH') return F_YELLOW;
    if (s === 'MATCHED') return F_GREEN;
    return F_NONE;
  }
  function fillForTally(ck: string) {
    const s = tallyStatus[ck];
    if (s === 'NOT_IN_PR') return F_BLUE;
    if (s === 'MISMATCH') return F_YELLOW;
    if (s === 'MATCHED') return F_GREEN;
    return F_NONE;
  }

  function styleCell(raw: any, fill: any, isDateCol: boolean) {
    if (isDateCol && raw !== null && raw !== undefined && raw !== '') {
      const converted = excelSerialToDate(raw);
      return { t: 's', v: converted, s: { fill, font: { sz: 10 }, alignment: { vertical: 'center' } } };
    }
    const t = (raw === null || raw === undefined) ? 's' : (typeof raw === 'number') ? 'n' : 's';
    const v = (raw === null || raw === undefined) ? '' : raw;
    const cell: any = { t, v, s: { fill, font: { sz: 10 }, alignment: { vertical: 'center' } } };
    if (t === 'n') cell.s.alignment.horizontal = 'right';
    return cell;
  }
  function hdrCell(v: any) {
    return { t: 's', v: String(v || ''), s: { fill: F_HDR, font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } } };
  }

  function buildRawSheet(rawHdr: any[], rawRows: any[], getFill: (ck: string) => any, getRemarks: (ck: string) => string, rowIndexMap: Record<string, number> | null, targetSheet: string | null) {
    const ws: any = {};
    let numCols = rawHdr ? rawHdr.length : 0;
    if (rawHdr) rawHdr.forEach((h: any, ci: number) => { ws[XLSX.utils.encode_cell({ r: 0, c: ci })] = hdrCell(h); });

    const dateColFlags: boolean[] = [];
    if (rawHdr) rawHdr.forEach((h: any) => { const hl = String(h || '').toLowerCase(); dateColFlags.push(hl.includes('date')); });

    let remarksColIdx = numCols;
    rawRows.forEach((rowObj: any, ri: number) => {
      const fill = rowObj.billKey ? getFill(rowObj.billKey) : F_NONE;
      const cells = rowObj.cells;
      if (cells.length > remarksColIdx) remarksColIdx = cells.length;
      numCols = Math.max(numCols, cells.length);
      cells.forEach((val: any, ci: number) => {
        const isDate = dateColFlags[ci] || false;
        ws[XLSX.utils.encode_cell({ r: ri + 1, c: ci })] = styleCell(val, fill, isDate);
      });
      const remark = rowObj.billKey ? getRemarks(rowObj.billKey) : '';
      const targetRow = (rowIndexMap && rowObj.billKey) ? rowIndexMap[rowObj.billKey] : null;
      const remarksCell: any = {
        t: 's', v: remark,
        s: { fill, font: { sz: 10, italic: true, color: (targetRow && targetSheet) ? { rgb: '1565C0' } : undefined, underline: !!(targetRow && targetSheet) }, alignment: { vertical: 'center', wrapText: false } },
      };
      if (targetRow && targetSheet) {
        remarksCell.l = { Target: "#'" + targetSheet + "'!A" + targetRow, Tooltip: 'Go to matching row in ' + targetSheet };
      }
      ws[XLSX.utils.encode_cell({ r: ri + 1, c: cells.length })] = remarksCell;
    });

    remarksColIdx = numCols;
    ws[XLSX.utils.encode_cell({ r: 0, c: remarksColIdx })] = hdrCell('Remarks');

    const totalCols = remarksColIdx + 1;
    const lastCol = XLSX.utils.encode_col(totalCols - 1);
    ws['!ref'] = 'A1:' + lastCol + (rawRows.length + 1);

    const wch: any[] = [];
    for (let i = 0; i < totalCols; i++) {
      if (i === remarksColIdx) { wch.push({ wch: 42 }); continue; }
      const h = rawHdr && rawHdr[i] ? String(rawHdr[i]).toLowerCase() : '';
      if (h.includes('party') || h.includes('name') || h.includes('address')) wch.push({ wch: 30 });
      else if (h.includes('bill') || h.includes('invoice') || h.includes('vou')) wch.push({ wch: 18 });
      else if (h.includes('date')) wch.push({ wch: 14 });
      else if (h.includes('gstin') || h.includes('gst no')) wch.push({ wch: 22 });
      else wch.push({ wch: 13 });
    }
    ws['!cols'] = wch;
    ws['!rows'] = [{ hpt: 26 }];
    ws['!autofilter'] = { ref: 'A1:' + lastCol + '1' };
    return ws;
  }

  const prSheetName = (prFileName || 'Client Purchase Sheet').replace(/\.xlsx?$/i, '').slice(0, 31);
  const tallySheetName = (tallyFileName || 'Tally Accounted Data').replace(/\.xlsx?$/i, '').slice(0, 31);

  function prRemarks(ck: string) {
    const s = prStatus[ck];
    if (s === 'MATCHED') return 'Matched — found & figures agree in ' + tallySheetName;
    if (s === 'MISMATCH') return 'Figure mismatch — entry found in ' + tallySheetName + ' but amounts differ';
    if (s === 'MISSING_IN_TALLY') return 'NOT in Tally — invoice missing from ' + tallySheetName;
    return '';
  }
  function tallyRemarks(ck: string) {
    const s = tallyStatus[ck];
    if (s === 'MATCHED') return 'Matched — found & figures agree in ' + prSheetName;
    if (s === 'MISMATCH') return 'Figure mismatch — entry found in ' + prSheetName + ' but amounts differ';
    if (s === 'NOT_IN_PR') return 'NOT in client purchase register — invoice missing from ' + prSheetName;
    return '';
  }

  // Build cross-sheet link maps
  const prToTallyIndex: Record<string, number> = {};
  Object.keys(auditResult.prRowIndex || {}).forEach((ck: string) => {
    const s = prStatus[ck];
    if (s === 'MISMATCH' || s === 'MATCHED') prToTallyIndex[ck] = auditResult.tallyRowIndex[ck];
  });
  const tallyToPrIndex: Record<string, number> = {};
  Object.keys(auditResult.tallyRowIndex || {}).forEach((ck: string) => {
    const s = tallyStatus[ck];
    if (s === 'MISMATCH' || s === 'MATCHED') tallyToPrIndex[ck] = auditResult.prRowIndex[ck];
  });

  // Sheet 1: Client Purchase Sheet (coloured)
  const ws1 = buildRawSheet(auditResult.prRaw.rawHdr, auditResult.prRaw.rawRows, fillForPR, prRemarks, prToTallyIndex, tallySheetName);
  XLSX.utils.book_append_sheet(wb, ws1, prSheetName);

  // Sheet 2: Tally Accounted Data (coloured)
  const ws2 = buildRawSheet(auditResult.tallyRaw.rawHdr, auditResult.tallyRaw.rawRows, fillForTally, tallyRemarks, tallyToPrIndex, prSheetName);
  XLSX.utils.book_append_sheet(wb, ws2, tallySheetName);

  // Sheet 3: Mismatch Detail
  const mismatches = auditResult.prRows.filter((r: any) => r.status === 'MISMATCH');
  const cols3 = ['Bill No', 'Party', 'Tax Category', 'As per ' + prSheetName, 'As per ' + tallySheetName, 'Difference'];
  const ws3: any = {};
  cols3.forEach((c, ci) => { ws3[XLSX.utils.encode_cell({ r: 0, c: ci })] = hdrCell(c); });
  let r3 = 1;
  mismatches.forEach((row: any) => {
    const pr = row.pr;
    const t = row.t;
    AUDIT_FIELDS.forEach((f: any) => {
      const d = row.diffs[f.label];
      if (!d || Math.abs(d.diff) <= 5) return;
      const dn = Math.round(d.diff * 100) / 100;
      ws3[XLSX.utils.encode_cell({ r: r3, c: 0 })] = { t: 's', v: pr.rawBill, s: { fill: F_YELLOW, font: { sz: 11 }, alignment: { vertical: 'center' } } };
      ws3[XLSX.utils.encode_cell({ r: r3, c: 1 })] = { t: 's', v: pr.party, s: { fill: F_YELLOW, font: { sz: 11 }, alignment: { vertical: 'center' } } };
      ws3[XLSX.utils.encode_cell({ r: r3, c: 2 })] = { t: 's', v: f.label, s: { fill: F_YELLOW, font: { sz: 11 }, alignment: { vertical: 'center' } } };
      ws3[XLSX.utils.encode_cell({ r: r3, c: 3 })] = { t: 'n', v: Math.round((pr[f.prKey] || 0) * 100) / 100, s: { fill: F_YELLOW, font: { sz: 11 }, alignment: { horizontal: 'right', vertical: 'center' }, z: '#,##0.00' } };
      ws3[XLSX.utils.encode_cell({ r: r3, c: 4 })] = { t: 'n', v: Math.round((t ? (t[f.tallyKey] || 0) : 0) * 100) / 100, s: { fill: F_YELLOW, font: { sz: 11 }, alignment: { horizontal: 'right', vertical: 'center' }, z: '#,##0.00' } };
      ws3[XLSX.utils.encode_cell({ r: r3, c: 5 })] = { t: 'n', v: dn, s: { fill: F_YELLOW, font: { sz: 11, bold: true, color: { rgb: 'B71C1C' } }, alignment: { horizontal: 'right', vertical: 'center' }, z: '#,##0.00' } };
      r3++;
    });
    if (r3 > 1) {
      for (let cc = 0; cc < 6; cc++) ws3[XLSX.utils.encode_cell({ r: r3, c: cc })] = { t: 's', v: '', s: { fill: { fgColor: { rgb: 'F5F5F5' } } } };
      r3++;
    }
  });
  if (r3 === 1) {
    ws3[XLSX.utils.encode_cell({ r: 1, c: 0 })] = { t: 's', v: 'No figure mismatches found. All matched bills have correct amounts.', s: { font: { sz: 11, color: { rgb: '166534' } }, fill: F_GREEN } };
    for (let cc2 = 1; cc2 < 6; cc2++) ws3[XLSX.utils.encode_cell({ r: 1, c: cc2 })] = { t: 's', v: '', s: { fill: F_GREEN } };
    r3 = 2;
  }
  ws3['!ref'] = 'A1:F' + r3;
  ws3['!cols'] = [{ wch: 20 }, { wch: 32 }, { wch: 18 }, { wch: 22 }, { wch: 22 }, { wch: 14 }];
  ws3['!rows'] = [{ hpt: 26 }];
  XLSX.utils.book_append_sheet(wb, ws3, 'Mismatch Detail');

  XLSX.writeFile(wb, 'PR_vs_Tally_Audit_' + stamp() + '.xlsx');
}
