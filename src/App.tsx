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
  Shield
} from 'lucide-react';

import { ADUser, AuditLog } from './types';
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

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  
  // Custom dashboard-triggered filters for accounts table
  const [dashboardFilter, setDashboardFilter] = useState<string | null>(null);

  // Core AD States (Backend-Driven)
  const [users, setUsers] = useState<ADUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [inactivityDays, setInactivityDays] = useState<number>(() => {
    const saved = localStorage.getItem('ad_inactivity_threshold');
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
      const [usersRes, logsRes, statusRes] = await Promise.all([
        fetch('/api/ad/users'),
        fetch('/api/ad/logs'),
        fetch('/api/ad/status')
      ]);

      if (usersRes.ok) {
        const usersData = await usersRes.json();
        if (Array.isArray(usersData)) setUsers(usersData);
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
        if (statusData.config && typeof statusData.config.inactivityDays === 'number') {
          setInactivityDays(statusData.config.inactivityDays);
          localStorage.setItem('ad_inactivity_threshold', statusData.config.inactivityDays.toString());
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
  }, []);

  useEffect(() => {
    localStorage.setItem('ad_inactivity_threshold', inactivityDays.toString());
  }, [inactivityDays]);

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

  // Global state handlers synchronized to Express AD Backend
  const handleAddUser = async (newUser: ADUser) => {
    try {
      await fetch('/api/ad/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser)
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
        body: JSON.stringify({ id: updatedUser.id, updatedUser })
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
        body: JSON.stringify(newLog)
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

  const activeAlertsCount = users.filter(u => {
    if (u.status !== 'Ativa') return false;
    const days = getDaysInactive(u.lastLogon);
    return days >= inactivityDays;
  }).length;

  const blockedUsersCount = users.filter(u => u.status === 'Bloqueada').length;

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

          {/* Config AD Item */}
          <div 
            onClick={() => setActiveTab('config')}
            className={`p-3 rounded-md flex items-center justify-between transition-all cursor-pointer ${
              activeTab === 'config' 
                ? 'active-nav text-white font-medium' 
                : 'hover:bg-slate-800 text-slate-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <Database className="w-4 h-4 opacity-80" />
              <span className="text-xs opacity-90 font-sans">Conexão AD Local</span>
            </div>
          </div>
        </nav>

        {/* Footer Admin profile */}
        <div className="p-6 border-t border-slate-800">
          <div className="flex items-center gap-3 p-1">
            <div className="w-10 h-10 bg-slate-700 text-slate-200 rounded-full flex items-center justify-center font-bold text-xs uppercase">
              AS
            </div>
            <div className="truncate">
              <p className="text-xs text-white font-medium truncate">admin</p>
            </div>
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
            {activeTab === 'relatorios' && 'Relatório Customizado de Auditoria'}
            {activeTab === 'alertas' && 'Central de Alertas de Inatividade'}
            {activeTab === 'logs' && 'Logs de Auditoria AD'}
            {activeTab === 'config' && 'Configuração de Conexão com AD Local'}
          </h1>
          <div className="flex items-center gap-4 text-xs text-slate-500 font-semibold">
            <span className="flex items-center gap-1.5">
              Status AD: 
              {useDemoMode ? (
                <span className="text-amber-600 font-bold uppercase text-[9px] bg-amber-50 px-2 py-0.5 rounded border border-amber-200/50">
                  Simulação
                </span>
              ) : adConnected ? (
                <span className="text-green-500 font-bold uppercase text-[9px] bg-green-50 px-2 py-0.5 rounded border border-green-200/50 animate-pulse">
                  Conectado Real
                </span>
              ) : (
                <span className="text-red-500 font-bold uppercase text-[9px] bg-red-50 px-2 py-0.5 rounded border border-red-200/50">
                  Desconectado
                </span>
              )}
            </span>
            <div className="h-4 w-px bg-slate-200"></div>
            <span>Junho, 2026</span>
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
                auditLogs={auditLogs} 
                inactivityDays={inactivityDays}
                onNavigate={handleNavigateFromDashboard}
                adStatus={adStatus}
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

          {activeTab === 'relatorios' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              <Reports users={users} />
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
