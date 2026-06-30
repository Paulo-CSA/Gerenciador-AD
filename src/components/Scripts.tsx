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
  Check,
  AlertTriangle,
  Info,
  Layers,
  FileWarning
} from 'lucide-react';
import { ADUser } from '../types';

interface ScriptsProps {
  users: ADUser[];
  onUpdateUser?: (updatedUser: ADUser) => Promise<void> | void;
  onAddAuditLog?: (log: any) => void;
}

interface SysvolFile {
  name: string;
  description: string;
  isCustom?: boolean;
}

const INITIAL_SYSVOL_FILES: SysvolFile[] = [
  { name: 'standard_logon.bat', description: 'Script geral para sincronização de horário de domínio e mapeamento da pasta pública institucional.' },
  { name: 'ti_tools.bat', description: 'Mapeamento de unidades de rede de TI, ferramentas administrativas e scripts de backup locais.' },
  { name: 'financeiro_net.bat', description: 'Acesso exclusivo ao servidor ERP Financeiro e mapeamento da pasta compartilhada do setor fiscal.' },
  { name: 'mapeamento_vendas.bat', description: 'Conexão automática com pastas do CRM de Vendas, metas e comissão de equipes comerciais.' },
  { name: 'homologacao_teste.bat', description: 'Script temporário de testes para novos mapeamentos de infraestrutura de rede.' },
  { name: 'old_backup_2024.bat', description: 'Script legado de backup de diretórios locais de usuários para servidor antigo.' },
  { name: 'limpeza_temp.bat', description: 'Script opcional para limpar pastas temporárias do Windows e arquivos temporários de logon.' },
  { name: 'mapear_impressoras_old.cmd', description: 'Mapeamento de impressoras legadas do setor administrativo central (substituído por GPO).' }
];

export default function Scripts({ users, onUpdateUser, onAddAuditLog }: ScriptsProps) {
  // State for physical files in SYSVOL
  const [sysvolFiles, setSysvolFiles] = useState<SysvolFile[]>(INITIAL_SYSVOL_FILES);
  
  // Selection state
  const [selectedScript, setSelectedScript] = useState<string | null>('standard_logon.bat');
  const [scriptFilterTab, setScriptFilterTab] = useState<'all' | 'in-use' | 'unused' | 'orphaned'>('all');
  
  // Searches
  const [scriptSearch, setScriptSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  
  // Custom script creation
  const [newScriptName, setNewScriptName] = useState('');
  const [newScriptDesc, setNewScriptDesc] = useState('');
  const [showAddScript, setShowAddScript] = useState(false);

  // User script editing inline state
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editScriptValue, setEditScriptValue] = useState('');

  // SCRIPT TRACING LOGIC
  const {
    userScriptsUsage,       // Map of scriptName -> count of users
    usersWithoutScript,     // Users with empty logonScript
    sysvolScriptsMap,       // Set of lowercased sysvol filenames
    orphanedScriptsSet,     // Scripts configured in AD users but NOT found in sysvolFiles list
  } = useMemo(() => {
    const usage: { [key: string]: number } = {};
    const woScript: ADUser[] = [];
    const sysvolNamesLower = new Set(sysvolFiles.map(f => f.name.toLowerCase().trim()));

    users.forEach(u => {
      const script = u.logonScript ? u.logonScript.trim() : '';
      if (script) {
        usage[script] = (usage[script] || 0) + 1;
      } else {
        woScript.push(u);
      }
    });

    const orphaned = new Set<string>();
    Object.keys(usage).forEach(scriptName => {
      if (!sysvolNamesLower.has(scriptName.toLowerCase())) {
        orphaned.add(scriptName);
      }
    });

    return {
      userScriptsUsage: usage,
      usersWithoutScript: woScript,
      sysvolScriptsMap: sysvolNamesLower,
      orphanedScriptsSet: orphaned
    };
  }, [users, sysvolFiles]);

  // Transform sysvolFiles + orphaned scripts into a unified data structure
  const allAnalysedScripts = useMemo(() => {
    const list = sysvolFiles.map(file => {
      const count = userScriptsUsage[file.name] || 0;
      return {
        ...file,
        count,
        isOrphaned: false, // exists in SYSVOL
        status: count > 0 ? 'in-use' : 'unused'
      };
    });

    // Add orphaned scripts (configured on users but missing from SYSVOL)
    Array.from(orphanedScriptsSet).forEach(name => {
      const count = userScriptsUsage[name] || 0;
      list.push({
        name,
        description: 'ATENÇÃO: Este script está configurado no AD, mas o arquivo físico correspondente não existe na pasta SYSVOL.',
        isCustom: true,
        count,
        isOrphaned: true,
        status: 'orphaned'
      });
    });

    return list;
  }, [sysvolFiles, userScriptsUsage, orphanedScriptsSet]);

  // Statistics
  const stats = useMemo(() => {
    const totalSysvol = sysvolFiles.length;
    const inUse = allAnalysedScripts.filter(s => s.count > 0 && !s.isOrphaned).length;
    const unused = allAnalysedScripts.filter(s => s.count === 0).length;
    const orphaned = orphanedScriptsSet.size;
    const withScriptCount = users.length - usersWithoutScript.length;

    const pctWithScript = users.length > 0 ? Math.round((withScriptCount / users.length) * 100) : 0;
    const pctWithoutScript = users.length > 0 ? Math.round((usersWithoutScript.length / users.length) * 100) : 0;

    return {
      totalSysvol,
      inUse,
      unused,
      orphaned,
      pctWithScript,
      pctWithoutScript,
      withScriptCount,
      withoutScriptCount: usersWithoutScript.length
    };
  }, [sysvolFiles, allAnalysedScripts, orphanedScriptsSet, users, usersWithoutScript]);

  // Filter script list shown on Left Column based on Search + FilterTab
  const filteredScripts = useMemo(() => {
    return allAnalysedScripts.filter(s => {
      // Search term match
      const matchesSearch = s.name.toLowerCase().includes(scriptSearch.toLowerCase()) || 
                            s.description.toLowerCase().includes(scriptSearch.toLowerCase());
      
      if (!matchesSearch) return false;

      // Tab match
      if (scriptFilterTab === 'in-use') {
        return s.count > 0 && !s.isOrphaned;
      }
      if (scriptFilterTab === 'unused') {
        return s.count === 0;
      }
      if (scriptFilterTab === 'orphaned') {
        return s.isOrphaned;
      }
      return true; // 'all'
    });
  }, [allAnalysedScripts, scriptSearch, scriptFilterTab]);

  // Users listed on Right Column
  const selectedScriptUsers = useMemo(() => {
    if (selectedScript === 'no-script') {
      return usersWithoutScript.filter(u => 
        u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.department.toLowerCase().includes(userSearch.toLowerCase())
      );
    } else if (selectedScript) {
      return users.filter(u => u.logonScript && u.logonScript.trim().toLowerCase() === selectedScript.toLowerCase()).filter(u =>
        u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.department.toLowerCase().includes(userSearch.toLowerCase())
      );
    }
    return [];
  }, [selectedScript, users, usersWithoutScript, userSearch]);

  // Change user logon script
  const handleAssignScript = async (user: ADUser, scriptName: string) => {
    if (!onUpdateUser) return;
    
    const cleanScript = scriptName.trim();
    const updatedUser = {
      ...user,
      logonScript: cleanScript || ""
    };

    try {
      await onUpdateUser(updatedUser);
      
      if (onAddAuditLog) {
        onAddAuditLog({
          id: 'log_script_' + Date.now(),
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
          operator: 'admin',
          action: 'Alteração de Perfil',
          targetUser: user.username,
          details: cleanScript 
            ? `Script de logon alterado para '${cleanScript}'.` 
            : `Script de logon removido de perfil do usuário.`,
          type: cleanScript ? 'success' : 'info'
        });
      }
      setEditingUserId(null);
    } catch (err) {
      console.error("Erro ao atualizar script do usuário:", err);
    }
  };

  // Create new physical .bat file in virtual SYSVOL
  const handleCreateSysvolFile = () => {
    if (!newScriptName) return;
    let cleanName = newScriptName.trim();
    if (!cleanName.endsWith('.bat') && !cleanName.endsWith('.cmd')) {
      cleanName += '.bat';
    }

    // Check duplicate
    if (sysvolFiles.some(f => f.name.toLowerCase() === cleanName.toLowerCase())) {
      alert("Este arquivo de script já existe no diretório SYSVOL!");
      return;
    }

    const newFile: SysvolFile = {
      name: cleanName,
      description: newScriptDesc.trim() || 'Script customizado carregado no SYSVOL corporativo.',
      isCustom: true
    };

    setSysvolFiles([...sysvolFiles, newFile]);
    setSelectedScript(cleanName);
    setNewScriptName('');
    setNewScriptDesc('');
    setShowAddScript(false);

    if (onAddAuditLog) {
      onAddAuditLog({
        id: 'log_sysvol_add_' + Date.now(),
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        operator: 'admin',
        action: 'SYSVOL Upload',
        targetUser: 'Servidor CASANOVA',
        details: `Arquivo de script '${cleanName}' criado no diretório de logon \\\\casanova\\SYSVOL\\inema.intranet\\scripts.`,
        type: 'success'
      });
    }
  };

  // Delete physical .bat file from SYSVOL
  const handleDeleteSysvolFile = (fileName: string) => {
    if (confirm(`Tem certeza que deseja excluir o arquivo '${fileName}' do diretório SYSVOL?`)) {
      setSysvolFiles(sysvolFiles.filter(f => f.name !== fileName));
      setSelectedScript('standard_logon.bat');

      if (onAddAuditLog) {
        onAddAuditLog({
          id: 'log_sysvol_del_' + Date.now(),
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
          operator: 'admin',
          action: 'SYSVOL Delete',
          targetUser: 'Servidor CASANOVA',
          details: `Arquivo de script '${fileName}' excluído do diretório SYSVOL.`,
          type: 'warning'
        });
      }
    }
  };

  // Convert an orphaned script into a registered sysvol script (Fixing script)
  const handleFixOrphanedScript = (scriptName: string) => {
    const fixedFile: SysvolFile = {
      name: scriptName,
      description: `Script recuperado automaticamente após identificação de órfão no perfil de usuário corporativo.`,
      isCustom: true
    };
    setSysvolFiles([...sysvolFiles, fixedFile]);
    
    if (onAddAuditLog) {
      onAddAuditLog({
        id: 'log_sysvol_fix_' + Date.now(),
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        operator: 'admin',
        action: 'SYSVOL Correcão',
        targetUser: 'Servidor CASANOVA',
        details: `Arquivo órfão '${scriptName}' criado fisicamente no SYSVOL para corrigir falhas de logon.`,
        type: 'success'
      });
    }
  };

  // Find info about selected script
  const selectedScriptInfo = useMemo(() => {
    if (selectedScript === 'no-script') return null;
    return allAnalysedScripts.find(s => s.name.toLowerCase() === selectedScript?.toLowerCase());
  }, [selectedScript, allAnalysedScripts]);

  return (
    <div className="space-y-6">
      
      {/* Overview Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        
        {/* Total scripts in SYSVOL */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="p-3.5 rounded-xl bg-blue-50 text-blue-600">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Arquivos no SYSVOL</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-xl font-display font-bold text-slate-800">{stats.totalSysvol}</span>
              <span className="text-[9px] text-blue-600 font-semibold uppercase">Arquivos .BAT / .CMD</span>
            </div>
          </div>
        </div>

        {/* Scripts In Use vs Unused */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="p-3.5 rounded-xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Em Uso (Ativos)</span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-xl font-display font-bold text-slate-800">{stats.inUse}</span>
              <span className="text-xs text-slate-400 font-medium">de {stats.totalSysvol} scripts</span>
            </div>
          </div>
        </div>

        {/* Unused Scripts count */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="p-3.5 rounded-xl bg-amber-50 text-amber-600">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Não Utilizados (Inativos)</span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-xl font-display font-bold text-slate-800">{stats.unused}</span>
              <span className="text-xs text-amber-600 font-semibold uppercase font-mono bg-amber-50 px-1.5 py-0.5 rounded text-[9px]">Limpeza Recomendada</span>
            </div>
          </div>
        </div>

        {/* Orphaned Script Alerts (Critical inconsistency) */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className={`p-3.5 rounded-xl ${stats.orphaned > 0 ? 'bg-rose-50 text-rose-600 animate-pulse' : 'bg-slate-50 text-slate-500'}`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Arquivos Órfãos / Faltantes</span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className={`text-xl font-display font-bold ${stats.orphaned > 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                {stats.orphaned}
              </span>
              <span className="text-[10px] text-slate-400 truncate font-mono">
                {stats.orphaned > 0 ? 'Inconsistência de Perfil' : 'Nenhuma inconsistência'}
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Directory & Core Path Info Banner */}
      <div className="bg-slate-900 text-slate-300 rounded-2xl p-4 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-950/80 text-blue-400 border border-blue-900/50">
            <FolderLock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-bold text-white uppercase tracking-wider">Diretório Físico do SYSVOL no Domínio</p>
            <p className="text-[11px] font-mono text-slate-400 select-all mt-0.5">
              \\casanova\SYSVOL\inema.intranet\scripts
            </p>
          </div>
        </div>
        <div className="flex gap-4 text-xs font-mono">
          <div className="bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/50">
            <span className="text-emerald-400">●</span> Sincronização: <span className="text-white font-bold">ATIVA</span>
          </div>
          <div className="bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/50">
            Mapeados no AD: <span className="text-white font-bold">{stats.withScriptCount} usuários</span>
          </div>
        </div>
      </div>

      {/* Main Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Side: Script Files List */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col h-[650px]">
          
          <div className="p-5 border-b border-slate-100 space-y-4 shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-slate-800 text-sm">Scripts de Inicialização</h3>
                <p className="text-[11px] text-slate-400">Monitore, crie ou analise arquivos de script</p>
              </div>
              <button 
                onClick={() => setShowAddScript(!showAddScript)}
                className="p-1.5 hover:bg-slate-50 text-blue-600 hover:text-blue-700 transition-colors border border-slate-100 rounded-lg flex items-center gap-1 text-[11px] font-bold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Novo .BAT</span>
              </button>
            </div>

            {/* Quick Add Script Form */}
            {showAddScript && (
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-2.5">
                <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Criar Script no SYSVOL</p>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={newScriptName}
                    onChange={(e) => setNewScriptName(e.target.value)}
                    placeholder="Nome do arquivo (ex: ti_v2.bat)"
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={newScriptDesc}
                    onChange={(e) => setNewScriptDesc(e.target.value)}
                    placeholder="Descrição / Função do script"
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={() => setShowAddScript(false)}
                      className="text-slate-500 hover:bg-slate-100 font-semibold text-xs px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleCreateSysvolFile}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                    >
                      Confirmar Criação
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Tracing Filter Tabs */}
            <div className="flex border-b border-slate-100 p-0.5 bg-slate-50 rounded-xl">
              <button
                onClick={() => setScriptFilterTab('all')}
                className={`flex-1 text-center py-1.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                  scriptFilterTab === 'all' 
                    ? 'bg-white text-slate-800 shadow-sm' 
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                Todos ({stats.totalSysvol + stats.orphaned})
              </button>
              <button
                onClick={() => setScriptFilterTab('in-use')}
                className={`flex-1 text-center py-1.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                  scriptFilterTab === 'in-use' 
                    ? 'bg-white text-slate-800 shadow-sm' 
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                Em Uso ({stats.inUse})
              </button>
              <button
                onClick={() => setScriptFilterTab('unused')}
                className={`flex-1 text-center py-1.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                  scriptFilterTab === 'unused' 
                    ? 'bg-white text-amber-700 shadow-sm' 
                    : 'text-slate-400 hover:text-amber-600'
                }`}
                title="Scripts no SYSVOL que não possuem nenhuma conta de usuário associada"
              >
                Não Usados ({stats.unused})
              </button>
              <button
                onClick={() => setScriptFilterTab('orphaned')}
                className={`flex-1 text-center py-1.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                  scriptFilterTab === 'orphaned' 
                    ? 'bg-white text-rose-700 shadow-sm' 
                    : 'text-slate-400 hover:text-rose-600'
                }`}
                title="Scripts configurados nos usuários mas ausentes do SYSVOL"
              >
                Inconsistentes ({stats.orphaned})
              </button>
            </div>

            {/* Script Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filtrar scripts na exibição..."
                value={scriptSearch}
                onChange={(e) => setScriptSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200/70 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all placeholder-slate-400"
              />
            </div>
          </div>

          {/* List scrollable section */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
            
            {/* Category: Sem Script de logon (Only shown when filter is 'all' or no-script) */}
            {(scriptFilterTab === 'all' || scriptFilterTab === 'unused') && (
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
                      <h4 className="font-display font-bold text-xs text-slate-800">Sem Script Configurado</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                        Contas com logon limpo (Nenhum script .bat definido no Perfil do AD).
                      </p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                    selectedScript === 'no-script' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {stats.withoutScriptCount}
                  </span>
                </div>
              </div>
            )}

            <div className="border-t border-slate-100 my-2 pt-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2 px-1">
                {scriptFilterTab === 'all' && 'Arquivos e Mapeamentos Identificados'}
                {scriptFilterTab === 'in-use' && 'Scripts Ativamente em Uso'}
                {scriptFilterTab === 'unused' && 'Scripts Ociosos (Não Mapeados)'}
                {scriptFilterTab === 'orphaned' && 'Scripts Ausentes no SYSVOL (Crítico)'}
              </span>
            </div>

            {/* List of active script files */}
            {filteredScripts.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
                <FileCode className="w-8 h-8 opacity-30" />
                <span>Nenhum script corresponde ao filtro aplicado.</span>
              </div>
            ) : (
              filteredScripts.map(script => (
                <div
                  key={script.name}
                  onClick={() => {
                    setSelectedScript(script.name);
                    setUserSearch('');
                  }}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer relative overflow-hidden ${
                    selectedScript?.toLowerCase() === script.name.toLowerCase()
                      ? script.isOrphaned 
                        ? 'bg-rose-50/50 border-rose-200/70 ring-1 ring-rose-200/50'
                        : script.count === 0 
                        ? 'bg-amber-50/50 border-amber-200/70 ring-1 ring-amber-200/50'
                        : 'bg-blue-50/50 border-blue-200/70 ring-1 ring-blue-200/50'
                      : 'bg-white border-slate-100 hover:bg-slate-50/50'
                  }`}
                >
                  {/* Orphaned Left Indicator Line */}
                  {script.isOrphaned && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-rose-500"></div>
                  )}
                  {script.count === 0 && !script.isOrphaned && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-400"></div>
                  )}

                  <div className="flex justify-between items-start">
                    <div className="flex gap-3">
                      <div className={`p-2 rounded-lg ${
                        selectedScript?.toLowerCase() === script.name.toLowerCase()
                          ? script.isOrphaned ? 'bg-rose-100 text-rose-700' : script.count === 0 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                          : script.isOrphaned ? 'bg-rose-50 text-rose-600' : script.count === 0 ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {script.isOrphaned ? <FileWarning className="w-4 h-4" /> : <FileCode className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <h4 className="font-mono font-bold text-xs text-slate-800 truncate">{script.name}</h4>
                          {script.isOrphaned && (
                            <span className="bg-rose-100 text-rose-800 font-bold text-[8px] px-1 rounded uppercase">Ausente</span>
                          )}
                          {script.count === 0 && !script.isOrphaned && (
                            <span className="bg-amber-100 text-amber-800 font-bold text-[8px] px-1 rounded uppercase">Inativo</span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5 leading-tight line-clamp-2">
                          {script.description}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                        selectedScript?.toLowerCase() === script.name.toLowerCase()
                          ? script.isOrphaned ? 'bg-rose-100 text-rose-800' : script.count === 0 ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                          : script.isOrphaned ? 'bg-rose-50 text-rose-800' : script.count === 0 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {script.count} {script.count === 1 ? 'conta' : 'contas'}
                      </span>

                      {/* Delete button if file is unused and not default */}
                      {script.count === 0 && !script.isOrphaned && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSysvolFile(script.name);
                          }}
                          className="p-1 hover:bg-rose-50 text-slate-400 hover:text-red-500 rounded transition-colors"
                          title="Excluir do diretório SYSVOL"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Side: Associated Accounts List & Diagnostic Warnings */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col h-[650px]">
          
          {/* Header of selected view */}
          <div className="p-5 border-b border-slate-100 bg-slate-50/30 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {selectedScript === 'no-script' ? (
                  <AlertCircle className="w-4.5 h-4.5 text-amber-500" />
                ) : selectedScriptInfo?.isOrphaned ? (
                  <AlertTriangle className="w-4.5 h-4.5 text-rose-500 animate-pulse" />
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
                  : selectedScriptInfo?.description}
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

          {/* Diagnostic Warnings based on selection */}
          <div className="shrink-0 p-4 border-b border-slate-100 bg-slate-50/50 space-y-3">
            
            {/* 1. Selected script is UNUSED */}
            {selectedScriptInfo && selectedScriptInfo.count === 0 && !selectedScriptInfo.isOrphaned && (
              <div className="bg-amber-50 border border-amber-200/60 rounded-xl p-3 flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-[11px] text-amber-800 leading-relaxed">
                  <span className="font-bold block">Script não utilizado</span>
                  Este arquivo .bat físico está presente no SYSVOL do servidor <strong className="font-mono">CASANOVA</strong>, mas nenhuma conta o está chamando. É seguro excluí-lo ou você pode associá-lo a novos usuários.
                </div>
              </div>
            )}

            {/* 2. Selected script is ORPHANED */}
            {selectedScriptInfo && selectedScriptInfo.isOrphaned && (
              <div className="bg-rose-50 border border-rose-200/60 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                  <div className="text-[11px] text-rose-800 leading-relaxed flex-1">
                    <span className="font-bold block text-xs">Inconsistência de Diretório Detectada!</span>
                    Existem <strong className="font-mono">{selectedScriptInfo.count} contas</strong> configuradas para carregar o arquivo <strong className="font-mono">{selectedScript}</strong>, porém este arquivo não existe fisicamente no SYSVOL. Os mapeamentos falharão no login destas contas.
                  </div>
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    onClick={() => handleFixOrphanedScript(selectedScript || '')}
                    className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Criar Script Faltante no SYSVOL</span>
                  </button>
                </div>
              </div>
            )}

            {/* 3. General advice */}
            {!selectedScriptInfo && selectedScript === 'no-script' && (
              <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                <div className="text-[11px] text-slate-600 leading-normal">
                  Estas contas efetuam login puro sem mapear unidades ou executar instruções locais por meio de arquivos .bat legados. Recomenda-se utilizar GPOs de mapeamento para novos computadores de domínio.
                </div>
              </div>
            )}

          </div>

          {/* User accounts list or table */}
          <div className="flex-1 overflow-y-auto">
            {selectedScriptUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8">
                <Users className="w-8 h-8 opacity-40 mb-2" />
                <p className="text-xs">Nenhuma conta associada encontrada.</p>
                {selectedScript !== 'no-script' && selectedScriptInfo && selectedScriptInfo.count === 0 && (
                  <p className="text-[10px] text-slate-400 mt-1 max-w-xs text-center">
                    Você pode atribuir este script a qualquer usuário acessando o módulo de "Gerenciamento de Contas" ou digitando o script de logon no perfil do usuário.
                  </p>
                )}
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] text-slate-400 font-semibold uppercase tracking-wider bg-slate-50/50 sticky top-0 z-10">
                    <th className="py-2.5 px-4">Nome completo / Logon</th>
                    <th className="py-2.5 px-4">Departamento</th>
                    <th className="py-2.5 px-4 text-center">Status</th>
                    <th className="py-2.5 px-4 text-right">Ação / Script</th>
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

                      {/* Action / script configuration */}
                      <td className="py-3 px-4 text-right">
                        {editingUserId === user.id ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <input
                              type="text"
                              value={editScriptValue}
                              onChange={(e) => setEditScriptValue(e.target.value)}
                              placeholder="ex: script.bat"
                              className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-mono text-slate-700 focus:ring-1 focus:ring-blue-500 focus:outline-none w-32"
                            />
                            <button
                              onClick={() => handleAssignScript(user, editScriptValue)}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors cursor-pointer"
                              title="Confirmar alteração"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingUserId(null)}
                              className="p-1 text-red-500 hover:bg-red-50 rounded transition-colors cursor-pointer"
                              title="Cancelar"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            {user.logonScript ? (
                              <span className={`font-mono text-[10px] px-2 py-0.5 rounded border ${
                                selectedScriptInfo?.isOrphaned 
                                  ? 'bg-rose-50 text-rose-600 border-rose-200' 
                                  : 'bg-slate-100 text-slate-600 border-slate-200/40'
                              }`}>
                                {user.logonScript}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">
                                Sem script
                              </span>
                            )}
                            <button
                              onClick={() => {
                                setEditingUserId(user.id);
                                setEditScriptValue(user.logonScript || '');
                              }}
                              className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                              title="Alterar script de logon"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
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
