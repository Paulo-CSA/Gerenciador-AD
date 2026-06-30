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
  LayoutGrid
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
import { ADUser, AuditLog, GPO } from '../types';

interface DashboardProps {
  users: ADUser[];
  auditLogs: AuditLog[];
  inactivityDays: number;
  onNavigate: (tab: string, filter?: string) => void;
  adStatus?: any;
}

export default function Dashboard({ 
  users, 
  auditLogs, 
  inactivityDays,
  onNavigate,
  adStatus
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

  // 3. Contas Criadas no Mês Vigente (Dinâmico: do dia 1 até o dia atual)
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

  const createdInCurrentMonth = users.filter(u => {
    if (!u.createdDate) return false;
    const createdDate = new Date(u.createdDate);
    return createdDate >= startOfMonth && createdDate <= endOfToday;
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
    const logonDate = new Date(lastLogonStr);
    if (isNaN(logonDate.getTime())) {
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
          Replicação: Saudável | Servidor: DC-PRIMARY-01
        </div>
      </div>

      {/* KPI Stats Grid & Distribuição Global */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in" id="kpi-and-distribution-row">
        
        {/* Grid do AD (compacta e densa à esquerda) */}
        <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-3" id="kpi-grid">
          
          {/* KPI 1: Ativas no Mês */}
          <div 
            id="kpi-active"
            onClick={() => onNavigate('contas', 'AtivasLogonMes')}
            className="bg-white p-3 rounded-xl border border-slate-100 shadow-xs hover:border-emerald-200 transition-all cursor-pointer flex items-center gap-3 group h-[88px]"
          >
            <div className="bg-emerald-50 text-emerald-600 p-2.5 rounded-lg group-hover:bg-emerald-100 transition-colors shrink-0">
              <UserCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-600 block">Contas</span>
              <h3 className="text-xs font-semibold text-slate-500 mt-0.5 truncate">Ativas no Mês</h3>
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
            className="bg-white p-3 rounded-xl border border-slate-100 shadow-xs hover:border-slate-300 transition-all cursor-pointer flex items-center gap-3 group h-[88px]"
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
            className="bg-white p-3 rounded-xl border border-slate-100 shadow-xs hover:border-blue-200 transition-all cursor-pointer flex items-center gap-3 group h-[88px]"
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

          {/* KPI 4: Inatividade Prolongada */}
          <div 
            id="kpi-inactive"
            onClick={() => onNavigate('alertas')}
            className="bg-white p-3 rounded-xl border border-slate-100 shadow-xs hover:border-amber-200 transition-all cursor-pointer flex items-center gap-3 group h-[88px]"
          >
            <div className="bg-amber-50 text-amber-600 p-2.5 rounded-lg group-hover:bg-amber-100 transition-colors shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[9px] font-bold uppercase tracking-wider text-amber-600 block">Segurança</span>
              <h3 className="text-xs font-semibold text-slate-500 mt-0.5 truncate">Inativas (+{inactivityDays}d)</h3>
              <div className="flex items-baseline gap-1 mt-0.5 leading-none">
                <span className="text-xl font-display font-bold text-slate-800">{inactiveUsers.length}</span>
                <span className="text-[9px] text-amber-600 font-semibold truncate">Inativas</span>
              </div>
            </div>
          </div>

        </div>

        {/* Status Distribution Pie Chart - Expansão Horizontal com Legenda à Esquerda */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs lg:col-span-7 flex flex-col justify-between h-[188px]" id="status-pie-card">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 h-full items-center">
            
            {/* Coluna Esquerda: Título, Descrição e Legenda */}
            <div className="md:col-span-7 flex flex-col justify-between h-full py-0.5">
              <div>
                <h3 className="font-display font-bold text-slate-800 text-sm">Distribuição Global de Contas</h3>
                <p className="text-slate-400 text-[11px] mt-0.5">Visão consolidada da integridade do Active Directory</p>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {statusData.map((entry, index) => (
                  <div key={entry.name} className="flex items-center gap-2 p-1.5 rounded-lg bg-slate-50 border border-slate-100/40">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}></span>
                    <div className="truncate min-w-0">
                      <span className="text-slate-500 block text-[9px] font-semibold uppercase tracking-wider truncate leading-none">{entry.name}</span>
                      <span className="font-bold text-slate-800 text-xs mt-0.5 block leading-none">{entry.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Coluna Direita: Pie Chart com Valor Central */}
            <div className="md:col-span-5 h-full relative flex items-center justify-center min-h-[130px]">
              <div className="h-32 w-32 relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={30}
                      outerRadius={48}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #f1f5f9', fontSize: '10px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute text-center pointer-events-none">
                  <span className="text-lg font-bold font-display text-slate-700 leading-none">{users.length}</span>
                  <p className="text-[7px] text-slate-400 font-bold tracking-wider uppercase mt-0.5">Total</p>
                </div>
              </div>
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

          <div className="mt-1 pt-1.5 border-t border-slate-50 text-[10px] text-slate-500 flex items-center justify-between">
            <span>Acesse a aba GPOs para auditoria.</span>
            <button 
              onClick={() => onNavigate('gpos')} 
              className="text-blue-600 hover:text-blue-800 font-bold"
            >
              Ver Detalhes &rarr;
            </button>
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
              <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium">Windows Server 2022</span>
            </div>

            <div className="flex justify-between items-center pb-3 border-b border-slate-50 text-xs">
              <span className="text-slate-500">Controlador (DC):</span>
              <span className="font-mono text-slate-700">{dcStatus}</span>
            </div>

            <div className="flex justify-between items-center pb-3 border-b border-slate-50 text-xs">
              <span className="text-slate-500">Políticas de Senha:</span>
              <span className="text-emerald-600 font-semibold">Ativa (Requisitos de Complexidade)</span>
            </div>

            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500">Expiração de Credenciais:</span>
              <span className="text-slate-700 font-semibold">A cada 90 dias</span>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 mt-2">
              <div className="flex gap-2.5 items-start">
                <ShieldAlert className="w-4 h-4 text-slate-500 mt-0.5" />
                <div className="text-[11px] text-slate-600 leading-relaxed">
                  <strong className="text-slate-700 block mb-0.5">Auditoria Exigida</strong>
                  As contas do tipo <strong className="text-red-600">Expirada</strong> e <strong className="text-amber-600">Inativa</strong> devem ser catalogadas mensalmente e removidas dos grupos de privilégio conforme as diretrizes do marco regulatório da LGPD / ISO 27001.
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
