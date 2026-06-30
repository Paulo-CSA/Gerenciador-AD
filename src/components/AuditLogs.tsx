/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  History, 
  Search, 
  Trash2, 
  Download, 
  ShieldCheck, 
  AlertTriangle, 
  X, 
  RefreshCw,
  Terminal,
  Filter
} from 'lucide-react';
import { AuditLog } from '../types';

interface AuditLogsProps {
  auditLogs: AuditLog[];
  onClearLogs: () => void;
}

export default function AuditLogs({ auditLogs, onClearLogs }: AuditLogsProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('todos');

  // Filter logs
  const filteredLogs = auditLogs.filter(log => {
    const matchesSearch = 
      log.operator.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.targetUser.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.details.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = typeFilter === 'todos' || log.type === typeFilter;

    return matchesSearch && matchesType;
  });

  const handleExportCSV = () => {
    const headers = ['Data/Hora', 'Operador', 'Operação', 'Usuário Alvo', 'Detalhes', 'Status'];
    const csvRows = [headers.join(';')];

    filteredLogs.forEach(l => {
      const row = [
        `"${l.timestamp}"`,
        `"${l.operator}"`,
        `"${l.action}"`,
        `"${l.targetUser}"`,
        `"${l.details}"`,
        `"${l.type}"`
      ];
      csvRows.push(row.join(';'));
    });

    const csvContent = '\uFEFF' + csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `AD_Logs_Auditoria_Seguranca.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden space-y-4 p-6" id="audit-logs-section">
      
      {/* Title / Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <h3 className="font-display font-bold text-slate-800 text-sm flex items-center gap-2">
            <History className="w-4.5 h-4.5 text-blue-500 animate-pulse" />
            Trilha de Auditoria de Segurança (Audit Log)
          </h3>
          <p className="text-slate-400 text-[11px] mt-0.5">
            Histórico imutável de alterações de credenciais, controle de acessos e manutenções do diretório local
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button 
            onClick={handleExportCSV}
            className="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-semibold py-1.5 px-3 rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar Logs
          </button>
          
          <button 
            onClick={() => {
              if (window.confirm('Tem certeza de que deseja limpar a visualização dos logs locais? Esta operação não apagará os logs físicos dos servidores do Active Directory.')) {
                onClearLogs();
              }
            }}
            className="bg-rose-50 hover:bg-rose-100 border border-rose-100 text-rose-700 font-semibold py-1.5 px-3 rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Limpar Logs
          </button>
        </div>
      </div>

      {/* Internal Filter Actions Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" id="log-filters">
        
        {/* Search input */}
        <div className="sm:col-span-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Filtrar por operador, ação, usuário alvo, etc..."
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Level type selector */}
        <div>
          <select 
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="todos">Todos os Níveis de Alerta</option>
            <option value="success">Sucesso (Sucesso)</option>
            <option value="info">Operações (Informações)</option>
            <option value="warning">Sinalizações (Avisos)</option>
            <option value="danger">Risco de Segurança (Crítico)</option>
          </select>
        </div>

      </div>

      {/* Logs Timelines */}
      <div className="overflow-x-auto border border-slate-100 rounded-xl">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-100 text-slate-400 font-semibold uppercase tracking-wider bg-slate-50/50">
              <th className="py-2.5 px-4">Data/Hora</th>
              <th className="py-2.5 px-4">Operador</th>
              <th className="py-2.5 px-4">Operação</th>
              <th className="py-2.5 px-4">Usuário Alvo</th>
              <th className="py-2.5 px-4">Mensagem / Detalhes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 text-slate-600 font-sans">
            {filteredLogs.length > 0 ? (
              filteredLogs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">{log.timestamp}</td>
                  <td className="py-3 px-4 font-semibold text-slate-800 whitespace-nowrap">
                    {log.operator}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1 font-bold rounded-full px-2 py-0.5 text-[10px] ${
                      log.type === 'success' ? 'bg-emerald-50 text-emerald-700' :
                      log.type === 'warning' ? 'bg-amber-50 text-amber-700' :
                      log.type === 'danger' ? 'bg-rose-50 text-rose-700' : 'bg-blue-50 text-blue-700'
                    }`}>
                      <span className={`w-1 h-1 rounded-full ${
                        log.type === 'success' ? 'bg-emerald-500' :
                        log.type === 'warning' ? 'bg-amber-500' :
                        log.type === 'danger' ? 'bg-rose-500' : 'bg-blue-500'
                      }`}></span>
                      {log.action}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-800 font-bold whitespace-nowrap">{log.targetUser}</td>
                  <td className="py-3 px-4 text-slate-500 min-w-xs leading-relaxed">{log.details}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="py-12 text-center text-slate-400 font-sans">
                  Nenhum evento registrado correspondente aos termos de busca.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Terminal View Decorative Footer */}
      <div className="bg-slate-900 rounded-xl p-4 border border-slate-800 flex items-start gap-3 text-slate-300 font-mono text-[11px] leading-relaxed no-print">
        <Terminal className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
        <div className="space-y-1">
          <p className="text-blue-300"># dcdiag /test:ActiveDirectory /s:CASANOVA</p>
          <p className="text-slate-400">
            Testing server: DC-PRIMARY-01 <br />
            Starting test: Connectivity .......... Passed <br />
            Starting test: Replications .......... Passed <br />
            Starting test: Advertising ........... Passed <br />
            Starting test: FsmoCheck ............. Passed <br />
            Starting test: UserAccountControl .... Verified 15 active AD accounts. 0 replication failures detected.
          </p>
        </div>
      </div>

    </div>
  );
}
