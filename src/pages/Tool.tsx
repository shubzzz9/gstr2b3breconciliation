/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import XLSX from 'xlsx-js-style';
import { scanTally, processTally, scanGSTR2B, parseGSTR2B, parseCombined, parsePurchaseRegister, parseTally4 } from '@/lib/gst-parsers';
import { reconcile, diagnoseMismatches, reconcilePRTally } from '@/lib/gst-reconcile';
import { downloadFile1, downloadFile2, downloadFile3, downloadPRTallyAudit } from '@/lib/gst-downloads';
import { TALLY_SINGLE_ROWS, TALLY_MULTI_ROWS } from '@/lib/gst-helpers';
import ContactPaywall from '@/components/ContactPaywall';
import AuthModal from '@/components/AuthModal';

type Mode = 'tally' | 'full' | 'combined' | 'prtally' | null;

const Tool = () => {
  const { user, loading, signOut } = useAuth();
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<Mode>(null);
  const [error, setError] = useState('');

  // Files
  const [tallyWB, setTallyWB] = useState<any>(null);
  const [gstrWB, setGstrWB] = useState<any>(null);
  const [combinedWB, setCombinedWB] = useState<any>(null);
  const [prWB, setPrWB] = useState<any>(null);
  const [tallyWB4, setTallyWB4] = useState<any>(null);
  const [tallyName, setTallyName] = useState('');
  const [gstrName, setGstrName] = useState('');
  const [combinedName, setCombinedName] = useState('');
  const [prName, setPrName] = useState('');
  const [tally4Name, setTally4Name] = useState('');

  // Scan results
  const [tallyScan, setTallyScan] = useState<any>(null);
  const [gstrScan, setGstrScan] = useState<any>(null);

  // Mappings
  const [singleMap, setSingleMap] = useState<Record<string, number>>({});
  const [multiMap, setMultiMap] = useState<Record<string, number[]>>({});

  // Results
  const [tallyData, setTallyData] = useState<any>(null);
  const [recoRows, setRecoRows] = useState<any>(null);
  const [diagData, setDiagData] = useState<any>(null);
  const [auditResult, setAuditResult] = useState<any>(null);
  const [tallyResult, setTallyResult] = useState<any>(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');

  // Usage
  const [exportCount, setExportCount] = useState(0);
  const [maxExports, setMaxExports] = useState(10);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingDownload, setPendingDownload] = useState<{ type: string; fn: () => void } | null>(null);

  const loadUsage = useCallback(async () => {
    if (!user) return;
    const { data: count } = await supabase.rpc('get_export_count', { p_user_id: user.id });
    setExportCount(count || 0);
    const { data: profile } = await supabase.from('profiles').select('max_exports, is_blocked').eq('user_id', user.id).single();
    if (profile) { setMaxExports(profile.max_exports); if (profile.is_blocked) setShowPaywall(true); }
  }, [user]);

  useEffect(() => { loadUsage(); }, [loadUsage]);

  const trackExport = async (type: string): Promise<boolean> => {
    if (!user) return false;
    const { data: canExport } = await supabase.rpc('can_user_export', { p_user_id: user.id });
    if (!canExport) { setShowPaywall(true); return false; }
    await supabase.from('export_logs').insert({ user_id: user.id, export_type: type });
    setExportCount(prev => prev + 1);
    return true;
  };

  const handleDownload = async (type: string, fn: () => void) => {
    if (!user) {
      setPendingDownload({ type, fn });
      setShowAuthModal(true);
      return;
    }
    if (await trackExport(type)) fn();
  };

  const handleAuthSuccess = async () => {
    setShowAuthModal(false);
    await loadUsage();
    if (pendingDownload) {
      const { type, fn } = pendingDownload;
      setPendingDownload(null);
      // Re-check after login
      const { data: canExport } = await supabase.rpc('can_user_export', { p_user_id: pendingDownload.type === type ? (await supabase.auth.getUser()).data.user!.id : '' });
      if (canExport) {
        const userId = (await supabase.auth.getUser()).data.user!.id;
        await supabase.from('export_logs').insert({ user_id: userId, export_type: type });
        setExportCount(prev => prev + 1);
        fn();
      } else {
        setShowPaywall(true);
      }
    }
  };

  const handleFile = (file: File, setter: (wb: any) => void, nameSetter: (n: string) => void) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'binary' });
        setter(wb);
        nameSetter(file.name);
      } catch { alert('Failed to read file. Make sure it is a valid Excel file.'); }
    };
    reader.readAsBinaryString(file);
  };

  const UploadBox = ({ label, hint, icon, fileName, onFile, borderColor }: any) => {
    const [dragover, setDragover] = useState(false);
    return (
      <div
        className={`upload-zone ${fileName ? 'loaded' : ''} ${dragover ? 'dragover' : ''}`}
        style={borderColor ? { borderColor } : {}}
        onClick={() => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.xlsx,.xls'; i.onchange = (e: any) => { if (e.target.files[0]) onFile(e.target.files[0]); }; i.click(); }}
        onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
        onDragLeave={() => setDragover(false)}
        onDrop={(e) => { e.preventDefault(); setDragover(false); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); }}
      >
        <div className="text-3xl mb-2">{icon}</div>
        <div className="text-sm font-semibold text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground mt-1">{hint}</div>
        {fileName && <div className="text-xs font-semibold text-success mt-2">✓ {fileName}</div>}
      </div>
    );
  };

  const handleStartFlow = (m: string) => {
    setMode(m as Mode);
    setError('');
    try {
      if (m === 'prtally') {
        const prRes = parsePurchaseRegister(prWB);
        const talRes = parseTally4(tallyWB4);
        setTallyResult({ prResult: prRes, tallyResult4: talRes });
        setStep(2);
        return;
      }
      if (m === 'combined') {
        const combined = parseCombined(combinedWB);
        setTallyResult(combined);
        setStep(2);
        return;
      }
      const scan = scanTally(tallyWB);
      setTallyScan(scan);
      setSingleMap(scan.singleGuesses);
      setMultiMap(scan.multiGuesses);
      if (m === 'full') {
        const gScan = scanGSTR2B(gstrWB);
        setGstrScan(gScan);
      }
      setStep(2);
    } catch (e: any) { setError(e.message); }
  };

  const handleConfirm = async () => {
    setStep(3); setProgress(0);
    try {
      if (mode === 'prtally') {
        setProgressLabel('Running audit...');
        setProgress(50);
        const result = reconcilePRTally(tallyResult.prResult, tallyResult.tallyResult4);
        setAuditResult(result);
        setProgress(100);
        setStep(4);
        return;
      }
      if (mode === 'combined') {
        setProgressLabel('Reconciling combined file...');
        setProgress(30);
        const reco = reconcile(tallyResult.gstrRows, tallyResult.ourRows);
        setRecoRows(reco);
        setProgress(70);
        const diag = diagnoseMismatches(reco);
        setDiagData(diag);
        setProgress(100);
        setStep(4);
        return;
      }
      setProgressLabel('Processing tally data...');
      setProgress(20);
      const mapping = { hdrIdx: tallyScan.hdrIdx, headers: tallyScan.headers, raw: tallyScan.raw, ...singleMap, ...multiMap };
      const tResult = processTally(mapping as any);
      setTallyData(tResult.rows);
      setTallyResult(tResult);

      if (mode === 'full' && gstrScan) {
        setProgressLabel('Parsing GSTR-2B...');
        setProgress(50);
        const gstrRows = parseGSTR2B(gstrScan);
        setProgressLabel('Reconciling...');
        setProgress(70);
        const reco = reconcile(gstrRows, tResult.rows, gstrScan.extraCols);
        setRecoRows(reco);
        setProgress(85);
        setProgressLabel('Diagnosing mismatches...');
        const diag = diagnoseMismatches(reco);
        setDiagData(diag);
      }
      setProgress(100);
      setStep(4);
    } catch (e: any) { setError('Processing error: ' + e.message); setStep(2); }
  };


  const resetTool = () => {
    setStep(1); setMode(null); setError('');
    setTallyWB(null); setGstrWB(null); setCombinedWB(null); setPrWB(null); setTallyWB4(null);
    setTallyName(''); setGstrName(''); setCombinedName(''); setPrName(''); setTally4Name('');
    setTallyScan(null); setGstrScan(null); setTallyData(null); setRecoRows(null);
    setDiagData(null); setAuditResult(null); setTallyResult(null);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="spinner" /></div>;

  const stepLabels = ['1 · Upload', '2 · Map Columns', '3 · Processing', '4 · Download'];

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-[1100px] mx-auto">
        {/* Header */}
        <div className="gradient-header text-primary-foreground p-5 rounded-t-xl flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-lg md:text-xl font-bold">🧾 GST Reconciliation Tool</h1>
            <p className="text-xs opacity-85 mt-1">Convert, compare and reconcile your Purchase Data with GSTR-2B</p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="bg-white/20 px-2 py-1 rounded text-xs">{exportCount}/{maxExports} exports</span>
            <button onClick={() => signOut()} className="text-xs underline opacity-80 hover:opacity-100">Sign Out</button>
          </div>
        </div>

        <div className="bg-card rounded-b-xl p-5 md:p-8 shadow-lg border border-border border-t-0">
          {/* Step Nav */}
          <div className="flex mb-6 rounded-lg overflow-hidden border border-border">
            {stepLabels.map((label, i) => (
              <div key={i} className={`step-tab ${step === i + 1 ? 'active' : ''} ${step > i + 1 ? 'done' : ''}`}>{label}</div>
            ))}
          </div>

          {error && <div className="alert-box alert-error mb-4">{error}</div>}

          {/* STEP 1: Upload */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="bg-secondary border border-border rounded-lg p-3 text-sm text-foreground">
                <strong className="text-primary">📌 Which option do I need?</strong>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1 mt-2 text-xs">
                  <div>• <strong>Option 1</strong> — Convert any purchase file to GSTR-2B format</div>
                  <div>• <strong>Option 2</strong> — Reconcile purchase file vs GSTR-2B</div>
                  <div>• <strong>Option 3</strong> — Reconcile from single combined file</div>
                  <div>• <strong>Option 4</strong> — Client Purchase Sheet vs Tally audit</div>
                </div>
              </div>

              {/* Option 1 */}
              <div className="option-card border-accent bg-accent/5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="bg-accent text-accent-foreground text-xs font-bold px-3 py-1 rounded">Option 1</span>
                  <span className="font-bold text-sm text-primary">Convert Purchase File → GSTR-2B Format</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">Upload any purchase file and convert to GSTR-2B column layout. No reconciliation.</p>
                <UploadBox icon="📊" label="Upload Purchase File" hint="Tally export, client register, or any invoice-wise Excel" fileName={tallyName} onFile={(f: File) => handleFile(f, setTallyWB, setTallyName)} />
                <button disabled={!tallyWB} onClick={() => handleStartFlow('tally')} className="btn-tool bg-accent text-accent-foreground mt-3 hover:opacity-90">Continue with Option 1 →</button>
              </div>

              {/* Option 2 */}
              <div className="option-card border-success bg-success/5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="bg-success text-success-foreground text-xs font-bold px-3 py-1 rounded">Option 2</span>
                  <span className="font-bold text-sm text-primary">Reconcile Purchase File vs GSTR-2B</span>
                  <span className="bg-success/20 text-success text-[10px] font-semibold px-2 py-0.5 rounded-full">Recommended</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">Upload purchase file + GSTR-2B from GST portal → full reconciliation.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  <UploadBox icon="📊" label="Your Purchase File *" hint="Tally export or any invoice-wise Excel" fileName={tallyName} onFile={(f: File) => handleFile(f, setTallyWB, setTallyName)} />
                  <UploadBox icon="🏛️" label="GSTR-2B from GST Portal *" hint="Excel from gstin.gov.in" fileName={gstrName} onFile={(f: File) => handleFile(f, setGstrWB, setGstrName)} />
                </div>
                <button disabled={!tallyWB || !gstrWB} onClick={() => handleStartFlow('full')} className="btn-tool bg-success text-success-foreground hover:opacity-90">Continue with Option 2 →</button>
              </div>

              {/* Option 3 */}
              <div className="option-card border-dashed border-purple-500 bg-purple-50">
                <div className="flex items-center gap-2 mb-3">
                  <span className="bg-purple-600 text-white text-xs font-bold px-3 py-1 rounded">Option 3</span>
                  <span className="font-bold text-sm text-primary">Reconcile from Single Combined File</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">Both datasets in one file with a DATA column ("GSTR 2B" / "Our Data").</p>
                <UploadBox icon="📋" label="Combined File" hint='Must have DATA column' fileName={combinedName} onFile={(f: File) => handleFile(f, setCombinedWB, setCombinedName)} borderColor="#a78bfa" />
                <button disabled={!combinedWB} onClick={() => handleStartFlow('combined')} className="btn-tool bg-purple-600 text-white mt-3 hover:opacity-90">Continue with Option 3 →</button>
              </div>

              {/* Option 4 */}
              <div className="option-card border-cyan-500 bg-cyan-50">
                <div className="flex items-center gap-2 mb-3">
                  <span className="bg-cyan-600 text-white text-xs font-bold px-3 py-1 rounded">Option 4</span>
                  <span className="font-bold text-sm text-primary">Client Purchase Sheet vs Tally Audit</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">Compare client's purchase register with Tally entries.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  <UploadBox icon="📄" label="Client's Purchase Sheet *" hint="Original purchase register" fileName={prName} onFile={(f: File) => handleFile(f, setPrWB, setPrName)} borderColor="#67e8f9" />
                  <UploadBox icon="📊" label="Tally Accounted Data *" hint="Purchase register from Tally" fileName={tally4Name} onFile={(f: File) => handleFile(f, setTallyWB4, setTally4Name)} borderColor="#67e8f9" />
                </div>
                <button disabled={!prWB || !tallyWB4} onClick={() => handleStartFlow('prtally')} className="btn-tool bg-cyan-600 text-white hover:opacity-90">Continue with Option 4 →</button>
              </div>
            </div>
          )}

          {/* STEP 2: Mapping */}
          {step === 2 && (
            <div>
              <div className="alert-box alert-info mb-4">
                <strong>Step 2: Confirm Column Detection</strong><br />
                We've auto-detected columns. Review below and confirm.
              </div>
              {(mode === 'tally' || mode === 'full') && tallyScan && (
                <div className="mb-6">
                  <h3 className="text-sm font-bold text-primary bg-secondary p-2 rounded mb-2">📊 Purchase File — Column Mapping</h3>
                  <table className="map-table">
                    <thead><tr><th>Purpose</th><th>Detected Column</th><th>Status</th></tr></thead>
                    <tbody>
                      {TALLY_SINGLE_ROWS.map(row => (
                        <tr key={row.id}>
                          <td className="text-xs font-medium">{row.label} {row.required && <span className="text-destructive">*</span>}</td>
                          <td>
                            <select className="w-full p-1 border border-input rounded text-xs bg-background"
                              value={singleMap[row.id] ?? -1}
                              onChange={(e) => setSingleMap(prev => ({ ...prev, [row.id]: parseInt(e.target.value) }))}>
                              <option value={-1}>(Not mapped)</option>
                              {tallyScan.headers.map((h: string, i: number) => <option key={i} value={i}>{h}</option>)}
                            </select>
                          </td>
                          <td>{(singleMap[row.id] ?? -1) >= 0 ? <span className="text-xs text-success font-semibold">✓ Found</span> : row.required ? <span className="text-xs text-destructive font-semibold">✗ Required</span> : <span className="text-xs text-warning font-semibold">⚠ Optional</span>}</td>
                        </tr>
                      ))}
                      {TALLY_MULTI_ROWS.map(row => (
                        <tr key={row.id}>
                          <td className="text-xs font-medium">{row.label} {row.required && <span className="text-destructive">*</span>}</td>
                          <td>
                            <div className="flex flex-wrap gap-1">
                              {tallyScan.headers.map((h: string, i: number) => (
                                <label key={i} className="inline-flex items-center gap-1 text-[11px] border border-input rounded px-1.5 py-0.5 cursor-pointer hover:bg-secondary">
                                  <input type="checkbox" checked={(multiMap[row.id] || []).includes(i)}
                                    onChange={(e) => {
                                      setMultiMap(prev => {
                                        const current = prev[row.id] || [];
                                        return { ...prev, [row.id]: e.target.checked ? [...current, i] : current.filter(x => x !== i) };
                                      });
                                    }} />
                                  {h}
                                </label>
                              ))}
                            </div>
                          </td>
                          <td>{(multiMap[row.id] || []).length > 0 ? <span className="text-xs text-success font-semibold">✓ {(multiMap[row.id] || []).length} cols</span> : row.required ? <span className="text-xs text-destructive font-semibold">✗ Required</span> : <span className="text-xs text-warning font-semibold">⚠ Optional</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {mode === 'full' && gstrScan && gstrScan.sanityWarnings.length > 0 && (
                <div className="alert-box alert-warn mb-4">
                  {gstrScan.sanityWarnings.map((w: string, i: number) => <div key={i}>{w}</div>)}
                </div>
              )}
              {(mode === 'combined' || mode === 'prtally') && (
                <div className="alert-box alert-success">
                  <strong>✓ File parsed successfully.</strong> Ready to process.
                </div>
              )}
              <div className="flex justify-between mt-6">
                <button onClick={() => setStep(1)} className="btn-tool bg-secondary text-foreground border border-border w-auto px-6 hover:bg-muted">← Back</button>
                <button onClick={handleConfirm} className="btn-tool bg-primary text-primary-foreground w-auto px-6 hover:opacity-90"
                  disabled={mode !== 'combined' && mode !== 'prtally' && TALLY_SINGLE_ROWS.filter(r => r.required).some(r => (singleMap[r.id] ?? -1) < 0)}>
                  Confirmed — Continue →
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Processing */}
          {step === 3 && (
            <div className="text-center py-10">
              <div className="spinner" />
              <p className="text-sm font-semibold text-primary mt-4">{progressLabel || 'Processing...'}</p>
              <div className="bg-secondary rounded-lg h-2.5 mt-4 overflow-hidden max-w-md mx-auto">
                <div className="h-full bg-gradient-to-r from-primary to-success rounded-lg transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {/* STEP 4: Download */}
          {step === 4 && (
            <div>
              <div className="alert-box alert-success mb-4"><strong>✓ Done!</strong> All output files are ready.</div>

              {recoRows && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                  {(() => {
                    const counts: Record<string, number> = {};
                    recoRows.forEach((r: any) => { counts[r['Remarks']] = (counts[r['Remarks']] || 0) + 1; });
                    const matched = Object.entries(counts).filter(([k]) => k.startsWith('Matched')).reduce((s, [, v]) => s + v, 0);
                    const gstrCount = recoRows.filter((r: any) => r['DATA'] === 'GSTR 2B').length;
                    const ourCount = recoRows.filter((r: any) => r['DATA'] === 'Our Data').length;
                    return (<>
                      <div className="summary-card"><div className="summary-val">{gstrCount}</div><div className="summary-lbl">GSTR-2B Rows</div></div>
                      <div className="summary-card"><div className="summary-val">{ourCount}</div><div className="summary-lbl">Our Data Rows</div></div>
                      <div className="summary-card border-success/30 bg-success/5"><div className="summary-val text-success">{matched}</div><div className="summary-lbl">Matched</div></div>
                      <div className="summary-card border-warning/30 bg-warning/5"><div className="summary-val text-warning">{recoRows.length - matched}</div><div className="summary-lbl">Unmatched</div></div>
                    </>);
                  })()}
                </div>
              )}

              <h3 className="text-sm font-bold text-primary mb-3">Download Files</h3>
              <div className="flex flex-wrap gap-4">
                {(mode === 'tally' || mode === 'full' || mode === 'combined') && tallyData && (
                  <div className="file-card">
                    <span className="text-[10px] font-semibold bg-accent/20 text-accent px-2 py-0.5 rounded-full">File 1</span>
                    <h4 className="text-sm font-bold mt-2">📄 GSTR-2B Format</h4>
                    <p className="text-xs text-muted-foreground mb-3">Your data formatted to GSTR-2B columns.</p>
                    <button onClick={() => handleDownload('file1', () => downloadFile1(tallyData))} className="btn-tool bg-primary text-primary-foreground hover:opacity-90">💾 Download</button>
                  </div>
                )}
                {(mode === 'full' || mode === 'combined') && recoRows && (
                  <div className="file-card">
                    <span className="text-[10px] font-semibold bg-success/20 text-success px-2 py-0.5 rounded-full">File 2</span>
                    <h4 className="text-sm font-bold mt-2">📋 Reconciliation Report</h4>
                    <p className="text-xs text-muted-foreground mb-3">Full reconciliation with remarks.</p>
                    <button onClick={() => handleDownload('file2', () => downloadFile2(recoRows, gstrScan?.extraCols))} className="btn-tool bg-success text-success-foreground hover:opacity-90">💾 Download</button>
                  </div>
                )}
                {(mode === 'full' || mode === 'combined') && diagData && (
                  <div className="file-card">
                    <span className="text-[10px] font-semibold bg-secondary text-foreground px-2 py-0.5 rounded-full">File 3</span>
                    <h4 className="text-sm font-bold mt-2">🔍 Mismatch Diagnosis</h4>
                    <p className="text-xs text-muted-foreground mb-3">Detailed mismatch analysis.</p>
                    <button onClick={() => handleDownload('file3', () => downloadFile3(diagData))} className="btn-tool bg-secondary text-foreground border border-border hover:bg-muted">💾 Download</button>
                  </div>
                )}
                {mode === 'prtally' && auditResult && (
                  <div className="file-card">
                    <span className="text-[10px] font-semibold bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full">Audit</span>
                    <h4 className="text-sm font-bold mt-2">🔎 PR vs Tally Audit</h4>
                    <p className="text-xs text-muted-foreground mb-3">Colour-coded audit result.</p>
                    <button onClick={() => handleDownload('file4', () => downloadPRTallyAudit(auditResult))} className="btn-tool bg-cyan-600 text-white hover:opacity-90">💾 Download</button>
                  </div>
                )}
              </div>

              <div className="mt-6">
                <button onClick={resetTool} className="btn-tool bg-secondary text-foreground border border-border w-auto px-6 hover:bg-muted">← Start Over</button>
              </div>
            </div>
          )}
        </div>

        <div className="text-center mt-4 text-xs text-muted-foreground italic">
          Developed by <strong className="text-warning">TechBharat Studios</strong> · <a href="mailto:techbharatstudios@gmail.com" className="underline">techbharatstudios@gmail.com</a>
        </div>
      </div>

      {showPaywall && <ContactPaywall onClose={() => setShowPaywall(false)} exportCount={exportCount} maxExports={maxExports} />}
    </div>
  );
};

export default Tool;
