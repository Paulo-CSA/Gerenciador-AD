/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  FileCode, 
  Search, 
  User, 
  Users, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  ArrowRight,
  Database,
  Terminal,
  FolderLock,
  Plus,
  RefreshCw,
  Edit2,
  Trash2,
  Check
} from 'lucide-react';
import { ADUser } from '../types';

interface ScriptsProps {
  users: ADUser[];
  onUpdateUser?: (updatedUser: ADUser) => Promise<void> | void;
  onAddAuditLog?: (log: any) => void;
}

// Simulated descriptions for typical AD scripts
const SCRIPT_DESCRIPTIONS: { [key: string]: string } = {
  'ti_tools.bat': 'Mapeamento de unidades de rede de TI, ferramentas administrativas e scripts de backup locais.',
  'financeiro_net.bat': 'Acesso exclusivo ao servidor ERP Financeiro e mapeamento da pasta compartilhada do setor fiscal.',
  'mapeamento_vendas.bat': 'Conexão automática com pastas do CRM de Vendas, metas e comissão de equipes comerciais.',
  'standard_logon.bat': 'Script geral para sincronização de horário de domínio e mapeamento da pasta pública institucional.'
};

export default function Scripts({ users }: ScriptsProps) {
  const [selectedScript, setSelectedScript] = useState<string | null>('standard_logon.bat');
  const [scriptSearch, setScriptSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  
  // Extract statistics and unique scripts
  const {
    scriptsWithCounts,
    usersWithScript,
    usersWithoutScript,
    totalScriptsCount
  } = useMemo(() => {
    const counts: { [key: string]: number } = {};
    const wScript: ADUser[] = [];
    const woScript: ADUser[] = [];

    users.forEach(u => {
      const script = u.logonScript ? u.logonScript.trim() : '';
      if (script) {
        counts[script] = (counts[script] || 0) + 1;
        wScript.push(u);
      } else {
        woScript.push(u);
      }
    });

    const scriptList = Object.keys(counts).map(name => ({
      name,
      count: counts[name],
      description: SCRIPT_DESCRIPTIONS[name] || 'Script customizado configurado nas políticas locais de perfil do usuário.'
    })).sort((a, b) => b.count - a.count);

    return {
      scriptsWithCounts: scriptList,
      usersWithScript: wScript,
      usersWithoutScript: woScript,
      totalScriptsCount: Object.keys(counts).length
    };
  }, [users]);

  // Total percentages
  const pctWithScript = users.length > 0 ? Math.round((usersWithScript.length / users.length) * 100) : 0;
  const pctWithoutScript = users.length > 0 ? Math.round((usersWithoutScript.length / users.length) * 100) : 0;

  // Filter script list
  const filteredScripts = useMemo(() => {
    return scriptsWithCounts.filter(s => 
      s.name.toLowerCase().includes(scriptSearch.toLowerCase()) ||
      s.description.toLowerCase().includes(scriptSearch.toLowerCase())
    );
  }, [scriptsWithCounts, scriptSearch]);

  // Determine active list based on selection
  const selectedScriptUsers = useMemo(() => {
    if (selectedScript === 'no-script') {
      return usersWithoutScript.filter(u => 
        u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.department.toLowerCase().includes(userSearch.toLowerCase())
      );
    } else if (selectedScript) {
      return users.filter(u => u.logonScript === selectedScript).filter(u =>
        u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.department.toLowerCase().includes(userSearch.toLowerCase())
      );
    }
    return [];
  }, [selectedScript, users, usersWithoutScript, userSearch]);

  return (
    <div className="space-y-6">
      
      {/* Overview Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        
        {/* Total scripts */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="p-3.5 rounded-xl bg-blue-50 text-blue-600">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Scripts Ativos</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-xl font-display font-bold text-slate-800">{totalScriptsCount}</span>
              <span className="text-[9px] text-blue-600 font-semibold uppercase">Arquivos .BAT</span>
            </div>
          </div>
        </div>

        {/* Users with scripts */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="p-3.5 rounded-xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Com Script de Logon</span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-xl font-display font-bold text-slate-800">{usersWithScript.length}</span>
              <span className="text-xs text-emerald-600 font-semibold font-mono">{pctWithScript}%</span>
            </div>
          </div>
        </div>

        {/* Users without scripts */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="p-3.5 rounded-xl bg-amber-50 text-amber-600">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Sem Script de Logon</span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-xl font-display font-bold text-slate-800">{usersWithoutScript.length}</span>
              <span className="text-xs text-amber-600 font-semibold font-mono">{pctWithoutScript}%</span>
            </div>
          </div>
        </div>

        {/* Path Info */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="p-3.5 rounded-xl bg-slate-100 text-slate-600">
            <FolderLock className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Diretório SYSVOL</span>
            <span className="text-[11px] font-mono font-medium text-slate-500 block truncate mt-0.5" title="\\casanova\SYSVOL\inema.intranet\scripts">
              \\casanova\SYSVOL\inema.intranet\scripts
            </span>
          </div>
        </div>

      </div>

      {/* Main Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Side: Script Files List */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col h-[620px]">
          <div className="p-5 border-b border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-slate-800 text-sm">Scripts de Inicialização</h3>
                <p className="text-[11px] text-slate-400">Selecione para ver as contas associadas</p>
              </div>
            </div>

            {/* Script Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filtrar scripts..."
                value={scriptSearch}
                onChange={(e) => setScriptSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200/70 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all placeholder-slate-400"
              />
            </div>
          </div>

          {/* List scrollable section */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
            
            {/* Category: Sem Script de logon */}
            <div
              onClick={() => {
                setSelectedScript('no-script');
                setUserSearch('');
              }}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                selectedScript === 'no-script'
                  ? 'bg-amber-50/50 border-amber-200/70 ring-1 ring-amber-200/50'
                  : 'bg-white border-slate-100 hover:bg-slate-50/50'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex gap-3">
                  <div className={`p-2 rounded-lg ${selectedScript === 'no-script' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                    <AlertCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-display font-bold text-xs text-slate-800">Nenhum Script Configurado</h4>
                    <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                      Contas sem arquivo de script .bat associado no Perfil do AD.
                    </p>
                  </div>
                </div>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                  selectedScript === 'no-script' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                }`}>
                  {usersWithoutScript.length}
                </span>
              </div>
            </div>

            <div className="border-t border-slate-100 my-2 pt-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2 px-1">
                Scripts do SYSVOL ({filteredScripts.length})
              </span>
            </div>

            {/* List of active script files */}
            {filteredScripts.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                Nenhum arquivo de script encontrado.
              </div>
            ) : (
              filteredScripts.map(script => (
                <div
                  key={script.name}
                  onClick={() => {
                    setSelectedScript(script.name);
                    setUserSearch('');
                  }}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    selectedScript === script.name
                      ? 'bg-blue-50/50 border-blue-200/70 ring-1 ring-blue-200/50'
                      : 'bg-white border-slate-100 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex gap-3">
                      <div className={`p-2 rounded-lg ${selectedScript === script.name ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                        <FileCode className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-mono font-bold text-xs text-slate-800 truncate">{script.name}</h4>
                        <p className="text-[10px] text-slate-400 mt-0.5 leading-tight line-clamp-2">
                          {script.description}
                        </p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full shrink-0 ml-2 ${
                      selectedScript === script.name ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {script.count}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Side: Associated Accounts List */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col h-[620px]">
          
          {/* Header of selected view */}
          <div className="p-5 border-b border-slate-100 bg-slate-50/30 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {selectedScript === 'no-script' ? (
                  <AlertCircle className="w-4.5 h-4.5 text-amber-500" />
                ) : (
                  <FileCode className="w-4.5 h-4.5 text-blue-500" />
                )}
                <h3 className="font-display font-bold text-slate-800 text-sm truncate">
                  {selectedScript === 'no-script' ? 'Contas Sem Script de Logon' : `Script: ${selectedScript}`}
                </h3>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {selectedScript === 'no-script' 
                  ? 'Colaboradores com perfil de rede sem execução de arquivos .bat automatizados.' 
                  : SCRIPT_DESCRIPTIONS[selectedScript || ''] || 'Script customizado do SYSVOL.'}
              </p>
            </div>

            {/* Quick Search accounts */}
            <div className="relative w-full md:w-52">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar contas..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* User accounts list or table */}
          <div className="flex-1 overflow-y-auto">
            {selectedScriptUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8">
                <Users className="w-8 h-8 opacity-40 mb-2" />
                <p className="text-xs">Nenhuma conta associada encontrada.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] text-slate-400 font-semibold uppercase tracking-wider bg-slate-50/50 sticky top-0 z-10">
                    <th className="py-2.5 px-4">Nome completo / Logon</th>
                    <th className="py-2.5 px-4">Departamento</th>
                    <th className="py-2.5 px-4 text-center">Status</th>
                    <th className="py-2.5 px-4 text-right">Script de Logon</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedScriptUsers.map(user => (
                    <tr key={user.id} className="hover:bg-slate-50/40 transition-colors">
                      {/* Name / Username */}
                      <td className="py-3 px-4">
                        <span className="font-bold text-xs text-slate-700 block truncate max-w-[160px]">{user.name}</span>
                        <span className="font-mono text-[10px] text-slate-400 block mt-0.5">{user.username}</span>
                      </td>

                      {/* Department */}
                      <td className="py-3 px-4">
                        <span className="text-xs text-slate-500 block truncate max-w-[150px]" title={user.department}>
                          {user.department}
                        </span>
                        <span className="text-[9px] text-slate-400 font-mono truncate block max-w-[150px]" title={user.ou}>
                          {user.ou.split(',')[0]}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded-full ${
                          user.status === 'Ativa' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100/50' :
                          user.status === 'Bloqueada' ? 'bg-red-50 text-red-700 border border-red-100/50' :
                          user.status === 'Expirada' ? 'bg-amber-50 text-amber-700 border border-amber-100/50' :
                          'bg-slate-50 text-slate-500 border border-slate-100/50'
                        }`}>
                          {user.status}
                        </span>
                      </td>

                      {/* Script configuration */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {user.logonScript ? (
                            <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200/40 font-medium">
                              {user.logonScript}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">
                              Sem script
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          
          {/* Footer informational stats */}
          <div className="p-3 border-t border-slate-100 bg-slate-50/50 text-[10px] text-slate-400 flex items-center justify-between shrink-0">
            <span>Sincronizado com controlador de domínio ativo: <strong>CASANOVA</strong></span>
            <span>Total nesta exibição: <strong>{selectedScriptUsers.length} contas</strong></span>
          </div>
        </div>

      </div>

    </div>
  );
}
