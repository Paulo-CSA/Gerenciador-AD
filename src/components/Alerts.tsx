/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  BellRing, 
  Settings, 
  Clock, 
  Mail, 
  ShieldAlert, 
  Check, 
  Lock, 
  AlertTriangle,
  UserX,
  XCircle,
  Sparkles,
  HelpCircle,
  Inbox,
  Download,
  Monitor,
  Laptop,
  Server,
  MonitorX,
  PowerOff,
  Users,
  Search,
  Filter,
  CheckSquare,
  Square,
  SlidersHorizontal
} from 'lucide-react';
import { ADUser, AuditLog, ADComputer } from '../types';

interface AlertsProps {
  users: ADUser[];
  onUpdateUser: (user: ADUser) => void;
  onAddAuditLog: (log: AuditLog) => void;
  inactivityDays: number;
  onUpdateInactivityDays: (days: number) => void;
  computers?: ADComputer[];
  computerInactivityDays?: number;
  onUpdateComputer?: (computer: ADComputer) => void;
  onUpdateComputerInactivityDays?: (days: number) => void;
  onDisableBatchComputers?: (ids: string[]) => void;
  initialSubTab?: 'usuarios' | 'computadores';
}

export default function Alerts({
  users,
  onUpdateUser,
  onAddAuditLog,
  inactivityDays,
  onUpdateInactivityDays,
  computers = [],
  computerInactivityDays = 90,
  onUpdateComputer,
  onUpdateComputerInactivityDays,
  onDisableBatchComputers,
  initialSubTab = 'usuarios'
}: AlertsProps) {
  // Navigation between User Alerts and Computer Alerts
  const [activeSubTab, setActiveSubTab] = useState<'usuarios' | 'computadores'>(initialSubTab);

  useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  // --- User Alert Settings State ---
  const [tempInactivityDays, setTempInactivityDays] = useState(inactivityDays);
  const [userSuccessMsg, setUserSuccessMsg] = useState('');
  const [dismissedUserIds, setDismissedUserIds] = useState<string[]>([]);

  useEffect(() => {
    setTempInactivityDays(inactivityDays);
  }, [inactivityDays]);

  // --- Computer Alert Settings State (0 a 365 dias) ---
  const [tempComputerDays, setTempComputerDays] = useState(computerInactivityDays);
  const [compSuccessMsg, setCompSuccessMsg] = useState('');
  const [dismissedCompIds, setDismissedCompIds] = useState<string[]>([]);
  const [compSearch, setCompSearch] = useState('');
  const [compOsFilter, setCompOsFilter] = useState('todos');
  const [selectedCompIds, setSelectedCompIds] = useState<string[]>([]);

  useEffect(() => {
    setTempComputerDays(computerInactivityDays);
  }, [computerInactivityDays]);

  // Calculate difference in days for users
  const getDaysInactive = (lastLogonStr: string) => {
    if (!lastLogonStr || lastLogonStr === 'Nunca') return 999;
    const logonDate = new Date(lastLogonStr);
    if (isNaN(logonDate.getTime())) return 999;
    const currentDate = new Date();
    const diffTime = Math.abs(currentDate.getTime() - logonDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  // Calculate difference in days for computers
  const getComputerDaysInactive = (lastLogonStr: string) => {
    if (!lastLogonStr || lastLogonStr === 'Nunca' || lastLogonStr === 'never' || lastLogonStr === '0') return 999;
    
    const cleanStr = String(lastLogonStr).trim();
    const datePart = cleanStr.split(' ')[0].split('T')[0];
    let logonDate: Date | null = null;
    
    const ymdParts = datePart.split('-');
    if (ymdParts.length === 3 && ymdParts[0].length === 4) {
      logonDate = new Date(parseInt(ymdParts[0], 10), parseInt(ymdParts[1], 10) - 1, parseInt(ymdParts[2], 10));
    } else {
      const slashParts = datePart.split('/');
      if (slashParts.length === 3) {
        if (slashParts[2].length === 4) {
          // DD/MM/YYYY
          logonDate = new Date(parseInt(slashParts[2], 10), parseInt(slashParts[1], 10) - 1, parseInt(slashParts[0], 10));
        } else if (slashParts[0].length === 4) {
          // YYYY/MM/DD
          logonDate = new Date(parseInt(slashParts[0], 10), parseInt(slashParts[1], 10) - 1, parseInt(slashParts[2], 10));
        }
      }
    }
    
    if (!logonDate || isNaN(logonDate.getTime())) {
      logonDate = new Date(cleanStr);
    }
    if (isNaN(logonDate.getTime())) return 999;
    
    const currentDate = new Date();
    const diffTime = currentDate.getTime() - logonDate.getTime();
    if (diffTime < 0) return 0;
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  // Filter inactive users
  const inactiveUsers = users.filter(user => {
    if (user.status !== 'Ativa') return false;
    if (dismissedUserIds.includes(user.id)) return false;
    const days = getDaysInactive(user.lastLogon);
    return days >= inactivityDays;
  });

  // Filter inactive / obsolete computers (calculates in real-time based on selected threshold)
  const inactiveComputers = useMemo(() => {
    return computers.filter(comp => {
      if (dismissedCompIds.includes(comp.id)) return false;
      const days = getComputerDaysInactive(comp.lastLogon);
      return days >= tempComputerDays;
    });
  }, [computers, tempComputerDays, dismissedCompIds]);

  // Filtered computers by search / OS
  const filteredComputers = useMemo(() => {
    return inactiveComputers.filter(comp => {
      const matchSearch = 
        comp.name.toLowerCase().includes(compSearch.toLowerCase()) ||
        comp.dnsHostName.toLowerCase().includes(compSearch.toLowerCase()) ||
        comp.ou.toLowerCase().includes(compSearch.toLowerCase()) ||
        comp.operatingSystem.toLowerCase().includes(compSearch.toLowerCase());

      if (!matchSearch) return false;

      if (compOsFilter === 'todos') return true;
      if (compOsFilter === 'windows11') return comp.operatingSystem.toLowerCase().includes('windows 11');
      if (compOsFilter === 'windows10') return comp.operatingSystem.toLowerCase().includes('windows 10');
      if (compOsFilter === 'server') return comp.operatingSystem.toLowerCase().includes('server');
      if (compOsFilter === 'legacy') return comp.operatingSystem.toLowerCase().includes('windows 7') || comp.operatingSystem.toLowerCase().includes('xp');

      return true;
    });
  }, [inactiveComputers, compSearch, compOsFilter]);

  // --- User Handlers ---
  const handleSaveUserSettings = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateInactivityDays(tempInactivityDays);
    setUserSuccessMsg('Configurações de políticas de inatividade de usuários salvas com sucesso!');
    setTimeout(() => setUserSuccessMsg(''), 4000);

    onAddAuditLog({
      id: Math.random().toString(),
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      operator: 'admin.silva',
      action: 'Alteração de Diretriz',
      targetUser: 'Sistema',
      details: `Limite de inatividade de contas configurado para ${tempInactivityDays} dias.`,
      type: 'info'
    });
  };

  const handleLockAccount = (user: ADUser) => {
    const updatedUser: ADUser = {
      ...user,
      status: 'Bloqueada'
    };
    onUpdateUser(updatedUser);

    onAddAuditLog({
      id: Math.random().toString(),
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      operator: 'Sistema (Alerta)',
      action: 'Bloqueio Automático',
      targetUser: user.username,
      details: `Conta bloqueada administrativamente por inatividade prolongada (${getDaysInactive(user.lastLogon)} dias sem logon no domínio).`,
      type: 'danger'
    });
  };

  const handleSendWarning = (user: ADUser) => {
    onAddAuditLog({
      id: Math.random().toString(),
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      operator: 'Sistema (E-mail)',
      action: 'Notificação Enviada',
      targetUser: user.username,
      details: `E-mail de aviso de expiração e inatividade enviado automaticamente para o endereço ${user.email}. Prazo de 7 dias para logon regular.`,
      type: 'warning'
    });
    alert(`E-mail de notificação enviado para ${user.email}. Solicitando logon nos próximos 7 dias.`);
  };

  const handleDismissUserAlert = (userId: string, userName: string) => {
    setDismissedUserIds(prev => [...prev, userId]);
    onAddAuditLog({
      id: Math.random().toString(),
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      operator: 'admin.silva',
      action: 'Alerta Dispensado',
      targetUser: userName,
      details: 'Alerta de inatividade dispensado manualmente pelo administrador. Usuário mantido ativo temporariamente.',
      type: 'info'
    });
  };

  const handleExportUserCSV = () => {
    if (inactiveUsers.length === 0) return;
    const headers = ['Nome Completo', 'Logon (sAMAccountName)', 'E-mail', 'Departamento', 'Cargo', 'Dias Inativo', 'Ultimo Logon'];
    const csvRows = [headers.join(';')];
    inactiveUsers.forEach(u => {
      const daysInactive = getDaysInactive(u.lastLogon);
      const row = [
        `"${u.name}"`,
        `"${u.username}"`,
        `"${u.email}"`,
        `"${u.department}"`,
        `"${u.title}"`,
        `"${daysInactive}"`,
        `"${u.lastLogon}"`
      ];
      csvRows.push(row.join(';'));
    });
    const csvContent = '\uFEFF' + csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const todayStr = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `AD_Alertas_Inatividade_${inactivityDays}d_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Computer Handlers ---
  const handleSaveComputerSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (onUpdateComputerInactivityDays) {
      onUpdateComputerInactivityDays(tempComputerDays);
    }
    setCompSuccessMsg(`Políticas de inatividade de computadores salvas (${tempComputerDays} dias)!`);
    setTimeout(() => setCompSuccessMsg(''), 4000);

    onAddAuditLog({
      id: Math.random().toString(),
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      operator: 'admin.silva',
      action: 'Política de Computadores',
      targetUser: 'Domínio AD',
      details: `Limite de inatividade de computadores configurado para ${tempComputerDays} dias.`,
      type: 'info'
    });
  };

  const handleDisableComputer = (comp: ADComputer) => {
    if (onUpdateComputer) {
      onUpdateComputer({
        ...comp,
        status: 'Desativado'
      });
    }
    onAddAuditLog({
      id: Math.random().toString(),
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      operator: 'admin.silva',
      action: 'Desativação de Computador',
      targetUser: comp.name,
      details: `Conta de máquina ${comp.name} desativada por inatividade (${getComputerDaysInactive(comp.lastLogon)} dias sem contato).`,
      type: 'danger'
    });
  };

  const handleReactivateComputer = (comp: ADComputer) => {
    if (onUpdateComputer) {
      onUpdateComputer({
        ...comp,
        status: 'Ativo'
      });
    }
    onAddAuditLog({
      id: Math.random().toString(),
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      operator: 'admin.silva',
      action: 'Reativação de Computador',
      targetUser: comp.name,
      details: `Conta de máquina ${comp.name} reativada administrativamente no domínio.`,
      type: 'success'
    });
  };

  const handleDismissCompAlert = (id: string, name: string) => {
    setDismissedCompIds(prev => [...prev, id]);
    onAddAuditLog({
      id: Math.random().toString(),
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      operator: 'admin.silva',
      action: 'Alerta Dispensado',
      targetUser: name,
      details: `Alerta de obsolescência para ${name} dispensado manualmente nesta sessão.`,
      type: 'info'
    });
  };

  const handleBatchDisableComps = () => {
    if (selectedCompIds.length === 0) return;
    if (window.confirm(`Confirma a desativação de ${selectedCompIds.length} computador(es) no Active Directory?`)) {
      if (onDisableBatchComputers) {
        onDisableBatchComputers(selectedCompIds);
      }
      setSelectedCompIds([]);
    }
  };

  const handleExportComputerCSV = () => {
    if (inactiveComputers.length === 0) return;
    const headers = ['Nome do Computador', 'Nome DNS (FQDN)', 'Sistema Operacional', 'Versao', 'Unidade Organizacional (OU)', 'Ultimo Logon', 'Dias Sem Comunicacao', 'Status', 'IP', 'Descricao'];
    const rows = [headers.join(';')];
    inactiveComputers.forEach(c => {
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
    link.setAttribute('download', `AD_Alertas_Computadores_${computerInactivityDays}d_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toggleSelectAllComps = () => {
    if (selectedCompIds.length === filteredComputers.length) {
      setSelectedCompIds([]);
    } else {
      setSelectedCompIds(filteredComputers.map(c => c.id));
    }
  };

  const toggleSelectOneComp = (id: string) => {
    setSelectedCompIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6 animate-fade-in" id="alerts-section">
      
      {/* Top Category Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-100 shadow-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveSubTab('usuarios')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'usuarios'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            Contas de Usuários ({inactiveUsers.length})
          </button>
          
          <button
            type="button"
            onClick={() => setActiveSubTab('computadores')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'computadores'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
            }`}
          >
            <MonitorX className="w-4 h-4" />
            Computadores Obsoletos ({inactiveComputers.length})
          </button>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium px-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          {activeSubTab === 'usuarios' ? (
            <span>Tolerância de Usuários: <strong className="font-mono text-slate-700">{inactivityDays} dias</strong></span>
          ) : (
            <span>Tolerância de Computadores: <strong className="font-mono text-slate-700">{computerInactivityDays} dias (0-365d)</strong></span>
          )}
        </div>
      </div>

      {/* VIEW 1: USUÁRIOS */}
      {activeSubTab === 'usuarios' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
          
          {/* Alert Rules & Config Sidebar (1 col) */}
          <div className="lg:col-span-1 bg-white p-5 rounded-2xl border border-slate-100 shadow-xs h-fit space-y-5" id="alerts-config">
            <h3 className="font-display font-bold text-slate-800 text-sm pb-3 border-b border-slate-100 flex items-center gap-2">
              <Settings className="w-4 h-4 text-blue-500" />
              Políticas de Inatividade AD
            </h3>

            <form onSubmit={handleSaveUserSettings} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="font-semibold text-slate-600 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    Limite de Inatividade
                  </label>
                  <span className="bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded font-mono">
                    {tempInactivityDays} dias
                  </span>
                </div>
                <input 
                  type="range" 
                  min="15" 
                  max="180" 
                  step="5"
                  className="w-full accent-blue-600 cursor-pointer h-1.5 bg-slate-100 rounded-lg"
                  value={tempInactivityDays}
                  onChange={(e) => setTempInactivityDays(Number(e.target.value))}
                />
                <span className="text-[10px] text-slate-400 block">
                  Contas de usuários sem logon no período estipulado serão sinalizadas para auditoria de segurança.
                </span>
              </div>

              {userSuccessMsg && (
                <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 p-3 rounded-xl flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <p className="text-[11px] leading-relaxed">{userSuccessMsg}</p>
                </div>
              )}

              <button 
                type="submit"
                className="w-full bg-slate-800 hover:bg-slate-900 text-white font-semibold py-2 px-3 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Salvar Políticas AD
              </button>
            </form>

            <div className="bg-amber-50 border border-amber-100 p-3.5 rounded-xl text-xs text-amber-800 space-y-1.5">
              <div className="flex gap-2 items-start">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="leading-relaxed text-[11px]">
                  <strong className="block mb-0.5">Segurança ISO 27001</strong>
                  A desativação automática de contas inativas é uma das principais exigências para auditoria de TI da ISO 27001 e conformidade regulatória para evitar vetores de "Contas Órfãs".
                </div>
              </div>
            </div>
          </div>

          {/* Flagged Accounts Work list (2 cols) */}
          <div className="lg:col-span-2 space-y-4" id="alerts-worklist">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <BellRing className="w-4 h-4 text-amber-500" />
                    <h3 className="font-display font-bold text-slate-800 text-sm">Alertas Ativos de Inatividade ({inactiveUsers.length})</h3>
                  </div>
                  <p className="text-slate-400 text-[11px]">Usuários com inatividade superior a <strong className="text-blue-600">{inactivityDays} dias</strong> que continuam com acesso autorizado</p>
                </div>
                
                <div className="flex items-center gap-2 self-start md:self-auto">
                  <button
                    onClick={handleExportUserCSV}
                    disabled={inactiveUsers.length === 0}
                    className="text-[11px] font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-colors border border-slate-200 cursor-pointer"
                    title="Exportar usuários inativos exibidos em CSV"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    Exportar CSV
                  </button>
                </div>
              </div>

              <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                {inactiveUsers.length > 0 ? (
                  inactiveUsers.map(user => {
                    const days = getDaysInactive(user.lastLogon);
                    return (
                      <div key={user.id} className="p-4 hover:bg-slate-50/80 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-xs uppercase shrink-0 border border-amber-100/50">
                            {user.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold text-slate-800 text-xs">{user.name}</h4>
                              <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1 rounded">@{user.username}</span>
                              <span className="bg-red-50 text-red-600 border border-red-100 font-bold px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {days} dias inativo
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap gap-x-3">
                              <span><strong>OU:</strong> {user.department}</span>
                              <span><strong>Cargo:</strong> {user.title}</span>
                              <span><strong>Último Logon:</strong> <span className="font-mono">{user.lastLogon}</span></span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 self-end md:self-auto shrink-0">
                          <button 
                            onClick={() => handleDismissUserAlert(user.id, user.name)}
                            className="text-slate-500 hover:text-slate-700 font-semibold px-2.5 py-1.5 rounded-lg text-[10px] hover:bg-slate-100 transition-colors cursor-pointer"
                            title="Dispensar alerta para este usuário"
                          >
                            Dispensar
                          </button>
                          <button 
                            onClick={() => handleSendWarning(user)}
                            className="bg-amber-50 hover:bg-amber-100 text-amber-700 font-semibold px-2.5 py-1.5 rounded-lg text-[10px] flex items-center gap-1 border border-amber-200/60 transition-colors cursor-pointer"
                            title="Enviar notificação formal de e-mail ao titular"
                          >
                            <Mail className="w-3 h-3" />
                            Enviar Alerta
                          </button>
                          <button 
                            onClick={() => handleLockAccount(user)}
                            className="bg-red-600 hover:bg-red-700 text-white font-semibold px-2.5 py-1.5 rounded-lg text-[10px] flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                            title="Bloquear conta do usuário no Active Directory"
                          >
                            <Lock className="w-3 h-3" />
                            Bloquear
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-12 text-center text-slate-400 bg-slate-50/50">
                    <div className="max-w-xs mx-auto space-y-2">
                      <div className="bg-emerald-50 text-emerald-600 p-3.5 rounded-full w-fit mx-auto border border-emerald-100">
                        <Check className="w-6 h-6" />
                      </div>
                      <h4 className="font-display font-semibold text-slate-700 text-xs">Zero Contas Inativas</h4>
                      <p className="text-[11px] text-slate-400">
                        Excelente! No momento, não há contas ativas com inatividade prolongada superior a {inactivityDays} dias de acordo com os critérios definidos.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* VIEW 2: COMPUTADORES OBSOLETOS (0 a 365 dias) */}
      {activeSubTab === 'computadores' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
          
          {/* Computer Alert Rules Sidebar (1 col) com barrinha de 0 até 365 dias */}
          <div className="lg:col-span-1 bg-white p-5 rounded-2xl border border-slate-100 shadow-xs h-fit space-y-5" id="computers-alerts-config">
            <h3 className="font-display font-bold text-slate-800 text-sm pb-3 border-b border-slate-100 flex items-center gap-2">
              <Settings className="w-4 h-4 text-rose-500" />
              Políticas de Inatividade AD - Computadores
            </h3>

            <form onSubmit={handleSaveComputerSettings} className="space-y-4 text-xs">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="font-semibold text-slate-600 flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-rose-500" />
                    Limite de Inatividade
                  </label>
                  <div className="flex items-center gap-1 bg-white border border-rose-300 rounded px-1.5 py-0.5">
                    <input 
                      type="number"
                      min="0"
                      max="365"
                      value={tempComputerDays}
                      onChange={(e) => {
                        const val = Math.min(365, Math.max(0, parseInt(e.target.value, 10) || 0));
                        setTempComputerDays(val);
                      }}
                      className="w-12 text-center font-mono font-bold text-rose-700 text-xs focus:outline-none"
                    />
                    <span className="text-[10px] font-bold text-rose-700">dias</span>
                  </div>
                </div>

                {/* Barrinha de 0 até 365 dias */}
                <input 
                  type="range" 
                  min="0" 
                  max="365" 
                  step="1"
                  className="w-full accent-rose-600 cursor-pointer h-2 bg-slate-100 rounded-lg"
                  value={tempComputerDays}
                  onChange={(e) => setTempComputerDays(Number(e.target.value))}
                />

                <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>0d (Sem contato)</span>
                  <span>90d (Padrão)</span>
                  <span>180d</span>
                  <span className="font-bold text-rose-600">240d</span>
                  <span>365d (1 ano)</span>
                </div>

                <div className="flex flex-wrap gap-1 pt-1">
                  {[0, 30, 60, 90, 120, 180, 240, 365].map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setTempComputerDays(d)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                        tempComputerDays === d
                          ? 'bg-rose-600 text-white border-rose-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {d}d
                    </button>
                  ))}
                </div>

                <span className="text-[10px] text-slate-400 block pt-1 leading-relaxed">
                  Estações e servidores sem comunicação por período superior a <strong className="text-slate-600">{tempComputerDays} dias</strong> serão sinalizados para desativação e auditoria.
                </span>
              </div>

              {compSuccessMsg && (
                <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 p-3 rounded-xl flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <p className="text-[11px] leading-relaxed">{compSuccessMsg}</p>
                </div>
              )}

              <button 
                type="submit"
                className="w-full bg-slate-800 hover:bg-slate-900 text-white font-semibold py-2 px-3 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Salvar Políticas AD
              </button>
            </form>

            <div className="bg-rose-50/70 border border-rose-100 p-3.5 rounded-xl text-xs text-rose-900 space-y-1.5">
              <div className="flex gap-2 items-start">
                <ShieldAlert className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                <div className="leading-relaxed text-[11px]">
                  <strong className="block mb-0.5">Segurança & Inventário CIS / ISO</strong>
                  Computadores obsoletos sem comunicação com o domínio deixam de receber atualizações de segurança e GPOs, gerando brechas críticas na rede.
                </div>
              </div>
            </div>
          </div>

          {/* Flagged Computers Work list (2 cols) */}
          <div className="lg:col-span-2 space-y-4" id="computers-alerts-worklist">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
              
              <div className="p-4 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <MonitorX className="w-4 h-4 text-rose-500" />
                    <h3 className="font-display font-bold text-slate-800 text-sm">
                      Computadores Obsoletos no Domínio ({inactiveComputers.length})
                    </h3>
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    Máquinas com inatividade superior a <strong className="text-rose-600">{computerInactivityDays} dias</strong>
                  </p>
                </div>
                
                <div className="flex items-center gap-2 self-start md:self-auto">
                  {selectedCompIds.length > 0 && (
                    <button
                      type="button"
                      onClick={handleBatchDisableComps}
                      className="text-[11px] font-semibold text-white bg-rose-600 hover:bg-rose-700 px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                    >
                      <PowerOff className="w-3 h-3" />
                      Desativar ({selectedCompIds.length})
                    </button>
                  )}
                  <button
                    onClick={handleExportComputerCSV}
                    disabled={inactiveComputers.length === 0}
                    className="text-[11px] font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-colors border border-slate-200 cursor-pointer"
                    title="Exportar computadores obsoletos em CSV"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    Exportar CSV
                  </button>
                </div>
              </div>

              {/* Toolbar */}
              <div className="p-3 bg-slate-50/50 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2.5">
                <div className="flex items-center gap-2 w-full sm:w-auto flex-1 max-w-sm">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar por nome, OU, SO..."
                      value={compSearch}
                      onChange={(e) => setCompSearch(e.target.value)}
                      className="w-full pl-8 pr-2.5 py-1 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-rose-500"
                    />
                  </div>
                  <select
                    value={compOsFilter}
                    onChange={(e) => setCompOsFilter(e.target.value)}
                    className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 font-medium"
                  >
                    <option value="todos">Todos SOs</option>
                    <option value="windows11">Windows 11</option>
                    <option value="windows10">Windows 10</option>
                    <option value="server">Servidores</option>
                    <option value="legacy">Legados</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-400 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={toggleSelectAllComps}
                    className="flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-800 cursor-pointer"
                  >
                    {selectedCompIds.length > 0 && selectedCompIds.length === filteredComputers.length ? (
                      <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                    ) : (
                      <Square className="w-3.5 h-3.5" />
                    )}
                    Selecionar todos
                  </button>
                </div>
              </div>

              {/* List / Table */}
              <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                {filteredComputers.length > 0 ? (
                  filteredComputers.map(comp => {
                    const days = getComputerDaysInactive(comp.lastLogon);
                    const isSelected = selectedCompIds.includes(comp.id);
                    const isServer = comp.name.toLowerCase().startsWith('srv') || comp.operatingSystem.toLowerCase().includes('server');
                    const isLaptop = comp.name.toLowerCase().includes('note') || comp.name.toLowerCase().includes('laptop');

                    return (
                      <div 
                        key={comp.id} 
                        className={`p-4 hover:bg-slate-50/80 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 ${isSelected ? 'bg-blue-50/30' : ''}`}
                      >
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            onClick={() => toggleSelectOneComp(comp.id)}
                            className="mt-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-blue-600" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>

                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                            isServer ? 'bg-purple-50 text-purple-600 border border-purple-100' :
                            isLaptop ? 'bg-blue-50 text-blue-600 border border-blue-100' :
                            'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}>
                            {isServer ? <Server className="w-4 h-4" /> :
                             isLaptop ? <Laptop className="w-4 h-4" /> :
                             <Monitor className="w-4 h-4" />}
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold text-slate-800 text-xs font-mono">{comp.name}</h4>
                              <span className="text-[10px] text-slate-400">({comp.operatingSystem})</span>
                              <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1 border ${
                                days >= 180 ? 'bg-red-50 text-red-600 border-red-100' : 'bg-amber-50 text-amber-700 border-amber-200'
                              }`}>
                                <Clock className="w-3 h-3" />
                                {days === 999 ? 'Nunca Conectou' : `${days} dias inativo`}
                              </span>
                              {comp.status === 'Desativado' && (
                                <span className="bg-slate-100 text-slate-600 font-semibold px-1.5 py-0.5 rounded text-[9px]">
                                  Desativado
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap gap-x-3">
                              <span><strong>OU:</strong> {comp.ou}</span>
                              <span><strong>FQDN:</strong> <span className="font-mono">{comp.dnsHostName}</span></span>
                              <span><strong>Último Contato:</strong> <span className="font-mono">{comp.lastLogon}</span></span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 self-end md:self-auto shrink-0">
                          <button 
                            type="button"
                            onClick={() => handleDismissCompAlert(comp.id, comp.name)}
                            className="text-slate-500 hover:text-slate-700 font-semibold px-2.5 py-1.5 rounded-lg text-[10px] hover:bg-slate-100 transition-colors cursor-pointer"
                            title="Dispensar alerta nesta sessão"
                          >
                            Dispensar
                          </button>
                          
                          {comp.status !== 'Desativado' ? (
                            <button 
                              type="button"
                              onClick={() => handleDisableComputer(comp)}
                              className="bg-rose-600 hover:bg-rose-700 text-white font-semibold px-2.5 py-1.5 rounded-lg text-[10px] flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                              title="Desativar conta de máquina no Active Directory"
                            >
                              <PowerOff className="w-3 h-3" />
                              Desativar Conta
                            </button>
                          ) : (
                            <button 
                              type="button"
                              onClick={() => handleReactivateComputer(comp)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-2.5 py-1.5 rounded-lg text-[10px] flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                              title="Reativar conta de máquina no Active Directory"
                            >
                              <Check className="w-3 h-3" />
                              Reativar
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-12 text-center text-slate-400 bg-slate-50/50">
                    <div className="max-w-xs mx-auto space-y-2">
                      <div className="bg-emerald-50 text-emerald-600 p-3.5 rounded-full w-fit mx-auto border border-emerald-100">
                        <Check className="w-6 h-6" />
                      </div>
                      <h4 className="font-display font-semibold text-slate-700 text-xs">Zero Computadores Obsoletos</h4>
                      <p className="text-[11px] text-slate-400">
                        Excelente! Não há computadores no domínio com tempo sem comunicação superior a {computerInactivityDays} dias.
                      </p>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>

        </div>
      )}

    </div>
  );
}
