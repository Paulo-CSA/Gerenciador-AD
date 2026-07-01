/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  FileText, 
  Calendar, 
  Download, 
  Printer, 
  Filter, 
  CheckSquare, 
  Square,
  FileCheck2,
  Building,
  UserCheck,
  Lock,
  CalendarDays,
  FileQuestion,
  Users,
  UserX
} from 'lucide-react';
import { ADUser } from '../types';

// Robust date parsing to avoid UTC vs local shift issues in browser environment
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

interface ReportsProps {
  users: ADUser[];
  onAddAuditLog?: (log: any) => void;
}

export default function Reports({ users, onAddAuditLog }: ReportsProps) {
  // Query state parameters
  const [startDate, setStartDate] = useState(() => {
    // Default to 30 days ago so we capture active mock accounts (e.g., June 2026 data on July 1st 2026)
    const d = new Date();
    d.setDate(d.getDate() - 30);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  
  // Status check filters
  const [showActive, setShowActive] = useState(true);
  const [showCreated, setShowCreated] = useState(true);
  const [showBlocked, setShowBlocked] = useState(true);
  const [showExpired, setShowExpired] = useState(true);
  const [showDisabled, setShowDisabled] = useState(true);
  const [showAllDisabled, setShowAllDisabled] = useState(false);
  const [showAllCreated, setShowAllCreated] = useState(false);

  // Department selection state
  const [selectedDept, setSelectedDept] = useState('todos');

  // Generated results list
  const [reportGenerated, setReportGenerated] = useState(false);
  const [matchedUsers, setMatchedUsers] = useState<ADUser[]>([]);
  const [reportSummary, setReportSummary] = useState({
    activeCount: 0,
    createdCount: 0,
    blockedCount: 0,
    expiredCount: 0,
    disabledCount: 0,
    totalCount: 0
  });

  const departments = Array.from(new Set(users.map(u => u.department)));

  const handleGenerateReport = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const start = parseLocalDate(startDate);
    const end = parseLocalDate(endDate);
    if (end) {
      // Set hours to include the whole day
      end.setHours(23, 59, 59, 999);
    }

    const results = users.filter(user => {
      // 1. Department filter
      if (selectedDept !== 'todos' && user.department !== selectedDept) {
        return false;
      }

      // 2. Date checks and status criteria
      const createdDate = parseLocalDate(user.createdDate);
      const logonDate = parseLocalDate(user.lastLogon);
      
      const createdInPeriod = !!(start && end && createdDate && createdDate >= start && createdDate <= end);
      const activeInPeriod = !!(user.status === 'Ativa' && logonDate && start && end && logonDate >= start && logonDate <= end);
      const isBlocked = user.status === 'Bloqueada';
      const isExpired = user.status === 'Expirada';
      const isDisabled = user.status === 'Desativada';

      // Safe date-check for deactivated/disabled accounts in selected period
      const disabledInPeriod = isDisabled && !!(
        (logonDate && start && end && logonDate >= start && logonDate <= end) || 
        (createdDate && start && end && createdDate >= start && createdDate <= end)
      );

      // Evaluate matching checked checkboxes
      let matchesStatus = false;
      
      // If "Contas Criadas" is checked, include users created in period
      if (showCreated && createdInPeriod) {
        matchesStatus = true;
      }
      
      // If "Contas Ativas" is checked, include users who logged on in period with status active
      if (showActive && activeInPeriod) {
        matchesStatus = true;
      }
      
      // If "Contas Bloqueadas" is checked, include blocked users
      if (showBlocked && isBlocked) {
        matchesStatus = true;
      }

      // If "Contas Expiradas" is checked, include expired users
      if (showExpired && isExpired) {
        matchesStatus = true;
      }

      // If "Contas Desativadas" is checked, include disabled users in the period
      if (showDisabled && disabledInPeriod) {
        matchesStatus = true;
      }

      // If "Todas as Contas Desativadas (Geral)" is checked, include any disabled user (no period limit)
      if (showAllDisabled && isDisabled) {
        matchesStatus = true;
      }

      // If "Todas as Contas Criadas (Geral)" is checked, include any created user (no period limit)
      if (showAllCreated) {
        matchesStatus = true;
      }

      return matchesStatus;
    });

    // Compute stats for results
    const activeCount = results.filter(u => {
      const logonDate = parseLocalDate(u.lastLogon);
      return u.status === 'Ativa' && logonDate && start && end && logonDate >= start && logonDate <= end;
    }).length;
    const createdCount = results.filter(u => {
      if (showAllCreated) return true;
      const cDate = parseLocalDate(u.createdDate);
      return !!(start && end && cDate && cDate >= start && cDate <= end);
    }).length;
    const blockedCount = results.filter(u => u.status === 'Bloqueada').length;
    const expiredCount = results.filter(u => u.status === 'Expirada').length;
    const disabledCount = results.filter(u => u.status === 'Desativada').length;

    setMatchedUsers(results);
    setReportSummary({
      activeCount,
      createdCount,
      blockedCount,
      expiredCount,
      disabledCount,
      totalCount: results.length
    });
    setReportGenerated(true);

    if (onAddAuditLog) {
      onAddAuditLog({
        action: "Solicitação de Relatório",
        targetUser: selectedDept === 'todos' ? "Todos os Setores" : `Setor: ${selectedDept}`,
        details: `Relatório de auditoria customizado gerado para o período de ${startDate} a ${endDate}. Retornou ${results.length} registros.`,
        type: "success"
      });
    }
  };

  // CSV Export utility
  const handleExportCSV = () => {
    if (matchedUsers.length === 0) return;

    if (onAddAuditLog) {
      onAddAuditLog({
        action: "Exportação de Relatório",
        targetUser: "Planilha CSV",
        details: `Relatório de auditoria (${startDate} a ${endDate}) exportado para formato CSV contendo ${matchedUsers.length} registros.`,
        type: "info"
      });
    }

    // Headers with BOM for Excel UTF-8 compatibility
    const headers = ['Nome Completo', 'Logon (sAMAccountName)', 'E-mail', 'Departamento', 'Cargo', 'Status', 'Data Criacao', 'Ultimo Logon', 'Expiracao Conta'];
    const csvRows = [headers.join(';')];

    matchedUsers.forEach(u => {
      const row = [
        `"${u.name}"`,
        `"${u.username}"`,
        `"${u.email}"`,
        `"${u.department}"`,
        `"${u.title}"`,
        `"${u.status}"`,
        `"${u.createdDate}"`,
        `"${u.lastLogon}"`,
        `"${u.accountExpires || 'Nunca'}"`
      ];
      csvRows.push(row.join(';'));
    });

    const csvContent = '\uFEFF' + csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `AD_Relatorio_Auditoria_${startDate}_a_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Direct trigger of print stylesheet
  const handlePrint = () => {
    if (onAddAuditLog) {
      onAddAuditLog({
        action: "Impressão de Relatório",
        targetUser: "Impressora / PDF",
        details: `Solicitada impressão ou geração de PDF do relatório de auditoria (${startDate} a ${endDate}) contendo ${matchedUsers.length} registros.`,
        type: "info"
      });
    }
    window.print();
  };

  return (
    <div className="space-y-6" id="reports-section">
      
      {/* Search Criteria Box */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs no-print" id="reports-criteria">
        <h3 className="font-display font-bold text-slate-800 text-base mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
          <FileText className="w-5 h-5 text-blue-600" />
          Gerador de Relatórios Customizados para Auditoria Mensal
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Column 1: Period Selection */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-400 font-mono tracking-wider uppercase flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-slate-400" />
              Período de Auditoria
            </h4>
            
            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-500 block mb-1 font-semibold">Data Inicial</label>
                <input 
                  type="date" 
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-slate-500 block mb-1 font-semibold">Data Final</label>
                <input 
                  type="date" 
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Column 2: Status Checkboxes */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-400 font-mono tracking-wider uppercase flex items-center gap-1.5">
              <CheckSquare className="w-4 h-4 text-slate-400" />
              Critérios de Inclusão
            </h4>

            <div className="space-y-2.5 text-xs text-slate-700">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input 
                  type="checkbox" 
                  className="rounded text-blue-600 focus:ring-blue-500 h-4.5 w-4.5"
                  checked={showActive}
                  onChange={(e) => setShowActive(e.target.checked)}
                />
                <div>
                  <span className="font-semibold block text-slate-700">Contas Ativas</span>
                  <span className="text-[10px] text-slate-400">Usuários logados no período</span>
                </div>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input 
                  type="checkbox" 
                  className="rounded text-blue-600 focus:ring-blue-500 h-4.5 w-4.5"
                  checked={showCreated}
                  onChange={(e) => setShowCreated(e.target.checked)}
                />
                <div>
                  <span className="font-semibold block text-slate-700">Contas Criadas</span>
                  <span className="text-[10px] text-slate-400">Provisões novas efetuadas no período</span>
                </div>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input 
                  type="checkbox" 
                  className="rounded text-blue-600 focus:ring-blue-500 h-4.5 w-4.5"
                  checked={showBlocked}
                  onChange={(e) => setShowBlocked(e.target.checked)}
                />
                <div>
                  <span className="font-semibold block text-slate-700">Contas Bloqueadas</span>
                  <span className="text-[10px] text-slate-400">Status atual de bloqueio no diretório</span>
                </div>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input 
                  type="checkbox" 
                  className="rounded text-blue-600 focus:ring-blue-500 h-4.5 w-4.5"
                  checked={showExpired}
                  onChange={(e) => setShowExpired(e.target.checked)}
                />
                <div>
                  <span className="font-semibold block text-slate-700">Contas Expiradas</span>
                  <span className="text-[10px] text-slate-400">Prazos de vigência finalizados</span>
                </div>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input 
                  type="checkbox" 
                  className="rounded text-blue-600 focus:ring-blue-500 h-4.5 w-4.5"
                  checked={showDisabled}
                  onChange={(e) => setShowDisabled(e.target.checked)}
                />
                <div>
                  <span className="font-semibold block text-slate-700">Contas Desativadas (no Período)</span>
                  <span className="text-[10px] text-slate-400">Logon ou criação ocorridos no período</span>
                </div>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer border-t border-slate-100 pt-1.5 mt-1.5">
                <input 
                  type="checkbox" 
                  className="rounded text-blue-600 focus:ring-blue-500 h-4.5 w-4.5"
                  checked={showAllDisabled}
                  onChange={(e) => setShowAllDisabled(e.target.checked)}
                />
                <div>
                  <span className="font-semibold block text-slate-700">Todas as Contas Desativadas (Geral)</span>
                  <span className="text-[10px] text-slate-400">Sem restrição de data do período</span>
                </div>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input 
                  type="checkbox" 
                  className="rounded text-blue-600 focus:ring-blue-500 h-4.5 w-4.5"
                  checked={showAllCreated}
                  onChange={(e) => setShowAllCreated(e.target.checked)}
                />
                <div>
                  <span className="font-semibold block text-slate-700">Todas as Contas Criadas (Geral)</span>
                  <span className="text-[10px] text-slate-400">Todas as contas existentes no diretório</span>
                </div>
              </label>
            </div>
          </div>

          {/* Column 3: Scope Filter & Button */}
          <div className="space-y-4 flex flex-col justify-between">
            <div>
              <h4 className="text-xs font-bold text-slate-400 font-mono tracking-wider uppercase flex items-center gap-1.5 mb-4">
                <Building className="w-4 h-4 text-slate-400" />
                Filtro de Escopo
              </h4>
              <div className="text-xs">
                <label className="text-slate-500 block mb-1 font-semibold">Departamento Alvo</label>
                <select 
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={selectedDept}
                  onChange={(e) => setSelectedDept(e.target.value)}
                >
                  <option value="todos">Todos os Departamentos</option>
                  {departments.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>
            </div>

            <button 
              type="button"
              onClick={handleGenerateReport}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm hover:shadow-md transition-all cursor-pointer"
            >
              <FileCheck2 className="w-4 h-4" />
              Compilar Relatório de Auditoria
            </button>
          </div>

        </div>
      </div>

      {/* REPORT DISPLAY AND WORKSPACE */}
      {reportGenerated ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6" id="reports-results-sheet">
          
          {/* Header section (styled for nice printing) */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-slate-100 font-mono text-[10px] text-slate-500 font-bold px-2 py-0.5 rounded">RE-AD-AUDIT-026</span>
                <span className="text-[10px] text-emerald-600 bg-emerald-50 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Homologado</span>
              </div>
              <h2 className="text-lg font-display font-bold text-slate-800 mt-1">Relatório Consolidado de Auditoria AD</h2>
              <p className="text-slate-400 text-xs mt-0.5">
                Período avaliado: <span className="font-mono font-semibold text-slate-700">{startDate}</span> até <span className="font-mono font-semibold text-slate-700">{endDate}</span>
                {selectedDept !== 'todos' && ` | Filtro: Depto ${selectedDept}`}
              </p>
            </div>
            
            {/* Download/Print Action Controls */}
            <div className="flex items-center gap-2 no-print self-start md:self-auto">
              <button 
                onClick={handleExportCSV}
                className="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-semibold py-1.5 px-3 rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Exportar CSV
              </button>
              <button 
                onClick={handlePrint}
                className="bg-blue-50 hover:bg-blue-100 border border-blue-100 text-blue-700 font-semibold py-1.5 px-3 rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Imprimir Relatório
              </button>
            </div>
          </div>

          {/* Quick numbers for audit overview */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4" id="report-stats">
            
            <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100">
              <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Registros Encontrados</span>
              <span className="text-2xl font-bold font-display text-slate-800 block mt-0.5">{reportSummary.totalCount}</span>
              <span className="text-[10px] text-slate-400 block mt-1">Contas sob escopo</span>
            </div>

            <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100">
              <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block flex items-center gap-1">
                <UserCheck className="w-3 h-3 text-emerald-500" /> Ativas no Período
              </span>
              <span className="text-2xl font-bold font-display text-emerald-700 block mt-0.5">{reportSummary.activeCount}</span>
              <span className="text-[10px] text-slate-400 block mt-1">Logon verificado</span>
            </div>

            <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100">
              <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block flex items-center gap-1">
                <CalendarDays className="w-3 h-3 text-blue-500" /> {showAllCreated ? "Criadas (Geral)" : "Criadas no Período"}
              </span>
              <span className="text-2xl font-bold font-display text-blue-700 block mt-0.5">{reportSummary.createdCount}</span>
              <span className="text-[10px] text-slate-400 block mt-1">{showAllCreated ? "Total no diretório" : "Novas provisões"}</span>
            </div>

            <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100">
              <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block flex items-center gap-1">
                <Lock className="w-3 h-3 text-red-500" /> Bloqueadas Atuais
              </span>
              <span className="text-2xl font-bold font-display text-red-700 block mt-0.5">{reportSummary.blockedCount}</span>
              <span className="text-[10px] text-slate-400 block mt-1">Exige intervenção</span>
            </div>

            <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100">
              <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block flex items-center gap-1">
                <FileQuestion className="w-3 h-3 text-amber-500" /> Expiradas Atuais
              </span>
              <span className="text-2xl font-bold font-display text-amber-700 block mt-0.5">{reportSummary.expiredCount}</span>
              <span className="text-[10px] text-slate-400 block mt-1">Vigência esgotada</span>
            </div>

            <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100">
              <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block flex items-center gap-1">
                <UserX className="w-3 h-3 text-slate-500" /> {showAllDisabled ? "Desativadas (Geral)" : "Desativadas no Período"}
              </span>
              <span className="text-2xl font-bold font-display text-slate-700 block mt-0.5">{reportSummary.disabledCount}</span>
              <span className="text-[10px] text-slate-400 block mt-1">{showAllDisabled ? "Suspensas no geral" : "Suspensas no período"}</span>
            </div>

          </div>

          {/* Main results table */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 font-mono tracking-wider uppercase">
              Lista Detalhada para Auditoria de Segurança
            </h3>

            <div className="overflow-x-auto border border-slate-100 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-500 font-bold bg-slate-50/75">
                    <th className="py-2.5 px-4">Nome completo</th>
                    <th className="py-2.5 px-4">SamAccountName</th>
                    <th className="py-2.5 px-4">Departamento</th>
                    <th className="py-2.5 px-4">Data de Criação</th>
                    <th className="py-2.5 px-4">Último Logon</th>
                    <th className="py-2.5 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-slate-600">
                  {matchedUsers.length > 0 ? (
                    matchedUsers.map(user => (
                      <tr key={user.id} className="hover:bg-slate-50/40">
                        <td className="py-3 px-4 font-semibold text-slate-800">{user.name}</td>
                        <td className="py-3 px-4 font-mono text-slate-500">{user.username}</td>
                        <td className="py-3 px-4 text-slate-600">{user.department}</td>
                        <td className="py-3 px-4 font-mono text-slate-500">{user.createdDate}</td>
                        <td className="py-3 px-4 font-mono text-slate-500">{user.lastLogon}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            user.status === 'Ativa' ? 'bg-emerald-50 text-emerald-700' :
                            user.status === 'Bloqueada' ? 'bg-red-50 text-red-700' :
                            user.status === 'Expirada' ? 'bg-amber-50 text-amber-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {user.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        Nenhum registro correspondente aos filtros de auditoria definidos.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Audit approval and sign signature placeholder (only really visible on print/final sheets) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-slate-100 text-xs">
            <div className="space-y-1.5 leading-relaxed text-slate-500">
              <strong className="text-slate-700">Declaração de Conformidade AD</strong>
              <p className="text-[11px]">
                Este documento apresenta o levantamento auditado das contas operantes e seus respectivos marcos de login, bloqueio e criação conforme armazenado nas bases do Active Directory local. Gerado em consonância com as normas de segurança corporativa e políticas internas de reciclagem de acessos.
              </p>
            </div>
            
            <div className="flex flex-col justify-end items-end space-y-4 pt-4 md:pt-0">
              <div className="w-56 border-b border-slate-300 text-center pb-1">
                <span className="font-mono text-[10px] text-slate-400 font-semibold block">ASSINATURA DO AUDITOR</span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono text-right">
                Emitido por: dllskuzi@gmail.com <br />
                Data de Emissão: 26/06/2026 10:06
              </p>
            </div>
          </div>

        </div>
      ) : (
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-12 text-center" id="reports-placeholder">
          <div className="max-w-md mx-auto space-y-3">
            <div className="bg-white p-4 rounded-2xl w-fit mx-auto border border-slate-100 shadow-xs text-blue-500">
              <Users className="w-8 h-8" />
            </div>
            <h4 className="font-display font-bold text-slate-700 text-sm">Pronto para Auditar</h4>
            <p className="text-slate-400 text-xs leading-relaxed">
              Defina os parâmetros de data, status de credenciais e escopos setoriais acima para compilar uma planilha homologada em conformidade com as normas ISO 27001 e auditorias mensais de governança.
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
