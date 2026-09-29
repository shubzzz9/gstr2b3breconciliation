/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  cleanString, normalise, numVal, safeVal, safeNum,
  excelSerialToDate, invSimilarity, GSTR_STD_COLS, AUDIT_FIELDS, nameSimilarity
} from './gst-helpers';

// ═══════════════════════════════════════════════════════════
// FIND POSSIBLE MATCHES
// ═══════════════════════════════════════════════════════════

function findPossibleMatches(outputRows: any[]) {
  // Pass 2: same GSTIN + same amounts (within Rs. 5), bill number written differently
  const TOL = 5;
  const near = (a: any, b: any, t = TOL) => Math.abs(numVal(a) - numVal(b)) <= t;
  const amtsMatch = (g: any, o: any, t = TOL) =>
    near(g['Taxable Value (₹)'], o['Taxable Value (₹)'], t) && near(g['Integrated Tax(₹)'], o['Integrated Tax(₹)'], t) &&
    near(g['Central Tax(₹)'], o['Central Tax(₹)'], t) && near(g['State/UT Tax(₹)'], o['State/UT Tax(₹)'], t);
  const gstrUnmatched = outputRows.filter(r => r['DATA'] === 'GSTR 2B' && r['Remarks'] === 'Not in our data');
  const ourUnmatched = outputRows.filter(r => r['DATA'] === 'Our Data' && r['Remarks'] === 'Not in GSTR 2B');
  const usedOur = new Set<number>();
  const pairs: any[] = [];

  gstrUnmatched.forEach(gRow => {
    const gstin = cleanString(gRow['GSTIN of supplier'] || '');
    if (!gstin) return;
    let bestScore = 0, bestMatch: any = null;
    ourUnmatched.forEach((oRow, oi) => {
      if (usedOur.has(oi)) return;
      if (cleanString(oRow['GSTIN of supplier'] || '') !== gstin) return;
      if (!amtsMatch(gRow, oRow)) return;
      let sim = invSimilarity(gRow['Invoice number'], oRow['Invoice number']);
      if (sim.score < 60 && amtsMatch(gRow, oRow, 1)) sim = { score: 50, reason: 'Same GSTIN and same amount — bill no. written differently' };
      if (sim.score >= 50 && sim.score > bestScore) {
        bestScore = sim.score;
        bestMatch = { oi, oRow, sim };
      }
    });
    if (bestMatch) {
      usedOur.add(bestMatch.oi);
      pairs.push({ gRow, oRow: bestMatch.oRow, sim: bestMatch.sim });
    }
  });
  return pairs;
}

/** Pass 3: same bill number + same amounts, but GSTIN differs or is blank on one side. */
function findGSTINPairs(outputRows: any[]) {
  const near = (a: any, b: any) => Math.abs(numVal(a) - numVal(b)) <= 5;
  const gstrUn = outputRows.filter(r => r['DATA'] === 'GSTR 2B' && String(r['Remarks']).startsWith('Not in our data') || (r['DATA'] === 'GSTR 2B' && r['Remarks'] === 'GSTIN not mentioned in GSTR 2B'));
  const ourUn = outputRows.filter(r => r['DATA'] === 'Our Data' && (r['Remarks'] === 'Not in GSTR 2B' || r['Remarks'] === 'GSTIN not mentioned in Our data'));
  const used = new Set<any>();
  const pairs: any[] = [];
  gstrUn.forEach(g => {
    const inv = cleanString(g['Invoice number'] || '');
    if (!inv) return;
    const o = ourUn.find(x => !used.has(x) && cleanString(x['Invoice number'] || '') === inv
      && cleanString(x['GSTIN of supplier'] || '') !== cleanString(g['GSTIN of supplier'] || '')
      && near(g['Taxable Value (₹)'], x['Taxable Value (₹)'])
      && near(numVal(g['Integrated Tax(₹)']) + numVal(g['Central Tax(₹)']) + numVal(g['State/UT Tax(₹)']),
              numVal(x['Integrated Tax(₹)']) + numVal(x['Central Tax(₹)']) + numVal(x['State/UT Tax(₹)'])));
    if (o) { used.add(o); pairs.push({ gRow: g, oRow: o }); }
  });
  return pairs;
}

/** GSTIN difference wording — "typo" only when 1–2 chars differ AND supplier names are similar. */
export function gstinDiffReason(g1: string, g2: string, name1: any, name2: any): string {
  const a = cleanString(g1), b = cleanString(g2);
  if (!a || !b) return 'GSTIN blank on one side — enter the supplier GSTIN in accounts';
  const diff = a.split('').filter((c, i) => c !== (b[i] || '')).length + Math.abs(a.length - b.length);
  const sim = nameSimilarity(name1, name2);
  if (diff <= 2 && (sim >= 0.5 || !String(name1 || '').trim() || !String(name2 || '').trim()))
    return `Likely GSTIN typo in accounts — ${diff} character(s) differ, supplier names similar`;
  if (a.slice(2, 12) === b.slice(2, 12)) return 'Same PAN, different GSTIN — supplier filed under another state/branch registration';
  return `Different supplier GSTIN (${diff} chars differ) — verify which supplier this bill belongs to`;
}

// ═══════════════════════════════════════════════════════════
// RECONCILE
// ═══════════════════════════════════════════════════════════

const TAX_TOL = 5;

function buildGSTRRow(g: any, remark: string, extraCols: any[]) {
  const row: Record<string, any> = {};
  ['GSTIN of supplier', 'Trade/Legal name', 'Invoice number', 'Invoice type',
   'Place of supply', 'Supply Attract Reverse Charge'].forEach(c => { row[c] = safeVal(g[c]); });
  row['Invoice Date'] = excelSerialToDate(g['Invoice Date']) || safeVal(g['Invoice Date']);
  ['Invoice Value(₹)', 'Taxable Value (₹)', 'Integrated Tax(₹)', 'Central Tax(₹)', 'State/UT Tax(₹)', 'Cess(₹)']
    .forEach(c => { row[c] = safeNum(g[c]); });
  extraCols.filter(ec => ec.include).forEach(ec => { row[ec.gstrCol] = safeVal(g[ec.gstrCol]); });
  row['DATA'] = 'GSTR 2B'; row['Remarks'] = remark;
  return row;
}

function buildOurRow(r: any, remark: string, extraCols: any[]) {
  const row: Record<string, any> = {};
  GSTR_STD_COLS.forEach(c => { row[c] = ''; });
  row['GSTIN of supplier'] = safeVal(r.gstin);
  row['Trade/Legal name'] = safeVal(r.tradeName);
  row['Invoice number'] = safeVal(r.invoiceNum);
  row['Invoice Date'] = safeVal(r.invoiceDate);
  row['Taxable Value (₹)'] = safeNum(r.taxable);
  row['Integrated Tax(₹)'] = safeNum(r.igst);
  row['Central Tax(₹)'] = safeNum(r.cgst);
  row['State/UT Tax(₹)'] = safeNum(r.sgst);
  row['Cess(₹)'] = safeNum(r.cess);
  extraCols.filter(ec => ec.include).forEach(ec => { row[ec.gstrCol] = ''; });
  row['DATA'] = 'Our Data'; row['Remarks'] = remark;
  return row;
}

export function reconcile(gstrRows: any[], ourRows: any[], extraCols: any[] = []) {
  const ourDict: Record<string, { gi: number; row: any }[]> = {};
  ourRows.forEach((row: any, gi: number) => {
    const g = cleanString(normalise(String(row.gstin || '')));
    const inv = row.invoiceNum === '(blank)' ? '' : (row.invoiceNum || '');
    const key = g + '|' + cleanString(inv);
    if (!ourDict[key]) ourDict[key] = [];
    ourDict[key].push({ gi, row });
  });

  const output: any[] = [];
  const used = new Set<number>();

  gstrRows.forEach((gRow: any) => {
    const gstin = String(gRow['GSTIN of supplier'] || '');
    const invoice = String(gRow['Invoice number'] || '');
    const key = cleanString(gstin) + '|' + cleanString(invoice);
    const cands = (ourDict[key] || []).filter(e => !used.has(e.gi));

    let remark: string;
    if (cands.length > 0) {
      const gT = numVal(gRow['Taxable Value (₹)']), gI = numVal(gRow['Integrated Tax(₹)']);
      const gC = numVal(gRow['Central Tax(₹)']), gS = numVal(gRow['State/UT Tax(₹)']);
      const gCe = numVal(gRow['Cess(₹)']);
      const sT = cands.reduce((s, e) => s + e.row.taxable, 0);
      const sI = cands.reduce((s, e) => s + e.row.igst, 0);
      const sC = cands.reduce((s, e) => s + e.row.cgst, 0);
      const sS = cands.reduce((s, e) => s + e.row.sgst, 0);
      const sCe = cands.reduce((s, e) => s + e.row.cess, 0);
      const fig = Math.abs(gT - sT) <= TAX_TOL && Math.abs(gI - sI) <= TAX_TOL &&
                  Math.abs(gC - sC) <= TAX_TOL && Math.abs(gS - sS) <= TAX_TOL && Math.abs(gCe - sCe) <= TAX_TOL;
      remark = fig ? (cands.length === 1 ? 'Matched' : `Matched - Multi-line (${cands.length} entries)`) : 'Fig Not Matched';
      output.push(buildGSTRRow(gRow, remark, extraCols));
      cands.forEach(e => { used.add(e.gi); output.push(buildOurRow(e.row, fig ? remark : 'Fig Not Matched', extraCols)); });
    } else {
      remark = !invoice ? 'Invoice number not mentioned in GSTR 2B'
              : !gstin ? 'GSTIN not mentioned in GSTR 2B'
              : 'Not in our data';
      output.push(buildGSTRRow(gRow, remark, extraCols));
    }
  });

  Object.values(ourDict).forEach(entries => {
    entries.forEach(e => {
      if (!used.has(e.gi)) {
        const inv = e.row.invoiceNum === '(blank)' ? '' : (e.row.invoiceNum || '');
        const gst = normalise(String(e.row.gstin || ''));
        const rem = !inv ? 'Invoice number not mentioned in Our data'
                   : !gst ? 'GSTIN not mentioned in Our data'
                   : 'Not in GSTR 2B';
        output.push(buildOurRow(e.row, rem, extraCols));
      }
    });
  });

  // Pass 2 — same GSTIN + amount, bill number differs
  const possibleMatchPairs = findPossibleMatches(output);
  possibleMatchPairs.forEach((p: any) => {
    p.gRow['Remarks'] = BILL_NO_DIFFERS;
    p.oRow['Remarks'] = BILL_NO_DIFFERS;
  });
  // Pass 3 — same bill number + amount, GSTIN differs / blank
  const gstinPairs = findGSTINPairs(output);
  gstinPairs.forEach((p: any) => {
    p.gRow['Remarks'] = GSTIN_DIFFERS;
    p.oRow['Remarks'] = GSTIN_DIFFERS;
  });
  const allPairs = [...possibleMatchPairs, ...gstinPairs];
  if (allPairs.length > 0) {
    const paired = new Set<any>();
    allPairs.forEach((p: any) => { paired.add(p.gRow); paired.add(p.oRow); });
    const nonPaired = output.filter(r => !paired.has(r));
    output.length = 0;
    nonPaired.forEach(r => output.push(r));
    allPairs.forEach((p: any) => { output.push(p.gRow); output.push(p.oRow); });
  }

  (output as any)._possibleMatchPairs = possibleMatchPairs;
  (output as any)._gstinPairs = gstinPairs;

  return output;
}

export const BILL_NO_DIFFERS = 'Matched – Bill No differs';
export const GSTIN_DIFFERS = 'Matched – GSTIN differs';

// ═══════════════════════════════════════════════════════════
// MISMATCH DIAGNOSIS — exact port from original buildDiagnosis
// ═══════════════════════════════════════════════════════════

export function diagnoseMismatches(gstrRows: any[], ourRows: any[], recoOutput: any[]) {
  // Build lookup maps
  const tallyByInv: Record<string, any[]> = {};
  ourRows.forEach((r: any) => {
    const inv = cleanString(r.invoiceNum === '(blank)' ? '' : (r.invoiceNum || ''));
    if (!tallyByInv[inv]) tallyByInv[inv] = [];
    tallyByInv[inv].push(r);
  });
  const gstrByInv: Record<string, any[]> = {};
  gstrRows.forEach((r: any) => {
    const inv = cleanString(String(r['Invoice number'] || ''));
    if (!gstrByInv[inv]) gstrByInv[inv] = [];
    gstrByInv[inv].push(r);
  });

  const notInOurData: any[] = [], notInGSTR2B: any[] = [], gstinMismatches: any[] = [], figNotMatched: any[] = [];

  recoOutput.forEach((row: any) => {
    const remark = row['Remarks'];
    const inv = cleanString(String(row['Invoice number'] || ''));
    const gstin = cleanString(String(row['GSTIN of supplier'] || ''));

    if (row['DATA'] === 'GSTR 2B' && remark === 'Not in our data') {
      const tallyMatches = tallyByInv[inv] || [];
      let reason = 'Invoice not found in Tally/Accounts. Please add this invoice in Tally/Accounts and run the reconciliation again.';
      let tallyGSTIN = '', suggestion = '', isGSTINIssue = false;
      if (tallyMatches.length > 0) {
        const tGSTIN = cleanString(normalise(String(tallyMatches[0].gstin || '')));
        tallyGSTIN = normalise(String(tallyMatches[0].gstin || ''));
        if (tGSTIN && tGSTIN !== gstin) {
          isGSTINIssue = true;
          const diffChars = gstin.split('').filter((c: string, i: number) => c !== (tGSTIN[i] || '')).length
                           + Math.abs(gstin.length - tGSTIN.length);
          if (gstin.length !== tGSTIN.length)
            reason = `GSTIN length mismatch — GSTR-2B has ${gstin.length} chars, Tally has ${tGSTIN.length} chars (missing/extra digit)`;
          else if (diffChars === 1)
            reason = '1-character GSTIN typo — likely zero vs letter O, or single digit error';
          else
            reason = `GSTIN mismatch — ${diffChars} characters differ (wrong GSTIN entered in Tally)`;
          suggestion = `Correct Tally GSTIN to: ${row['GSTIN of supplier']}`;
        }
      }
      if (isGSTINIssue) row['Remarks'] = 'Not in our data — GSTIN Mismatch';
      const diagRow: any = {
        'GSTIN (GSTR-2B)': row['GSTIN of supplier'],
        'Supplier': row['Trade/Legal name'],
        'Invoice Number': row['Invoice number'],
        'Invoice Date': row['Invoice Date'],
        'Taxable Value': row['Taxable Value (₹)'],
        'IGST': row['Integrated Tax(₹)'],
        'CGST': row['Central Tax(₹)'],
        'SGST': row['State/UT Tax(₹)'],
        'Diagnosis': reason,
        'Action': suggestion,
      };
      if (isGSTINIssue) {
        gstinMismatches.push({
          'Source': 'GSTR-2B side',
          'GSTIN (GSTR-2B)': row['GSTIN of supplier'] || '',
          'GSTIN (Tally)': tallyGSTIN,
          'Supplier': row['Trade/Legal name'] || '',
          'Invoice Number': row['Invoice number'] || '',
          'Invoice Date': row['Invoice Date'] || '',
          'Taxable Value': row['Taxable Value (₹)'],
          'IGST': row['Integrated Tax(₹)'],
          'CGST': row['Central Tax(₹)'],
          'SGST': row['State/UT Tax(₹)'],
          'Diagnosis': reason,
          'Correct the Tally/Accounts GSTIN to': row['GSTIN of supplier'] || '',
        });
      } else {
        notInOurData.push(diagRow);
      }
    }

    if (row['DATA'] === 'Our Data' && remark === 'Not in GSTR 2B') {
      const gstrMatches = gstrByInv[inv] || [];
      let reason = 'Invoice may not be filed by supplier in GSTR-1 yet';
      let gstrGSTIN = '', suggestion = '', isGSTINIssue = false;
      if (gstrMatches.length > 0) {
        const gG = cleanString(String(gstrMatches[0]['GSTIN of supplier'] || ''));
        gstrGSTIN = String(gstrMatches[0]['GSTIN of supplier'] || '');
        if (gG && gG !== gstin) {
          isGSTINIssue = true;
          const diffChars = gstin.split('').filter((c: string, i: number) => c !== (gG[i] || '')).length
                           + Math.abs(gstin.length - gG.length);
          if (gstin.length !== gG.length)
            reason = `GSTIN length mismatch — Tally has ${gstin.length} chars, GSTR-2B has ${gG.length} chars`;
          else if (diffChars === 1)
            reason = '1-character GSTIN typo in Tally — check for zero vs letter O';
          else
            reason = `GSTIN mismatch — ${diffChars} chars differ (wrong GSTIN in Tally)`;
          suggestion = `Correct Tally GSTIN to: ${gstrGSTIN}`;
        }
      }
      if (isGSTINIssue) row['Remarks'] = 'Not in GSTR 2B — GSTIN Mismatch';
      const diagRow: any = {
        'GSTIN (Tally)': row['GSTIN of supplier'],
        'Supplier': row['Trade/Legal name'],
        'Invoice Number': row['Invoice number'],
        'Invoice Date': row['Invoice Date'],
        'Taxable Value': row['Taxable Value (₹)'],
        'IGST': row['Integrated Tax(₹)'],
        'CGST': row['Central Tax(₹)'],
        'SGST': row['State/UT Tax(₹)'],
        'Diagnosis': reason,
        'Action': suggestion,
      };
      if (isGSTINIssue) {
        gstinMismatches.push({
          'Source': 'Tally side',
          'GSTIN (GSTR-2B)': gstrGSTIN,
          'GSTIN (Tally)': row['GSTIN of supplier'] || '',
          'Supplier': row['Trade/Legal name'] || '',
          'Invoice Number': row['Invoice number'] || '',
          'Invoice Date': row['Invoice Date'] || '',
          'Taxable Value': row['Taxable Value (₹)'],
          'IGST': row['Integrated Tax(₹)'],
          'CGST': row['Central Tax(₹)'],
          'SGST': row['State/UT Tax(₹)'],
          'Diagnosis': reason,
          'Correct the Tally/Accounts GSTIN to': gstrGSTIN || row['GSTIN of supplier'] || '',
        });
      } else {
        notInGSTR2B.push(diagRow);
      }
    }
  });

  // Fig Not Matched pairs — diagnose WHY amounts differ
  const seenFigInv = new Set<string>();
  recoOutput.forEach((row: any) => {
    if (row['DATA'] !== 'GSTR 2B') return;
    const rem = String(row['Remarks'] || '');
    if (!rem.startsWith('Fig Not Matched')) return;
    const inv = cleanString(String(row['Invoice number'] || ''));
    if (seenFigInv.has(inv)) return;
    seenFigInv.add(inv);
    const partner = recoOutput.find((r: any) => r['DATA'] === 'Our Data' && cleanString(String(r['Invoice number'] || '')) === inv);
    if (!partner) return;
    const gstrTax = safeNum(row['Taxable Value (₹)']);
    const ourTax = safeNum(partner['Taxable Value (₹)']);
    const gstrIGST = safeNum(row['Integrated Tax(₹)']);
    const ourIGST = safeNum(partner['Integrated Tax(₹)']);
    const gstrCGST = safeNum(row['Central Tax(₹)']);
    const ourCGST = safeNum(partner['Central Tax(₹)']);
    const gstrSGST = safeNum(row['State/UT Tax(₹)']);
    const ourSGST = safeNum(partner['State/UT Tax(₹)']);
    const taxDiff = Math.round((numVal(gstrTax) - numVal(ourTax)) * 100) / 100;
    const igstDiff = Math.round((numVal(gstrIGST) - numVal(ourIGST)) * 100) / 100;
    const cgstDiff = Math.round((numVal(gstrCGST) - numVal(ourCGST)) * 100) / 100;
    const sgstDiff = Math.round((numVal(gstrSGST) - numVal(ourSGST)) * 100) / 100;
    const itcDiff = Math.round((igstDiff + cgstDiff + sgstDiff) * 100) / 100;
    const absTax = Math.abs(taxDiff), absItc = Math.abs(itcDiff);
    const isInterstate = (numVal(gstrIGST) > 0 && numVal(ourCGST) > 0 && numVal(ourIGST) === 0) || (numVal(ourIGST) > 0 && numVal(gstrCGST) > 0 && numVal(gstrIGST) === 0);
    let diagnosis: string, sortPri: number;
    if (absTax <= 1 && absItc <= 1) {
      diagnosis = 'Rounding off difference only, can be ignored'; sortPri = 3;
    } else if (isInterstate) {
      diagnosis = 'Interstate vs Intrastate mismatch — IGST vs CGST+SGST type differs between GSTR-2B and accounts'; sortPri = 1;
    } else if (numVal(gstrTax) > 0 && absTax <= numVal(gstrTax) * 0.01) {
      diagnosis = 'Minor difference (less than 1%) — likely rounding across line items'; sortPri = 3;
    } else {
      diagnosis = 'Significant amount mismatch — cross-check physical bill with accounts entry'; sortPri = 1;
    }
    figNotMatched.push({
      'Diagnosis': diagnosis,
      'Supplier': String(row['Trade/Legal name'] || ''),
      'GSTIN': String(row['GSTIN of supplier'] || ''),
      'Invoice Number': String(row['Invoice number'] || ''),
      'Invoice Date': String(row['Invoice Date'] || ''),
      'Taxable Value (GSTR-2B)': gstrTax,
      'Taxable Value (Accounts)': ourTax,
      'Taxable Difference': taxDiff,
      'IGST Diff (+ = Add to books / - = Reduce in books)': igstDiff,
      'CGST Diff (+ = Add to books / - = Reduce in books)': cgstDiff,
      'SGST Diff (+ = Add to books / - = Reduce in books)': sgstDiff,
      'Net ITC Difference (Rs.)': itcDiff,
      _sp: sortPri,
    });
  });
  figNotMatched.sort((a: any, b: any) => a._sp - b._sp);
  figNotMatched.forEach((r: any) => { delete r._sp; });

  return { notInOurData, notInGSTR2B, gstinMismatches, figNotMatched };
}

// ═══════════════════════════════════════════════════════════
// PR vs TALLY RECONCILIATION (Option 4)
// ═══════════════════════════════════════════════════════════

export function reconcilePRTally(prResult: any, tallyResult4: any) {
  const { bills, billOrder } = prResult;
  const { tally, tallyOrder } = tallyResult4;
  const TOL = 5;
  const prRows: any[] = [];
  const tallyRows: any[] = [];
  const usedTally: Record<string, boolean> = {};

  billOrder.forEach((ck: string) => {
    const pr = bills[ck];
    const t = tally[ck] || null;
    let status: string;
    const diffs: Record<string, any> = {};

    if (!t) {
      status = 'MISSING_IN_TALLY';
    } else {
      usedTally[ck] = true;
      const hasMismatch = AUDIT_FIELDS.some(f => Math.abs(pr[f.prKey] - (t[f.tallyKey] || 0)) > TOL);
      status = hasMismatch ? 'MISMATCH' : 'MATCHED';
    }

    if (t) {
      AUDIT_FIELDS.forEach(f => {
        const prV = pr[f.prKey] || 0;
        const tV = t[f.tallyKey] || 0;
        diffs[f.label] = { pr: prV, tally: tV, diff: prV - tV };
      });
    }
    prRows.push({ pr, t, ck, status, diffs });
  });

  tallyOrder.forEach((ck: string) => {
    const t = tally[ck];
    const pr = bills[ck] || null;
    let status: string;
    const diffs: Record<string, any> = {};

    if (!pr) {
      status = 'NOT_IN_PR';
    } else {
      const prRow = prRows.find((r: any) => r.ck === ck);
      status = prRow ? prRow.status : 'MATCHED';
    }

    if (pr) {
      AUDIT_FIELDS.forEach(f => {
        const prV = pr[f.prKey] || 0;
        const tV = t[f.tallyKey] || 0;
        diffs[f.label] = { pr: prV, tally: tV, diff: tV - prV };
      });
    }
    tallyRows.push({ t, pr, ck, status, diffs });
  });

  // Build row-index maps for cross-sheet hyperlinks
  const prRowIndex: Record<string, number> = {};
  const tallyRowIndex: Record<string, number> = {};
  prResult.rawRows.forEach((rowObj: any, i: number) => {
    if (rowObj.billKey && !(rowObj.billKey in prRowIndex)) {
      prRowIndex[rowObj.billKey] = i + 2;
    }
  });
  tallyResult4.rawRows.forEach((rowObj: any, i: number) => {
    if (rowObj.billKey && !(rowObj.billKey in tallyRowIndex)) {
      tallyRowIndex[rowObj.billKey] = i + 2;
    }
  });

  return {
    prRows, tallyRows,
    mismatchCount: prRows.filter(r => r.status === 'MISMATCH').length,
    missingCount: prRows.filter(r => r.status === 'MISSING_IN_TALLY').length,
    extraCount: tallyRows.filter(r => r.status === 'NOT_IN_PR').length,
    prRaw: prResult, tallyRaw: tallyResult4,
    prRowIndex, tallyRowIndex,
  };
}

// ═══════════════════════════════════════════════════════════
// DEBIT / CREDIT NOTE RECONCILIATION (Option 2 only)
// ═══════════════════════════════════════════════════════════

import { DOC_TYPE_LABEL } from './gst-helpers';

const NOTE_TOL = 5;

function buildGSTRNoteRow(g: any, remark: string, extraCols: any[]) {
  const row = buildGSTRRow(g, remark, extraCols);
  row['Document Type'] = DOC_TYPE_LABEL[g.docType as string] || 'Credit Note';
  return row;
}

function buildOurNoteRow(r: any, remark: string, extraCols: any[]) {
  const row = buildOurRow(r, remark, extraCols);
  row['Document Type'] = DOC_TYPE_LABEL[r.docType as string] || 'Debit Note';
  return row;
}

/**
 * Reconcile GSTR-2B B2B-CDNR rows against debit/credit notes booked in the accounts.
 * Keyed on GSTIN + note number. Amounts are compared on absolute value because the
 * portal and the books use mirrored sign conventions for the same transaction.
 */
export function reconcileNotes(cdnrRows: any[], ourNoteRows: any[], extraCols: any[] = []) {
  const ourDict: Record<string, { gi: number; row: any }[]> = {};
  ourNoteRows.forEach((row: any, gi: number) => {
    const g = cleanString(normalise(String(row.gstin || '')));
    const inv = row.invoiceNum === '(blank)' ? '' : (row.invoiceNum || '');
    const key = g + '|' + cleanString(inv);
    if (!ourDict[key]) ourDict[key] = [];
    ourDict[key].push({ gi, row });
  });

  const output: any[] = [];
  const used = new Set<number>();
  const absCmp = (a: number, b: number) => Math.abs(Math.abs(a) - Math.abs(b)) <= NOTE_TOL;

  cdnrRows.forEach((gRow: any) => {
    const gstin = String(gRow['GSTIN of supplier'] || '');
    const noteNo = String(gRow['Invoice number'] || '');
    const key = cleanString(gstin) + '|' + cleanString(noteNo);
    const cands = (ourDict[key] || []).filter(e => !used.has(e.gi));

    if (cands.length > 0) {
      const sum = (f: (r: any) => number) => cands.reduce((s, e) => s + f(e.row), 0);
      const fig = absCmp(numVal(gRow['Taxable Value (₹)']), sum(r => r.taxable))
        && absCmp(numVal(gRow['Integrated Tax(₹)']), sum(r => r.igst))
        && absCmp(numVal(gRow['Central Tax(₹)']), sum(r => r.cgst))
        && absCmp(numVal(gRow['State/UT Tax(₹)']), sum(r => r.sgst))
        && absCmp(numVal(gRow['Cess(₹)']), sum(r => r.cess));
      const remark = fig ? (cands.length === 1 ? 'Matched' : `Matched - Multi-line (${cands.length} entries)`) : 'Fig Not Matched';
      output.push(buildGSTRNoteRow(gRow, remark, extraCols));
      cands.forEach(e => { used.add(e.gi); output.push(buildOurNoteRow(e.row, fig ? remark : 'Fig Not Matched', extraCols)); });
    } else {
      const remark = !noteNo ? 'Note number not mentioned in GSTR 2B'
        : !gstin ? 'GSTIN not mentioned in GSTR 2B'
        : 'Not in our data';
      output.push(buildGSTRNoteRow(gRow, remark, extraCols));
    }
  });

  Object.values(ourDict).forEach(entries => {
    entries.forEach(e => {
      if (used.has(e.gi)) return;
      const inv = e.row.invoiceNum === '(blank)' ? '' : (e.row.invoiceNum || '');
      const gst = normalise(String(e.row.gstin || ''));
      const rem = !inv ? 'Note number not mentioned in Our data'
        : !gst ? 'GSTIN not mentioned in Our data'
        : 'Not in GSTR 2B';
      output.push(buildOurNoteRow(e.row, rem, extraCols));
    });
  });

  // Fuzzy fallback — same GSTIN and amounts, note number differs
  const pairs: any[] = [];
  const gUn = output.filter(r => r['DATA'] === 'GSTR 2B' && r['Remarks'] === 'Not in our data');
  const oUn = output.filter(r => r['DATA'] === 'Our Data' && r['Remarks'] === 'Not in GSTR 2B');
  const usedOur = new Set<number>();
  gUn.forEach(gRow => {
    const gstin = cleanString(gRow['GSTIN of supplier'] || '');
    if (!gstin) return;
    let best: any = null, bestScore = 0;
    oUn.forEach((oRow, oi) => {
      if (usedOur.has(oi)) return;
      if (cleanString(oRow['GSTIN of supplier'] || '') !== gstin) return;
      if (!absCmp(numVal(gRow['Taxable Value (₹)']), numVal(oRow['Taxable Value (₹)']))) return;
      const sim = invSimilarity(gRow['Invoice number'], oRow['Invoice number']);
      if (sim.score >= 60 && sim.score > bestScore) { bestScore = sim.score; best = { oi, oRow, sim }; }
    });
    if (best) { usedOur.add(best.oi); pairs.push({ gRow, oRow: best.oRow, sim: best.sim }); }
  });
  pairs.forEach(p => {
    p.gRow['Remarks'] = 'Possible Match — Note No. differs';
    p.oRow['Remarks'] = 'Possible Match — Note No. differs';
  });
  (output as any)._possibleNotePairs = pairs;

  return output;
}

/** Note-specific mismatch diagnosis for File 3. */
export function diagnoseNotes(noteOutput: any[]) {
  const noteMismatches: any[] = [];
  const seen = new Set<any>();

  noteOutput.forEach((row: any) => {
    if (seen.has(row)) return;
    const remark = String(row['Remarks'] || '');
    const base = {
      'Document Type': row['Document Type'] || '',
      'GSTIN': row['GSTIN of supplier'] || '',
      'Supplier': row['Trade/Legal name'] || '',
      'Note Number': row['Invoice number'] || '',
      'Note Date': row['Invoice Date'] || '',
      'Taxable Value': row['Taxable Value (₹)'],
      'IGST': row['Integrated Tax(₹)'],
      'CGST': row['Central Tax(₹)'],
      'SGST': row['State/UT Tax(₹)'],
    };

    if (row['DATA'] === 'GSTR 2B' && remark === 'Not in our data') {
      noteMismatches.push({
        ...base,
        'Diagnosis': 'Credit note issued by supplier but no purchase return booked — ITC must be reduced in your books',
        'Action': 'Book the purchase return / debit note in accounts and reverse the ITC',
      });
    } else if (row['DATA'] === 'Our Data' && remark === 'Not in GSTR 2B') {
      noteMismatches.push({
        ...base,
        'Diagnosis': 'Debit note booked in accounts but the supplier has not filed the corresponding credit note in GSTR-1',
        'Action': 'Follow up with the supplier to report the credit note',
      });
    } else if (row['DATA'] === 'GSTR 2B' && remark.startsWith('Fig Not Matched')) {
      const partner = noteOutput.find((r: any) => r['DATA'] === 'Our Data'
        && cleanString(String(r['Invoice number'] || '')) === cleanString(String(row['Invoice number'] || ''))
        && cleanString(String(r['GSTIN of supplier'] || '')) === cleanString(String(row['GSTIN of supplier'] || '')));
      if (!partner) return;
      seen.add(partner);
      const d = (a: any, b: any) => Math.round((Math.abs(numVal(a)) - Math.abs(numVal(b))) * 100) / 100;
      const taxDiff = d(row['Taxable Value (₹)'], partner['Taxable Value (₹)']);
      const igstDiff = d(row['Integrated Tax(₹)'], partner['Integrated Tax(₹)']);
      const cgstDiff = d(row['Central Tax(₹)'], partner['Central Tax(₹)']);
      const sgstDiff = d(row['State/UT Tax(₹)'], partner['State/UT Tax(₹)']);
      const itcDiff = Math.round((igstDiff + cgstDiff + sgstDiff) * 100) / 100;
      const isInterstate = (numVal(row['Integrated Tax(₹)']) !== 0 && numVal(partner['Central Tax(₹)']) !== 0 && numVal(partner['Integrated Tax(₹)']) === 0)
        || (numVal(partner['Integrated Tax(₹)']) !== 0 && numVal(row['Central Tax(₹)']) !== 0 && numVal(row['Integrated Tax(₹)']) === 0);
      let diagnosis: string;
      if (Math.abs(taxDiff) <= 1 && Math.abs(itcDiff) <= 1) diagnosis = 'Rounding off difference only, can be ignored';
      else if (isInterstate) diagnosis = 'Interstate vs Intrastate mismatch on the note — IGST vs CGST+SGST differs';
      else diagnosis = 'Significant note amount mismatch — cross-check the note with the accounts entry';
      noteMismatches.push({
        ...base,
        'Taxable Value': row['Taxable Value (₹)'],
        'Taxable Value (Accounts)': partner['Taxable Value (₹)'],
        'Taxable Difference': taxDiff,
        'Net ITC Difference (Rs.)': itcDiff,
        'Diagnosis': diagnosis,
        'Action': 'Correct the note value in accounts or ask the supplier to amend',
      });
    }
  });

  return { noteMismatches };
}

/** Supplier-level Net ITC summary — invoices minus notes, on both sides. */
export function buildNetITCSummary(invoiceOutput: any[], noteOutput: any[]) {
  const map: Record<string, any> = {};
  const itcOf = (r: any) => numVal(r['Integrated Tax(₹)']) + numVal(r['Central Tax(₹)']) + numVal(r['State/UT Tax(₹)']);
  const get = (gstin: string, name: string) => {
    const k = cleanString(gstin) || '(blank)';
    if (!map[k]) map[k] = { gstin: gstin || '(blank)', name: name || '', b2bInv: 0, b2bNote: 0, bookInv: 0, bookNote: 0 };
    if (!map[k].name && name) map[k].name = name;
    return map[k];
  };

  (invoiceOutput || []).forEach((r: any) => {
    if (String(r['Remarks'] || '').startsWith('Possible Match') === false && !r['DATA']) return;
    const e = get(String(r['GSTIN of supplier'] || ''), String(r['Trade/Legal name'] || ''));
    if (r['DATA'] === 'GSTR 2B') e.b2bInv += itcOf(r);
    else if (r['DATA'] === 'Our Data') e.bookInv += itcOf(r);
  });
  (noteOutput || []).forEach((r: any) => {
    const e = get(String(r['GSTIN of supplier'] || ''), String(r['Trade/Legal name'] || ''));
    if (r['DATA'] === 'GSTR 2B') e.b2bNote += itcOf(r);
    else if (r['DATA'] === 'Our Data') e.bookNote += itcOf(r);
  });

  const r2 = (n: number) => Math.round(n * 100) / 100;
  return Object.values(map).map((e: any) => {
    const net2b = e.b2bInv + e.b2bNote;
    const netBooks = e.bookInv + e.bookNote;
    return {
      'GSTIN': e.gstin,
      'Supplier': e.name,
      'ITC on Invoices (GSTR-2B)': r2(e.b2bInv),
      'ITC on Notes (GSTR-2B)': r2(e.b2bNote),
      'Net ITC as per GSTR-2B': r2(net2b),
      'ITC on Invoices (Books)': r2(e.bookInv),
      'ITC on Notes (Books)': r2(e.bookNote),
      'Net ITC as per Books': r2(netBooks),
      'Difference (2B - Books)': r2(net2b - netBooks),
    };
  }).sort((a: any, b: any) => Math.abs(b['Difference (2B - Books)']) - Math.abs(a['Difference (2B - Books)']));
}

// ═══════════════════════════════════════════════════════════
// ROW COVERAGE AUDIT — explains why output rows < input rows
// ═══════════════════════════════════════════════════════════

export interface RowAuditInput {
  tallyAudit: any;
  gstrStats?: { rowsRead: number; blankRows: number } | null;
  gstrGroups?: number;
  cdnrStats?: { rowsRead: number; blankRows: number } | null;
  cdnrGroups?: number;
  recoRowCount?: number;
  noteRowCount?: number;
}

/** Flat rows for the on-screen Row Coverage panel and the "Row Audit" sheet. */
export function buildRowAudit(input: RowAuditInput) {
  const a = input.tallyAudit || {};
  const rows: any[] = [];
  const add = (section: string, item: string, count: any, details = '') =>
    rows.push({ Section: section, Item: item, Count: count, Details: details });

  const PR = 'Purchase file';
  add(PR, 'Data rows read (after the header row)', a.rowsRead ?? 0, '');
  add(PR, 'Blank rows skipped', a.blankRows ?? 0, 'Completely empty rows');
  add(PR, 'Total / sub-total rows skipped', (a.totalRowsSkipped || []).length,
    (a.totalRowsSkipped || []).slice(0, 25).map((r: any) => `row ${r.row}`).join(', '));
  add(PR, 'Rows skipped — no supplier / party name', (a.noSupplierRows || []).length,
    (a.noSupplierRows || []).slice(0, 25).map((r: any) => `row ${r.row}${r.invoiceNum ? ` (${r.invoiceNum})` : ''}`).join(', '));
  add(PR, 'Rows actually used', a.rowsUsed ?? 0, 'Every one of these rows is included in the output figures');
  add(PR, 'Rows merged into a single invoice / note', a.mergedRows ?? 0,
    `${a.mergedGroups ?? 0} documents had more than one line (multi-rate bills) and were summed`);
  add(PR, 'Invoice groups after merging', a.invoiceGroups ?? 0, '');
  add(PR, 'Debit / credit note groups after merging', a.noteGroups ?? 0, '');

  if (input.gstrStats) {
    add('GSTR-2B (B2B)', 'Data rows read', input.gstrStats.rowsRead, '');
    add('GSTR-2B (B2B)', 'Blank rows skipped', input.gstrStats.blankRows, '');
    add('GSTR-2B (B2B)', 'Invoice groups after merging', input.gstrGroups ?? 0, 'Same GSTIN + invoice number rows are summed');
  }
  if (input.cdnrStats) {
    add('GSTR-2B (Notes)', 'Data rows read', input.cdnrStats.rowsRead, '');
    add('GSTR-2B (Notes)', 'Blank rows skipped', input.cdnrStats.blankRows, '');
    add('GSTR-2B (Notes)', 'Note groups after merging', input.cdnrGroups ?? 0, '');
  }
  add('Output', 'Reconciliation Output lines', input.recoRowCount ?? 0, '');
  if (input.noteRowCount) add('Output', 'Debit / Credit Note lines', input.noteRowCount, '');

  (a.mergedSamples || []).forEach((s: any) => {
    add('Merged documents (sample)', `${s.gstin || '(no GSTIN)'} — ${s.invoiceNum}`, s.count, `Purchase file rows: ${s.rows}`);
  });

  return rows;
}
