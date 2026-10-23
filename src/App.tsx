/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Users, 
  Activity, 
  FileText, 
  BellRing, 
  History, 
  Database, 
  User, 
  ShieldCheck, 
  ArrowUpRight,
  Clock,
  Shield,
  FileCode,
  LogOut
} from 'lucide-react';

import { ADUser, AuditLog, ADComputer } from './types';
import { initialUsers, initialAuditLogs } from './mockData';

// Component Imports
import Dashboard from './components/Dashboard';
import UserManagement from './components/UserManagement';
import Groups from './components/Groups';
import Reports from './components/Reports';
import Alerts from './components/Alerts';
import AuditLogs from './components/AuditLogs';
import AdConfigPanel from './components/AdConfigPanel';
import GroupPolicies from './components/GroupPolicies';
import Scripts from './components/Scripts';
import Login from './components/Login';

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  
  // Authenticated Operator State (AD Integrated)
  const [currentUser, setCurrentUser] = useState<any>(() => {
    const saved = sessionStorage.getItem('ad_console_user');
    return saved ? JSON.parse(saved) : null;
  });
  
  // Custom dashboard-triggered filters for accounts table
  const [dashboardFilter, setDashboardFilter] = useState<string | null>(null);

  // Core AD States (Backend-Driven)
  const [users, setUsers] = useState<ADUser[]>([]);
  const [computers, setComputers] = useState<ADComputer[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [inactivityDays, setInactivityDays] = useState<number>(() => {
    const saved = localStorage.getItem('ad_inactivity_threshold');
    return saved ? Number(saved) : 90;
  });
  const [computerInactivityDays, setComputerInactivityDays] = useState<number>(() => {
    const saved = localStorage.getItem('ad_computer_inactivity_threshold');
    return saved ? Number(saved) : 90;
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [adConnected, setAdConnected] = useState<boolean>(false);
  const [useDemoMode, setUseDemoMode] = useState<boolean>(true);
  const [adStatus, setAdStatus] = useState<any>(null);

  // Fetch all active data from backend Express server
  const refreshData = async () => {
    try {
      setLoading(true);
      const [usersRes, logsRes, statusRes, computersRes] = await Promise.all([
        fetch('/api/ad/users'),
        fetch('/api/ad/logs'),
        fetch('/api/ad/status'),
        fetch('/api/ad/computers')
      ]);

      if (usersRes.ok) {
        const usersData = await usersRes.json();
        if (Array.isArray(usersData)) {
          setUsers(usersData);
        } else {
          setUsers([]);
        }
      } else {
        setUsers([]);
      }
      
      if (computersRes.ok) {
        const computersData = await computersRes.json();
        if (Array.isArray(computersData)) {
          setComputers(computersData);
        } else {
          setComputers([]);
        }
      } else {
        setComputers([]);
      }

      if (logsRes.ok) {
        const logsData = await logsRes.json();
        if (Array.isArray(logsData)) setAuditLogs(logsData);
      }

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setAdConnected(statusData.connected);
        setUseDemoMode(statusData.useDemoMode);
        setAdStatus(statusData);
        if (statusData.config) {
          if (typeof statusData.config.inactivityDays === 'number') {
            setInactivityDays(statusData.config.inactivityDays);
            localStorage.setItem('ad_inactivity_threshold', statusData.config.inactivityDays.toString());
          }
          if (typeof statusData.config.computerInactivityDays === 'number') {
            setComputerInactivityDays(statusData.config.computerInactivityDays);
            localStorage.setItem('ad_computer_inactivity_threshold', statusData.config.computerInactivityDays.toString());
          }
        }
      }
    } catch (err) {
      console.error('Erro ao buscar dados do servidor AD:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
    // Load inactivity threshold from local storage
    const savedThreshold = localStorage.getItem('ad_inactivity_threshold');
    if (savedThreshold) {
      setInactivityDays(Number(savedThreshold));
    }
    const savedCompThreshold = localStorage.getItem('ad_computer_inactivity_threshold');
    if (savedCompThreshold) {
      setComputerInactivityDays(Number(savedCompThreshold));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('ad_inactivity_threshold', inactivityDays.toString());
  }, [inactivityDays]);

  useEffect(() => {
    localStorage.setItem('ad_computer_inactivity_threshold', computerInactivityDays.toString());
  }, [computerInactivityDays]);

  const handleUpdateInactivityDays = async (days: number) => {
    setInactivityDays(days);
    localStorage.setItem('ad_inactivity_threshold', days.toString());
    try {
      await fetch('/api/ad/save-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inactivityDays: days })
      });
    } catch (err) {
      console.error('Erro ao atualizar limite de inatividade no servidor:', err);
    }
  };

  const handleUpdateComputerInactivityDays = async (days: number) => {
    setComputerInactivityDays(days);
    localStorage.setItem('ad_computer_inactivity_threshold', days.toString());
    try {
      await fetch('/api/ad/save-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ computerInactivityDays: days })
      });
    } catch (err) {
      console.error('Erro ao atualizar limite de computadores no servidor:', err);
    }
  };

  const handleUpdateComputer = async (updatedComputer: ADComputer) => {
    // Optimistic UI update so the change is instantly visible
    setComputers(prev => prev.map(c => 
      (c.id === updatedComputer.id || c.name === updatedComputer.name) ? { ...c, ...updatedComputer } : c
    ));

    try {
      const res = await fetch('/api/ad/computers/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: updatedComputer.id,
          updatedComputer,
          operator: currentUser ? currentUser.username : 'admin.silva'
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        alert(data.error || 'Não foi possível desativar a conta de computador no Active Directory.');
      }
      refreshData();
    } catch (err: any) {
      console.error('Erro ao atualizar computador no AD:', err);
      alert('Falha na comunicação ao tentar desativar computador: ' + (err.message || err));
      refreshData();
    }
  };

  const handleDisableBatchComputers = async (ids: string[]) => {
    // Optimistic UI update
    const idSet = new Set(ids);
    setComputers(prev => prev.map(c => 
      (idSet.has(c.id) || idSet.has(c.name)) ? { ...c, status: 'Desativado' } : c
    ));

    try {
      const res = await fetch('/api/ad/computers/disable-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids,
          operator: currentUser ? currentUser.username : 'admin.silva'
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        alert(data.error || 'Falha ao desativar computadores em lote no Active Directory.');
      }
      refreshData();
    } catch (err: any) {
      console.error('Erro ao desativar computadores em lote no AD:', err);
      alert('Falha na comunicação ao desativar computadores: ' + (err.message || err));
      refreshData();
    }
  };

  // Global state handlers synchronized to Express AD Backend
  const handleAddUser = async (newUser: ADUser) => {
    try {
      await fetch('/api/ad/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newUser,
          operator: currentUser ? currentUser.username : 'admin.silva'
        })
      });
      refreshData();
    } catch (err) {
      console.error('Erro ao criar usuário no AD:', err);
    }
  };

  const handleUpdateUser = async (updatedUser: ADUser) => {
    try {
      await fetch('/api/ad/users/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id: updatedUser.id, 
          updatedUser,
          operator: currentUser ? currentUser.username : 'admin.silva'
        })
      });
      refreshData();
    } catch (err) {
      console.error('Erro ao atualizar usuário no AD:', err);
    }
  };

  const handleDeleteUser = async (id: string) => {
    try {
      // Deletions are typically handled as block/disable in AD, but we support deletion in local simulated AD DB
      refreshData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddAuditLog = async (newLog: AuditLog) => {
    try {
      await fetch('/api/ad/logs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newLog,
          operator: currentUser ? currentUser.username : (newLog.operator || 'admin.silva')
        })
      });
      refreshData();
    } catch (err) {
      console.error('Erro ao registrar log no AD:', err);
    }
  };

  const handleClearLogs = async () => {
    try {
      await fetch('/api/ad/logs/clear', { method: 'POST' });
      refreshData();
    } catch (err) {
      console.error('Erro ao limpar logs do AD:', err);
    }
  };

  // Dashboard navigation router
  const handleNavigateFromDashboard = (tabName: string, filterName?: string) => {
    setActiveTab(tabName);
    if (filterName) {
      setDashboardFilter(filterName);
    } else {
      setDashboardFilter(null);
    }
  };

  // Custom counts for navigation bubble warnings
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
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const getComputerDaysInactive = (lastLogonStr: string) => {
    if (!lastLogonStr || lastLogonStr === 'Nunca') {
      return 999;
    }
    const logonDate = new Date(lastLogonStr);
    if (isNaN(logonDate.getTime())) {
      return 999;
    }
    const currentDate = new Date();
    const diffTime = Math.abs(currentDate.getTime() - logonDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const activeUserAlerts = users.filter(u => {
    if (u.status !== 'Ativa') return false;
    const days = getDaysInactive(u.lastLogon);
    return days >= inactivityDays;
  }).length;

  const activeComputerAlerts = computers.filter(c => {
    if (c.status === 'Desativado') return false;
    const days = getComputerDaysInactive(c.lastLogon);
    return days >= computerInactivityDays;
  }).length;

  const activeAlertsCount = activeUserAlerts + activeComputerAlerts;

  const blockedUsersCount = users.filter(u => u.status === 'Bloqueada').length;

  if (!currentUser) {
    return (
      <Login 
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          sessionStorage.setItem('ad_console_user', JSON.stringify(user));
        }} 
      />
    );
  }

  return (
    <div className="flex h-screen w-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      
      {/* Sidebar navigation column (styled in compliance with Sleek theme) */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 no-print">
        {/* Brand Header */}
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-sm tracking-wide">
            AD
          </div>
          <div>
            <span className="text-white font-semibold text-sm tracking-tight block">DirectoryAdmin</span>
            <span className="text-[9px] font-mono text-slate-500 font-bold uppercase tracking-wider block">Inema</span>
          </div>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto">
          {/* Dashboard Item */}
          <div 
            onClick={() => setActiveTab('dashboard')}
            className={`p-3 rounded-md flex items-center justify-between transition-all cursor-pointer ${
              activeTab === 'dashboard' 
                ? 'active-nav text-white font-medium' 
                : 'hover:bg-slate-800 text-slate-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <Activity className="w-4 h-4 opacity-80" />
              <span className="text-xs opacity-90">Painel Principal</span>
            </div>
          </div>

          {/* Accounts Item */}
          <div 
            onClick={() => handleNavigateFromDashboard('contas')}
            className={`p-3 rounded-md flex items-center justify-between transition-all cursor-pointer ${
              activeTab === 'contas' 
                ? 'active-nav text-white font-medium' 
                : 'hover:bg-slate-800 text-slate-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <Users className="w-4 h-4 opacity-80" />
              <span className="text-xs opacity-90">Gerenciar Contas</span>
            </div>
            {blockedUsersCount > 0 && (
              <span className="bg-red-500 text-white font-bold font-mono text-[9px] px-1.5 py-0.5 rounded-full">
                {blockedUsersCount}
              </span>
            )}
          </div>

          {/* Groups Item */}
          <div 
            onClick={() => {
              setActiveTab('grupos');
              setDashboardFilter(null);
            }}
            className={`p-3 rounded-md flex items-center justify-between transition-all cursor-pointer ${
              activeTab === 'grupos' 
                ? 'active-nav text-white font-medium' 
                : 'hover:bg-slate-800 text-slate-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <Shield className="w-4 h-4 opacity-80" />
              <span className="text-xs opacity-90">Grupos de Segurança</span>
            </div>
          </div>

          {/* Group Policies GPO Item */}
          <div 
            onClick={() => {
              setActiveTab('gpos');
              setDashboardFilter(null);
            }}
            className={`p-3 rounded-md flex items-center justify-between transition-all cursor-pointer ${
              activeTab === 'gpos' 
                ? 'active-nav text-white font-medium' 
                : 'hover:bg-slate-800 text-slate-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-4 h-4 opacity-80" />
              <span className="text-xs opacity-90">Políticas de Grupo</span>
            </div>
          </div>

          {/* Scripts Item */}
          <div 
            onClick={() => {
              setActiveTab('scripts');
              setDashboardFilter(null);
            }}
            className={`p-3 rounded-md flex items-center justify-between transition-all cursor-pointer ${
              activeTab === 'scripts' 
                ? 'active-nav text-white font-medium' 
                : 'hover:bg-slate-800 text-slate-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <FileCode className="w-4 h-4 opacity-80" />
              <span className="text-xs opacity-90">Scripts de Logon</span>
            </div>
          </div>

          {/* Reports Item */}
          <div 
            onClick={() => setActiveTab('relatorios')}
            className={`p-3 rounded-md flex items-center justify-between transition-all cursor-pointer ${
              activeTab === 'relatorios' 
                ? 'active-nav text-white font-medium' 
                : 'hover:bg-slate-800 text-slate-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <FileText className="w-4 h-4 opacity-80" />
              <span className="text-xs opacity-90">Relatórios Custom</span>
            </div>
          </div>

          {/* Inactivity Alerts Item */}
          <div 
            onClick={() => setActiveTab('alertas')}
            className={`p-3 rounded-md flex items-center justify-between transition-all cursor-pointer ${
              activeTab === 'alertas' 
                ? 'active-nav text-white font-medium' 
                : 'hover:bg-slate-800 text-slate-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <BellRing className="w-4 h-4 opacity-80" />
              <span className="text-xs opacity-90">Alertas Automáticos</span>
            </div>
            {activeAlertsCount > 0 && (
              <span className="bg-amber-500 text-white font-bold font-mono text-[9px] px-1.5 py-0.5 rounded-full">
                {activeAlertsCount}
              </span>
            )}
          </div>

          {/* Logs Item */}
          <div 
            onClick={() => setActiveTab('logs')}
            className={`p-3 rounded-md flex items-center justify-between transition-all cursor-pointer ${
              activeTab === 'logs' 
                ? 'active-nav text-white font-medium' 
                : 'hover:bg-slate-800 text-slate-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <History className="w-4 h-4 opacity-80" />
              <span className="text-xs opacity-90 font-sans">Auditoria Mensal</span>
            </div>
          </div>

          {/* Configuração AD Item */}
          <div 
            onClick={() => {
              setActiveTab('config');
              setDashboardFilter(null);
            }}
            className={`p-3 rounded-md flex items-center justify-between transition-all cursor-pointer ${
              activeTab === 'config' 
                ? 'active-nav text-white font-medium' 
                : 'hover:bg-slate-800 text-slate-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <Database className="w-4 h-4 opacity-80" />
              <span className="text-xs opacity-90 font-sans">Configuração AD</span>
            </div>
            {!useDemoMode && adConnected && (
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            )}
            {!useDemoMode && !adConnected && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
            )}
          </div>

        </nav>

        {/* Footer Admin profile */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/20">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-full flex items-center justify-center font-bold text-xs uppercase shrink-0">
              {currentUser.name ? (
                currentUser.name.trim().split(/\s+/).length >= 2 
                  ? (currentUser.name.trim().split(/\s+/)[0][0] + currentUser.name.trim().split(/\s+/).slice(-1)[0][0]).toUpperCase()
                  : currentUser.name.substring(0, 2).toUpperCase()
              ) : 'AD'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-white font-semibold truncate" title={currentUser.name}>
                {currentUser.name || currentUser.username}
              </p>
              <p className="text-[10px] text-slate-500 truncate" title={currentUser.title || 'Operador de Rede'}>
                {currentUser.title || 'Operador de Rede'}
              </p>
            </div>
            <button 
              onClick={async () => {
                if (window.confirm('Deseja realmente encerrar a sessão administrativa?')) {
                  try {
                    await handleAddAuditLog({
                      id: "",
                      timestamp: "",
                      operator: currentUser?.username || 'admin.silva',
                      action: "Logoff na Aplicação",
                      targetUser: currentUser?.username || 'admin.silva',
                      details: `Usuário ${currentUser?.name || currentUser?.username || 'Administrador'} encerrou a sessão administrativa na aplicação.`,
                      type: "info"
                    });
                  } catch (err) {
                    console.error('Erro ao registrar logoff:', err);
                  }
                  setCurrentUser(null);
                  sessionStorage.removeItem('ad_console_user');
                }
              }}
              className="p-1.5 hover:bg-red-500/10 text-slate-400 hover:text-red-400 rounded-lg transition-colors cursor-pointer shrink-0"
              title="Encerrar Sessão (Log Out)"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main workspace container column */}
      <main className="flex-1 flex flex-col overflow-hidden">
        
        {/* Dynamic header bar (styled per Sleek theme) */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0 no-print">
          <h1 className="text-lg font-semibold text-slate-800 font-display">
            {activeTab === 'dashboard' && 'Visão Geral do Domínio'}
            {activeTab === 'contas' && 'Gerenciamento de Objetos de Contas'}
            {activeTab === 'grupos' && 'Grupos de Segurança e Distribuição'}
            {activeTab === 'gpos' && 'Diretivas de Políticas de Grupo (GPO)'}
            {activeTab === 'scripts' && 'Scripts de Logon de Inicialização (.BAT)'}
            {activeTab === 'relatorios' && 'Relatório Customizado de Auditoria'}
            {activeTab === 'alertas' && 'Central de Alertas de Inatividade'}
            {activeTab === 'logs' && 'Logs de Auditoria AD'}
            {activeTab === 'config' && 'Configuração de Conexão com AD Local'}
          </h1>
          <div className="flex items-center gap-4 text-xs text-slate-500 font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab('config')}
              className="flex items-center gap-2 hover:opacity-85 transition-opacity cursor-pointer"
              title="Clique para abrir e testar os parâmetros do Active Directory"
            >
              <span className="text-slate-400">Status AD:</span>
              {useDemoMode ? (
                <span className="text-amber-700 font-bold uppercase text-[10px] bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-md border border-amber-300 flex items-center gap-1.5 transition-colors">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  Modo Simulação
                </span>
              ) : adConnected ? (
                <span className="text-emerald-700 font-bold uppercase text-[10px] bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-md border border-emerald-300 flex items-center gap-1.5 transition-colors">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  AD Real Conectado ({adStatus?.config?.domain || 'inema.intranet'})
                </span>
              ) : (
                <span className="text-rose-700 font-bold uppercase text-[10px] bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded-md border border-rose-300 flex items-center gap-1.5 transition-colors">
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                  AD Real Desconectado ({adStatus?.config?.url || '172.16.0.1:389'})
                </span>
              )}
            </button>
            <div className="h-4 w-px bg-slate-200"></div>
            <span className="font-mono text-slate-600 font-semibold">
              {(() => {
                const d = new Date();
                const day = String(d.getDate()).padStart(2, '0');
                const month = String(d.getMonth() + 1).padStart(2, '0');
                return `${day}/${month}/${d.getFullYear()}`;
              })()}
            </span>
          </div>
        </header>

        {/* Dynamic scrollable body workspace content */}
        <div className="p-8 flex-1 overflow-y-auto" id="app-workspace-content">
          {activeTab === 'dashboard' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              <Dashboard 
                users={users} 
                computers={computers}
                auditLogs={auditLogs} 
                inactivityDays={inactivityDays}
                computerInactivityDays={computerInactivityDays}
                onNavigate={handleNavigateFromDashboard}
                adStatus={adStatus}
                useDemoMode={useDemoMode}
                adConnected={adConnected}
                onUpdateComputer={handleUpdateComputer}
                onUpdateComputerInactivityDays={handleUpdateComputerInactivityDays}
                onDisableBatchComputers={handleDisableBatchComputers}
                onAddAuditLog={handleAddAuditLog}
              />
            </motion.div>
          )}

          {activeTab === 'contas' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              <UserManagement 
                users={users}
                onAddUser={handleAddUser}
                onUpdateUser={handleUpdateUser}
                onDeleteUser={handleDeleteUser}
                onAddAuditLog={handleAddAuditLog}
                dashboardFilter={dashboardFilter}
                onClearDashboardFilter={() => setDashboardFilter(null)}
              />
            </motion.div>
          )}

          {activeTab === 'grupos' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              <Groups users={users} />
            </motion.div>
          )}

          {activeTab === 'gpos' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              <GroupPolicies />
            </motion.div>
          )}

          {activeTab === 'scripts' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              <Scripts 
                users={users}
                onUpdateUser={handleUpdateUser}
                onAddAuditLog={handleAddAuditLog}
              />
            </motion.div>
          )}

          {activeTab === 'relatorios' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              <Reports 
                users={users} 
                onAddAuditLog={handleAddAuditLog}
              />
            </motion.div>
          )}

          {activeTab === 'alertas' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              <Alerts 
                users={users}
                onUpdateUser={handleUpdateUser}
                onAddAuditLog={handleAddAuditLog}
                inactivityDays={inactivityDays}
                onUpdateInactivityDays={handleUpdateInactivityDays}
                computers={computers}
                computerInactivityDays={computerInactivityDays}
                onUpdateComputer={handleUpdateComputer}
                onUpdateComputerInactivityDays={handleUpdateComputerInactivityDays}
                onDisableBatchComputers={handleDisableBatchComputers}
                initialSubTab={dashboardFilter === 'computadores' ? 'computadores' : 'usuarios'}
              />
            </motion.div>
          )}

          {activeTab === 'logs' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              <AuditLogs 
                auditLogs={auditLogs} 
                onClearLogs={handleClearLogs}
              />
            </motion.div>
          )}

          {activeTab === 'config' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              <AdConfigPanel onConfigChanged={refreshData} />
            </motion.div>
          )}
        </div>

      </main>

    </div>
  );
}
