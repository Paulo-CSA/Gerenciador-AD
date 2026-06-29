/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  ShieldCheck, 
  Search, 
  Download, 
  Plus, 
  Link2, 
  Link2Off, 
  CheckCircle2, 
  XCircle, 
  FileText, 
  Settings, 
  TrendingUp,
  LayoutGrid,
  Info,
  Calendar,
  User,
  Activity,
  AlertTriangle,
  FolderTree
} from 'lucide-react';
import { GPO } from '../types';
import { 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend 
} from 'recharts';

export default function GroupPolicies() {
  // Simulated database of default GPOs
  const [gpos, setGpos] = useState<GPO[]>([
    {
      id: 'gpo-1',
      name: 'Default Domain Policy',
      status: 'Ativo',
      linkedTo: ['DC=empresa,DC=local'],
      enforced: true,
      gpoType: 'Segurança',
      description: 'Política padrão do domínio. Define requisitos de senha, bloqueio de conta e criptografia Kerberos.',
      modifiedDate: '2026-05-12 14:32:10',
      author: 'administrator@empresa.local'
    },
    {
      id: 'gpo-2',
      name: 'WSUS - Atualizações Automáticas de TI',
      status: 'Ativo',
      linkedTo: ['OU=Computadores,OU=TI'],
      enforced: false,
      gpoType: 'Modelos Administrativos',
      description: 'Configura os computadores para buscarem atualizações críticas do Windows Update no servidor interno de WSUS.',
      modifiedDate: '2026-06-20 09:15:00',
      author: 'ana.santos@empresa.com.br'
    },
    {
      id: 'gpo-3',
      name: 'Bloqueio de Dispositivos USB de Armazenamento',
      status: 'Ativo',
      linkedTo: ['OU=Usuarios,OU=TI', 'OU=Financeiro,OU=Usuarios'],
      enforced: true,
      gpoType: 'Segurança',
      description: 'Garante o bloqueio de leitura/escrita em pendrives e dispositivos USB não autorizados por questões de conformidade LGPD.',
      modifiedDate: '2026-06-18 16:45:22',
      author: 'administrator@empresa.local'
    },
    {
      id: 'gpo-4',
      name: 'Mapeamento Automático de Impressoras e Rede',
      status: 'Ativo',
      linkedTo: ['OU=Usuarios'],
      enforced: false,
      gpoType: 'Preferências',
      description: 'Mapeia as impressoras departamentais e unidades compartilhadas de arquivos (Z: e S:) no logon do usuário.',
      modifiedDate: '2026-04-10 11:20:05',
      author: 'carlos.souza@empresa.com.br'
    },
    {
      id: 'gpo-5',
      name: 'Papel de Parede Corporativo Padrão',
      status: 'Desativado',
      linkedTo: [], // Unlinked
      enforced: false,
      gpoType: 'Modelos Administrativos',
      description: 'Aplica o papel de parede oficial e impede que os usuários alterem o fundo de tela da área de trabalho.',
      modifiedDate: '2026-03-01 08:00:00',
      author: 'mariana.oliveira@empresa.com.br'
    },
    {
      id: 'gpo-6',
      name: 'Desativação de Painel de Controle e Prompt (CMD)',
      status: 'Ativo',
      linkedTo: ['OU=Financeiro,OU=Usuarios'],
      enforced: true,
      gpoType: 'Segurança',
      description: 'Impede o acesso do usuário comum às configurações administrativas do Windows e ao interpretador de comandos.',
      modifiedDate: '2026-06-22 10:05:40',
      author: 'administrator@empresa.local'
    },
    {
      id: 'gpo-7',
      name: 'Script de Logon - Auditoria Diária de Inventário',
      status: 'Ativo',
      linkedTo: ['DC=empresa,DC=local'],
      enforced: false,
      gpoType: 'Scripts',
      description: 'Executa um script PowerShell silencioso para coletar informações básicas de hardware e software das estações.',
      modifiedDate: '2026-05-30 17:50:11',
      author: 'ana.santos@empresa.com.br'
    },
    {
      id: 'gpo-8',
      name: 'Configuração Automática de Proxy de Navegador',
      status: 'Ativo',
      linkedTo: [], // Unlinked
      enforced: false,
      gpoType: 'Preferências',
      description: 'Define as configurações padrão do proxy de internet de maneira transparente para o Microsoft Edge e Chrome.',
      modifiedDate: '2026-01-15 14:30:00',
      author: 'carlos.souza@empresa.com.br'
    },
    {
      id: 'gpo-9',
      name: 'Instalação Silenciosa de Agente de Endpoint Antivírus',
      status: 'Ativo',
      linkedTo: ['OU=Computadores,OU=TI'],
      enforced: false,
      gpoType: 'Software',
      description: 'Garante que o instalador MSI do antivírus corporativo seja implantado automaticamente nas estações de trabalho.',
      modifiedDate: '2026-06-25 15:10:55',
      author: 'ana.santos@empresa.com.br'
    },
    {
      id: 'gpo-10',
      name: 'Bloqueio de Sincronização do OneDrive Pessoal',
      status: 'Desativado',
      linkedTo: [], // Unlinked
      enforced: false,
      gpoType: 'Modelos Administrativos',
      description: 'Impede os usuários de vincularem suas contas pessoais do OneDrive no computador corporativo.',
      modifiedDate: '2026-02-12 09:40:18',
      author: 'mariana.oliveira@empresa.com.br'
    }
  ]);

  // Form State for creating new GPO
  const [showAddForm, setShowAddForm] = useState(false);
  const [newGpoName, setNewGpoName] = useState('');
  const [newGpoType, setNewGpoType] = useState<GPO['gpoType']>('Segurança');
  const [newGpoDescription, setNewGpoDescription] = useState('');
  const [newGpoStatus, setNewGpoStatus] = useState<GPO['status']>('Ativo');
  const [newGpoLinkOU, setNewGpoLinkOU] = useState('');
  const [newGpoEnforced, setNewGpoEnforced] = useState(false);

  // Search and Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterUsage, setFilterUsage] = useState<'all' | 'in-use' | 'not-in-use'>('all');
  const [selectedGpoId, setSelectedGpoId] = useState<string | null>('gpo-1');

  // List of standard Active Directory OUs for easy linking
  const availableOUs = [
    'DC=empresa,DC=local',
    'OU=Usuarios',
    'OU=Computadores,OU=TI',
    'OU=Tecnologia,OU=Usuarios',
    'OU=Financeiro,OU=Usuarios',
    'OU=RH,OU=Usuarios'
  ];

  // Calculations for KPI Cards
  const totalGpos = gpos.length;
  const inUseGpos = gpos.filter(g => g.linkedTo.length > 0).length;
  const notInUseGpos = totalGpos - inUseGpos;
  const enforcedGpos = gpos.filter(g => g.enforced).length;

  // Selected GPO Object
  const selectedGpo = useMemo(() => {
    return gpos.find(g => g.id === selectedGpoId) || null;
  }, [gpos, selectedGpoId]);

  // Handle toggling GPO status
  const handleToggleStatus = (id: string) => {
    setGpos(prev => prev.map(g => {
      if (g.id === id) {
        const nextStatus: GPO['status'] = g.status === 'Ativo' ? 'Desativado' : 'Ativo';
        return {
          ...g,
          status: nextStatus,
          modifiedDate: new Date().toISOString().replace('T', ' ').substring(0, 19)
        };
      }
      return g;
    }));
  };

  // Handle toggling GPO enforcement
  const handleToggleEnforced = (id: string) => {
    setGpos(prev => prev.map(g => {
      if (g.id === id) {
        return {
          ...g,
          enforced: !g.enforced,
          modifiedDate: new Date().toISOString().replace('T', ' ').substring(0, 19)
        };
      }
      return g;
    }));
  };

  // Handle linking/unlinking an OU
  const handleToggleLinkOU = (id: string, ou: string) => {
    setGpos(prev => prev.map(g => {
      if (g.id === id) {
        const isAlreadyLinked = g.linkedTo.includes(ou);
        const nextLinked = isAlreadyLinked 
          ? g.linkedTo.filter(item => item !== ou)
          : [...g.linkedTo, ou];
        return {
          ...g,
          linkedTo: nextLinked,
          modifiedDate: new Date().toISOString().replace('T', ' ').substring(0, 19)
        };
      }
      return g;
    }));
  };

  // Handle adding a new GPO
  const handleCreateGpo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGpoName.trim()) return;

    const newGpo: GPO = {
      id: `gpo-${Date.now()}`,
      name: newGpoName,
      status: newGpoStatus,
      linkedTo: newGpoLinkOU ? [newGpoLinkOU] : [],
      enforced: newGpoEnforced,
      gpoType: newGpoType,
      description: newGpoDescription || 'Nenhuma descrição fornecida.',
      modifiedDate: new Date().toISOString().replace('T', ' ').substring(0, 19),
      author: 'administrator@empresa.local'
    };

    setGpos(prev => [newGpo, ...prev]);
    setSelectedGpoId(newGpo.id);
    setShowAddForm(false);
    
    // Clear Form fields
    setNewGpoName('');
    setNewGpoType('Segurança');
    setNewGpoDescription('');
    setNewGpoStatus('Ativo');
    setNewGpoLinkOU('');
    setNewGpoEnforced(false);
  };

  // Filter GPOs based on query search and selectors
  const filteredGpos = useMemo(() => {
    return gpos.filter(g => {
      const matchesSearch = g.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            g.description.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesType = filterType === 'all' || g.gpoType === filterType;
      
      const matchesStatus = filterStatus === 'all' || g.status === filterStatus;
      
      const matchesUsage = filterUsage === 'all' || 
                           (filterUsage === 'in-use' && g.linkedTo.length > 0) ||
                           (filterUsage === 'not-in-use' && g.linkedTo.length === 0);

      return matchesSearch && matchesType && matchesStatus && matchesUsage;
    });
  }, [gpos, searchTerm, filterType, filterStatus, filterUsage]);

  // CSV Export of the current list of GPOs
  const handleExportCSV = () => {
    const headers = ['ID', 'Nome da GPO', 'Tipo de GPO', 'Status', 'GPO Imposta', 'Vinculos (OUs)', 'Ultima Modificacao', 'Autor', 'Descricao'];
    const csvRows = [headers.join(';')];

    filteredGpos.forEach(g => {
      const row = [
        `"${g.id}"`,
        `"${g.name}"`,
        `"${g.gpoType}"`,
        `"${g.status}"`,
        `"${g.enforced ? 'Sim' : 'Não'}"`,
        `"${g.linkedTo.join(' | ')}"`,
        `"${g.modifiedDate}"`,
        `"${g.author}"`,
        `"${g.description}"`
      ];
      csvRows.push(row.join(';'));
    });

    const csvContent = '\uFEFF' + csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `AD_Politicas_De_Grupo_GPO.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Chart Data Preparation ---

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

  // Chart 3: GPO Link Breakdown (Detailed bar chart showing count of links)
  const gpoLinksBreakdownData = useMemo(() => {
    return gpos.map(g => ({
      name: g.name.length > 25 ? g.name.substring(0, 22) + '...' : g.name,
      vinculos: g.linkedTo.length,
      status: g.status
    })).sort((a, b) => b.vinculos - a.vinculos);
  }, [gpos]);

  return (
    <div className="flex flex-col gap-6" id="group-policies-section">
      
      {/* Visual Metric KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0 border border-blue-100">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total de GPOs</p>
            <h4 className="text-2xl font-bold font-display text-slate-800 mt-0.5">{totalGpos}</h4>
            <span className="text-[10px] text-slate-500">Cadastradas no Sysvol</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center shrink-0 border border-emerald-100">
            <Link2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">GPOs em Uso</p>
            <h4 className="text-2xl font-bold font-display text-slate-800 mt-0.5">{inUseGpos}</h4>
            <span className="text-[10px] text-emerald-600 font-semibold">
              {((inUseGpos / totalGpos) * 100).toFixed(0)}% Vinculadas a OUs
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-50 text-slate-500 rounded-xl flex items-center justify-center shrink-0 border border-slate-100">
            <Link2Off className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Não Utilizadas</p>
            <h4 className="text-2xl font-bold font-display text-slate-800 mt-0.5">{notInUseGpos}</h4>
            <span className="text-[10px] text-slate-500">Órfãs ou sem vínculo</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center shrink-0 border border-rose-100">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">GPOs Forçadas</p>
            <h4 className="text-2xl font-bold font-display text-slate-800 mt-0.5">{enforcedGpos}</h4>
            <span className="text-[10px] text-rose-600 font-semibold">Prevalecem sobre bloqueios</span>
          </div>
        </div>
      </div>

      {/* Graphical Dashboard Panel (Visualizations) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Chart 1: GPO usage donut */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex flex-col h-[280px]">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2 shrink-0">
            <Activity className="w-4 h-4 text-blue-500" />
            Taxa de Vínculo (Uso de GPOs)
          </h3>
          <div className="flex-1 min-h-0 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={usageChartData}
                  cx="50%"
                  cy="45%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {usageChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ fontSize: '11px', borderRadius: '8px', border: '1px solid #f1f5f9' }}
                />
              </PieChart>
            </ResponsiveContainer>
            
            {/* Center value overlay */}
            <div className="absolute top-[35%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
              <span className="text-2xl font-bold text-slate-800">{inUseGpos}</span>
              <span className="text-[10px] text-slate-400 block font-semibold">Em Uso</span>
            </div>
          </div>
          
          {/* Custom legend */}
          <div className="flex justify-center gap-4 text-xs mt-2 shrink-0">
            {usageChartData.map((item, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-slate-500 font-medium text-[11px]">{item.name} ({item.value})</span>
              </div>
            ))}
          </div>
        </div>

        {/* Chart 2: GPO types breakdown */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex flex-col h-[280px]">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2 shrink-0">
            <LayoutGrid className="w-4 h-4 text-emerald-500" />
            Classificação por Categorias
          </h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={typeChartData}
                  cx="50%"
                  cy="45%"
                  outerRadius={75}
                  dataKey="value"
                  label={({ name, value }) => `${name.substring(0,8)} (${value})`}
                  labelLine={false}
                >
                  {typeChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ fontSize: '11px', borderRadius: '8px', border: '1px solid #f1f5f9' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2 justify-center text-[10px] shrink-0 mt-1 max-h-[45px] overflow-y-auto">
            {typeChartData.map((item, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-slate-500 font-semibold">{item.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Chart 3: Links per GPO Bar Chart */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex flex-col h-[280px]">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-2 shrink-0">
            <TrendingUp className="w-4 h-4 text-purple-500" />
            Densidade de Vínculos por GPO
          </h3>
          <div className="flex-1 min-h-0 mt-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={gpoLinksBreakdownData.slice(0, 5)} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 9 }} stroke="#94a3b8" allowDecimals={false} />
                <Tooltip 
                  contentStyle={{ fontSize: '11px', borderRadius: '8px', border: '1px solid #f1f5f9' }}
                  cursor={{ fill: '#f8fafc' }}
                />
                <Bar dataKey="vinculos" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="OUs Vinculadas" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-center text-slate-400 mt-1 shrink-0">
            Mostrando as 5 políticas de maior distribuição no diretório
          </p>
        </div>

      </div>

      {/* Main Interactive Management Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Left Side: GPO List Workspace */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-xs flex flex-col min-h-[480px]">
          
          {/* Header Actions */}
          <div className="p-4 border-b border-slate-50 flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-blue-500" />
              <h2 className="text-sm font-bold text-slate-800">Políticas Ativas no Sysvol</h2>
            </div>

            <div className="flex items-center gap-2 self-end md:self-auto">
              <button
                onClick={handleExportCSV}
                className="text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all border border-slate-200 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Exportar Lista
              </button>
              
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Nova GPO
              </button>
            </div>
          </div>

          {/* New GPO Form */}
          {showAddForm && (
            <form onSubmit={handleCreateGpo} className="p-4 bg-blue-50/40 border-b border-blue-50 flex flex-col gap-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-800 flex items-center gap-1.5">
                  <Plus className="w-4 h-4" /> Criar Novo Objeto de Política de Grupo (GPO)
                </span>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="text-slate-400 hover:text-slate-600 text-xs font-semibold"
                >
                  Cancelar
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-slate-500">Nome do Objeto GPO</label>
                  <input
                    type="text"
                    required
                    placeholder="ex: Bloqueio de Jogos e Rede Social"
                    value={newGpoName}
                    onChange={e => setNewGpoName(e.target.value)}
                    className="text-xs px-3 py-1.5 border border-slate-200 rounded-md outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-slate-500">Tipo de Configuração</label>
                  <select
                    value={newGpoType}
                    onChange={e => setNewGpoType(e.target.value as GPO['gpoType'])}
                    className="text-xs px-3 py-1.5 border border-slate-200 rounded-md outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                  >
                    <option value="Segurança">Segurança</option>
                    <option value="Preferências">Preferências</option>
                    <option value="Modelos Administrativos">Modelos Administrativos</option>
                    <option value="Software">Software</option>
                    <option value="Scripts">Scripts</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1 md:col-span-2">
                  <label className="text-[11px] font-semibold text-slate-500">Descrição / Objetivo da Política</label>
                  <input
                    type="text"
                    placeholder="Garante o bloqueio de sites e executáveis específicos de jogos..."
                    value={newGpoDescription}
                    onChange={e => setNewGpoDescription(e.target.value)}
                    className="text-xs px-3 py-1.5 border border-slate-200 rounded-md outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-slate-500">Vincular Imediatamente à Unidade (Opcional)</label>
                  <select
                    value={newGpoLinkOU}
                    onChange={e => setNewGpoLinkOU(e.target.value)}
                    className="text-xs px-3 py-1.5 border border-slate-200 rounded-md outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                  >
                    <option value="">Não vincular ainda (manter desvinculada)</option>
                    {availableOUs.map(ou => (
                      <option key={ou} value={ou}>{ou}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-4 mt-4">
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newGpoEnforced}
                      onChange={e => setNewGpoEnforced(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    Forçar Aplicação (Enforced)
                  </label>

                  <div className="flex gap-2 text-xs ml-auto">
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 font-bold text-white rounded-md cursor-pointer"
                    >
                      Salvar Política
                    </button>
                  </div>
                </div>
              </div>
            </form>
          )}

          {/* Search and Advanced Filter Tools */}
          <div className="p-4 bg-slate-50/60 border-b border-slate-50 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar GPOs por nome ou descrição..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full text-xs pl-9 pr-4 py-2 border border-slate-200 rounded-lg bg-white outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                className="text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white outline-none"
              >
                <option value="all">Todos os Tipos</option>
                <option value="Segurança">Segurança</option>
                <option value="Preferências">Preferências</option>
                <option value="Modelos Administrativos">Modelos Adm.</option>
                <option value="Software">Software</option>
                <option value="Scripts">Scripts</option>
              </select>

              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white outline-none"
              >
                <option value="all">Status (Ativo/Desat.)</option>
                <option value="Ativo">Ativas</option>
                <option value="Desativado">Desativadas</option>
              </select>

              <select
                value={filterUsage}
                onChange={e => setFilterUsage(e.target.value as any)}
                className="text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white outline-none"
              >
                <option value="all">Vínculo (Todos)</option>
                <option value="in-use">Vinculadas (Em Uso)</option>
                <option value="not-in-use">Não Utilizadas</option>
              </select>
            </div>
          </div>

          {/* GPO List Table Grid */}
          <div className="flex-1 overflow-x-auto">
            {filteredGpos.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
                <AlertTriangle className="w-8 h-8 text-amber-500" />
                <span>Nenhuma política de grupo atende aos filtros aplicados.</span>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/30 text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-50">
                    <th className="py-3 px-4 font-semibold">Política / Diretiva do Sysvol</th>
                    <th className="py-3 px-4 font-semibold">Categoria</th>
                    <th className="py-3 px-4 font-semibold text-center">Status</th>
                    <th className="py-3 px-4 font-semibold text-center">Uso / Vínculo</th>
                    <th className="py-3 px-4 font-semibold text-center">GPO Imposta</th>
                    <th className="py-3 px-4 font-semibold text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredGpos.map((g) => (
                    <tr 
                      key={g.id} 
                      onClick={() => setSelectedGpoId(g.id)}
                      className={`cursor-pointer transition-colors ${
                        selectedGpoId === g.id ? 'bg-blue-50/30 font-medium' : 'hover:bg-slate-50/20'
                      }`}
                    >
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="font-semibold text-slate-800 text-xs truncate" title={g.name}>
                          {g.name}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 truncate" title={g.description}>
                          {g.description}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 shrink-0">
                        <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          g.gpoType === 'Segurança' ? 'bg-rose-50 text-rose-700 border border-rose-100' :
                          g.gpoType === 'Preferências' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                          g.gpoType === 'Modelos Administrativos' ? 'bg-purple-50 text-purple-700 border border-purple-100' :
                          g.gpoType === 'Software' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                          'bg-cyan-50 text-cyan-700 border border-cyan-100'
                        }`}>
                          {g.gpoType}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {g.status === 'Ativo' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" /> Ativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                            <XCircle className="w-3 h-3" /> Desativado
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {g.linkedTo.length > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">
                            <Link2 className="w-3 h-3" /> {g.linkedTo.length} {g.linkedTo.length === 1 ? 'Vínculo' : 'Vínculos'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">
                            <Link2Off className="w-3 h-3" /> Não Utilizada
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`text-[11px] font-semibold ${g.enforced ? 'text-rose-600' : 'text-slate-400'}`}>
                          {g.enforced ? 'Imposta (Sim)' : 'Não'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => handleToggleStatus(g.id)}
                          className={`text-[10px] font-bold px-2 py-1 rounded transition-colors ${
                            g.status === 'Ativo' 
                              ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200' 
                              : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                          } cursor-pointer`}
                        >
                          {g.status === 'Ativo' ? 'Desativar' : 'Ativar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Side: GPO Linked OUs & Interactive Controls */}
        <div className="xl:col-span-1 flex flex-col gap-4">
          
          {selectedGpo ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-5 flex flex-col min-h-[480px]">
              
              {/* Header Title with Icon */}
              <div className="flex items-start gap-3 border-b border-slate-50 pb-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  selectedGpo.gpoType === 'Segurança' ? 'bg-rose-50 text-rose-600 border border-rose-100' :
                  selectedGpo.gpoType === 'Preferências' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                  selectedGpo.gpoType === 'Modelos Administrativos' ? 'bg-purple-50 text-purple-600 border border-purple-100' :
                  'bg-blue-50 text-blue-600 border border-blue-100'
                }`}>
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-800 text-sm tracking-tight leading-tight">
                    {selectedGpo.name}
                  </h3>
                  <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                    ID: {selectedGpo.id}
                  </span>
                </div>
              </div>

              {/* GPO properties */}
              <div className="my-4 flex flex-col gap-3 flex-1 overflow-y-auto pr-1">
                
                {/* Description */}
                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Info className="w-3 h-3 text-slate-400" /> Descrição da Diretiva
                  </h4>
                  <p className="text-xs text-slate-600 bg-slate-50/50 border border-slate-100 p-2.5 rounded-lg leading-relaxed">
                    {selectedGpo.description}
                  </p>
                </div>

                {/* Properties list */}
                <div className="grid grid-cols-2 gap-3 bg-slate-50/20 p-2.5 rounded-xl border border-slate-100">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-semibold text-slate-400 uppercase">Status</span>
                    <span className={`text-xs font-bold ${selectedGpo.status === 'Ativo' ? 'text-emerald-600' : 'text-slate-500'}`}>
                      {selectedGpo.status}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-semibold text-slate-400 uppercase">Prevalência</span>
                    <span className={`text-xs font-bold ${selectedGpo.enforced ? 'text-rose-600' : 'text-slate-500'}`}>
                      {selectedGpo.enforced ? 'Forçado (Enforced)' : 'Normal'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-semibold text-slate-400 uppercase flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" /> Modificação
                    </span>
                    <span className="text-xs text-slate-700 font-mono">
                      {selectedGpo.modifiedDate.split(' ')[0]}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-semibold text-slate-400 uppercase flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-400" /> Autor
                    </span>
                    <span className="text-xs text-slate-700 truncate" title={selectedGpo.author}>
                      {selectedGpo.author.split('@')[0]}
                    </span>
                  </div>
                </div>

                {/* Toggle Actions section */}
                <div className="flex items-center gap-2 mt-1">
                  <button
                    onClick={() => handleToggleEnforced(selectedGpo.id)}
                    className={`flex-1 text-center py-1.5 px-3 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                      selectedGpo.enforced 
                        ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100' 
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {selectedGpo.enforced ? 'Remover Forçamento' : 'Forçar Aplicação'}
                  </button>
                </div>

                {/* Linked OUs management */}
                <div className="mt-2 border-t border-slate-50 pt-3">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <FolderTree className="w-3 h-3 text-slate-400" /> Vínculos de Unidades Organizacionais (OUs)
                  </h4>
                  
                  {/* Active linked items */}
                  <div className="flex flex-col gap-1.5 max-h-[160px] overflow-y-auto">
                    {availableOUs.map(ou => {
                      const isLinked = selectedGpo.linkedTo.includes(ou);
                      return (
                        <div 
                          key={ou} 
                          onClick={() => handleToggleLinkOU(selectedGpo.id, ou)}
                          className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                            isLinked 
                              ? 'bg-blue-50/50 border-blue-200 text-blue-800 font-semibold' 
                              : 'bg-white border-slate-100 text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          <span className="font-mono text-[10.5px] truncate" title={ou}>{ou}</span>
                          {isLinked ? (
                            <span className="text-[10px] font-bold text-blue-600 shrink-0 flex items-center gap-1 bg-white px-2 py-0.5 rounded-full border border-blue-100 shadow-3xs">
                              Vinculado
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 shrink-0 hover:text-slate-600">
                              Clique para Vincular
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>

              {/* Status footer banner */}
              <div className="mt-auto bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex items-center gap-2">
                <Info className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-[10.5px] text-slate-500 leading-tight">
                  {selectedGpo.status === 'Ativo' && selectedGpo.linkedTo.length > 0 
                    ? `Esta GPO está em vigor para todos os objetos contidos nas ${selectedGpo.linkedTo.length} OUs vinculadas.` 
                    : 'Esta política de grupo está offline no momento ou sem vínculos de OU para aplicação.'
                  }
                </span>
              </div>

            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-8 text-center flex flex-col items-center justify-center min-h-[480px]">
              <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-3">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-700">Nenhuma GPO Selecionada</h3>
              <p className="text-slate-400 text-xs mt-1 max-w-xs leading-relaxed">
                Clique em qualquer diretiva da tabela para analisar as propriedades detalhadas, forçar aplicação ou gerenciar vínculos de OUs do Active Directory.
              </p>
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
