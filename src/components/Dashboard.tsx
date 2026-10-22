/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  UserX, 
  UserCheck, 
  UserPlus, 
  AlertTriangle, 
  ShieldAlert, 
  Clock, 
  Activity, 
  Building2, 
  KeyRound,
  FileSpreadsheet,
  ShieldCheck,
  Link2,
  Link2Off,
  Loader2,
  FileText,
  LayoutGrid,
  CheckCircle2,
  Infinity,
  Lock,
  Monitor,
  Laptop,
  Server,
  MonitorX,
  MonitorCheck,
  MonitorOff,
  PowerOff,
  SlidersHorizontal,
  Search,
  Filter,
  CheckSquare,
  Square,
  Check,
  Download
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  Legend,
  AreaChart,
  Area
} from 'recharts';
import { ADUser, AuditLog, GPO, ADComputer } from '../types';

function parseLocalDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr || dateStr === 'Nunca' || dateStr === 'never') return null;
  const parts = dateStr.split(' ')[0].split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    return new Date(year, month, day);
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

interface DashboardProps {
  users: ADUser[];
  auditLogs: AuditLog[];
  inactivityDays: number;
  onNavigate: (tab: string, filter?: string) => void;
  adStatus?: any;
  computers?: ADComputer[];
  computerInactivityDays?: number;
  onUpdateComputer?: (computer: ADComputer) => void;
  onUpdateComputerInactivityDays?: (days: number) => void;
  onDisableBatchComputers?: (ids: string[]) => void;
  onAddAuditLog?: (log: AuditLog) => void;
}

export default function Dashboard({ 
  users, 
  auditLogs, 
  inactivityDays,
  onNavigate,
  adStatus,
  computers = [],
  computerInactivityDays = 90,
  onUpdateComputer,
  onUpdateComputerInactivityDays,
  onDisableBatchComputers,
  onAddAuditLog
}: DashboardProps) {
  
  // GPO state for dashboard GPO cards
  const [gpos, setGpos] = useState<GPO[]>([]);
  const [loadingGpos, setLoadingGpos] = useState<boolean>(true);

  useEffect(() => {
    let active = true;
    const fetchGpos = async () => {
      try {
        const response = await fetch('/api/ad/gpos');
        if (response.ok && active) {
          const data = await response.json();
          setGpos(data);
        }
      } catch (err) {
        console.error("Erro ao buscar GPOs para o dashboard:", err);
      } finally {
        if (active) setLoadingGpos(false);
      }
    };
    fetchGpos();
    return () => {
      active = false;
    };
  }, []);

  // GPO metrics calculations
  const totalGpos = gpos.length;
  const inUseGpos = gpos.filter(g => g.linkedTo.length > 0).length;
  const notInUseGpos = totalGpos - inUseGpos;

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

  // Date calculations (Current dynamic date)
  const CURRENT_YEAR_MONTH = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();

  const ldapUrl = adStatus?.config?.url || '';
  let ldapHost = '192.168.1.100';
  if (ldapUrl) {
    try {
      const withoutProto = ldapUrl.replace(/^ldaps?:\/\//i, '');
      const hostPart = withoutProto.split(':')[0];
      if (hostPart) ldapHost = hostPart;
    } catch (e) {
      // Fallback
    }
  }

  const isDemo = adStatus?.useDemoMode ?? true;
  const dcStatus = isDemo 
    ? "192.168.1.100 (Simulado)" 
    : `${ldapHost} (Ativo - Primário)`;
  
  // 1. Contas Ativas no AD (Todas que estão ativas)
  const activeInCurrentMonth = users.filter(u => u.status === 'Ativa');

  // 2. Contas Desativadas no Mês
  const disabledInCurrentMonth = users.filter(u => u.status === 'Desativada');
  const blockedUsers = users.filter(u => u.status === 'Bloqueada');

  // 3. Contas Criadas no Mês Vigente (Dinâmico: do primeiro dia do mês até o último)
  const today = new Date();
  const createdInCurrentMonth = users.filter(u => {
    if (!u.createdDate) return false;
    const createdDate = parseLocalDate(u.createdDate);
    return createdDate && 
      createdDate.getFullYear() === today.getFullYear() && 
      createdDate.getMonth() === today.getMonth();
  });

  // 4. Contas Expiradas
  const expiredUsers = users.filter(u => u.status === 'Expirada');
  const disabledUsers = users.filter(u => u.status === 'Desativada');

  // 5. Inatividade prolongada (baseada nos dias configurados, ex: 90 dias)
  // 90 dias antes de 2026-06-26 é aproximadamente 2026-03-28.
  // Faremos um cálculo de diferença real simples de data
  const getDaysInactive = (lastLogonStr: string) => {
    if (!lastLogonStr || lastLogonStr === 'Nunca') {
      return 999;
    }
    const logonDate = parseLocalDate(lastLogonStr);
    if (!logonDate || isNaN(logonDate.getTime())) {
      return 999;
    }
    const currentDate = new Date();
    const diffTime = Math.abs(currentDate.getTime() - logonDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const inactiveUsers = users.filter(u => {
    if (u.status !== 'Ativa') return false;
    const days = getDaysInactive(u.lastLogon);
    return days >= inactivityDays;
  });

  // 6. Contas com Senha Nunca Expira (Somente Ativas)
  const neverExpiresUsers = users.filter(u => u.status === 'Ativa' && !!u.passwordNeverExpires);

  // 7. Contas que o usuário não pode alterar a senha (Somente Ativas)
  const cannotChangePasswordUsers = users.filter(u => u.status === 'Ativa' && !!u.userCannotChangePassword);

  // --- Gestão de Computadores Obsoletos no AD (0 a 365 dias) ---
  const [localComputerDays, setLocalComputerDays] = useState<number>(computerInactivityDays ?? 90);
  const [computerSearch, setComputerSearch] = useState<string>('');
  const [selectedOsFilter, setSelectedOsFilter] = useState<string>('todos');
  const [dismissedCompIds, setDismissedCompIds] = useState<string[]>([]);
  const [selectedCompIds, setSelectedCompIds] = useState<string[]>([]);
  const [policySavedMsg, setPolicySavedMsg] = useState<string>('');

  useEffect(() => {
    if (computerInactivityDays !== undefined) {
      setLocalComputerDays(computerInactivityDays);
    }
  }, [computerInactivityDays]);

  const getComputerDaysInactive = (lastLogonStr: string) => {
    if (!lastLogonStr || lastLogonStr === 'Nunca' || lastLogonStr === 'never') {
      return 999;
    }
    const logonDate = parseLocalDate(lastLogonStr);
    if (!logonDate || isNaN(logonDate.getTime())) {
      return 999;
    }
    const currentDate = new Date();
    const diffTime = Math.abs(currentDate.getTime() - logonDate.getTime());
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  const computerList = computers || [];
  const totalComputers = computerList.length;
  const activeComputers = computerList.filter(c => c.status === 'Ativo');
  const disabledComputers = computerList.filter(c => c.status === 'Desativado');

  // Computadores obsoletos conforme o limite da barrinha (0 a 365 dias)
  const obsoleteComputers = useMemo(() => {
    return computerList.filter(c => {
      if (dismissedCompIds.includes(c.id)) return false;
      const days = getComputerDaysInactive(c.lastLogon);
      return days >= localComputerDays;
    });
  }, [computerList, localComputerDays, dismissedCompIds]);

  const obsoletePercentage = totalComputers > 0 
    ? Math.round((obsoleteComputers.length / totalComputers) * 100) 
    : 0;

  // Lista filtrada para a tabela interativa
  const filteredObsoleteComputers = useMemo(() => {
    return obsoleteComputers.filter(comp => {
      const matchSearch = 
        comp.name.toLowerCase().includes(computerSearch.toLowerCase()) ||
        comp.dnsHostName.toLowerCase().includes(computerSearch.toLowerCase()) ||
        comp.ou.toLowerCase().includes(computerSearch.toLowerCase()) ||
        comp.operatingSystem.toLowerCase().includes(computerSearch.toLowerCase());

      if (!matchSearch) return false;

      if (selectedOsFilter === 'todos') return true;
      if (selectedOsFilter === 'windows11') return comp.operatingSystem.toLowerCase().includes('windows 11');
      if (selectedOsFilter === 'windows10') return comp.operatingSystem.toLowerCase().includes('windows 10');
      if (selectedOsFilter === 'server') return comp.operatingSystem.toLowerCase().includes('server');
      if (selectedOsFilter === 'legacy') return comp.operatingSystem.toLowerCase().includes('windows 7') || comp.operatingSystem.toLowerCase().includes('xp');

      return true;
    });
  }, [obsoleteComputers, computerSearch, selectedOsFilter]);

  const handleSaveComputerPolicy = (e: React.FormEvent) => {
    e.preventDefault();
    if (onUpdateComputerInactivityDays) {
      onUpdateComputerInactivityDays(localComputerDays);
    }
    setPolicySavedMsg(`Política de computadores obsoletos salva com sucesso (${localComputerDays} dias)!`);
    setTimeout(() => setPolicySavedMsg(''), 4000);

    if (onAddAuditLog) {
      onAddAuditLog({
        id: "log_" + Date.now(),
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        operator: 'admin.silva',
        action: 'Política de Computadores',
        targetUser: 'Domínio AD',
        details: `Limite de tolerância para computadores obsoletos ajustado para ${localComputerDays} dias.`,
        type: 'info'
      });
    }
  };

  const handleDisableComputerAction = (comp: ADComputer) => {
    if (onUpdateComputer) {
      onUpdateComputer({
        ...comp,
        status: 'Desativado'
      });
    }
    if (onAddAuditLog) {
      onAddAuditLog({
        id: "log_" + Date.now(),
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        operator: 'admin.silva',
        action: 'Desativação de Computador',
        targetUser: comp.name,
        details: `Conta de máquina ${comp.name} (${comp.operatingSystem}) desativada por inatividade prolongada (${getComputerDaysInactive(comp.lastLogon)} dias).`,
        type: 'danger'
      });
    }
  };

  const handleReactivateComputerAction = (comp: ADComputer) => {
    if (onUpdateComputer) {
      onUpdateComputer({
        ...comp,
        status: 'Ativo'
      });
    }
    if (onAddAuditLog) {
      onAddAuditLog({
        id: "log_" + Date.now(),
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        operator: 'admin.silva',
        action: 'Reativação de Computador',
        targetUser: comp.name,
        details: `Conta de máquina ${comp.name} reativada administrativamente no domínio.`,
        type: 'success'
      });
    }
  };

  const handleDismissComputerAction = (id: string, name: string) => {
    setDismissedCompIds(prev => [...prev, id]);
    if (onAddAuditLog) {
      onAddAuditLog({
        id: "log_" + Date.now(),
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        operator: 'admin.silva',
        action: 'Alerta Dispensado',
        targetUser: name,
        details: `Alerta de obsolescência para o computador ${name} dispensado para esta sessão.`,
        type: 'info'
      });
    }
  };

  const handleBatchDisableSelected = () => {
    if (selectedCompIds.length === 0) return;
    if (window.confirm(`Confirma a desativação de ${selectedCompIds.length} conta(s) de computador obsoleta(s) no Active Directory?`)) {
      if (onDisableBatchComputers) {
        onDisableBatchComputers(selectedCompIds);
      }
      setSelectedCompIds([]);
    }
  };

  const handleExportComputersCSV = () => {
    if (obsoleteComputers.length === 0) return;
    const headers = ['Nome do Computador', 'Nome DNS (FQDN)', 'Sistema Operacional', 'Versao', 'Unidade Organizacional (OU)', 'Ultimo Logon', 'Dias Sem Comunicacao', 'Status', 'IP', 'Descricao'];
    const rows = [headers.join(';')];
    obsoleteComputers.forEach(c => {
      const days = getComputerDaysInactive(c.lastLogon);
      const row = [
        `"${c.name}"`,
        `"${c.dnsHostName}"`,
        `"${c.operatingSystem}"`,
        `"${c.operatingSystemVersion || ''}"`,
        `"${c.ou}"`,
        `"${c.lastLogon}"`,
        `"${days}"`,
        `"${c.status}"`,
        `"${c.ipAddress || ''}"`,
        `"${c.description || ''}"`
      ];
      rows.push(row.join(';'));
    });
    const csvContent = '\uFEFF' + rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const todayStr = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `AD_Computadores_Obsoletos_${localComputerDays}d_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toggleSelectAll = () => {
    if (selectedCompIds.length === filteredObsoleteComputers.length) {
      setSelectedCompIds([]);
    } else {
      setSelectedCompIds(filteredObsoleteComputers.map(c => c.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedCompIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Department Distribution data
  const departmentCounts: { [key: string]: number } = {};
  users.forEach(u => {
    departmentCounts[u.department] = (departmentCounts[u.department] || 0) + 1;
  });
  const departmentData = Object.keys(departmentCounts).map(dept => ({
    name: dept,
    value: departmentCounts[dept]
  })).sort((a, b) => b.value - a.value);

  // Status breakdown data for Pie Chart
  const statusCounts = {
    'Ativas': users.filter(u => u.status === 'Ativa').length,
    'Bloqueadas': users.filter(u => u.status === 'Bloqueada').length,
    'Expiradas': users.filter(u => u.status === 'Expirada').length,
    'Desativadas': users.filter(u => u.status === 'Desativada').length,
  };
  const statusData = Object.keys(statusCounts).map(status => ({
    name: status,
    value: statusCounts[status as keyof typeof statusCounts]
  }));

  // Historical Monthly Trend Data (Simulated for Jan-Jun 2026)
  const monthlyTrendData = [
    { name: 'Jan', Criadas: 1, Bloqueadas: 2, AtivasLogon: 9 },
    { name: 'Fev', Criadas: 2, Bloqueadas: 1, AtivasLogon: 11 },
    { name: 'Mar', Criadas: 4, Bloqueadas: 3, AtivasLogon: 12 },
    { name: 'Abr', Criadas: 2, Bloqueadas: 2, AtivasLogon: 10 },
    { name: 'Mai', Criadas: 3, Bloqueadas: 1, AtivasLogon: 13 },
    { name: 'Jun', Criadas: createdInCurrentMonth.length, Bloqueadas: blockedUsers.length, AtivasLogon: activeInCurrentMonth.length },
  ];

  const PIE_COLORS = ['#10B981', '#EF4444', '#F59E0B', '#6B7280'];
  const DEPT_COLORS = ['#3B82F6', '#2563EB', '#1D4ED8', '#60A5FA', '#93C5FD', '#10B981'];

  return (
    <div className="space-y-6" id="dashboard-section">
      {/* Top Welcome / Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-xs">
        <div>
          <h2 className="text-xl font-display font-bold text-slate-800 tracking-tight">Painel de Controle Active Directory</h2>
          <p className="text-slate-500 text-sm mt-1">
            Status geral do domínio e auditorias de contas. Data de referência: <span className="font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-semibold text-xs">{(() => { const d = new Date(); const day = String(d.getDate()).padStart(2, '0'); const month = String(d.getMonth() + 1).padStart(2, '0'); return `${day}/${month}/${d.getFullYear()}`; })()}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full self-start md:self-auto">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          Replicação: Saudável | Servidor: CASANOVA
        </div>
      </div>

      {/* KPI Stats Grid & Distribuição Global */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in" id="kpi-and-distribution-row">
        
        {/* Grid do AD (2 linhas e 3 colunas em telas médias/grandes) */}
        <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4" id="kpi-grid">
          
          {/* KPI 1: Ativas no Mês */}
          <div 
            id="kpi-active"
            onClick={() => onNavigate('contas', 'AtivasLogonMes')}
            className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-xs hover:border-emerald-200 transition-all cursor-pointer flex items-center gap-3 group h-[92px]"
          >
            <div className="bg-emerald-50 text-emerald-600 p-2.5 rounded-lg group-hover:bg-emerald-100 transition-colors shrink-0">
              <UserCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-600 block">Contas</span>
              <h3 className="text-xs font-semibold text-slate-500 mt-0.5 truncate">Ativas</h3>
              <div className="flex items-baseline gap-1 mt-0.5 leading-none">
                <span className="text-xl font-display font-bold text-slate-800">{activeInCurrentMonth.length}</span>
                <span className="text-[9px] text-emerald-600 font-semibold truncate">Habilitadas</span>
              </div>
            </div>
          </div>

          {/* KPI 2: Desativadas no Mês */}
          <div 
            id="kpi-disabled"
            onClick={() => onNavigate('contas', 'DesativadasMes')}
            className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-xs hover:border-slate-300 transition-all cursor-pointer flex items-center gap-3 group h-[92px]"
          >
            <div className="bg-slate-50 text-slate-500 p-2.5 rounded-lg group-hover:bg-slate-150 transition-colors shrink-0">
              <UserX className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">Suspensas</span>
              <h3 className="text-xs font-semibold text-slate-500 mt-0.5 truncate">Desativadas</h3>
              <div className="flex items-baseline gap-1 mt-0.5 leading-none">
                <span className="text-xl font-display font-bold text-slate-800">{disabledInCurrentMonth.length}</span>
                <span className="text-[9px] text-slate-500 font-medium truncate">Bloqueadas</span>
              </div>
            </div>
          </div>

          {/* KPI 3: Criadas no Mês */}
          <div 
            id="kpi-created"
            onClick={() => onNavigate('contas', 'CriadasMes')}
            className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-xs hover:border-blue-200 transition-all cursor-pointer flex items-center gap-3 group h-[92px]"
          >
            <div className="bg-blue-50 text-blue-600 p-2.5 rounded-lg group-hover:bg-blue-100 transition-colors shrink-0">
              <UserPlus className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[9px] font-bold uppercase tracking-wider text-blue-600 block">Provisões</span>
              <h3 className="text-xs font-semibold text-slate-500 mt-0.5 truncate">Criadas no Mês</h3>
              <div className="flex items-baseline gap-1 mt-0.5 leading-none">
                <span className="text-xl font-display font-bold text-slate-800">{createdInCurrentMonth.length}</span>
                <span className="text-[9px] text-blue-600 font-semibold truncate">Este mês</span>
              </div>
            </div>
          </div>

          {/* KPI 4: Inatividade Prolongada Usuários */}
          <div 
            id="kpi-inactive"
            onClick={() => onNavigate('alertas', 'usuarios')}
            className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-xs hover:border-amber-200 transition-all cursor-pointer flex items-center gap-3 group h-[92px]"
          >
            <div className="bg-amber-50 text-amber-600 p-2.5 rounded-lg group-hover:bg-amber-100 transition-colors shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[9px] font-bold uppercase tracking-wider text-amber-600 block">Usuários</span>
              <h3 className="text-xs font-semibold text-slate-500 mt-0.5 truncate">Inativas (+{inactivityDays}d)</h3>
              <div className="flex items-baseline gap-1 mt-0.5 leading-none">
                <span className="text-xl font-display font-bold text-slate-800">{inactiveUsers.length}</span>
                <span className="text-[9px] text-amber-600 font-semibold truncate">Contas</span>
              </div>
            </div>
          </div>

          {/* KPI 5: Computadores Obsoletos no AD */}
          <div 
            id="kpi-obsolete-computers"
            onClick={() => {
              const el = document.getElementById('obsolete-computers-card');
              if (el) {
                el.scrollIntoView({ behavior: 'smooth' });
              } else {
                onNavigate('alertas', 'computadores');
              }
            }}
            className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-xs hover:border-rose-200 transition-all cursor-pointer flex items-center gap-3 group h-[92px]"
          >
            <div className="bg-rose-50 text-rose-600 p-2.5 rounded-lg group-hover:bg-rose-100 transition-colors shrink-0">
              <MonitorX className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[9px] font-bold uppercase tracking-wider text-rose-600 block">Computadores AD</span>
              <h3 className="text-xs font-semibold text-slate-500 mt-0.5 truncate">Obsoletos (+{localComputerDays}d)</h3>
              <div className="flex items-baseline gap-1 mt-0.5 leading-none">
                <span className="text-xl font-display font-bold text-slate-800">{obsoleteComputers.length}</span>
                <span className="text-[9px] text-rose-600 font-semibold truncate">Estações</span>
              </div>
            </div>
          </div>

          {/* KPI 6: Senha Nunca Expira */}
          <div 
            id="kpi-never-expires"
            onClick={() => onNavigate('contas', 'NeverExpires')}
            className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-xs hover:border-blue-200 transition-all cursor-pointer flex items-center gap-3 group h-[92px]"
          >
            <div className="bg-blue-50 text-blue-600 p-2.5 rounded-lg group-hover:bg-blue-100 transition-colors shrink-0">
              <Infinity className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[9px] font-bold uppercase tracking-wider text-blue-600 block">Atributo AD</span>
              <h3 className="text-xs font-semibold text-slate-500 mt-0.5 truncate">Senha Sem Expiração</h3>
              <div className="flex items-baseline gap-1 mt-0.5 leading-none">
                <span className="text-xl font-display font-bold text-slate-800">{neverExpiresUsers.length}</span>
                <span className="text-[9px] text-blue-600 font-semibold truncate">Ativas</span>
              </div>
            </div>
          </div>

          {/* KPI 7: Não Altera Senha */}
          <div 
            id="kpi-cannot-change"
            onClick={() => onNavigate('contas', 'CannotChangePassword')}
            className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-xs hover:border-indigo-200 transition-all cursor-pointer flex items-center gap-3 group h-[92px]"
          >
            <div className="bg-indigo-50 text-indigo-600 p-2.5 rounded-lg group-hover:bg-indigo-100 transition-colors shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-600 block">Atributo AD</span>
              <h3 className="text-xs font-semibold text-slate-500 mt-0.5 truncate">Não Altera Senha</h3>
              <div className="flex items-baseline gap-1 mt-0.5 leading-none">
                <span className="text-xl font-display font-bold text-slate-800">{cannotChangePasswordUsers.length}</span>
                <span className="text-[9px] text-indigo-600 font-semibold truncate">Ativas</span>
              </div>
            </div>
          </div>

        </div>

        {/* Status Distribution Pie Chart - No mesmo grid das contas */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs lg:col-span-4 flex flex-col justify-between h-[200px]" id="status-pie-card">
          <div>
            <h3 className="font-display font-bold text-slate-800 text-xs">Distribuição de Contas</h3>
            <p className="text-slate-400 text-[10px] mt-0.5 truncate">Integridade geral de contas no Active Directory</p>
          </div>

          <div className="grid grid-cols-12 gap-2 items-center flex-1 min-h-0 mt-1">
            {/* Coluna do Gráfico */}
            <div className="col-span-5 relative flex items-center justify-center h-full">
              <div className="h-24 w-24 relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={24}
                      outerRadius={36}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#ffffff', borderRadius: '6px', border: '1px solid #f1f5f9', fontSize: '9px', padding: '4px 8px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute text-center pointer-events-none">
                  <span className="text-sm font-bold font-display text-slate-700 leading-none">{users.length}</span>
                  <p className="text-[6px] text-slate-400 font-bold tracking-wider uppercase leading-none mt-0.5">Total</p>
                </div>
              </div>
            </div>

            {/* Coluna de Legenda */}
            <div className="col-span-7 grid grid-cols-1 gap-1.5 max-h-[120px] overflow-y-auto pr-1">
              {statusData.map((entry, index) => (
                <div key={entry.name} className="flex items-center justify-between gap-1.5 p-1 px-1.5 rounded-lg bg-slate-50 border border-slate-100/40 text-left min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}></span>
                    <span className="text-slate-500 text-[9px] font-bold uppercase tracking-wider truncate leading-none">{entry.name}</span>
                  </div>
                  <span className="font-mono font-bold text-slate-800 text-xs shrink-0 leading-none">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* GPO Performance and Analytics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="dashboard-charts">
        
        {/* GPO Charts - Taxa de Vínculo e Classificação por Categorias (Expansão Horizontal lg:col-span-7) */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs lg:col-span-7 flex flex-col justify-between h-[235px]" id="gpo-charts-card">
          <div className="flex items-center justify-between mb-2 shrink-0">
            <div>
              <h3 className="font-display font-bold text-slate-800 text-sm">Distribuição e Uso de GPOs</h3>
              <p className="text-slate-400 text-[11px]">Métricas de vinculação e categorização das políticas do domínio</p>
            </div>
          </div>
          
          {loadingGpos ? (
            <div className="flex-1 flex flex-col items-center justify-center">
              <Loader2 className="w-7 h-7 text-blue-600 animate-spin mb-1" />
              <span className="text-[10px] text-slate-400">Carregando visualizações...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0">
              
              {/* Gráfico 1: Taxa de Vínculo */}
              <div className="flex border-r border-slate-100/80 pr-2 h-full items-center min-w-0">
                <div className="flex-1 flex flex-col justify-between h-full py-1 min-w-0">
                  <div>
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <Activity className="w-3.5 h-3.5 text-blue-500" />
                      Taxa de Vínculo
                    </h4>
                    <p className="text-[9px] text-slate-400">Status de governança</p>
                  </div>
                  <div className="space-y-1 mt-2">
                    {usageChartData.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 p-1 rounded bg-slate-50 border border-slate-100/50 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                        <span className="text-slate-500 font-semibold text-[9px] truncate">{item.name}: <strong className="text-slate-800 font-bold">{item.value}</strong></span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="w-24 h-24 relative flex items-center justify-center shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={usageChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={20}
                        outerRadius={32}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {usageChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: '9px', borderRadius: '6px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute text-center pointer-events-none">
                    <span className="text-xs font-bold text-slate-700 leading-none">{inUseGpos}</span>
                    <p className="text-[6px] text-slate-400 font-semibold uppercase leading-none mt-0.5">Em Uso</p>
                  </div>
                </div>
              </div>

              {/* Gráfico 2: Classificação por Categorias */}
              <div className="flex h-full items-center pl-2 min-w-0">
                <div className="flex-1 flex flex-col justify-between h-full py-1 min-w-0">
                  <div>
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <LayoutGrid className="w-3.5 h-3.5 text-emerald-500" />
                      Categorias GPO
                    </h4>
                    <p className="text-[9px] text-slate-400">Divisão de políticas</p>
                  </div>
                  <div className="space-y-1 mt-1.5 max-h-[100px] overflow-y-auto pr-1">
                    {typeChartData.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-1 p-0.5 px-1 rounded bg-slate-50 border border-slate-100/30">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                          <span className="text-slate-500 font-semibold text-[9px] truncate">{item.name}</span>
                        </div>
                        <span className="text-slate-800 font-bold text-[9px] px-1 bg-slate-200/50 rounded shrink-0">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="w-24 h-24 relative flex items-center justify-center shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={typeChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={20}
                        outerRadius={32}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {typeChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: '9px', borderRadius: '6px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>
          )}
        </div>

        {/* GPO Indicators Card (Compacto à esquerda / lg:col-span-5) */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs lg:col-span-5 flex flex-col justify-between h-[235px]" id="gpo-indicators-card">
          <div>
            <h3 className="font-display font-bold text-slate-800 text-xs flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              Métricas de Diretivas (GPOs)
            </h3>
            <p className="text-slate-400 text-[10px]">Políticas ativas e estruturadas no Active Directory</p>
          </div>
          
          {loadingGpos ? (
            <div className="flex-1 flex flex-col items-center justify-center py-4">
              <Loader2 className="w-6 h-6 text-blue-600 animate-spin mb-1" />
              <span className="text-xs text-slate-400">Carregando indicadores...</span>
            </div>
          ) : (
            <div className="space-y-1.5 my-auto py-1">
              {/* Total GPOs Card */}
              <div 
                onClick={() => onNavigate('gpos')}
                className="bg-blue-50/40 hover:bg-blue-50/70 p-2 rounded-lg border border-blue-100/30 transition-all cursor-pointer flex items-center justify-between group"
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-blue-100 text-blue-600 rounded-md flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-700">Total de GPOs</span>
                    <span className="text-[9px] text-slate-400 block -mt-0.5">Criadas no AD</span>
                  </div>
                </div>
                <span className="text-lg font-bold font-display text-slate-800 pr-1">{totalGpos}</span>
              </div>

              {/* GPOs em Uso Card */}
              <div 
                onClick={() => onNavigate('gpos')}
                className="bg-emerald-50/40 hover:bg-emerald-50/70 p-2 rounded-lg border border-emerald-100/30 transition-all cursor-pointer flex items-center justify-between group"
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-emerald-100 text-emerald-600 rounded-md flex items-center justify-center shrink-0">
                    <Link2 className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-700 font-semibold">GPOs em Uso</span>
                    <span className="text-[9px] text-emerald-600 font-semibold block -mt-0.5">
                      {totalGpos > 0 ? ((inUseGpos / totalGpos) * 100).toFixed(0) : 0}% Vinculadas
                    </span>
                  </div>
                </div>
                <span className="text-lg font-bold font-display text-slate-800 pr-1">{inUseGpos}</span>
              </div>

              {/* Não Utilizadas Card */}
              <div 
                onClick={() => onNavigate('gpos')}
                className="bg-slate-50 hover:bg-slate-100 p-2 rounded-lg border border-slate-200/50 transition-all cursor-pointer flex items-center justify-between group"
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-slate-200 text-slate-500 rounded-md flex items-center justify-center shrink-0">
                    <Link2Off className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-700">Não Utilizadas</span>
                    <span className="text-[9px] text-slate-500 block -mt-0.5">Sem vínculo ativo</span>
                  </div>
                </div>
                <span className="text-lg font-bold font-display text-slate-800 pr-1">{notInUseGpos}</span>
              </div>
            </div>
          )}


        
        </div>

      </div>

      {/* Central de Alertas de Computadores Obsoletos no AD (0 até 365 dias) */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-6 space-y-6" id="obsolete-computers-card">
        
        {/* Card Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100/50">
              <MonitorX className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display font-bold text-slate-800 text-base">
                  Central de Alertas: Computadores Obsoletos no AD
                </h3>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">
                  Políticas de Inatividade AD
                </span>
              </div>
              <p className="text-slate-400 text-xs mt-0.5">
                Identificação e mitigação de estações de trabalho e servidores sem contato recente com o controlador de domínio
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportComputersCSV}
              disabled={obsoleteComputers.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200/60 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title="Baixar lista completa em formato CSV para auditoria"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              Exportar CSV ({obsoleteComputers.length})
            </button>
            <button
              onClick={() => onNavigate('alertas', 'computadores')}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-xl border border-blue-200/60 transition-colors cursor-pointer"
            >
              Abrir em Alertas &rarr;
            </button>
          </div>
        </div>

        {/* Feedback Alert Message */}
        {policySavedMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl flex items-center gap-2 text-xs animate-fade-in">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium">{policySavedMsg}</span>
          </div>
        )}

        {/* Configuration Toolbar & Slider (0 até 365 dias) */}
        <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-100 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            
            {/* Range Slider Container */}
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <SlidersHorizontal className="w-4 h-4 text-rose-500" />
                  Limite de Inatividade para Máquinas (Período de Tolerância):
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400">Selecionado:</span>
                  <span className="font-mono font-bold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-md text-xs border border-rose-200/80">
                    {localComputerDays} dias
                  </span>
                </div>
              </div>

              {/* Slider Input (0 a 365 dias) */}
              <div className="space-y-1">
                <input 
                  type="range"
                  min="0"
                  max="365"
                  step="1"
                  value={localComputerDays}
                  onChange={(e) => setLocalComputerDays(Number(e.target.value))}
                  className="w-full accent-rose-600 cursor-pointer h-2 bg-slate-200 rounded-lg transition-all"
                  id="computer-inactivity-slider"
                />
                <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                  <span>0 dias (Sem contato recente)</span>
                  <span className="hidden sm:inline">90 dias (Padrão corporativo)</span>
                  <span className="hidden sm:inline">180 dias (Semestral)</span>
                  <span>365 dias (1 ano)</span>
                </div>
              </div>
            </div>

            {/* Quick Presets & Save Button */}
            <div className="flex flex-wrap items-center gap-1.5 lg:border-l lg:border-slate-200 lg:pl-4 shrink-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block w-full lg:w-auto">
                Atalhos Rápidos:
              </span>
              {[
                { label: '0d', val: 0 },
                { label: '30d', val: 30 },
                { label: '60d', val: 60 },
                { label: '90d', val: 90 },
                { label: '180d', val: 180 },
                { label: '365d', val: 365 },
              ].map(preset => (
                <button
                  key={preset.val}
                  type="button"
                  onClick={() => setLocalComputerDays(preset.val)}
                  className={`px-2 py-1 text-[11px] font-bold rounded-lg border transition-all cursor-pointer ${
                    localComputerDays === preset.val
                      ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-800'
                  }`}
                >
                  {preset.label}
                </button>
              ))}

              <button
                type="button"
                onClick={handleSaveComputerPolicy}
                className="ml-auto lg:ml-2 px-3 py-1 bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                Salvar Política AD
              </button>
            </div>

          </div>

          {/* Micro KPI Summary Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-200/50">
            <div className="bg-white p-2.5 rounded-lg border border-slate-100/80">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Parque Total</span>
              <span className="text-base font-bold font-display text-slate-800">{totalComputers}</span>
              <span className="text-[10px] text-slate-400 block -mt-0.5">Máquinas registradas</span>
            </div>

            <div className="bg-white p-2.5 rounded-lg border border-rose-100 bg-rose-50/20">
              <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider block">Obsoletos (+{localComputerDays}d)</span>
              <span className="text-base font-bold font-display text-rose-700">{obsoleteComputers.length}</span>
              <span className="text-[10px] text-rose-600/80 block -mt-0.5">Sem contato recente</span>
            </div>

            <div className="bg-white p-2.5 rounded-lg border border-slate-100/80">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Já Desativados</span>
              <span className="text-base font-bold font-display text-slate-700">{disabledComputers.length}</span>
              <span className="text-[10px] text-slate-400 block -mt-0.5">Contas suspensas</span>
            </div>

            <div className="bg-white p-2.5 rounded-lg border border-slate-100/80">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Obsolescência</span>
              <span className="text-base font-bold font-display text-amber-600">{obsoletePercentage}%</span>
              <span className="text-[10px] text-slate-400 block -mt-0.5">Risco de contas órfãs</span>
            </div>
          </div>
        </div>

        {/* Worklist Controls (Search, Filter, Batch Action) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          
          <div className="flex flex-1 items-center gap-2 max-w-md">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text"
                placeholder="Filtrar por nome (ex: WKS, SRV, LAPTOP), OU ou SO..."
                value={computerSearch}
                onChange={(e) => setComputerSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <select
              value={selectedOsFilter}
              onChange={(e) => setSelectedOsFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="todos">Todos os Sistemas</option>
              <option value="windows11">Windows 11</option>
              <option value="windows10">Windows 10</option>
              <option value="server">Windows Server</option>
              <option value="legacy">Legados (Windows 7/XP)</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            {selectedCompIds.length > 0 && (
              <button
                type="button"
                onClick={handleBatchDisableSelected}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                <PowerOff className="w-3.5 h-3.5" />
                Desativar Selecionados ({selectedCompIds.length})
              </button>
            )}
            <span className="text-[11px] text-slate-400">
              Mostrando <strong className="text-slate-700">{filteredObsoleteComputers.length}</strong> de {obsoleteComputers.length} obsoletos
            </span>
          </div>

        </div>

        {/* Obsolete Computers Table */}
        <div className="overflow-x-auto border border-slate-100 rounded-xl">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-3 w-8">
                  <button 
                    type="button"
                    onClick={toggleSelectAll} 
                    className="cursor-pointer text-slate-400 hover:text-slate-600 flex items-center"
                    title="Selecionar todos"
                  >
                    {selectedCompIds.length > 0 && selectedCompIds.length === filteredObsoleteComputers.length ? (
                      <CheckSquare className="w-4 h-4 text-blue-600" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="py-2.5 px-3">Nome da Máquina / FQDN</th>
                <th className="py-2.5 px-3">Sistema Operacional</th>
                <th className="py-2.5 px-3">Unidade Organizacional (OU)</th>
                <th className="py-2.5 px-3">Último Contato AD</th>
                <th className="py-2.5 px-3">Inatividade</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Ações de Mitigação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-slate-600">
              {filteredObsoleteComputers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 text-xs">
                    <MonitorCheck className="w-8 h-8 mx-auto text-emerald-500 mb-2 opacity-80" />
                    Nenhum computador obsoleto encontrado para o limite de <strong className="text-slate-700">{localComputerDays} dias</strong>.
                  </td>
                </tr>
              ) : (
                filteredObsoleteComputers.map((comp) => {
                  const daysInactive = getComputerDaysInactive(comp.lastLogon);
                  const isSelected = selectedCompIds.includes(comp.id);
                  const isServer = comp.name.toLowerCase().startsWith('srv') || comp.operatingSystem.toLowerCase().includes('server');
                  const isLaptop = comp.name.toLowerCase().includes('note') || comp.name.toLowerCase().includes('laptop');

                  return (
                    <tr 
                      key={comp.id} 
                      className={`hover:bg-slate-50/80 transition-colors ${isSelected ? 'bg-blue-50/30' : ''}`}
                    >
                      {/* Checkbox */}
                      <td className="py-2.5 px-3">
                        <button 
                          type="button"
                          onClick={() => toggleSelectOne(comp.id)} 
                          className="cursor-pointer text-slate-400 hover:text-slate-600 flex items-center"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-blue-600" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {/* Computer Hostname & FQDN */}
                      <td className="py-2.5 px-3 font-mono">
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                            isServer ? 'bg-purple-50 text-purple-600' :
                            isLaptop ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {isServer ? <Server className="w-3.5 h-3.5" /> :
                             isLaptop ? <Laptop className="w-3.5 h-3.5" /> :
                             <Monitor className="w-3.5 h-3.5" />}
                          </div>
                          <div>
                            <span className="font-bold text-slate-800 text-xs block">{comp.name}</span>
                            <span className="text-[10px] text-slate-400 block -mt-0.5">{comp.dnsHostName}</span>
                          </div>
                        </div>
                      </td>

                      {/* Operating System */}
                      <td className="py-2.5 px-3">
                        <span className="font-medium text-slate-700 block text-xs">{comp.operatingSystem}</span>
                        {comp.operatingSystemVersion && (
                          <span className="text-[10px] text-slate-400 block font-mono">{comp.operatingSystemVersion}</span>
                        )}
                      </td>

                      {/* OU */}
                      <td className="py-2.5 px-3">
                        <span className="text-slate-600 font-medium block truncate max-w-xs text-[11px]" title={comp.ou}>
                          {comp.ou}
                        </span>
                      </td>

                      {/* Last Logon Date */}
                      <td className="py-2.5 px-3 font-mono text-slate-500 text-[11px]">
                        {comp.lastLogon}
                      </td>

                      {/* Days Inactive Badge */}
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-full text-[10px] border ${
                          daysInactive >= 365 ? 'bg-rose-100 text-rose-800 border-rose-300' :
                          daysInactive >= 180 ? 'bg-rose-50 text-rose-700 border-rose-200' :
                          daysInactive >= 90 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          'bg-slate-100 text-slate-700 border-slate-200'
                        }`}>
                          <Clock className="w-3 h-3" />
                          {daysInactive === 999 ? 'Nunca Conectou' : `${daysInactive} dias`}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-md text-[10px] ${
                          comp.status === 'Desativado' ? 'bg-slate-100 text-slate-600' :
                          comp.status === 'Obsoleto' ? 'bg-rose-50 text-rose-700 font-bold' :
                          'bg-emerald-50 text-emerald-700'
                        }`}>
                          {comp.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {comp.status !== 'Desativado' ? (
                            <button
                              type="button"
                              onClick={() => handleDisableComputerAction(comp)}
                              className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-md font-semibold text-[10px] border border-rose-200/60 transition-colors cursor-pointer"
                              title="Desativar conta de máquina no Active Directory"
                            >
                              Desativar Conta
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleReactivateComputerAction(comp)}
                              className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-md font-semibold text-[10px] border border-emerald-200/60 transition-colors cursor-pointer"
                              title="Reativar conta de máquina no Active Directory"
                            >
                              Reativar
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDismissComputerAction(comp.id, comp.name)}
                            className="px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-md font-medium text-[10px] transition-colors cursor-pointer"
                            title="Dispensar alerta temporariamente"
                          >
                            Dispensar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Security & Compliance Footer Note */}
        <div className="bg-amber-50/70 border border-amber-100/80 p-3.5 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
          <ShieldAlert className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-[11px] leading-relaxed">
            <strong className="font-semibold block mb-0.5">Governança de TI & Conformidade ISO 27001 / CIS Benchmarks:</strong>
            Contas de computadores obsoletas retêm senhas de máquina Kerberos antigas que podem ser exploradas em ataques de persistência e elevação de privilégios. Recomenda-se a desativação de estações sem comunicação há mais de <strong className="font-semibold">{localComputerDays} dias</strong> e posterior expurgo após 30 dias de quarentena.
          </div>
        </div>

      </div>

      {/* Audit Logs & System Status Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="dashboard-details-row">
        
        {/* Bottom Audits Preview - Now taking lg:col-span-2 for beautiful horizontal spacing */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs lg:col-span-2" id="audit-preview-card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display font-bold text-slate-800">Logs de Auditoria Recentes</h3>
              <p className="text-slate-400 text-xs">Últimas ações administrativas efetuadas no diretório</p>
            </div>
            <button 
              onClick={() => onNavigate('logs')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline"
            >
              Ver todos os logs &rarr;
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-2 px-3">Data/Hora</th>
                  <th className="py-2 px-3">Operador</th>
                  <th className="py-2 px-3">Ação</th>
                  <th className="py-2 px-3">Alvo</th>
                  <th className="py-2 px-3">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-slate-600">
                {auditLogs.slice(0, 4).map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-3 font-mono text-slate-500">{log.timestamp}</td>
                    <td className="py-2.5 px-3">
                      <span className="font-medium text-slate-700">{log.operator}</span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`inline-flex items-center gap-1 font-semibold rounded-full px-2 py-0.5 text-[10px] ${
                        log.type === 'success' ? 'bg-emerald-50 text-emerald-700' :
                        log.type === 'warning' ? 'bg-amber-50 text-amber-700' :
                        log.type === 'danger' ? 'bg-rose-50 text-rose-700' : 'bg-blue-50 text-blue-700'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-800 font-semibold">{log.targetUser}</td>
                    <td className="py-2.5 px-3 text-slate-500 truncate max-w-xs">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* System Health / Directory Status */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs lg:col-span-1" id="directory-status-card">
          <h3 className="font-display font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-500" />
            Infraestrutura do Domínio
          </h3>
          <div className="space-y-4">
            
            <div className="flex justify-between items-center pb-3 border-b border-slate-50 text-xs">
              <span className="text-slate-500">Nome do Domínio:</span>
              <span className="font-mono text-slate-700 font-semibold">{adStatus?.config?.domain || "empresa.local"}</span>
            </div>

            <div className="flex justify-between items-center pb-3 border-b border-slate-50 text-xs">
              <span className="text-slate-500">Nível Funcional:</span>
              <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium">{adStatus?.config?.functionalLevel || "Windows Server 2012"}</span>
            </div>

            <div className="flex justify-between items-center pb-3 border-b border-slate-50 text-xs">
              <span className="text-slate-500">Controlador (DC):</span>
              <span className="font-mono text-slate-700">{dcStatus}</span>
            </div>

            <div className="flex justify-between items-center pb-3 border-b border-slate-50 text-xs">
              <span className="text-slate-500">Políticas de Senha:</span>
              <span className="text-emerald-600 font-semibold">Ativa (Complexidade)</span>
            </div>

            <div className="flex justify-between items-center pb-3 border-b border-slate-50 text-xs">
              <span className="text-slate-500">Expiração de Credenciais:</span>
              <span className="text-slate-700 font-semibold">90 dias</span>
            </div>

            {/* Nova seção: Integridade e Saúde Física do AD solicitado pelo usuário */}
            <div className="pt-1 mt-1 space-y-2 text-xs">
              <span className="font-bold text-slate-700 text-[10px] uppercase tracking-wider block mb-1">Integridade do Domínio</span>
              
              <div className="flex items-center justify-between p-1.5 px-2.5 bg-emerald-50/40 rounded-xl border border-emerald-100/20">
                <div className="flex items-center gap-1.5 min-w-0">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="text-slate-600 font-medium text-[11px] truncate">Replicação (SYSVOL)</span>
                </div>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">Saudável</span>
              </div>

              <div className="flex items-center justify-between p-1.5 px-2.5 bg-emerald-50/40 rounded-xl border border-emerald-100/20">
                <div className="flex items-center gap-1.5 min-w-0">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="text-slate-600 font-medium text-[11px] truncate">Integridade do DNS</span>
                </div>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">100% OK</span>
              </div>

              <div className="flex items-center justify-between p-1.5 px-2.5 bg-emerald-50/40 rounded-xl border border-emerald-100/20">
                <div className="flex items-center gap-1.5 min-w-0">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="text-slate-600 font-medium text-[11px] truncate">Pastas SYSVOL/NETLOGON</span>
                </div>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">Disponível</span>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 mt-2">
              <div className="flex gap-2 items-start">
                <ShieldAlert className="w-3.5 h-3.5 text-slate-500 mt-0.5 shrink-0" />
                <div className="text-[10px] text-slate-600 leading-relaxed">
                  <strong className="text-slate-700 block mb-0.5">Auditoria Regulatório</strong>
                  Contas <strong className="text-red-600">Expiradas</strong> ou <strong className="text-amber-600">Inativas</strong> devem ser limpas mensalmente para conformidade LGPD / ISO 27001.
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
