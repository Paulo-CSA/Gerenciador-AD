/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
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
  FileSpreadsheet
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
import { ADUser, AuditLog } from '../types';

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
  
  // Date calculations (Current date 2026-06-26)
  const CURRENT_YEAR_MONTH = '2026-06';

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
  
  // 1. Contas Ativas no Mês Vigente (status = Ativa E lastLogon no mês vigente)
  const activeInCurrentMonth = users.filter(u => 
    u.status === 'Ativa' && u.lastLogon.startsWith(CURRENT_YEAR_MONTH)
  );

  // 2. Contas Desativadas no Mês
  const disabledInCurrentMonth = users.filter(u => u.status === 'Desativada');
  const blockedUsers = users.filter(u => u.status === 'Bloqueada');

  // 3. Contas Criadas no Mês Vigente
  const createdInCurrentMonth = users.filter(u => 
    u.createdDate.startsWith(CURRENT_YEAR_MONTH)
  );

  // 4. Contas Expiradas
  const expiredUsers = users.filter(u => u.status === 'Expirada');
  const disabledUsers = users.filter(u => u.status === 'Desativada');

  // 5. Inatividade prolongada (baseada nos dias configurados, ex: 90 dias)
  // 90 dias antes de 2026-06-26 é aproximadamente 2026-03-28.
  // Faremos um cálculo de diferença real simples de data
  const getDaysInactive = (lastLogonStr: string) => {
    const logonDate = new Date(lastLogonStr);
    const currentDate = new Date('2026-06-26');
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
            Status geral do domínio e auditorias de contas. Data de referência: <span className="font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-semibold text-xs">26/06/2026</span>
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full self-start md:self-auto">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          Replicação: Saudável | Servidor: DC-PRIMARY-01
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="kpi-grid">
        
        {/* KPI 1: Ativas no Mês */}
        <div 
          id="kpi-active"
          onClick={() => onNavigate('contas', 'AtivasLogonMes')}
          className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs hover:border-emerald-200 transition-all cursor-pointer group"
        >
          <div className="flex justify-between items-start">
            <div className="bg-emerald-50 text-emerald-600 p-3 rounded-xl group-hover:bg-emerald-100 transition-colors">
              <UserCheck className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
              Mês Vigente
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-sm font-medium text-slate-500">Contas Ativas no Mês</h3>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-display font-bold text-slate-800">{activeInCurrentMonth.length}</span>
              <span className="text-xs font-semibold text-emerald-600 flex items-center">
                +{((activeInCurrentMonth.length / (users.filter(u => u.status === 'Ativa').length || 1)) * 100).toFixed(0)}% do total
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-2">Logon efetuado em Junho/2026</p>
          </div>
        </div>

        {/* KPI 2: Desativadas no Mês */}
        <div 
          id="kpi-disabled"
          onClick={() => onNavigate('contas', 'DesativadasMes')}
          className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs hover:border-slate-300 transition-all cursor-pointer group"
        >
          <div className="flex justify-between items-start">
            <div className="bg-slate-100 text-slate-600 p-3 rounded-xl group-hover:bg-slate-200 transition-colors">
              <UserX className="w-6 h-6" />
            </div>
            {disabledInCurrentMonth.length > 0 && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 bg-slate-200 px-2 py-0.5 rounded-full">
                Suspenso
              </span>
            )}
          </div>
          <div className="mt-4">
            <h3 className="text-sm font-medium text-slate-500">Contas Desativadas no Mês</h3>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-display font-bold text-slate-800">{disabledInCurrentMonth.length}</span>
              <span className="text-xs font-semibold text-slate-500">
                Acesso suspenso
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-2">Desativadas administrativamente</p>
          </div>
        </div>

        {/* KPI 3: Criadas no Mês */}
        <div 
          id="kpi-created"
          onClick={() => onNavigate('contas', 'CriadasMes')}
          className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs hover:border-blue-200 transition-all cursor-pointer group"
        >
          <div className="flex justify-between items-start">
            <div className="bg-blue-50 text-blue-600 p-3 rounded-xl group-hover:bg-blue-100 transition-colors">
              <UserPlus className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
              Novos Usuários
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-sm font-medium text-slate-500">Criadas no Mês</h3>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-display font-bold text-slate-800">{createdInCurrentMonth.length}</span>
              <span className="text-xs font-semibold text-blue-600">Provisões de Junho</span>
            </div>
            <p className="text-xs text-slate-400 mt-2">Integração de pessoal concluída</p>
          </div>
        </div>

        {/* KPI 4: Inatividade Prolongada */}
        <div 
          id="kpi-inactive"
          onClick={() => onNavigate('alertas')}
          className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs hover:border-amber-200 transition-all cursor-pointer group"
        >
          <div className="flex justify-between items-start">
            <div className="bg-amber-50 text-amber-600 p-3 rounded-xl group-hover:bg-amber-100 transition-colors">
              <Clock className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
              &gt; {inactivityDays} dias
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-sm font-medium text-slate-500">Inativas (+{inactivityDays}d)</h3>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-display font-bold text-slate-800">{inactiveUsers.length}</span>
              <span className="text-xs font-semibold text-amber-600">Risco de segurança</span>
            </div>
            <p className="text-xs text-slate-400 mt-2">Recomendado suspender acesso</p>
          </div>
        </div>

      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="dashboard-charts">
        
        {/* Trend Area Chart */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs lg:col-span-2" id="trend-chart-card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display font-bold text-slate-800">Histórico de Eventos de Contas</h3>
              <p className="text-slate-400 text-xs">Métricas consolidadas do último semestre</p>
            </div>
            <div className="flex gap-4 text-xs font-medium">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-blue-500 rounded-sm"></span>Logon Ativo</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-emerald-500 rounded-sm"></span>Criadas</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-rose-500 rounded-sm"></span>Bloqueadas</span>
            </div>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorAtivas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorCriadas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #f1f5f9', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }} 
                  labelClassName="font-bold text-slate-700"
                />
                <Area type="monotone" name="Ativas no Mês" dataKey="AtivasLogon" stroke="#3b82f6" strokeWidth={2.5} fillOpacity={1} fill="url(#colorAtivas)" />
                <Area type="monotone" name="Criadas" dataKey="Criadas" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorCriadas)" />
                <Area type="monotone" name="Bloqueadas" dataKey="Bloqueadas" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 4" fill="none" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Status Distribution Pie Chart */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs" id="status-pie-card">
          <div className="mb-4">
            <h3 className="font-display font-bold text-slate-800">Distribuição Global</h3>
            <p className="text-slate-400 text-xs">Divisão de todos os registros carregados no AD</p>
          </div>
          <div className="h-56 relative flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #f1f5f9' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute text-center">
              <span className="text-2xl font-bold font-display text-slate-700">{users.length}</span>
              <p className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase">Contas</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
            {statusData.map((entry, index) => (
              <div key={entry.name} className="flex items-center gap-2 p-1.5 rounded-lg bg-slate-50 border border-slate-100">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[index] }}></span>
                <div className="truncate">
                  <span className="text-slate-500 block text-[10px]">{entry.name}</span>
                  <span className="font-bold text-slate-800">{entry.value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Department Distribution & Domain Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="dashboard-details-row">
        
        {/* Department chart (2 cols) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs lg:col-span-2" id="department-bar-card">
          <div className="mb-4">
            <h3 className="font-display font-bold text-slate-800">Volume por Departamento</h3>
            <p className="text-slate-400 text-xs">Representação de contas por área de negócio</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={departmentData} layout="vertical" margin={{ top: 5, right: 10, left: 30, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" tickLine={false} axisLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} tick={{ fill: '#475569', fontSize: 11 }} width={120} />
                <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px' }} />
                <Bar dataKey="value" name="Quantidade" radius={[0, 4, 4, 0]} barSize={16}>
                  {departmentData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={DEPT_COLORS[index % DEPT_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* System Health / Directory Status */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs" id="directory-status-card">
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

      {/* Bottom Audits Preview */}
      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs" id="audit-preview-card">
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
    </div>
  );
}
