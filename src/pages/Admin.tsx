import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Shield, Users, FileDown, Fingerprint, Ban, CheckCircle, ArrowLeft, RefreshCw, Calendar, Hash, Clock } from 'lucide-react';

type Profile = {
  id: string;
  user_id: string;
  full_name: string | null;
  phone: string | null;
  is_blocked: boolean;
  max_exports: number;
  access_mode: string;
  access_expires_at: string | null;
  created_at: string;
  updated_at: string;
};

type ExportLog = {
  id: string;
  user_id: string;
  export_type: string;
  device_fingerprint: string | null;
  ip_address: string | null;
  created_at: string;
};

type Device = {
  id: string;
  fingerprint: string;
  ip_address: string | null;
  user_id: string | null;
  export_count: number;
  is_blocked: boolean;
  first_seen_at: string;
  last_seen_at: string;
  metadata: unknown;
};

const Admin = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [exports, setExports] = useState<ExportLog[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [editingMax, setEditingMax] = useState<string | null>(null);
  const [maxVal, setMaxVal] = useState('');
  const [editingAccess, setEditingAccess] = useState<string | null>(null);
  const [accessMode, setAccessMode] = useState('exports');
  const [accessExpiry, setAccessExpiry] = useState('');
  const [syncing, setSyncing] = useState(false);

  const syncToSheets = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-to-sheets');
      if (error) throw error;
      if (data?.success) {
        toast.success(`Synced ${data.synced.signups} users & ${data.synced.exports} exports to Google Sheets`);
      } else {
        throw new Error(data?.error || 'Sync failed');
      }
    } catch (err: any) {
      toast.error(`Sync failed: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const checkAdmin = useCallback(async () => {
    if (!user) {
      setChecking(false);
      return;
    }
    const { data } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    setIsAdmin(!!data);
    setChecking(false);
  }, [user]);

  useEffect(() => { if (!loading) checkAdmin(); }, [loading, checkAdmin]);

  const loadData = useCallback(async () => {
    if (!isAdmin) return;
    const [p, e, d] = await Promise.all([
      supabase.rpc('admin_get_all_profiles'),
      supabase.rpc('admin_get_all_export_logs'),
      supabase.rpc('admin_get_all_devices'),
    ]);
    if (p.data) setProfiles(p.data as unknown as Profile[]);
    if (e.data) setExports(e.data as ExportLog[]);
    if (d.data) setDevices(d.data as Device[]);
  }, [isAdmin]);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleUserBlock = async (userId: string, blocked: boolean) => {
    await supabase.rpc('admin_set_user_blocked', { p_target_user_id: userId, p_blocked: !blocked });
    toast.success(blocked ? 'User unblocked' : 'User blocked');
    loadData();
  };

  const toggleDeviceBlock = async (fingerprint: string, blocked: boolean) => {
    await supabase.rpc('admin_set_device_blocked', { p_fingerprint: fingerprint, p_blocked: !blocked });
    toast.success(blocked ? 'Device unblocked' : 'Device blocked');
    loadData();
  };

  const updateMaxExports = async (userId: string) => {
    const val = parseInt(maxVal);
    if (isNaN(val) || val < 0) { toast.error('Invalid number'); return; }
    await supabase.rpc('admin_set_max_exports', { p_target_user_id: userId, p_max: val });
    toast.success('Max exports updated');
    setEditingMax(null);
    loadData();
  };

  const updateAccessMode = async (userId: string) => {
    const expiresAt = accessExpiry ? new Date(accessExpiry).toISOString() : null;
    await supabase.rpc('admin_set_access_mode', {
      p_target_user_id: userId,
      p_mode: accessMode,
      p_expires_at: expiresAt,
    });
    toast.success('Access mode updated');
    setEditingAccess(null);
    loadData();
  };

  if (loading || checking) return <div className="min-h-screen flex items-center justify-center"><div className="spinner" /></div>;
  if (!user) { navigate('/auth'); return null; }
  if (!isAdmin) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="max-w-md">
        <CardContent className="p-8 text-center">
          <Shield className="mx-auto h-12 w-12 text-destructive mb-4" />
          <h2 className="text-xl font-bold text-foreground mb-2">Access Denied</h2>
          <p className="text-muted-foreground text-sm mb-4">You don't have admin privileges.</p>
          <Button variant="outline" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Tool
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  const totalExports = exports.length;
  const blockedUsers = profiles.filter(p => p.is_blocked).length;
  const blockedDevices = devices.filter(d => d.is_blocked).length;

  const accessModeLabel = (mode: string) => {
    switch (mode) {
      case 'exports': return { label: 'By Exports', icon: <Hash className="h-3 w-3" />, color: 'secondary' as const };
      case 'days': return { label: 'By Days', icon: <Calendar className="h-3 w-3" />, color: 'default' as const };
      case 'both': return { label: 'Both', icon: <Clock className="h-3 w-3" />, color: 'outline' as const };
      default: return { label: mode, icon: null, color: 'secondary' as const };
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-[1200px] mx-auto">
        {/* Header */}
        <div className="gradient-header text-primary-foreground p-5 rounded-t-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6" />
            <div>
              <h1 className="text-lg font-bold">Admin Dashboard</h1>
              <p className="text-xs opacity-80">Manage users, exports, and devices</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="text-primary-foreground hover:bg-white/20" onClick={syncToSheets} disabled={syncing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Syncing…' : 'Sync to Sheets'}
            </Button>
            <Button variant="ghost" className="text-primary-foreground hover:bg-white/20" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Tool
            </Button>
          </div>
        </div>

        <div className="bg-card rounded-b-xl p-5 md:p-8 shadow-lg border border-border border-t-0">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card><CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-primary">{profiles.length}</div>
              <div className="text-xs text-muted-foreground">Total Users</div>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-primary">{totalExports}</div>
              <div className="text-xs text-muted-foreground">Total Exports</div>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-destructive">{blockedUsers}</div>
              <div className="text-xs text-muted-foreground">Blocked Users</div>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-destructive">{blockedDevices}</div>
              <div className="text-xs text-muted-foreground">Blocked Devices</div>
            </CardContent></Card>
          </div>

          <Tabs defaultValue="users">
            <TabsList className="mb-4">
              <TabsTrigger value="users"><Users className="h-4 w-4 mr-1" /> Users</TabsTrigger>
              <TabsTrigger value="exports"><FileDown className="h-4 w-4 mr-1" /> Exports</TabsTrigger>
              <TabsTrigger value="devices"><Fingerprint className="h-4 w-4 mr-1" /> Devices</TabsTrigger>
            </TabsList>

            {/* Users Tab */}
            <TabsContent value="users">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-secondary">
                      <th className="p-2 text-left border border-border text-xs">Name</th>
                      <th className="p-2 text-left border border-border text-xs">User ID</th>
                      <th className="p-2 text-left border border-border text-xs">Phone</th>
                      <th className="p-2 text-center border border-border text-xs">Access Mode</th>
                      <th className="p-2 text-center border border-border text-xs">Max Exports</th>
                      <th className="p-2 text-center border border-border text-xs">Expires</th>
                      <th className="p-2 text-center border border-border text-xs">Status</th>
                      <th className="p-2 text-center border border-border text-xs">Joined</th>
                      <th className="p-2 text-center border border-border text-xs">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profiles.map(p => {
                      const modeInfo = accessModeLabel(p.access_mode || 'exports');
                      return (
                        <tr key={p.id} className="hover:bg-muted/50">
                          <td className="p-2 border border-border font-medium">{p.full_name || '—'}</td>
                          <td className="p-2 border border-border text-xs font-mono text-muted-foreground">{p.user_id.slice(0, 8)}...</td>
                          <td className="p-2 border border-border text-xs">{p.phone || '—'}</td>
                          <td className="p-2 border border-border text-center">
                            {editingAccess === p.user_id ? (
                              <div className="flex flex-col items-center gap-1">
                                <select
                                  value={accessMode}
                                  onChange={e => setAccessMode(e.target.value)}
                                  className="text-xs border border-border rounded px-1 py-0.5 bg-background"
                                >
                                  <option value="exports">By Exports</option>
                                  <option value="days">By Days</option>
                                  <option value="both">Both</option>
                                </select>
                                {(accessMode === 'days' || accessMode === 'both') && (
                                  <Input
                                    type="datetime-local"
                                    value={accessExpiry}
                                    onChange={e => setAccessExpiry(e.target.value)}
                                    className="w-40 h-7 text-xs"
                                  />
                                )}
                                <div className="flex gap-1">
                                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => updateAccessMode(p.user_id)}>✓</Button>
                                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEditingAccess(null)}>✕</Button>
                                </div>
                              </div>
                            ) : (
                              <Badge
                                variant={modeInfo.color}
                                className="cursor-pointer gap-1"
                                onClick={() => {
                                  setEditingAccess(p.user_id);
                                  setAccessMode(p.access_mode || 'exports');
                                  setAccessExpiry(p.access_expires_at ? new Date(p.access_expires_at).toISOString().slice(0, 16) : '');
                                }}
                              >
                                {modeInfo.icon} {modeInfo.label}
                              </Badge>
                            )}
                          </td>
                          <td className="p-2 border border-border text-center">
                            {editingMax === p.user_id ? (
                              <div className="flex items-center gap-1 justify-center">
                                <Input type="number" value={maxVal} onChange={e => setMaxVal(e.target.value)} className="w-16 h-7 text-xs" />
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => updateMaxExports(p.user_id)}>✓</Button>
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditingMax(null)}>✕</Button>
                              </div>
                            ) : (
                              <span className="cursor-pointer hover:underline" onClick={() => { setEditingMax(p.user_id); setMaxVal(String(p.max_exports)); }}>
                                {p.max_exports}
                              </span>
                            )}
                          </td>
                          <td className="p-2 border border-border text-center text-xs text-muted-foreground">
                            {p.access_expires_at ? new Date(p.access_expires_at).toLocaleDateString() : '—'}
                          </td>
                          <td className="p-2 border border-border text-center">
                            <Badge variant={p.is_blocked ? 'destructive' : 'secondary'}>
                              {p.is_blocked ? 'Blocked' : 'Active'}
                            </Badge>
                          </td>
                          <td className="p-2 border border-border text-center text-xs text-muted-foreground">
                            {new Date(p.created_at).toLocaleDateString()}
                          </td>
                          <td className="p-2 border border-border text-center">
                            <Button size="sm" variant={p.is_blocked ? 'outline' : 'destructive'} className="h-7 text-xs" onClick={() => toggleUserBlock(p.user_id, p.is_blocked)}>
                              {p.is_blocked ? <><CheckCircle className="h-3 w-3 mr-1" /> Unblock</> : <><Ban className="h-3 w-3 mr-1" /> Block</>}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                    {profiles.length === 0 && (
                      <tr><td colSpan={9} className="p-8 text-center text-muted-foreground border border-border">No users yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            {/* Exports Tab */}
            <TabsContent value="exports">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-secondary">
                      <th className="p-2 text-left border border-border text-xs">Date</th>
                      <th className="p-2 text-left border border-border text-xs">User ID</th>
                      <th className="p-2 text-left border border-border text-xs">Type</th>
                      <th className="p-2 text-left border border-border text-xs">IP Address</th>
                      <th className="p-2 text-left border border-border text-xs">Fingerprint</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exports.map(e => (
                      <tr key={e.id} className="hover:bg-muted/50">
                        <td className="p-2 border border-border text-xs">{new Date(e.created_at).toLocaleString()}</td>
                        <td className="p-2 border border-border text-xs font-mono text-muted-foreground">{e.user_id.slice(0, 8)}...</td>
                        <td className="p-2 border border-border"><Badge variant="outline">{e.export_type}</Badge></td>
                        <td className="p-2 border border-border text-xs font-mono">{e.ip_address || '—'}</td>
                        <td className="p-2 border border-border text-xs font-mono text-muted-foreground">{e.device_fingerprint?.slice(0, 12) || '—'}...</td>
                      </tr>
                    ))}
                    {exports.length === 0 && (
                      <tr><td colSpan={5} className="p-8 text-center text-muted-foreground border border-border">No exports yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            {/* Devices Tab */}
            <TabsContent value="devices">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-secondary">
                      <th className="p-2 text-left border border-border text-xs">Fingerprint</th>
                      <th className="p-2 text-left border border-border text-xs">IP</th>
                      <th className="p-2 text-left border border-border text-xs">User ID</th>
                      <th className="p-2 text-center border border-border text-xs">Exports</th>
                      <th className="p-2 text-center border border-border text-xs">Status</th>
                      <th className="p-2 text-left border border-border text-xs">Last Seen</th>
                      <th className="p-2 text-center border border-border text-xs">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {devices.map(d => (
                      <tr key={d.id} className="hover:bg-muted/50">
                        <td className="p-2 border border-border text-xs font-mono">{d.fingerprint.slice(0, 16)}...</td>
                        <td className="p-2 border border-border text-xs font-mono">{d.ip_address || '—'}</td>
                        <td className="p-2 border border-border text-xs font-mono text-muted-foreground">{d.user_id?.slice(0, 8) || '—'}...</td>
                        <td className="p-2 border border-border text-center">
                          <Badge variant={d.export_count >= 15 ? 'destructive' : 'secondary'}>{d.export_count}</Badge>
                        </td>
                        <td className="p-2 border border-border text-center">
                          <Badge variant={d.is_blocked ? 'destructive' : 'secondary'}>
                            {d.is_blocked ? 'Blocked' : 'Active'}
                          </Badge>
                        </td>
                        <td className="p-2 border border-border text-xs text-muted-foreground">{new Date(d.last_seen_at).toLocaleString()}</td>
                        <td className="p-2 border border-border text-center">
                          <Button size="sm" variant={d.is_blocked ? 'outline' : 'destructive'} className="h-7 text-xs" onClick={() => toggleDeviceBlock(d.fingerprint, d.is_blocked)}>
                            {d.is_blocked ? <><CheckCircle className="h-3 w-3 mr-1" /> Unblock</> : <><Ban className="h-3 w-3 mr-1" /> Block</>}
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {devices.length === 0 && (
                      <tr><td colSpan={7} className="p-8 text-center text-muted-foreground border border-border">No devices tracked yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default Admin;
