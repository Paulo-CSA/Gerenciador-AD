/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldCheck, 
  Search, 
  Download, 
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
  FolderTree,
  Loader2,
  RefreshCw,
  Eye,
  Lock,
  Upload,
  Trash2,
  FileCode,
  Check
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
  Tooltip 
} from 'recharts';

export default function GroupPolicies() {
  // GPOs State (fetched from API)
  const [gpos, setGpos] = useState<GPO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search and Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterUsage, setFilterUsage] = useState<'all' | 'in-use' | 'not-in-use'>('all');
  const [selectedGpoId, setSelectedGpoId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'settings'>('overview');

  // XML Import States
  const [showImportArea, setShowImportArea] = useState(false);
  const [importingFile, setImportingFile] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [parsedPreviewGpos, setParsedPreviewGpos] = useState<any[]>([]);
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);

  // Parse GPMC GPO Report XML
  const parseGPMCReportXml = (xmlText: string) => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    
    // Check for parsing errors
    const parseError = xmlDoc.querySelector('parsererror');
    if (parseError) {
      throw new Error('O arquivo XML carregado é inválido ou contém erros de sintaxe.');
    }

    // GPMC report can have <GPO> as root, or <GPOs> containing <GPO> elements
    const gpoElements = xmlDoc.getElementsByTagName('GPO');
    if (gpoElements.length === 0) {
      throw new Error('Nenhum objeto GPO (<GPO>) foi encontrado no arquivo XML de relatório.');
    }

    const parsedGpos: any[] = [];

    for (let i = 0; i < gpoElements.length; i++) {
      const gpoNode = gpoElements[i];
      
      // Extract Name
      const name = gpoNode.getElementsByTagName('Name')[0]?.textContent || 'GPO Sem Nome';
      
      // Extract GUID
      let id = '';
      const idNode = gpoNode.getElementsByTagName('Identifier')[0];
      if (idNode) {
        const subIdNode = idNode.getElementsByTagName('Identifier')[0];
        id = (subIdNode?.textContent || idNode.textContent || '').trim().toUpperCase();
      }
      if (!id) {
        id = `{GPO-IMPORT-${Math.random().toString(36).substring(2, 11).toUpperCase()}}`;
      }

      // Dates
      const createdTimeStr = gpoNode.getElementsByTagName('CreatedTime')[0]?.textContent || '';
      const modifiedTimeStr = gpoNode.getElementsByTagName('ModifiedTime')[0]?.textContent || '';
      
      const parseTime = (timeStr: string) => {
        if (!timeStr) return '2026-06-25';
        return timeStr.split('T')[0];
      };
      
      const modifiedDate = parseTime(modifiedTimeStr);

      // SOMs / Linked OUs
      const linkedTo: string[] = [];
      let enforced = false;
      const somNodes = gpoNode.getElementsByTagName('SOM');
      for (let j = 0; j < somNodes.length; j++) {
        const som = somNodes[j];
        const path = som.getElementsByTagName('Path')[0]?.textContent;
        const enabled = som.getElementsByTagName('Enabled')[0]?.textContent;
        if (path && enabled !== 'false') {
          linkedTo.push(path);
          const noOverride = som.getElementsByTagName('NoOverride')[0]?.textContent;
          if (noOverride === 'true') {
            enforced = true;
          }
        }
      }

      // Classify GPO Type based on Name
      let gpoType: 'Segurança' | 'Preferências' | 'Modelos Administrativos' | 'Software' | 'Scripts' = 'Segurança';
      const nameLower = name.toLowerCase();
      if (nameLower.includes('software') || nameLower.includes('install') || nameLower.includes('deploy')) {
        gpoType = 'Software';
      } else if (nameLower.includes('script') || nameLower.includes('logon') || nameLower.includes('logoff') || nameLower.includes('startup') || nameLower.includes('shutdown') || nameLower.includes('.bat') || nameLower.includes('.vbs') || nameLower.includes('.ps1')) {
        gpoType = 'Scripts';
      } else if (nameLower.includes('preference') || nameLower.includes('mapeamento') || nameLower.includes('drive') || nameLower.includes('printer') || nameLower.includes('impressora')) {
        gpoType = 'Preferências';
      } else if (nameLower.includes('adm') || nameLower.includes('template') || nameLower.includes('chrome') || nameLower.includes('edge') || nameLower.includes('firewall') || nameLower.includes('update') || nameLower.includes('wsus')) {
        gpoType = 'Modelos Administrativos';
      } else {
        gpoType = 'Segurança';
      }

      // Status
      let status: 'Ativo' | 'Desativado' | 'Apenas Computador' | 'Apenas Usuário' = 'Ativo';
      const compEnabledNode = gpoNode.getElementsByTagName('ComputerEnabled')[0];
      const userEnabledNode = gpoNode.getElementsByTagName('UserEnabled')[0];
      const compEnabled = compEnabledNode ? compEnabledNode.textContent === 'true' : true;
      const userEnabled = userEnabledNode ? userEnabledNode.textContent === 'true' : true;
      
      if (!compEnabled && !userEnabled) {
        status = 'Desativado';
      } else if (compEnabled && !userEnabled) {
        status = 'Apenas Computador';
      } else if (!compEnabled && userEnabled) {
        status = 'Apenas Usuário';
      }

      // Settings
      const settings: any[] = [];

      // Parse Settings
      const configTypes = ['Computer', 'User'] as const;
      for (const configType of configTypes) {
        const configNode = gpoNode.getElementsByTagName(configType)[0];
        if (!configNode) continue;

        // 1. Registry Policy / Administrative Templates
        const policyNodes = configNode.getElementsByTagName('Policy');
        for (let k = 0; k < policyNodes.length; k++) {
          const policyNode = policyNodes[k];
          const pName = policyNode.getElementsByTagName('Name')[0]?.textContent;
          const pState = policyNode.getElementsByTagName('State')[0]?.textContent;
          const pCategory = policyNode.getElementsByTagName('Category')[0]?.textContent || 'Modelos Administrativos';
          
          if (pName) {
            let settingText = pState || 'Habilitado';
            
            const comment = policyNode.getElementsByTagName('Comment')[0]?.textContent;
            if (comment) settingText += `\nComentário: ${comment}`;
            
            const valueNodes = policyNode.getElementsByTagName('Value');
            if (valueNodes.length > 0) {
              const valList: string[] = [];
              for (let v = 0; v < valueNodes.length; v++) {
                const vn = valueNodes[v];
                const vnName = vn.getElementsByTagName('Name')[0]?.textContent;
                const vnSetting = vn.getElementsByTagName('Setting')[0]?.textContent || vn.textContent;
                valList.push(vnName ? `${vnName}: ${vnSetting}` : String(vnSetting));
              }
              if (valList.length > 0) {
                settingText += `\nValores:\n` + valList.join('\n');
              }
            }

            settings.push({
              category: configType,
              path: `Administrative Templates > ${pCategory}`,
              policy: pName,
              setting: settingText,
              status: pState === 'Disabled' ? 'Desativado' : 'Habilitado'
            });
          }
        }

        // 2. Security Settings (Computer Settings only)
        if (configType === 'Computer') {
          // Account Policies
          const accountNode = configNode.getElementsByTagName('Account')[0];
          if (accountNode) {
            const policies = accountNode.children;
            for (let k = 0; k < policies.length; k++) {
              const p = policies[k];
              const pName = p.tagName.replace(/([A-Z])/g, ' $1').trim();
              const pValue = p.getElementsByTagName('Value')[0]?.textContent || p.textContent || '';
              if (pValue.trim()) {
                settings.push({
                  category: 'Computer',
                  path: 'Windows Settings > Security Settings > Account Policies',
                  policy: pName,
                  setting: pValue,
                  status: 'Habilitado'
                });
              }
            }
          }

          // Security Options
          const secOptionsNode = configNode.getElementsByTagName('SecurityOptions')[0];
          if (secOptionsNode) {
            const optionNodes = secOptionsNode.getElementsByTagName('SecurityOption');
            for (let k = 0; k < optionNodes.length; k++) {
              const opt = optionNodes[k];
              const optName = opt.getElementsByTagName('Name')[0]?.textContent || '';
              const optValue = opt.getElementsByTagName('Display')[0]?.textContent || opt.getElementsByTagName('Setting')[0]?.textContent || '';
              if (optName && optValue) {
                settings.push({
                  category: 'Computer',
                  path: 'Windows Settings > Security Settings > Local Policies > Security Options',
                  policy: optName,
                  setting: optValue,
                  status: 'Habilitado'
                });
              }
            }
          }

          // User Rights
          const privRightsNode = configNode.getElementsByTagName('PrivilegeRights')[0];
          if (privRightsNode) {
            const privNodes = privRightsNode.getElementsByTagName('PrivilegeRight');
            for (let k = 0; k < privNodes.length; k++) {
              const priv = privNodes[k];
              const privName = priv.getElementsByTagName('Name')[0]?.textContent || '';
              const groups = Array.from(priv.getElementsByTagName('UserOrGroup')).map(g => g.textContent).join(', ');
              if (privName && groups) {
                settings.push({
                  category: 'Computer',
                  path: 'Windows Settings > Security Settings > Local Policies > User Rights Assignment',
                  policy: privName,
                  setting: `Atribuído a: ${groups}`,
                  status: 'Habilitado'
                });
              }
            }
          }
        }

        // 3. Scripts Settings
        const scriptsNode = configNode.getElementsByTagName('Scripts')[0];
        if (scriptsNode) {
          const scriptNodes = scriptsNode.getElementsByTagName('Script');
          for (let k = 0; k < scriptNodes.length; k++) {
            const scr = scriptNodes[k];
            const typeNode = scr.parentElement?.getElementsByTagName('ScriptType')[0] || scr.parentElement?.parentElement?.getElementsByTagName('ScriptType')[0];
            const scriptType = typeNode?.textContent || 'Logon';
            const cmd = scr.getElementsByTagName('Command')[0]?.textContent || scr.getElementsByTagName('Name')[0]?.textContent || '';
            const args = scr.getElementsByTagName('Arguments')[0]?.textContent || scr.getElementsByTagName('Parameters')[0]?.textContent || 'Sem parâmetros';
            if (cmd) {
              settings.push({
                category: configType,
                path: `Windows Settings > Scripts (${scriptType})`,
                policy: `Script: ${cmd}`,
                setting: `Parâmetros: ${args}`,
                status: 'Habilitado'
              });
            }
          }
        }

        // 4. Preferences
        const prefNode = configNode.getElementsByTagName('Preferences')[0];
        if (prefNode) {
          // Drive Maps
          const driveNodes = prefNode.getElementsByTagName('Drive');
          for (let k = 0; k < driveNodes.length; k++) {
            const dNode = driveNodes[k];
            const letter = dNode.getElementsByTagName('Letter')[0]?.textContent || dNode.getAttribute('letter') || '';
            const pPath = dNode.getElementsByTagName('Path')[0]?.textContent || dNode.getAttribute('path') || '';
            const action = dNode.getElementsByTagName('Action')[0]?.textContent || dNode.getAttribute('action') || 'Update';
            const label = dNode.getElementsByTagName('Label')[0]?.textContent || dNode.getAttribute('label') || 'Compartilhamento';
            if (letter && pPath) {
              settings.push({
                category: configType,
                path: 'User Preferences > Windows Settings > Drive Maps',
                policy: `Map Drive ${letter}:`,
                setting: `Ação: ${action}\nCaminho: ${pPath}\nRótulo: ${label}`,
                status: 'Habilitado'
              });
            }
          }

          // Printers
          const printerNodes = prefNode.getElementsByTagName('Printer');
          for (let k = 0; k < printerNodes.length; k++) {
            const pNode = printerNodes[k];
            const pName = pNode.getElementsByTagName('Name')[0]?.textContent || pNode.getAttribute('name') || '';
            const pPath = pNode.getElementsByTagName('Path')[0]?.textContent || pNode.getAttribute('path') || '';
            const action = pNode.getElementsByTagName('Action')[0]?.textContent || pNode.getAttribute('action') || 'Create';
            if (pName || pPath) {
              settings.push({
                category: configType,
                path: 'User Preferences > Control Panel Settings > Printers',
                policy: `Conexão de Impressora: ${pName || 'Compartilhada'}`,
                setting: `Ação: ${action}\nCaminho da Fila: ${pPath || 'HP LaserJet'}`,
                status: 'Habilitado'
              });
            }
          }
        }
      }

      // Fallback: If no settings were structured but we have custom elements, let's look for anything with text inside Extensions
      if (settings.length === 0) {
        const extElements = gpoNode.getElementsByTagName('ExtensionData');
        for (let k = 0; k < extElements.length; k++) {
          const ext = extElements[k];
          const children = ext.querySelectorAll('*');
          children.forEach(child => {
            if (child.children.length === 0 && child.textContent?.trim() && child.tagName !== 'Name' && child.tagName !== 'Identifier') {
              const parentName = child.parentElement?.tagName || 'Opção';
              settings.push({
                category: 'Computer',
                path: `GPO Extensions > ${parentName}`,
                policy: child.tagName,
                setting: child.textContent.trim(),
                status: 'Habilitado'
              });
            }
          });
        }
      }

      if (settings.length === 0) {
        settings.push({
          category: 'Computer',
          path: 'Escopo > Informação',
          policy: 'Políticas do Sistema',
          setting: 'Esta GPO foi carregada sem diretivas adicionais no escopo do arquivo XML.',
          status: 'Habilitado'
        });
      }

      parsedGpos.push({
        id,
        name,
        status,
        linkedTo,
        enforced,
        gpoType,
        description: `GPO real importada diretamente do relatório XML do Active Directory. ID original: ${id}.`,
        modifiedDate,
        author: gpoNode.getElementsByTagName('Author')[0]?.textContent || 'administrator@empresa.local',
        settings
      });
    }

    return parsedGpos;
  };

  // File Upload Handlers
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportingFile(true);
    setImportError(null);
    setImportSuccessMsg(null);
    setParsedPreviewGpos([]);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const result = parseGPMCReportXml(text);
        setParsedPreviewGpos(result);
      } catch (err: any) {
        console.error(err);
        setImportError(err.message || 'Falha ao processar o arquivo XML. Certifique-se de que é um relatório GPMC XML válido.');
      } finally {
        setImportingFile(false);
      }
    };
    reader.onerror = () => {
      setImportError('Erro ao ler o arquivo.');
      setImportingFile(false);
    };
    reader.readAsText(file);
  };

  // Submit parsed GPOs to Backend
  const handleImportSubmit = async () => {
    if (parsedPreviewGpos.length === 0) return;
    setLoading(true);
    try {
      const response = await fetch('/api/ad/gpos/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gpos: parsedPreviewGpos })
      });

      if (!response.ok) {
        throw new Error('Falha ao salvar as GPOs importadas no servidor.');
      }

      const resData = await response.json();
      setImportSuccessMsg(`Sucesso! ${resData.importedCount} GPOs importadas e ${resData.updatedCount} GPOs atualizadas com as configurações reais.`);
      setParsedPreviewGpos([]);
      setShowImportArea(false);
      await fetchGpos(); // Reload GPOs
    } catch (err: any) {
      setImportError(err.message || 'Erro ao sincronizar GPOs importadas com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  // Reset GPOs back to defaults
  const handleResetGpos = async () => {
    if (!window.confirm('Tem certeza de que deseja remover todas as GPOs reais importadas e restaurar a simulação padrão?')) return;
    setLoading(true);
    try {
      const response = await fetch('/api/ad/gpos/reset', { method: 'POST' });
      if (!response.ok) throw new Error('Falha ao resetar as GPOs no servidor.');
      setImportSuccessMsg('As GPOs importadas foram apagadas e a lista padrão restaurada.');
      await fetchGpos(); // Reload GPOs
    } catch (err: any) {
      setError(err.message || 'Erro ao resetar GPOs.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch GPOs from backend
  const fetchGpos = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/ad/gpos');
      if (!response.ok) {
        throw new Error(`Erro ao carregar diretivas: ${response.statusText}`);
      }
      const data = await response.json();
      setGpos(data);
      if (data.length > 0) {
        setSelectedGpoId(data[0].id);
      } else {
        setSelectedGpoId(null);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Erro inesperado ao buscar as diretivas de grupo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGpos();
  }, []);

  // Selected GPO Object
  const selectedGpo = useMemo(() => {
    return gpos.find(g => g.id === selectedGpoId) || null;
  }, [gpos, selectedGpoId]);

  // Calculations for KPI Cards
  const totalGpos = gpos.length;
  const inUseGpos = gpos.filter(g => g.linkedTo.length > 0).length;
  const notInUseGpos = totalGpos - inUseGpos;
  const enforcedGpos = gpos.filter(g => g.enforced).length;

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
    const headers = ['ID/GUID', 'Nome da GPO', 'Tipo de GPO', 'Status', 'GPO Imposta', 'Vinculos (OUs)', 'Ultima Modificacao', 'Autor', 'Descricao'];
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-100 shadow-xs" id="gpo-loading">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
        <h3 className="text-sm font-bold text-slate-800">Carregando Políticas de Grupo</h3>
        <p className="text-slate-400 text-xs mt-1">Buscando diretivas reais diretamente no Sysvol do Active Directory...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-8 text-center flex flex-col items-center justify-center py-16" id="gpo-error">
        <AlertTriangle className="w-12 h-12 text-rose-500 mb-4 animate-bounce" />
        <h3 className="text-sm font-bold text-slate-800">Erro ao Carregar GPOs</h3>
        <p className="text-slate-500 text-xs mt-1 max-w-md leading-relaxed">{error}</p>
        <button 
          onClick={fetchGpos}
          className="mt-5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Tentar Novamente
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6" id="group-policies-section">
      
      {/* Read-Only Mode Banner / Control Center */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col gap-4 shadow-3xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 border border-blue-200">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900 leading-tight">Auditoria e Sincronização de Diretivas (GPO)</h4>
              <p className="text-[10.5px] text-slate-500 mt-0.5">
                Visualize as configurações reais das GPOs do seu domínio importando o relatório XML gerado no Active Directory.
              </p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowImportArea(!showImportArea)}
              className={`text-[11px] font-bold px-3 py-1.5 rounded-lg border flex items-center gap-1.5 cursor-pointer transition-all ${
                showImportArea 
                  ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700' 
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Upload className="w-3 h-3" />
              Importar Relatório XML
            </button>
            <button
              onClick={handleResetGpos}
              className="text-[11px] font-bold text-rose-700 hover:text-rose-900 bg-white hover:bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-200 flex items-center gap-1.5 cursor-pointer transition-all"
              title="Apagar GPOs importadas e voltar para o simulador"
            >
              <Trash2 className="w-3 h-3" />
              Restaurar Padrão
            </button>
            <button
              onClick={fetchGpos}
              className="text-[11px] font-bold text-slate-700 hover:text-slate-950 bg-white hover:bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <RefreshCw className="w-3 h-3" />
              Sincronizar AD
            </button>
          </div>
        </div>

        {/* Dynamic Success / Info Message */}
        {importSuccessMsg && (
          <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-lg p-2.5 text-xs font-medium flex items-center gap-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{importSuccessMsg}</span>
            <button className="ml-auto text-emerald-500 hover:text-emerald-700 font-bold" onClick={() => setImportSuccessMsg(null)}>×</button>
          </div>
        )}

        {/* Collapsible GPMC XML Upload Area */}
        {showImportArea && (
          <div className="border-t border-slate-200/80 pt-4 mt-1 flex flex-col gap-4 animate-fade-in bg-white p-4 rounded-xl border border-dashed border-slate-300">
            <div className="flex flex-col gap-1">
              <h5 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <FileCode className="w-4 h-4 text-blue-600" />
                Como gerar o relatório real de GPOs do seu Active Directory:
              </h5>
              <p className="text-[10.5px] text-slate-500 leading-relaxed max-w-3xl mt-1">
                Abra o PowerShell como Administrador no seu controlador de domínio e execute o comando abaixo para gerar o arquivo XML contendo todas as políticas e suas configurações reais:
              </p>
              <div className="bg-slate-950 text-slate-200 font-mono text-[10.5px] p-2.5 rounded-lg mt-1.5 border border-slate-800 overflow-x-auto select-all flex items-center justify-between">
                <code>Get-GPOReport -All -ReportType Xml -Path "C:\gpo_report.xml"</code>
                <span className="text-[9px] text-slate-500 uppercase font-sans font-bold bg-slate-800 px-1.5 py-0.5 rounded">PowerShell</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Depois, arraste ou faça o upload do arquivo <code className="font-mono text-slate-500">gpo_report.xml</code> gerado para visualizar as configurações exatas de logon scripts (.bat, .vbs), políticas de senhas e administrativas no painel.
              </p>
            </div>

            <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl p-8 bg-slate-50/50 hover:bg-slate-50 transition-all cursor-pointer relative">
              <input 
                type="file" 
                accept=".xml" 
                onChange={handleFileUpload} 
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
              <Upload className="w-8 h-8 text-slate-400 mb-2 animate-pulse" />
              <span className="text-xs font-bold text-slate-600">Selecione ou solte o arquivo XML do relatório de GPO</span>
              <span className="text-[10px] text-slate-400 mt-1">Suporta arquivos XML de GPO unitárias ou relatórios completos (-All)</span>
            </div>

            {importingFile && (
              <div className="flex items-center gap-2 text-xs text-blue-600 font-bold justify-center py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Analisando estrutura do relatório XML...</span>
              </div>
            )}

            {importError && (
              <div className="bg-rose-50 border border-rose-100 text-rose-800 p-3 rounded-lg text-xs flex items-center gap-2">
                <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{importError}</span>
              </div>
            )}

            {/* XML Import Preview Area */}
            {parsedPreviewGpos.length > 0 && (
              <div className="flex flex-col gap-3 border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Preview: {parsedPreviewGpos.length} {parsedPreviewGpos.length === 1 ? 'GPO detectada' : 'GPOs detectadas'} no relatório
                  </span>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setParsedPreviewGpos([])}
                      className="text-slate-500 hover:text-slate-700 text-xs font-semibold bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={handleImportSubmit}
                      className="text-white bg-blue-600 hover:bg-blue-700 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer transition-all shadow-xs"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Importar {parsedPreviewGpos.length} GPOs reais
                    </button>
                  </div>
                </div>

                <div className="max-h-[180px] overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-100">
                  {parsedPreviewGpos.map((pGpo, index) => (
                    <div key={index} className="p-2.5 flex items-center justify-between bg-slate-50/20 text-xs hover:bg-slate-50/50 transition-all">
                      <div className="flex flex-col min-w-0 flex-1 pr-4">
                        <span className="font-bold text-slate-700 truncate">{pGpo.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">{pGpo.id}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {pGpo.gpoType}
                        </span>
                        <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                          {pGpo.settings.length} diretivas
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Visual Metric KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0 border border-blue-100">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total de GPOs</p>
            <h4 className="text-2xl font-bold font-display text-slate-800 mt-0.5">{totalGpos}</h4>
            <span className="text-[10px] text-slate-500">Mapeadas no AD</span>
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
              {totalGpos > 0 ? ((inUseGpos / totalGpos) * 100).toFixed(0) : 0}% Vinculadas a OUs
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
            <span className="text-[10px] text-slate-500">Sem link ativo</span>
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
          <div className="p-4 border-b border-slate-50 flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-blue-500" />
              <h2 className="text-sm font-bold text-slate-800">Políticas Ativas no Active Directory</h2>
            </div>

            <button
              onClick={handleExportCSV}
              className="text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all border border-slate-200 cursor-pointer self-end sm:self-auto"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar Lista (.CSV)
            </button>
          </div>

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
                className="text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white outline-none cursor-pointer"
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
                className="text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white outline-none cursor-pointer"
              >
                <option value="all">Status (Todas)</option>
                <option value="Ativo">Ativas</option>
                <option value="Desativado">Desativadas</option>
              </select>

              <select
                value={filterUsage}
                onChange={e => setFilterUsage(e.target.value as any)}
                className="text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white outline-none cursor-pointer"
              >
                <option value="all">Vínculo (Todas)</option>
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
                    <th className="py-3 px-4 font-semibold">Política / Diretiva de Grupo</th>
                    <th className="py-3 px-4 font-semibold">Categoria</th>
                    <th className="py-3 px-4 font-semibold text-center">Status</th>
                    <th className="py-3 px-4 font-semibold text-center">Uso / Vínculo</th>
                    <th className="py-3 px-4 font-semibold text-center">GPO Imposta</th>
                    <th className="py-3 px-4 font-semibold text-right">Auditoria</th>
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
                        <div className="font-semibold text-slate-800 text-xs truncate animate-fade-in" title={g.name}>
                          {g.name}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 truncate font-mono" title={g.id}>
                          {g.id}
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
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" /> Ativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full">
                            <XCircle className="w-3 h-3" /> Desativado
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {g.linkedTo.length > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">
                            <Link2 className="w-3 h-3" /> {g.linkedTo.length} {g.linkedTo.length === 1 ? 'Link' : 'Links'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">
                            <Link2Off className="w-3 h-3" /> Sem Link
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`text-[11px] font-bold ${g.enforced ? 'text-rose-600 bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded' : 'text-slate-400'}`}>
                          {g.enforced ? 'Sim (Forçada)' : 'Não'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          className="text-[11px] text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 ml-auto cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedGpoId(g.id);
                          }}
                        >
                          <Eye className="w-3.5 h-3.5" /> Analisar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Side: GPO Linked OUs & Detailed Properties */}
        <div className="xl:col-span-1 flex flex-col gap-4 animate-fade-in">
          
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
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-slate-800 text-sm tracking-tight leading-tight select-all">
                    {selectedGpo.name}
                  </h3>
                  <span className="text-[9px] text-slate-400 font-mono mt-1 block select-all">
                    GUID: {selectedGpo.id}
                  </span>
                </div>
              </div>

              {/* Tabs for Overview and Detailed Policy Settings */}
              <div className="flex border-b border-slate-100 mb-4 mt-3 shrink-0">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`flex-1 pb-2.5 text-xs font-bold border-b-2 transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeTab === 'overview'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <Info className="w-3.5 h-3.5" />
                  Visão Geral
                </button>
                <button
                  onClick={() => setActiveTab('settings')}
                  className={`flex-1 pb-2.5 text-xs font-bold border-b-2 transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeTab === 'settings'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <Settings className="w-3.5 h-3.5" />
                  Configurações ({selectedGpo.settings?.length || 0})
                </button>
              </div>

              {/* Conditional Tab Rendering */}
              {activeTab === 'overview' ? (
                <div className="my-2 flex flex-col gap-4 flex-1 overflow-y-auto pr-1">
                  
                  {/* Description */}
                  <div>
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Info className="w-3 h-3 text-slate-400" /> Detalhes do Escopo
                    </h4>
                    <p className="text-xs text-slate-600 bg-slate-50/50 border border-slate-100 p-2.5 rounded-lg leading-relaxed select-all">
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
                        {selectedGpo.enforced ? 'Forçado (Enforced)' : 'Herdada / Normal'}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[9px] font-semibold text-slate-400 uppercase flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" /> Sincronizada
                      </span>
                      <span className="text-xs text-slate-700 font-mono">
                        {selectedGpo.modifiedDate}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[9px] font-semibold text-slate-400 uppercase flex items-center gap-1">
                        <User className="w-3 h-3 text-slate-400" /> Dono Padrão
                      </span>
                      <span className="text-xs text-slate-700 truncate" title={selectedGpo.author}>
                        {selectedGpo.author.split('@')[0]}
                      </span>
                    </div>
                  </div>

                  {/* Linked OUs management */}
                  <div className="border-t border-slate-50 pt-3 flex flex-col flex-1 min-h-[180px]">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1 shrink-0">
                      <FolderTree className="w-3 h-3 text-slate-400" /> Unidades Organizacionais Vinculadas ({selectedGpo.linkedTo.length})
                    </h4>
                    
                    {/* Active linked items */}
                    <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-1.5 min-h-0">
                      {selectedGpo.linkedTo.length === 0 ? (
                        <div className="flex-1 bg-slate-50/50 border border-dashed border-slate-200 rounded-lg p-6 text-center flex flex-col items-center justify-center gap-1.5">
                          <Link2Off className="w-6 h-6 text-slate-400" />
                          <span className="text-[11px] font-bold text-slate-500">GPO Órfã (Desvinculada)</span>
                          <span className="text-[10px] text-slate-400">Esta política de grupo não está associada a nenhuma OU ativa e não afeta usuários ou computadores.</span>
                        </div>
                      ) : (
                        selectedGpo.linkedTo.map((ou, idx) => (
                          <div 
                            key={idx} 
                            className="flex items-center justify-between p-2 rounded-lg border bg-blue-50/30 border-blue-100 text-blue-900 text-xs"
                          >
                            <span className="font-mono text-[10px] truncate select-all flex-1 pr-2" title={ou}>
                              {ou}
                            </span>
                            <span className="text-[9px] font-bold text-blue-700 bg-white px-1.5 py-0.5 rounded-full border border-blue-100 shadow-3xs shrink-0 flex items-center gap-1">
                              <Link2 className="w-2.5 h-2.5" /> Vinculada
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                </div>
              ) : (
                <div className="my-2 flex flex-col gap-3 flex-1 overflow-y-auto pr-1">
                  
                  <div className="flex items-center justify-between mb-1 shrink-0">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Diretivas Ativas</span>
                    <span className="text-[10px] text-blue-600 font-bold bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">
                      {selectedGpo.settings?.length || 0} configuradas
                    </span>
                  </div>

                  {!selectedGpo.settings || selectedGpo.settings.length === 0 ? (
                    <div className="flex-1 bg-slate-50/50 border border-dashed border-slate-200 rounded-lg p-6 text-center flex flex-col items-center justify-center gap-1.5">
                      <AlertTriangle className="w-6 h-6 text-slate-400" />
                      <span className="text-[11px] font-bold text-slate-500">Nenhuma Configuração Encontrada</span>
                      <span className="text-[10px] text-slate-400">Este objeto de diretiva de grupo não contém diretivas de logon ou configurações mapeadas no momento.</span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3 flex-1 overflow-y-auto pr-1">
                      {selectedGpo.settings.map((setting, idx) => (
                        <div 
                          key={idx} 
                          className="bg-slate-50/40 hover:bg-slate-50/70 p-3 rounded-xl border border-slate-100 flex flex-col gap-2 transition-all"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                              setting.category === 'Computer' 
                                ? 'bg-blue-50 text-blue-700 border-blue-100' 
                                : 'bg-purple-50 text-purple-700 border-purple-100'
                            }`}>
                              {setting.category === 'Computer' ? 'Computador' : 'Usuário'}
                            </span>
                            <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              {setting.status || 'Habilitado'}
                            </span>
                          </div>

                          <div className="text-[10px] text-slate-400 font-medium leading-normal select-all">
                            {setting.path}
                          </div>

                          <div className="border-t border-dashed border-slate-200/60 pt-1.5 mt-0.5 flex flex-col gap-1">
                            <div className="text-xs font-bold text-slate-800">
                              {setting.policy}
                            </div>
                            <div className="text-[11px] text-slate-600 bg-white border border-slate-100 rounded-lg px-2 py-1.5 font-mono select-all break-all leading-relaxed whitespace-pre-wrap">
                              {setting.setting}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                </div>
              )}

              {/* Status footer banner */}
              <div className="mt-auto bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex items-center gap-2 shrink-0">
                <Info className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-[10.5px] text-slate-500 leading-tight">
                  {selectedGpo.status === 'Ativo' && selectedGpo.linkedTo.length > 0 
                    ? `Esta GPO está em vigor para todos os objetos dentro de ${selectedGpo.linkedTo.length} OUs ou recipientes do AD.` 
                    : 'Esta política de grupo está desativada ou sem vínculos para ser aplicada no momento.'
                  }
                </span>
              </div>

            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-8 text-center flex flex-col items-center justify-center min-h-[480px]">
              <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-3">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-700">Nenhuma Diretiva Selecionada</h3>
              <p className="text-slate-400 text-xs mt-1 max-w-xs leading-relaxed">
                Escolha uma política na lista lateral para analisar seus detalhes e os recipientes do Active Directory vinculados a ela.
              </p>
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
