/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  Monitor, 
  Server, 
  Laptop, 
  PowerOff, 
  Check, 
  RefreshCw, 
  MoreVertical, 
  ChevronRight, 
  X, 
  Calendar, 
  Network, 
  Download, 
  CheckSquare, 
  Square, 
  Clock, 
  AlertTriangle, 
  ShieldCheck, 
  ShieldAlert, 
  SlidersHorizontal,
  Copy,
  ExternalLink,
  Layers,
  HardDrive
} from 'lucide-react';
import { ADComputer, AuditLog } from '../types';

function parseLocalDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr || dateStr === 'Nunca' || dateStr === 'never' || dateStr === '0') return null;
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

function getDaysSinceDate(dateStr: string | null | undefined): number {
  const d = parseLocalDate(dateStr);
  if (!d) return 999;
  const now = new Date();
  const diffTime = now.getTime() - d.getTime();
  if (diffTime < 0) return 0;
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

interface ComputerManagementProps {
  computers: ADComputer[];
  onUpdateComputer?: (computer: ADComputer) => void;
  onDisableBatchComputers?: (items: (string | ADComputer)[]) => void;
  onAddAuditLog?: (log: AuditLog) => void;
  computerInactivityDays?: number;
  useDemoMode?: boolean;
  adConnected?: boolean;
  adStatus?: any;
}

export default function ComputerManagement({
  computers = [],
  onUpdateComputer,
  onDisableBatchComputers,
  onAddAuditLog,
  computerInactivityDays = 90,
  useDemoMode = false,
  adConnected = false,
  adStatus
}: ComputerManagementProps) {
  // Search & filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'ativo' | 'desativado' | 'obsoleto'>('todos');
  const [osFilter, setOsFilter] = useState<string>('todos');
  const [ouFilter, setOuFilter] = useState<string>('todos');
  
  // Selection states for batch operations
  const [selectedCompIds, setSelectedCompIds] = useState<string[]>([]);
  const [selectedComputer, setSelectedComputer] = useState<ADComputer | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string>('');

  const showFeedback = (msg: string) => {
    setActionSuccessMsg(msg);
    setTimeout(() => setActionSuccessMsg(''), 4000);
  };

  // Distinct OUs for filter
  const distinctOUs = useMemo(() => {
    const ous = new Set<string>();
    computers.forEach(c => {
      if (c.ou) ous.add(c.ou);
    });
    return Array.from(ous).sort();
  }, [computers]);

  // Statistics calculation
  const totalCount = computers.length;
  const activeCount = computers.filter(c => c.status === 'Ativo').length;
  const disabledCount = computers.filter(c => c.status === 'Desativado').length;
  const obsoleteCount = computers.filter(c => {
    const days = getDaysSinceDate(c.lastLogon);
    return days >= computerInactivityDays && c.status !== 'Desativado';
  }).length;

  // Filtered computer records
  const filteredComputers = useMemo(() => {
    return computers.filter(comp => {
      // 1. Search term (Name, FQDN, Operating System, OU, Canonical Path)
      const term = searchTerm.toLowerCase();
      const matchesSearch = 
        comp.name.toLowerCase().includes(term) ||
        comp.dnsHostName.toLowerCase().includes(term) ||
        comp.operatingSystem.toLowerCase().includes(term) ||
        comp.ou.toLowerCase().includes(term) ||
        (comp.canonicalPath && comp.canonicalPath.toLowerCase().includes(term));

      if (!matchesSearch) return false;

      // 2. Status filter
      if (statusFilter === 'ativo') {
        if (comp.status !== 'Ativo') return false;
      } else if (statusFilter === 'desativado') {
        if (comp.status !== 'Desativado') return false;
      } else if (statusFilter === 'obsoleto') {
        const days = getDaysSinceDate(comp.lastLogon);
        if (days < computerInactivityDays || comp.status === 'Desativado') return false;
      }

      // 3. Operating System filter
      if (osFilter !== 'todos') {
        const osLower = comp.operatingSystem.toLowerCase();
        if (osFilter === 'win11' && !osLower.includes('windows 11')) return false;
        if (osFilter === 'win10' && !osLower.includes('windows 10')) return false;
        if (osFilter === 'server' && !osLower.includes('server')) return false;
        if (osFilter === 'legacy' && !osLower.includes('windows 7') && !osLower.includes('xp')) return false;
      }

      // 4. OU filter
      if (ouFilter !== 'todos') {
        if (comp.ou !== ouFilter) return false;
      }

      return true;
    });
  }, [computers, searchTerm, statusFilter, osFilter, ouFilter, computerInactivityDays]);

  // Selection toggles
  const toggleSelectAll = () => {
    if (selectedCompIds.length === filteredComputers.length) {
      setSelectedCompIds([]);
    } else {
      setSelectedCompIds(filteredComputers.map(c => c.id || c.name));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedCompIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Actions: Disable / Reactivate single computer
  const handleToggleComputerStatus = (comp: ADComputer) => {
    const isCurrentlyDisabled = comp.status === 'Desativado';
    const newStatus: 'Ativo' | 'Desativado' = isCurrentlyDisabled ? 'Ativo' : 'Desativado';
    const actionLabel = isCurrentlyDisabled ? 'Reativação de Computador' : 'Desativação de Computador';

    const confirmed = window.confirm(
      isCurrentlyDisabled
        ? `Confirma a REATIVAÇÃO da conta da máquina '${comp.name}' no Active Directory?`
        : `Confirma a DESATIVAÇÃO / BLOQUEIO da conta da máquina '${comp.name}' no Active Directory? O computador perderá acesso ao domínio.`
    );
    if (!confirmed) return;

    if (onUpdateComputer) {
      onUpdateComputer({
        ...comp,
        status: newStatus
      });
    }

    if (onAddAuditLog) {
      onAddAuditLog({
        id: "log_" + Date.now(),
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        operator: 'admin.silva',
        action: actionLabel,
        targetUser: comp.name,
        details: `Conta de máquina ${comp.name} (${comp.operatingSystem}) alterada para status '${newStatus}' no domínio.`,
        type: newStatus === 'Desativado' ? 'danger' : 'success'
      });
    }

    showFeedback(`Conta da máquina ${comp.name} foi ${newStatus === 'Desativado' ? 'desativada' : 'reativada'} com sucesso!`);
    if (selectedComputer && (selectedComputer.id === comp.id || selectedComputer.name === comp.name)) {
      setSelectedComputer({ ...comp, status: newStatus });
    }
  };

  // Batch Disable
  const handleBatchDisable = () => {
    if (selectedCompIds.length === 0) return;
    const count = selectedCompIds.length;
    if (window.confirm(`Confirma a DESATIVAÇÃO / BLOQUEIO de ${count} máquina(s) selecionada(s) no Active Directory?`)) {
      if (onDisableBatchComputers) {
        const selectedObjects = computers.filter(c => selectedCompIds.includes(c.id) || selectedCompIds.includes(c.name));
        onDisableBatchComputers(selectedObjects.length > 0 ? selectedObjects : selectedCompIds);
      }
      showFeedback(`Solicitação de desativação para ${count} máquina(s) enviada ao Active Directory.`);
      setSelectedCompIds([]);
    }
  };

  // Copy to clipboard helper
  const handleCopy = (text: string, fieldName: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    }
  };

  // CSV Export utility
  const handleExportCSV = () => {
    if (filteredComputers.length === 0) return;

    if (onAddAuditLog) {
      onAddAuditLog({
        id: "log_" + Date.now(),
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        operator: 'admin.silva',
        action: "Exportação de Computadores",
        targetUser: "Planilha CSV",
        details: `Inventário de computadores exportado em CSV contendo ${filteredComputers.length} registros.`,
        type: "info"
      });
    }

    const headers = [
      'Nome da Maquina',
      'Nome DNS (FQDN)',
      'Sistema Operacional',
      'Versao do SO',
      'Unidade Organizacional (OU)',
      'Caminho Canonico AD',
      'Ultimo Contato AD',
      'Dias Sem Comunicacao',
      'Status',
      'Distinguished Name (DN)',
      'Data de Criacao AD'
    ];

    const rows = [headers.join(';')];

    filteredComputers.forEach(comp => {
      const days = getDaysSinceDate(comp.lastLogon);
      const row = [
        `"${comp.name}"`,
        `"${comp.dnsHostName}"`,
        `"${comp.operatingSystem}"`,
        `"${comp.operatingSystemVersion || ''}"`,
        `"${comp.ou}"`,
        `"${comp.canonicalPath || ''}"`,
        `"${comp.lastLogon}"`,
        `"${days === 999 ? 'Nunca' : days}"`,
        `"${comp.status}"`,
        `"${comp.dn || comp.distinguishedName || ''}"`,
        `"${comp.whenCreated || ''}"`
      ];
      rows.push(row.join(';'));
    });

    const csvContent = '\uFEFF' + rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const todayStr = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `AD_Maquinas_Inventario_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Clear filters
  const handleClearFilters = () => {
    setSearchTerm('');
    setStatusFilter('todos');
    setOsFilter('todos');
    setOuFilter('todos');
  };

  return (
    <div className="space-y-6" id="computer-management-page">
      
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-display font-bold text-slate-800 tracking-tight">
              Gerenciar Máquinas do Active Directory
            </h2>
            <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 px-2.5 py-0.5 rounded-full">
              Inventário AD
            </span>
          </div>
          <p className="text-slate-500 text-sm mt-1">
            Consulta detalhada, auditoria de comunicação e bloqueio/desativação de estações de trabalho e servidores no domínio.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {useDemoMode ? (
            <div className="flex items-center gap-2 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200/60 px-3 py-1.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              Modo Simulação
            </div>
          ) : adConnected ? (
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-3 py-1.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              AD Real: {adStatus?.config?.domain || "inema.intranet"} | Conectado
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200/60 px-3 py-1.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              AD Real: Desconectado
            </div>
          )}
        </div>
      </div>

      {/* Success Alert Banner */}
      {actionSuccessMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl flex items-center gap-2 text-xs animate-fade-in shadow-2xs">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-medium">{actionSuccessMsg}</span>
        </div>
      )}

      {/* Metric Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Machines */}
        <div 
          onClick={() => { setStatusFilter('todos'); }}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === 'todos' 
              ? 'bg-blue-50/70 border-blue-300 ring-2 ring-blue-500/20' 
              : 'bg-white border-slate-100 hover:border-slate-200 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Parque Total</span>
            <div className="w-7 h-7 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">
              <HardDrive className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-display text-slate-800 mt-2">{totalCount}</p>
          <span className="text-[10px] text-slate-400 mt-0.5 block">Máquinas registradas no AD</span>
        </div>

        {/* Active Machines */}
        <div 
          onClick={() => { setStatusFilter('ativo'); }}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === 'ativo' 
              ? 'bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-500/20' 
              : 'bg-white border-slate-100 hover:border-slate-200 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Máquinas Ativas</span>
            <div className="w-7 h-7 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center">
              <Check className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-display text-emerald-700 mt-2">{activeCount}</p>
          <span className="text-[10px] text-emerald-600/80 mt-0.5 block">Com conta habilitada no domínio</span>
        </div>

        {/* Disabled Machines */}
        <div 
          onClick={() => { setStatusFilter('desativado'); }}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === 'desativado' 
              ? 'bg-rose-50/70 border-rose-300 ring-2 ring-rose-500/20' 
              : 'bg-white border-slate-100 hover:border-slate-200 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Desativadas / Bloqueadas</span>
            <div className="w-7 h-7 bg-rose-100 text-rose-600 rounded-lg flex items-center justify-center">
              <PowerOff className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-display text-rose-700 mt-2">{disabledCount}</p>
          <span className="text-[10px] text-rose-600/80 mt-0.5 block">userAccountControl bit 2 ativo</span>
        </div>

        {/* Obsolete Machines */}
        <div 
          onClick={() => { setStatusFilter('obsoleto'); }}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === 'obsoleto' 
              ? 'bg-amber-50/70 border-amber-300 ring-2 ring-amber-500/20' 
              : 'bg-white border-slate-100 hover:border-slate-200 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Obsoletas (+{computerInactivityDays}d)</span>
            <div className="w-7 h-7 bg-amber-100 text-amber-600 rounded-lg flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-display text-amber-700 mt-2">{obsoleteCount}</p>
          <span className="text-[10px] text-amber-600/80 mt-0.5 block">Sem contato recente com o AD</span>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-6 space-y-4">
        
        {/* Action Toolbar & Filters */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          
          {/* Search Box */}
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text"
              placeholder="Buscar por nome da máquina (ex: NB-INEMA-12440), FQDN, OU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
            {searchTerm && (
              <button 
                type="button"
                onClick={() => setSearchTerm('')} 
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Dropdown Filters */}
          <div className="flex flex-wrap items-center gap-2">
            
            {/* Status Filter */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select 
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
              >
                <option value="todos">Todos os Status ({computers.length})</option>
                <option value="ativo">Apenas Ativas ({activeCount})</option>
                <option value="desativado">Apenas Desativadas ({disabledCount})</option>
                <option value="obsoleto">Obsoletas (+{computerInactivityDays}d) ({obsoleteCount})</option>
              </select>
            </div>

            {/* Operating System Filter */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
              <select 
                value={osFilter}
                onChange={(e) => setOsFilter(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
              >
                <option value="todos">Todos os Sistemas</option>
                <option value="win11">Windows 11</option>
                <option value="win10">Windows 10</option>
                <option value="server">Windows Server</option>
                <option value="legacy">Legados (Windows 7/XP)</option>
              </select>
            </div>

            {/* OU Filter */}
            {distinctOUs.length > 0 && (
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 max-w-[200px]">
                <Layers className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <select 
                  value={ouFilter}
                  onChange={(e) => setOuFilter(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer truncate"
                  title="Filtrar por Unidade Organizacional"
                >
                  <option value="todos">Todas as OUs</option>
                  {distinctOUs.map(ou => (
                    <option key={ou} value={ou}>{ou}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Export CSV Button */}
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={filteredComputers.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title="Baixar lista completa em formato CSV para auditoria"
            >
              <Download className="w-3.5 h-3.5 text-slate-300" />
              Exportar CSV ({filteredComputers.length})
            </button>
          </div>

        </div>

        {/* Batch Operations Floating / Active Bar */}
        {selectedCompIds.length > 0 && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-center justify-between gap-4 animate-fade-in shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse"></span>
              <span className="text-xs font-bold text-rose-900">
                {selectedCompIds.length} máquina(s) selecionada(s)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedCompIds([])}
                className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-800 font-medium cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleBatchDisable}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                <PowerOff className="w-3.5 h-3.5" />
                Desativar / Bloquear Selecionadas ({selectedCompIds.length})
              </button>
            </div>
          </div>
        )}

        {/* Results Counter & Clear Filters */}
        <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
          <span>
            Exibindo <strong className="text-slate-700 font-semibold">{filteredComputers.length}</strong> de {computers.length} máquinas no inventário
          </span>
          {(searchTerm || statusFilter !== 'todos' || osFilter !== 'todos' || ouFilter !== 'todos') && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="text-blue-600 hover:text-blue-800 font-semibold text-xs cursor-pointer flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Limpar Filtros
            </button>
          )}
        </div>

        {/* Table Container */}
        <div className="overflow-x-auto border border-slate-100 rounded-xl">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-3 w-8">
                  <button 
                    type="button"
                    onClick={toggleSelectAll} 
                    className="cursor-pointer text-slate-400 hover:text-slate-600 flex items-center"
                    title="Selecionar todos os computadores visíveis"
                  >
                    {selectedCompIds.length > 0 && selectedCompIds.length === filteredComputers.length ? (
                      <CheckSquare className="w-4 h-4 text-blue-600" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="py-3 px-3">Nome da Máquina / FQDN</th>
                <th className="py-3 px-3">Sistema Operacional</th>
                <th className="py-3 px-3">Unidade Organizacional (OU)</th>
                <th className="py-3 px-3">Último Contato AD</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-slate-600">
              {filteredComputers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Monitor className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <p className="font-bold text-slate-700 text-sm">Nenhuma máquina encontrada</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {searchTerm || statusFilter !== 'todos' 
                        ? 'Tente ajustar os critérios de pesquisa ou limpar os filtros aplicados.' 
                        : 'Nenhum computador registrado no controlador de domínio.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredComputers.map(comp => {
                  const daysInactive = getDaysSinceDate(comp.lastLogon);
                  const isSelected = selectedCompIds.includes(comp.id || comp.name);
                  const isServer = comp.name.toLowerCase().startsWith('srv') || comp.operatingSystem.toLowerCase().includes('server');
                  const isLaptop = comp.name.toLowerCase().includes('note') || comp.name.toLowerCase().includes('laptop') || comp.name.toLowerCase().startsWith('nb');

                  return (
                    <tr 
                      key={comp.id || comp.name}
                      className={`hover:bg-slate-50/70 transition-colors ${isSelected ? 'bg-blue-50/30' : ''}`}
                    >
                      {/* Checkbox */}
                      <td className="py-3 px-3">
                        <button 
                          type="button"
                          onClick={() => toggleSelectOne(comp.id || comp.name)}
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
                      <td className="py-3 px-3 font-mono">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                            isServer ? 'bg-purple-50 text-purple-600 border-purple-100' :
                            isLaptop ? 'bg-blue-50 text-blue-600 border-blue-100' : 
                            'bg-slate-100 text-slate-600 border-slate-200'
                          }`}>
                            {isServer ? <Server className="w-4 h-4" /> :
                             isLaptop ? <Laptop className="w-4 h-4" /> :
                             <Monitor className="w-4 h-4" />}
                          </div>
                          <div>
                            <span 
                              onClick={() => setSelectedComputer(comp)}
                              className="font-bold text-slate-800 text-xs block hover:text-blue-600 cursor-pointer"
                              title="Clique para ver detalhes completos da máquina"
                            >
                              {comp.name}
                            </span>
                            <span className="text-[10px] text-slate-400 block -mt-0.5 truncate max-w-xs" title={comp.dnsHostName}>
                              {comp.dnsHostName}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Operating System */}
                      <td className="py-3 px-3">
                        <span className="font-medium text-slate-700 block text-xs">
                          {comp.operatingSystem}
                        </span>
                        {comp.operatingSystemVersion && (
                          <span className="text-[10px] text-slate-400 block font-mono">
                            {comp.operatingSystemVersion}
                          </span>
                        )}
                      </td>

                      {/* OU & Canonical Path */}
                      <td className="py-3 px-3">
                        <div className="flex flex-col">
                          <span 
                            className="text-slate-700 font-medium truncate max-w-xs text-[11px]" 
                            title={comp.canonicalPath || comp.dn || comp.ou}
                          >
                            {comp.ou}
                          </span>
                          {comp.canonicalPath && (
                            <span 
                              className="text-[9px] text-slate-400 font-mono truncate max-w-xs block -mt-0.5" 
                              title={comp.canonicalPath}
                            >
                              {comp.canonicalPath}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Last Contact */}
                      <td className="py-3 px-3 font-mono text-slate-500 text-[11px]">
                        <div>
                          <span>{comp.lastLogon}</span>
                          <span className={`inline-flex items-center gap-1 font-bold px-1.5 py-0.2 rounded-full text-[9px] ml-1.5 border ${
                            daysInactive >= 365 ? 'bg-rose-100 text-rose-800 border-rose-300' :
                            daysInactive >= 180 ? 'bg-rose-50 text-rose-700 border-rose-200' :
                            daysInactive >= 90 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            'bg-slate-100 text-slate-600 border-slate-200'
                          }`}>
                            <Clock className="w-2.5 h-2.5" />
                            {daysInactive === 999 ? 'Nunca' : `${daysInactive}d`}
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3">
                        {comp.status === 'Desativado' ? (
                          <span className="inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700 border border-slate-200">
                            <PowerOff className="w-3 h-3 text-slate-500" />
                            Desativado
                          </span>
                        ) : daysInactive >= computerInactivityDays ? (
                          <span className="inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-full text-[10px] bg-amber-50 text-amber-700 border border-amber-200">
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            Ativo (Obsoleto)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-full text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Check className="w-3 h-3 text-emerald-600" />
                            Ativo
                          </span>
                        )}
                      </td>

                      {/* Action Buttons */}
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {comp.status !== 'Desativado' ? (
                            <button
                              type="button"
                              onClick={() => handleToggleComputerStatus(comp)}
                              className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg font-bold text-[10px] border border-rose-200/60 transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                              title="Desativar conta de máquina no Active Directory"
                            >
                              <PowerOff className="w-3 h-3" />
                              Desativar
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleToggleComputerStatus(comp)}
                              className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg font-bold text-[10px] border border-emerald-200/60 transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                              title="Reativar conta de máquina no Active Directory"
                            >
                              <Check className="w-3 h-3" />
                              Reativar
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setSelectedComputer(comp)}
                            className="px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg font-medium text-[10px] border border-slate-200/60 transition-colors cursor-pointer"
                            title="Ver detalhes completos do objeto AD"
                          >
                            Detalhes
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

      </div>

      {/* Slide-over Drawer for Computer Details */}
      {selectedComputer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col justify-between border-l border-slate-200 overflow-y-auto">
            
            {/* Drawer Header */}
            <div className="p-6 border-b border-slate-100 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 border border-blue-100 rounded-xl flex items-center justify-center font-bold">
                  {selectedComputer.name.toLowerCase().startsWith('srv') ? (
                    <Server className="w-6 h-6" />
                  ) : (
                    <Monitor className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base font-mono">
                    {selectedComputer.name}
                  </h3>
                  <p className="text-slate-400 text-xs font-mono">
                    {selectedComputer.dnsHostName}
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setSelectedComputer(null)} 
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="p-6 space-y-6 flex-1 text-xs">
              
              {/* Status Banner inside Drawer */}
              <div className={`p-4 rounded-xl border flex items-center justify-between ${
                selectedComputer.status === 'Desativado'
                  ? 'bg-rose-50/60 border-rose-200 text-rose-900'
                  : 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
              }`}>
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider block opacity-75">Status no Domínio</span>
                  <p className="font-bold text-sm mt-0.5 flex items-center gap-1.5">
                    {selectedComputer.status === 'Desativado' ? (
                      <>
                        <PowerOff className="w-4 h-4 text-rose-600" />
                        Conta Desativada / Bloqueada
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4 text-emerald-600" />
                        Conta Habilitada e Ativa
                      </>
                    )}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleToggleComputerStatus(selectedComputer)}
                  className={`px-3 py-1.5 rounded-lg font-bold text-xs shadow-xs transition-colors cursor-pointer ${
                    selectedComputer.status === 'Desativado'
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-rose-600 hover:bg-rose-700 text-white'
                  }`}
                >
                  {selectedComputer.status === 'Desativado' ? 'Reativar no AD' : 'Desativar no AD'}
                </button>
              </div>

              {/* System & OS Info */}
              <div className="space-y-3">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Especificações do Sistema
                </h4>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-2.5">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Sistema Operacional:</span>
                    <span className="font-semibold text-slate-800">{selectedComputer.operatingSystem}</span>
                  </div>
                  {selectedComputer.operatingSystemVersion && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-medium">Versão / Build:</span>
                      <span className="font-mono text-slate-700">{selectedComputer.operatingSystemVersion}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Nome DNS Completo (FQDN):</span>
                    <span className="font-mono text-slate-700 text-[11px]">{selectedComputer.dnsHostName}</span>
                  </div>
                </div>
              </div>

              {/* AD Directory Location & Path */}
              <div className="space-y-3">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Localização no Active Directory
                </h4>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-3">
                  <div>
                    <span className="text-slate-500 font-medium block mb-1">Unidade Organizacional (OU):</span>
                    <div className="bg-white p-2 rounded-lg border border-slate-200 font-medium text-slate-700 text-[11px]">
                      {selectedComputer.ou}
                    </div>
                  </div>

                  {selectedComputer.canonicalPath && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-slate-500 font-medium">Caminho Canônico no AD:</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(selectedComputer.canonicalPath!, 'canonical')}
                          className="text-blue-600 hover:text-blue-800 font-semibold text-[10px] flex items-center gap-1 cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                          {copiedField === 'canonical' ? 'Copiado!' : 'Copiar'}
                        </button>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-slate-200 font-mono text-slate-600 text-[10px] break-all select-all">
                        {selectedComputer.canonicalPath}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-slate-500 font-medium">Distinguished Name (DN LDAP):</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(selectedComputer.dn || selectedComputer.distinguishedName || '', 'dn')}
                        className="text-blue-600 hover:text-blue-800 font-semibold text-[10px] flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                        {copiedField === 'dn' ? 'Copiado!' : 'Copiar'}
                      </button>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200 font-mono text-slate-600 text-[10px] break-all select-all">
                      {selectedComputer.dn || selectedComputer.distinguishedName || `CN=${selectedComputer.name},${adStatus?.config?.baseDN || 'DC=inema,DC=intranet'}`}
                    </div>
                  </div>
                </div>
              </div>

              {/* Communication & Audit Dates */}
              <div className="space-y-3">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Comunicação & Metadados AD
                </h4>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-2.5">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Último Logon / Contato AD:</span>
                    <span className="font-mono font-bold text-slate-800">{selectedComputer.lastLogon}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Dias Sem Comunicação:</span>
                    <span className="font-mono font-bold text-slate-800">
                      {getDaysSinceDate(selectedComputer.lastLogon) === 999 
                        ? 'Nunca Conectou' 
                        : `${getDaysSinceDate(selectedComputer.lastLogon)} dias`}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Última Troca de Senha da Máquina:</span>
                    <span className="font-mono text-slate-700">{selectedComputer.pwdLastSet || 'Nunca'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Data de Criação do Objeto:</span>
                    <span className="font-mono text-slate-700">{selectedComputer.whenCreated}</span>
                  </div>
                  {selectedComputer.userAccountControl !== undefined && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-medium">userAccountControl (UAC):</span>
                      <span className="font-mono text-slate-700 font-bold bg-slate-200/60 px-1.5 py-0.5 rounded text-[10px]">
                        {selectedComputer.userAccountControl}
                      </span>
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
              <span className="text-[11px] text-slate-400">
                Identificador: <span className="font-mono font-bold text-slate-600">{selectedComputer.name}</span>
              </span>
              <button
                type="button"
                onClick={() => setSelectedComputer(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
