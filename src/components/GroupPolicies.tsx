/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldCheck, 
  Search, 
  Download, 
  Link2, 
  Link2Off, 
  CheckCircle2, 
  XCircle, 
  FileText, 
  Settings, 
  TrendingUp,
  LayoutGrid,
  Info,
  Calendar,
  User,
  Activity,
  AlertTriangle,
  FolderTree,
  Loader2,
  RefreshCw,
  Eye,
  Lock,
  Plus,
  Trash2,
  Cpu,
  Wrench
} from 'lucide-react';
import { GPO } from '../types';
import { 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip 
} from 'recharts';

export interface GPOSetting {
  id: string;
  key: string;
  value: string;
  scope: 'Computador' | 'Usuário';
}

const getDefaultSettings = (gpoName: string, gpoId: string): GPOSetting[] => {
  const nameLower = gpoName.toLowerCase();
  
  if (nameLower.includes('default domain policy')) {
    return [
      { id: `${gpoId}-1`, key: 'MinPasswordLength', value: '14 caracteres', scope: 'Computador' },
      { id: `${gpoId}-2`, key: 'PasswordComplexity', value: 'Ativado (Complexity=1)', scope: 'Computador' },
      { id: `${gpoId}-3`, key: 'LockoutThreshold', value: '5 tentativas incorretas', scope: 'Computador' },
      { id: `${gpoId}-4`, key: 'LockoutDuration', value: '30 minutos', scope: 'Computador' },
    ];
  }
  if (nameLower.includes('domain controllers')) {
    return [
      { id: `${gpoId}-1`, key: 'AuditLogonEvents', value: 'Sucesso e Falha', scope: 'Computador' },
      { id: `${gpoId}-2`, key: 'AddUserRight', value: 'Administrators, Backup Operators', scope: 'Computador' },
      { id: `${gpoId}-3`, key: 'EnableLUA', value: 'Ativado (UAC)', scope: 'Computador' },
    ];
  }
  if (nameLower.includes('wsus')) {
    return [
      { id: `${gpoId}-1`, key: 'WsusServer', value: 'http://wsus01.empresa.local:8530', scope: 'Computador' },
      { id: `${gpoId}-2`, key: 'DetectionFrequency', value: '4 horas', scope: 'Computador' },
      { id: `${gpoId}-3`, key: 'AUOptions', value: '4 - Agendar Instalação Diária (03:00)', scope: 'Computador' },
    ];
  }
  if (nameLower.includes('usb') || nameLower.includes('remov')) {
    return [
      { id: `${gpoId}-1`, key: 'RemovableDiskDeny', value: 'Ativado (Bloqueado)', scope: 'Computador' },
      { id: `${gpoId}-2`, key: 'WpdDevicesDeny', value: 'Ativado (Bloqueado)', scope: 'Computador' },
    ];
  }
  if (nameLower.includes('impressora') || nameLower.includes('printer')) {
    return [
      { id: `${gpoId}-1`, key: 'PrinterPath', value: '\\\\impressora-vendas.empresa.local\\HP-Laser', scope: 'Usuário' },
      { id: `${gpoId}-2`, key: 'Action', value: 'Update', scope: 'Usuário' },
      { id: `${gpoId}-3`, key: 'AsDefault', value: 'Sim', scope: 'Usuário' },
    ];
  }
  if (nameLower.includes('rede') || nameLower.includes('unidade') || nameLower.includes('drive')) {
    return [
      { id: `${gpoId}-1`, key: 'DriveLetter', value: 'P:', scope: 'Usuário' },
      { id: `${gpoId}-2`, key: 'TargetPath', value: '\\\\servidor\\compartilhados\\publico', scope: 'Usuário' },
      { id: `${gpoId}-3`, key: 'Action', value: 'Create', scope: 'Usuário' },
    ];
  }
  if (nameLower.includes('configurações') || nameLower.includes('painel') || nameLower.includes('control panel')) {
    return [
      { id: `${gpoId}-1`, key: 'NoControlPanel', value: 'Ativado (1)', scope: 'Usuário' },
      { id: `${gpoId}-2`, key: 'SettingsVisibility', value: 'hide:all', scope: 'Usuário' },
    ];
  }
  if (nameLower.includes('script') || nameLower.includes('logon')) {
    return [
      { id: `${gpoId}-1`, key: 'ScriptPath', value: '\\\\empresa.local\\SysVol\\empresa.local\\scripts\\audit.ps1', scope: 'Usuário' },
      { id: `${gpoId}-2`, key: 'Parameters', value: '-NoProfile -ExecutionPolicy Bypass', scope: 'Usuário' },
    ];
  }
  if (nameLower.includes('onedrive')) {
    return [
      { id: `${gpoId}-1`, key: 'PreventPersonalOneDrive', value: 'Ativado (1)', scope: 'Computador' },
    ];
  }
  if (nameLower.includes('cmd') || nameLower.includes('powershell')) {
    return [
      { id: `${gpoId}-1`, key: 'DisableCMD', value: 'Ativado (2 - Impede execução de scripts .bat também)', scope: 'Usuário' },
    ];
  }
  if (nameLower.includes('papel') || nameLower.includes('wallpaper')) {
    return [
      { id: `${gpoId}-1`, key: 'WallpaperPath', value: '\\\\servidor\\publico\\wallpaper.jpg', scope: 'Usuário' },
      { id: `${gpoId}-2`, key: 'WallpaperStyle', value: 'Fill', scope: 'Usuário' },
    ];
  }
  
  return [
    { id: `${gpoId}-1`, key: 'GpoStatus', value: 'Aplicado', scope: 'Computador' },
  ];
};

export default function GroupPolicies() {
  // GPOs State (fetched from API)
  const [gpos, setGpos] = useState<GPO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search and Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterUsage, setFilterUsage] = useState<'all' | 'in-use' | 'not-in-use'>('all');
  const [selectedGpoId, setSelectedGpoId] = useState<string | null>(null);

  // GPO Configured Settings/Attributes State
  const [allSettings, setAllSettings] = useState<Record<string, GPOSetting[]>>(() => {
    const saved = localStorage.getItem('ad_gpo_settings_v1');
    return saved ? JSON.parse(saved) : {};
  });

  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newScope, setNewScope] = useState<'Computador' | 'Usuário'>('Computador');
  const [showAddForm, setShowAddForm] = useState(false);

  // Fetch GPOs from backend
  const fetchGpos = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/ad/gpos');
      if (!response.ok) {
        throw new Error(`Erro ao carregar diretivas: ${response.statusText}`);
      }
      const data = await response.json();
      setGpos(data);
      if (data.length > 0) {
        setSelectedGpoId(data[0].id);
      } else {
        setSelectedGpoId(null);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Erro inesperado ao buscar as diretivas de grupo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGpos();
  }, []);

  // Sync loaded GPOs with local storage settings, setting defaults if missing
  useEffect(() => {
    if (gpos.length > 0) {
      setAllSettings(prev => {
        let updated = false;
        const next = { ...prev };
        gpos.forEach(g => {
          if (!next[g.id]) {
            next[g.id] = getDefaultSettings(g.name, g.id);
            updated = true;
          }
        });
        if (updated) {
          localStorage.setItem('ad_gpo_settings_v1', JSON.stringify(next));
          return next;
        }
        return prev;
      });
    }
  }, [gpos]);

  const handleAddSetting = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGpoId || !newKey.trim() || !newValue.trim()) return;

    const newSetting: GPOSetting = {
      id: `${selectedGpoId}-${Date.now()}`,
      key: newKey.trim(),
      value: newValue.trim(),
      scope: newScope,
    };

    setAllSettings(prev => {
      const next = {
        ...prev,
        [selectedGpoId]: [...(prev[selectedGpoId] || []), newSetting]
      };
      localStorage.setItem('ad_gpo_settings_v1', JSON.stringify(next));
      return next;
    });

    // Reset form
    setNewKey('');
    setNewValue('');
    setShowAddForm(false);
  };

  const handleDeleteSetting = (settingId: string) => {
    if (!selectedGpoId) return;
    setAllSettings(prev => {
      const next = {
        ...prev,
        [selectedGpoId]: (prev[selectedGpoId] || []).filter(s => s.id !== settingId)
      };
      localStorage.setItem('ad_gpo_settings_v1', JSON.stringify(next));
      return next;
    });
  };

  // Selected GPO Object
  const selectedGpo = useMemo(() => {
    return gpos.find(g => g.id === selectedGpoId) || null;
  }, [gpos, selectedGpoId]);

  // Calculations for KPI Cards
  const totalGpos = gpos.length;
  const inUseGpos = gpos.filter(g => g.linkedTo.length > 0).length;
  const notInUseGpos = totalGpos - inUseGpos;
  const enforcedGpos = gpos.filter(g => g.enforced).length;

  // Filter GPOs based on query search and selectors
  const filteredGpos = useMemo(() => {
    return gpos.filter(g => {
      const matchesSearch = g.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            g.description.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesType = filterType === 'all' || g.gpoType === filterType;
      
      const matchesStatus = filterStatus === 'all' || g.status === filterStatus;
      
      const matchesUsage = filterUsage === 'all' || 
                           (filterUsage === 'in-use' && g.linkedTo.length > 0) ||
                           (filterUsage === 'not-in-use' && g.linkedTo.length === 0);

      return matchesSearch && matchesType && matchesStatus && matchesUsage;
    });
  }, [gpos, searchTerm, filterType, filterStatus, filterUsage]);

  // CSV Export of the current list of GPOs
  const handleExportCSV = () => {
    const headers = ['ID/GUID', 'Nome da GPO', 'Tipo de GPO', 'Status', 'GPO Imposta', 'Vinculos (OUs)', 'Ultima Modificacao', 'Autor', 'Descricao'];
    const csvRows = [headers.join(';')];

    filteredGpos.forEach(g => {
      const row = [
        `"${g.id}"`,
        `"${g.name}"`,
        `"${g.gpoType}"`,
        `"${g.status}"`,
        `"${g.enforced ? 'Sim' : 'Não'}"`,
        `"${g.linkedTo.join(' | ')}"`,
        `"${g.modifiedDate}"`,
        `"${g.author}"`,
        `"${g.description}"`
      ];
      csvRows.push(row.join(';'));
    });

    const csvContent = '\uFEFF' + csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `AD_Politicas_De_Grupo_GPO.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Chart Data Preparation ---

  // Chart 1: Usage Distribution
  const usageChartData = useMemo(() => {
    return [
      { name: 'Em Uso (Vinculadas)', value: inUseGpos, color: '#3b82f6' },
      { name: 'Não Utilizadas', value: notInUseGpos, color: '#94a3b8' }
    ];
  }, [inUseGpos, notInUseGpos]);

  // Chart 2: Type Distribution
  const typeChartData = useMemo(() => {
    const counts: Record<string, number> = {
      'Segurança': 0,
      'Preferências': 0,
      'Modelos Administrativos': 0,
      'Software': 0,
      'Scripts': 0
    };
    
    gpos.forEach(g => {
      if (counts[g.gpoType] !== undefined) {
        counts[g.gpoType] += 1;
      }
    });

    return Object.keys(counts).map(key => ({
      name: key,
      value: counts[key],
      color: key === 'Segurança' ? '#e11d48' :
             key === 'Preferências' ? '#10b981' :
             key === 'Modelos Administrativos' ? '#8b5cf6' :
             key === 'Software' ? '#f59e0b' : '#06b6d4'
    })).filter(item => item.value > 0);
  }, [gpos]);

  // Chart 3: GPO Link Breakdown (Detailed bar chart showing count of links)
  const gpoLinksBreakdownData = useMemo(() => {
    return gpos.map(g => ({
      name: g.name.length > 25 ? g.name.substring(0, 22) + '...' : g.name,
      vinculos: g.linkedTo.length,
      status: g.status
    })).sort((a, b) => b.vinculos - a.vinculos);
  }, [gpos]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-100 shadow-xs" id="gpo-loading">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
        <h3 className="text-sm font-bold text-slate-800">Carregando Políticas de Grupo</h3>
        <p className="text-slate-400 text-xs mt-1">Buscando diretivas reais diretamente no Sysvol do Active Directory...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-8 text-center flex flex-col items-center justify-center py-16" id="gpo-error">
        <AlertTriangle className="w-12 h-12 text-rose-500 mb-4 animate-bounce" />
        <h3 className="text-sm font-bold text-slate-800">Erro ao Carregar GPOs</h3>
        <p className="text-slate-500 text-xs mt-1 max-w-md leading-relaxed">{error}</p>
        <button 
          onClick={fetchGpos}
          className="mt-5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Tentar Novamente
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6" id="group-policies-section">
      
      {/* Read-Only Mode Banner */}
      <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-3xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-amber-900 leading-tight">Módulo de Leitura e Auditoria de GPOs</h4>
            <p className="text-[10.5px] text-amber-700 mt-0.5">As diretivas exibidas abaixo são carregadas diretamente do domínio. Modificações e criações são desativadas por segurança.</p>
          </div>
        </div>
        
        <button
          onClick={fetchGpos}
          className="text-[11px] font-bold text-amber-800 hover:text-amber-950 bg-white hover:bg-amber-100/50 px-2.5 py-1.5 rounded-lg border border-amber-200 flex items-center gap-1.5 self-start sm:self-auto cursor-pointer transition-all"
        >
          <RefreshCw className="w-3 h-3" />
          Sincronizar Sysvol
        </button>
      </div>
      
      {/* Visual Metric KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0 border border-blue-100">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total de GPOs</p>
            <h4 className="text-2xl font-bold font-display text-slate-800 mt-0.5">{totalGpos}</h4>
            <span className="text-[10px] text-slate-500">Mapeadas no AD</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center shrink-0 border border-emerald-100">
            <Link2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">GPOs em Uso</p>
            <h4 className="text-2xl font-bold font-display text-slate-800 mt-0.5">{inUseGpos}</h4>
            <span className="text-[10px] text-emerald-600 font-semibold">
              {totalGpos > 0 ? ((inUseGpos / totalGpos) * 100).toFixed(0) : 0}% Vinculadas a OUs
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-50 text-slate-500 rounded-xl flex items-center justify-center shrink-0 border border-slate-100">
            <Link2Off className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Não Utilizadas</p>
            <h4 className="text-2xl font-bold font-display text-slate-800 mt-0.5">{notInUseGpos}</h4>
            <span className="text-[10px] text-slate-500">Sem link ativo</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center shrink-0 border border-rose-100">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">GPOs Forçadas</p>
            <h4 className="text-2xl font-bold font-display text-slate-800 mt-0.5">{enforcedGpos}</h4>
            <span className="text-[10px] text-rose-600 font-semibold">Prevalecem sobre bloqueios</span>
          </div>
        </div>
      </div>

      {/* Graphical Dashboard Panel (Visualizations) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Chart 1: GPO usage donut */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex flex-col h-[280px]">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2 shrink-0">
            <Activity className="w-4 h-4 text-blue-500" />
            Taxa de Vínculo (Uso de GPOs)
          </h3>
          <div className="flex-1 min-h-0 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={usageChartData}
                  cx="50%"
                  cy="45%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {usageChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ fontSize: '11px', borderRadius: '8px', border: '1px solid #f1f5f9' }}
                />
              </PieChart>
            </ResponsiveContainer>
            
            {/* Center value overlay */}
            <div className="absolute top-[35%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
              <span className="text-2xl font-bold text-slate-800">{inUseGpos}</span>
              <span className="text-[10px] text-slate-400 block font-semibold">Em Uso</span>
            </div>
          </div>
          
          {/* Custom legend */}
          <div className="flex justify-center gap-4 text-xs mt-2 shrink-0">
            {usageChartData.map((item, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-slate-500 font-medium text-[11px]">{item.name} ({item.value})</span>
              </div>
            ))}
          </div>
        </div>

        {/* Chart 2: GPO types breakdown */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex flex-col h-[280px]">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2 shrink-0">
            <LayoutGrid className="w-4 h-4 text-emerald-500" />
            Classificação por Categorias
          </h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={typeChartData}
                  cx="50%"
                  cy="45%"
                  outerRadius={75}
                  dataKey="value"
                  label={({ name, value }) => `${name.substring(0,8)} (${value})`}
                  labelLine={false}
                >
                  {typeChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ fontSize: '11px', borderRadius: '8px', border: '1px solid #f1f5f9' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2 justify-center text-[10px] shrink-0 mt-1 max-h-[45px] overflow-y-auto">
            {typeChartData.map((item, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-slate-500 font-semibold">{item.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Chart 3: Links per GPO Bar Chart */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex flex-col h-[280px]">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-2 shrink-0">
            <TrendingUp className="w-4 h-4 text-purple-500" />
            Densidade de Vínculos por GPO
          </h3>
          <div className="flex-1 min-h-0 mt-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={gpoLinksBreakdownData.slice(0, 5)} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 9 }} stroke="#94a3b8" allowDecimals={false} />
                <Tooltip 
                  contentStyle={{ fontSize: '11px', borderRadius: '8px', border: '1px solid #f1f5f9' }}
                  cursor={{ fill: '#f8fafc' }}
                />
                <Bar dataKey="vinculos" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="OUs Vinculadas" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-center text-slate-400 mt-1 shrink-0">
            Mostrando as 5 políticas de maior distribuição no diretório
          </p>
        </div>

      </div>

      {/* Main Interactive Management Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Left Side: GPO List Workspace */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-xs flex flex-col min-h-[480px]">
          
          {/* Header Actions */}
          <div className="p-4 border-b border-slate-50 flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-blue-500" />
              <h2 className="text-sm font-bold text-slate-800">Políticas Ativas no Active Directory</h2>
            </div>

            <button
              onClick={handleExportCSV}
              className="text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all border border-slate-200 cursor-pointer self-end sm:self-auto"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar Lista (.CSV)
            </button>
          </div>

          {/* Search and Advanced Filter Tools */}
          <div className="p-4 bg-slate-50/60 border-b border-slate-50 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar GPOs por nome ou descrição..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full text-xs pl-9 pr-4 py-2 border border-slate-200 rounded-lg bg-white outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                className="text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white outline-none cursor-pointer"
              >
                <option value="all">Todos os Tipos</option>
                <option value="Segurança">Segurança</option>
                <option value="Preferências">Preferências</option>
                <option value="Modelos Administrativos">Modelos Adm.</option>
                <option value="Software">Software</option>
                <option value="Scripts">Scripts</option>
              </select>

              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white outline-none cursor-pointer"
              >
                <option value="all">Status (Todas)</option>
                <option value="Ativo">Ativas</option>
                <option value="Desativado">Desativadas</option>
              </select>

              <select
                value={filterUsage}
                onChange={e => setFilterUsage(e.target.value as any)}
                className="text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white outline-none cursor-pointer"
              >
                <option value="all">Vínculo (Todas)</option>
                <option value="in-use">Vinculadas (Em Uso)</option>
                <option value="not-in-use">Não Utilizadas</option>
              </select>
            </div>
          </div>

          {/* GPO List Table Grid */}
          <div className="flex-1 overflow-x-auto">
            {filteredGpos.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
                <AlertTriangle className="w-8 h-8 text-amber-500" />
                <span>Nenhuma política de grupo atende aos filtros aplicados.</span>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/30 text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-50">
                    <th className="py-3 px-4 font-semibold">Política / Diretiva de Grupo</th>
                    <th className="py-3 px-4 font-semibold">Categoria</th>
                    <th className="py-3 px-4 font-semibold text-center">Status</th>
                    <th className="py-3 px-4 font-semibold text-center">Uso / Vínculo</th>
                    <th className="py-3 px-4 font-semibold text-center">GPO Imposta</th>
                    <th className="py-3 px-4 font-semibold text-right">Auditoria</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredGpos.map((g) => (
                    <tr 
                      key={g.id} 
                      onClick={() => setSelectedGpoId(g.id)}
                      className={`cursor-pointer transition-colors ${
                        selectedGpoId === g.id ? 'bg-blue-50/30 font-medium' : 'hover:bg-slate-50/20'
                      }`}
                    >
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="font-semibold text-slate-800 text-xs truncate animate-fade-in" title={g.name}>
                          {g.name}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 truncate font-mono" title={g.id}>
                          {g.id}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 shrink-0">
                        <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          g.gpoType === 'Segurança' ? 'bg-rose-50 text-rose-700 border border-rose-100' :
                          g.gpoType === 'Preferências' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                          g.gpoType === 'Modelos Administrativos' ? 'bg-purple-50 text-purple-700 border border-purple-100' :
                          g.gpoType === 'Software' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                          'bg-cyan-50 text-cyan-700 border border-cyan-100'
                        }`}>
                          {g.gpoType}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {g.status === 'Ativo' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" /> Ativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full">
                            <XCircle className="w-3 h-3" /> Desativado
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {g.linkedTo.length > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">
                            <Link2 className="w-3 h-3" /> {g.linkedTo.length} {g.linkedTo.length === 1 ? 'Link' : 'Links'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">
                            <Link2Off className="w-3 h-3" /> Sem Link
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`text-[11px] font-bold ${g.enforced ? 'text-rose-600 bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded' : 'text-slate-400'}`}>
                          {g.enforced ? 'Sim (Forçada)' : 'Não'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          className="text-[11px] text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 ml-auto cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedGpoId(g.id);
                          }}
                        >
                          <Eye className="w-3.5 h-3.5" /> Analisar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Side: GPO Linked OUs & Detailed Properties */}
        <div className="xl:col-span-1 flex flex-col gap-4 animate-fade-in">
          
          {selectedGpo ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-5 flex flex-col min-h-[480px]">
              
              {/* Header Title with Icon */}
              <div className="flex items-start gap-3 border-b border-slate-50 pb-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  selectedGpo.gpoType === 'Segurança' ? 'bg-rose-50 text-rose-600 border border-rose-100' :
                  selectedGpo.gpoType === 'Preferências' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                  selectedGpo.gpoType === 'Modelos Administrativos' ? 'bg-purple-50 text-purple-600 border border-purple-100' :
                  'bg-blue-50 text-blue-600 border border-blue-100'
                }`}>
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-slate-800 text-sm tracking-tight leading-tight select-all">
                    {selectedGpo.name}
                  </h3>
                  <span className="text-[9px] text-slate-400 font-mono mt-1 block select-all">
                    GUID: {selectedGpo.id}
                  </span>
                </div>
              </div>

              {/* GPO properties */}
              <div className="my-4 flex flex-col gap-4 flex-1 overflow-y-auto pr-1">
                
                {/* Description */}
                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Info className="w-3 h-3 text-slate-400" /> Detalhes do Escopo
                  </h4>
                  <p className="text-xs text-slate-600 bg-slate-50/50 border border-slate-100 p-2.5 rounded-lg leading-relaxed select-all">
                    {selectedGpo.description}
                  </p>
                </div>

                {/* Properties list */}
                <div className="grid grid-cols-2 gap-3 bg-slate-50/20 p-2.5 rounded-xl border border-slate-100">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-semibold text-slate-400 uppercase">Status</span>
                    <span className={`text-xs font-bold ${selectedGpo.status === 'Ativo' ? 'text-emerald-600' : 'text-slate-500'}`}>
                      {selectedGpo.status}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-semibold text-slate-400 uppercase">Prevalência</span>
                    <span className={`text-xs font-bold ${selectedGpo.enforced ? 'text-rose-600' : 'text-slate-500'}`}>
                      {selectedGpo.enforced ? 'Forçado (Enforced)' : 'Herdada / Normal'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-semibold text-slate-400 uppercase flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" /> Sincronizada
                    </span>
                    <span className="text-xs text-slate-700 font-mono">
                      {selectedGpo.modifiedDate}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-semibold text-slate-400 uppercase flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-400" /> Dono Padrão
                    </span>
                    <span className="text-xs text-slate-700 truncate" title={selectedGpo.author}>
                      {selectedGpo.author.split('@')[0]}
                    </span>
                  </div>
                </div>

                {/* Configured GPO Settings and Attributes (Request) */}
                <div className="border-t border-slate-50 pt-3 flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <Cpu className="w-3 h-3 text-slate-400" /> Atributos e Configurações ({ (allSettings[selectedGpo.id] || []).length })
                    </h4>
                    <button
                      type="button"
                      onClick={() => setShowAddForm(!showAddForm)}
                      className="text-[10px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-md flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Plus className="w-2.5 h-2.5" />
                      {showAddForm ? 'Cancelar' : 'Configurar'}
                    </button>
                  </div>

                  {/* Add Attribute Form */}
                  {showAddForm && (
                    <form onSubmit={handleAddSetting} className="bg-slate-50/75 border border-slate-100 p-3 rounded-xl mb-3 flex flex-col gap-2.5 animate-fade-in">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                        <Wrench className="w-3 h-3" /> Nova Configuração / Diretiva
                      </div>
                      
                      <div className="grid grid-cols-1 gap-2">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Nome do Atributo / Diretiva</label>
                          <input
                            type="text"
                            required
                            placeholder="Ex: MinPasswordLength, RemovableDiskDeny"
                            value={newKey}
                            onChange={e => setNewKey(e.target.value)}
                            className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Valor Aplicado</label>
                          <input
                            type="text"
                            required
                            placeholder="Ex: 14, Ativado, http://wsus:8530"
                            value={newValue}
                            onChange={e => setNewValue(e.target.value)}
                            className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 mb-1">Escopo de Aplicação</label>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setNewScope('Computador')}
                              className={`flex-1 py-1 px-2 text-[10.5px] font-semibold rounded-md border text-center transition-all cursor-pointer ${
                                newScope === 'Computador'
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              Computador
                            </button>
                            <button
                              type="button"
                              onClick={() => setNewScope('Usuário')}
                              className={`flex-1 py-1 px-2 text-[10.5px] font-semibold rounded-md border text-center transition-all cursor-pointer ${
                                newScope === 'Usuário'
                                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              Usuário
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => setShowAddForm(false)}
                          className="px-2.5 py-1 text-[10.5px] font-bold text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer transition-colors"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="px-2.5 py-1 text-[10.5px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-md cursor-pointer flex items-center gap-1 transition-colors shadow-3xs"
                        >
                          <Plus className="w-3 h-3" /> Adicionar
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Settings / Attributes List */}
                  <div className="flex flex-col gap-1.5 max-h-[160px] overflow-y-auto pr-1 mb-2">
                    {!(allSettings[selectedGpo.id]) || allSettings[selectedGpo.id].length === 0 ? (
                      <div className="text-center py-4 bg-slate-50/50 border border-dashed border-slate-200 rounded-xl text-[10px] text-slate-400">
                        Nenhum atributo ou diretiva de máquina configurado para esta GPO.
                      </div>
                    ) : (
                      allSettings[selectedGpo.id].map((setting) => (
                        <div 
                          key={setting.id} 
                          className="group flex items-center justify-between p-2 rounded-lg border border-slate-100 bg-slate-50/40 hover:bg-slate-50/80 hover:border-slate-200 transition-all text-xs"
                        >
                          <div className="min-w-0 flex-1 pr-2">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-700 text-[11px] truncate select-all">{setting.key}</span>
                              <span className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                                setting.scope === 'Computador' 
                                  ? 'bg-blue-50 text-blue-600 border border-blue-100' 
                                  : 'bg-purple-50 text-purple-600 border border-purple-100'
                              }`}>
                                {setting.scope}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate select-all">{setting.value}</div>
                          </div>
                          
                          <button
                            type="button"
                            onClick={() => handleDeleteSetting(setting.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-md transition-all cursor-pointer shrink-0"
                            title="Remover Atributo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Linked OUs management */}
                <div className="border-t border-slate-50 pt-3 flex flex-col flex-1 min-h-[150px]">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1 shrink-0">
                    <FolderTree className="w-3 h-3 text-slate-400" /> Unidades Organizacionais Vinculadas ({selectedGpo.linkedTo.length})
                  </h4>
                  
                  {/* Active linked items */}
                  <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-1.5 min-h-0">
                    {selectedGpo.linkedTo.length === 0 ? (
                      <div className="flex-1 bg-slate-50/50 border border-dashed border-slate-200 rounded-lg p-6 text-center flex flex-col items-center justify-center gap-1.5">
                        <Link2Off className="w-6 h-6 text-slate-400" />
                        <span className="text-[11px] font-bold text-slate-500">GPO Órfã (Desvinculada)</span>
                        <span className="text-[10px] text-slate-400">Esta política de grupo não está associada a nenhuma OU ativa e não afeta usuários ou computadores.</span>
                      </div>
                    ) : (
                      selectedGpo.linkedTo.map((ou, idx) => (
                        <div 
                          key={idx} 
                          className="flex items-center justify-between p-2 rounded-lg border bg-blue-50/30 border-blue-100 text-blue-900 text-xs"
                        >
                          <span className="font-mono text-[10px] truncate select-all flex-1 pr-2" title={ou}>
                            {ou}
                          </span>
                          <span className="text-[9px] font-bold text-blue-700 bg-white px-1.5 py-0.5 rounded-full border border-blue-100 shadow-3xs shrink-0 flex items-center gap-1">
                            <Link2 className="w-2.5 h-2.5" /> Vinculada
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>

              {/* Status footer banner */}
              <div className="mt-auto bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex items-center gap-2 shrink-0">
                <Info className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-[10.5px] text-slate-500 leading-tight">
                  {selectedGpo.status === 'Ativo' && selectedGpo.linkedTo.length > 0 
                    ? `Esta GPO está em vigor para todos os objetos dentro de ${selectedGpo.linkedTo.length} OUs ou recipientes do AD.` 
                    : 'Esta política de grupo está desativada ou sem vínculos para ser aplicada no momento.'
                  }
                </span>
              </div>

            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-8 text-center flex flex-col items-center justify-center min-h-[480px]">
              <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-3">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-700">Nenhuma Diretiva Selecionada</h3>
              <p className="text-slate-400 text-xs mt-1 max-w-xs leading-relaxed">
                Escolha uma política na lista lateral para analisar seus detalhes e os recipientes do Active Directory vinculados a ela.
              </p>
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
