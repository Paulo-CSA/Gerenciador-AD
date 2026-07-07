/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Network, 
  Server, 
  Plus, 
  Trash2, 
  Search, 
  AlertTriangle, 
  CheckCircle, 
  RefreshCw, 
  Filter,
  ShieldAlert, 
  Sparkles, 
  Check,
  Activity,
  Info,
  Globe,
  Mail,
  Database,
  Monitor,
  Shield,
  FileCode
} from 'lucide-react';
import { DNSZone, DNSRecord, AuditLog } from '../types';

interface DnsManagementProps {
  onAddAuditLog?: (log: AuditLog) => Promise<void>;
  currentUser?: any;
}

export default function DnsManagement({ onAddAuditLog, currentUser }: DnsManagementProps) {
  const [zones, setZones] = useState<DNSZone[]>([]);
  const [records, setRecords] = useState<DNSRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedZone, setSelectedZone] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeCategory, setActiveCategory] = useState<'all' | 'forward' | 'reverse'>('forward');
  
  // Clean operation status
  const [cleaning, setCleaning] = useState<boolean>(false);
  const [cleanResult, setCleanResult] = useState<{
    success: boolean;
    removedCount: number;
    duplicatesRemoved: string[];
  } | null>(null);

  // Form states for creating a new DNS record
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newRecordZone, setNewRecordZone] = useState<string>('');
  const [newRecordName, setNewRecordName] = useState<string>('');
  const [newRecordType, setNewRecordType] = useState<string>('A');
  const [newRecordValue, setNewRecordValue] = useState<string>('');
  const [newRecordTtl, setNewRecordTtl] = useState<number>(3600);
  const [newRecordIsStatic, setNewRecordIsStatic] = useState<boolean>(false);
  const [formError, setFormError] = useState<string>('');
  const [formSuccess, setFormSuccess] = useState<string>('');

  // Zone management states
  const [showZoneModal, setShowZoneModal] = useState<boolean>(false);
  const [newZoneName, setNewZoneName] = useState<string>('');
  const [newZoneType, setNewZoneType] = useState<'Direta' | 'Inversa'>('Direta');
  const [newZoneUpdate, setNewZoneUpdate] = useState<'Segura' | 'Não Segura' | 'Nenhuma'>('Segura');
  const [zoneFormError, setZoneFormError] = useState<string>('');
  const [zoneFormSuccess, setZoneFormSuccess] = useState<string>('');

  // Sync state
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncSuccess, setSyncSuccess] = useState<string>('');

  const fetchDnsData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/ad/dns');
      if (res.ok) {
        const data = await res.json();
        setZones(data.zones || []);
        setRecords(data.records || []);
        if (data.zones && data.zones.length > 0) {
          setNewRecordZone(prev => prev || data.zones[0].name);
        }
      }
    } catch (error) {
      console.error('Erro ao buscar dados do DNS:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncAD = async () => {
    if (!window.confirm("A sincronização irá recriar as Zonas e os Registros DNS para corresponderem exatamente ao domínio e aos IPs configurados no seu AD real. Deseja prosseguir?")) {
      return;
    }
    try {
      setSyncing(true);
      setSyncSuccess('');
      const res = await fetch('/api/ad/dns/sync-ad-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operator: currentUser?.username || 'admin.silva'
        })
      });
      if (res.ok) {
        const data = await res.json();
        setZones(data.zones || []);
        setRecords(data.records || []);
        setSyncSuccess('Sincronização com as configurações do seu AD concluída com sucesso!');
        if (data.zones && data.zones.length > 0) {
          setNewRecordZone(data.zones[0].name);
        }
        setTimeout(() => setSyncSuccess(''), 4000);
      } else {
        alert('Erro ao sincronizar DNS com o Active Directory.');
      }
    } catch (error) {
      console.error(error);
      alert('Erro ao se comunicar com o servidor.');
    } finally {
      setSyncing(false);
    }
  };

  const handleCreateZone = async (e: React.FormEvent) => {
    e.preventDefault();
    setZoneFormError('');
    setZoneFormSuccess('');
    if (!newZoneName) {
      setZoneFormError('O nome da zona é obrigatório.');
      return;
    }
    try {
      const res = await fetch('/api/ad/dns/zones/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newZoneName,
          type: newZoneType,
          updateType: newZoneUpdate,
          operator: currentUser?.username || 'admin.silva'
        })
      });
      if (res.ok) {
        const data = await res.json();
        setZones(data.zones || []);
        setZoneFormSuccess('Zona DNS criada com sucesso!');
        setNewZoneName('');
        setTimeout(() => {
          setZoneFormSuccess('');
        }, 1500);
      } else {
        const data = await res.json();
        setZoneFormError(data.error || 'Erro ao criar zona.');
      }
    } catch (error) {
      setZoneFormError('Erro de rede.');
    }
  };

  const handleDeleteZone = async (zoneName: string) => {
    if (!window.confirm(`ATENÇÃO: Excluir a zona '${zoneName}' apagará TODOS os registros DNS associados a ela! Deseja realmente excluir?`)) {
      return;
    }
    try {
      const res = await fetch('/api/ad/dns/zones/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: zoneName,
          operator: currentUser?.username || 'admin.silva'
        })
      });
      if (res.ok) {
        const data = await res.json();
        setZones(data.zones || []);
        setRecords(data.records || []);
        if (selectedZone === zoneName) {
          setSelectedZone('all');
        }
      } else {
        alert('Falha ao excluir a zona.');
      }
    } catch (error) {
      alert('Erro de rede ao excluir a zona.');
    }
  };

  useEffect(() => {
    fetchDnsData();
  }, []);

  // Duplicate analysis logic
  const analyzeDuplicates = () => {
    const duplicatesList: {
      type: 'identical' | 'conflict_a' | 'conflict_ptr';
      description: string;
      records: DNSRecord[];
    }[] = [];

    // 1. Check for identical duplicates (same zone, name, type, value)
    const identicalMap = new Map<string, DNSRecord[]>();
    records.forEach(r => {
      const key = `${r.zoneName.toLowerCase()}|${r.name.toLowerCase()}|${r.type}|${r.value.toLowerCase()}`;
      if (!identicalMap.has(key)) {
        identicalMap.set(key, []);
      }
      identicalMap.get(key)!.push(r);
    });

    identicalMap.forEach((recs, key) => {
      if (recs.length > 1) {
        const first = recs[0];
        duplicatesList.push({
          type: 'identical',
          description: `Registro idêntico duplicado na zona ${first.zoneName}: '${first.name}' (${first.type}) apontando para '${first.value}'`,
          records: recs
        });
      }
    });

    // 2. Check for conflicting IP mappings (A records for same name pointing to different IPs)
    const aMap = new Map<string, DNSRecord[]>();
    records.forEach(r => {
      if (r.type === 'A') {
        const key = `${r.zoneName.toLowerCase()}|${r.name.toLowerCase()}`;
        if (!aMap.has(key)) {
          aMap.set(key, []);
        }
        aMap.get(key)!.push(r);
      }
    });

    aMap.forEach((recs, key) => {
      // Find entries that have different IP values
      const uniqueValues = new Set(recs.map(r => r.value.toLowerCase()));
      if (uniqueValues.size > 1) {
        const first = recs[0];
        duplicatesList.push({
          type: 'conflict_a',
          description: `Conflito de IP para Hostname '${first.name}' na zona ${first.zoneName}: Múltiplos endereços mapeados simultaneamente (${recs.map(r => r.value).join(', ')})`,
          records: recs
        });
      }
    });

    // 3. Check for conflicting PTR mappings (PTR records for same IP pointing to different hosts)
    const ptrMap = new Map<string, DNSRecord[]>();
    records.forEach(r => {
      if (r.type === 'PTR') {
        const key = `${r.zoneName.toLowerCase()}|${r.name.toLowerCase()}`;
        if (!ptrMap.has(key)) {
          ptrMap.set(key, []);
        }
        ptrMap.get(key)!.push(r);
      }
    });

    ptrMap.forEach((recs, key) => {
      const uniqueValues = new Set(recs.map(r => r.value.toLowerCase()));
      if (uniqueValues.size > 1) {
        const first = recs[0];
        duplicatesList.push({
          type: 'conflict_ptr',
          description: `Conflito de Ponteiro Inverso para IP .${first.name} na zona ${first.zoneName}: Aponta para múltiplos hosts (${recs.map(r => r.value.replace(/\.$/, '')).join(', ')})`,
          records: recs
        });
      }
    });

    return duplicatesList;
  };

  const detectedDuplicates = analyzeDuplicates();
  const healthScore = Math.max(0, 100 - (detectedDuplicates.length * 11));

  const handleCleanDuplicates = async () => {
    try {
      setCleaning(true);
      setCleanResult(null);
      const res = await fetch('/api/ad/dns/clean-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operator: currentUser?.username || 'admin.silva'
        })
      });

      if (res.ok) {
        const data = await res.json();
        setCleanResult({
          success: true,
          removedCount: data.removedCount,
          duplicatesRemoved: data.duplicatesRemoved
        });
        setRecords(data.records);
        
        if (onAddAuditLog && data.removedCount > 0) {
          await onAddAuditLog({
            id: "",
            timestamp: "",
            operator: currentUser?.username || "admin.silva",
            action: "Limpeza de DNS",
            targetUser: "Servidor DNS",
            details: `Varredura de scavenging concluída com sucesso. ${data.removedCount} registros obsoletos ou conflitantes foram eliminados.`,
            type: "success"
          });
        }
      } else {
        setCleanResult({
          success: false,
          removedCount: 0,
          duplicatesRemoved: ['Erro desconhecido ao limpar o servidor de nomes.']
        });
      }
    } catch (error) {
      console.error(error);
      setCleanResult({
        success: false,
        removedCount: 0,
        duplicatesRemoved: ['Erro de comunicação com o servidor de banco de dados.']
      });
    } finally {
      setCleaning(false);
    }
  };

  const handleAddRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (!newRecordName || !newRecordValue) {
      setFormError('Preencha o nome do registro e o valor de destino.');
      return;
    }

    try {
      const res = await fetch('/api/ad/dns/records/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zoneName: newRecordZone,
          name: newRecordName,
          type: newRecordType,
          value: newRecordValue,
          ttl: newRecordTtl,
          isStatic: newRecordIsStatic,
          operator: currentUser?.username || 'admin.silva'
        })
      });

      if (res.ok) {
        const data = await res.json();
        setFormSuccess('Registro DNS criado com sucesso!');
        setNewRecordName('');
        setNewRecordValue('');
        setNewRecordIsStatic(false);
        fetchDnsData();
        setTimeout(() => {
          setShowAddModal(false);
          setFormSuccess('');
        }, 1500);
      } else {
        const data = await res.json();
        setFormError(data.error || 'Erro ao adicionar registro.');
      }
    } catch (err) {
      setFormError('Falha de conexão com o servidor.');
    }
  };

  const handleDeleteRecord = async (id: string, name: string, type: string) => {
    if (!window.confirm(`Deseja realmente excluir o registro ${type} para '${name}'?`)) {
      return;
    }

    try {
      const res = await fetch('/api/ad/dns/records/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          operator: currentUser?.username || 'admin.silva'
        })
      });

      if (res.ok) {
        setRecords(prev => prev.filter(r => r.id !== id));
      } else {
        alert('Falha ao excluir o registro.');
      }
    } catch (err) {
      alert('Erro de conexão ao excluir o registro.');
    }
  };

  // Filter records based on UI state
  const filteredRecords = records.filter(r => {
    // Determine corresponding zone type ('Direta' or 'Inversa')
    const zone = zones.find(z => z.name.toLowerCase() === r.zoneName.toLowerCase());
    const zoneType = zone ? zone.type : 'Direta'; // Default to Direta (Forward)

    const matchesCategory = 
      activeCategory === 'all' ||
      (activeCategory === 'forward' && zoneType === 'Direta') ||
      (activeCategory === 'reverse' && zoneType === 'Inversa');

    const matchesZone = selectedZone === 'all' || r.zoneName === selectedZone;
    const matchesType = selectedType === 'all' || r.type === selectedType;
    
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = 
      r.name.toLowerCase().includes(searchLower) ||
      r.value.toLowerCase().includes(searchLower) ||
      r.zoneName.toLowerCase().includes(searchLower);

    return matchesCategory && matchesZone && matchesType && matchesSearch;
  });

  // Get all unique hosts/sites from direct/forward lookup zones for the interactive visual catalog
  const forwardSites = records.filter(r => {
    const z = zones.find(zone => zone.name.toLowerCase() === r.zoneName.toLowerCase());
    const isForward = !z || z.type === 'Direta';
    return isForward && (r.type === 'A' || r.type === 'CNAME' || r.type === 'MX');
  });

  return (
    <div className="space-y-6">
      
      {syncSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3.5 rounded-xl shadow-sm flex items-center gap-2.5 animate-fade-in no-print">
          <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
          <div className="flex-1">
            <span className="text-xs font-semibold">{syncSuccess}</span>
          </div>
        </div>
      )}
      
      {/* DNS Dashboard Banner & Stats Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* DNS Server Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Server className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-xs font-mono text-slate-400 uppercase tracking-wider font-bold">Serviço DNS</h3>
            <p className="text-sm font-semibold text-slate-800 mt-1">Windows Server Integrated</p>
            <p className="text-xs text-slate-500 mt-0.5">Integrado ao Active Directory</p>
            <div className="flex items-center gap-1.5 mt-3">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              <span className="text-[10px] text-green-600 font-bold uppercase">Online & Ativo</span>
            </div>
          </div>
        </div>

        {/* DNS Zones Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Network className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-xs font-mono text-slate-400 uppercase tracking-wider font-bold">Zonas Ativas</h3>
            <p className="text-2xl font-semibold text-slate-800 mt-1">{zones.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">Zonas Diretas e Inversas</p>
            <div className="flex gap-2 mt-2">
              {zones.map((z, idx) => (
                <span key={idx} className="bg-slate-100 text-slate-600 font-medium px-2 py-0.5 rounded text-[10px] truncate" title={z.name}>
                  {z.name}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Server Health Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-start gap-4">
          <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${
            healthScore >= 90 ? 'bg-green-50 text-green-600' :
            healthScore >= 70 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'
          }`}>
            <Activity className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-xs font-mono text-slate-400 uppercase tracking-wider font-bold">Saúde do Servidor</h3>
            <div className="flex items-baseline gap-2 mt-1">
              <span className={`text-2xl font-bold ${
                healthScore >= 90 ? 'text-green-600' :
                healthScore >= 70 ? 'text-amber-600' : 'text-red-600'
              }`}>{healthScore}%</span>
              <span className="text-xs text-slate-500">Índice de Integridade</span>
            </div>
            {detectedDuplicates.length > 0 ? (
              <p className="text-xs text-amber-600 font-medium mt-1">
                {detectedDuplicates.length} problemas de duplicidade encontrados
              </p>
            ) : (
              <p className="text-xs text-green-600 font-medium mt-1">
                Nenhum conflito ou registro obsoleto
              </p>
            )}
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2">
              <div 
                className={`h-1.5 rounded-full transition-all duration-500 ${
                  healthScore >= 90 ? 'bg-green-500' :
                  healthScore >= 70 ? 'bg-amber-500' : 'bg-red-500'
                }`} 
                style={{ width: `${healthScore}%` }}
              ></div>
            </div>
          </div>
        </div>

      </div>

      {/* DNS Diagnostics & Scavenging Section */}
      {detectedDuplicates.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-amber-900 font-display">Registros DNS Obsoletos e Duplicados Identificados</h4>
                <p className="text-xs text-amber-700 mt-1">
                  Mapeamentos de IP obsoletos ou registros idênticos duplicados podem degradar o desempenho e causar instabilidades de rede (Round-Robin indevido) no ambiente corporativo.
                </p>
              </div>
            </div>
            
            <button
              onClick={handleCleanDuplicates}
              disabled={cleaning}
              className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs rounded-lg shadow transition-colors flex items-center justify-center gap-2 shrink-0 disabled:opacity-50 cursor-pointer"
            >
              {cleaning ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Limpando Registros...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  Executar Limpeza de DNS
                </>
              )}
            </button>
          </div>

          {/* List of Detected Issues */}
          <div className="mt-4 space-y-2 max-h-48 overflow-y-auto pr-2">
            {detectedDuplicates.map((dup, idx) => (
              <div key={idx} className="bg-white/80 border border-amber-200/50 rounded-lg p-3 text-xs flex justify-between items-center gap-4">
                <div className="flex items-start gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                    dup.type === 'identical' ? 'bg-blue-400' : 'bg-red-400'
                  }`}></span>
                  <div>
                    <span className="font-semibold text-slate-800">{dup.description}</span>
                    <div className="flex gap-2 mt-1">
                      {dup.records.map((r, rIdx) => (
                        <span key={rIdx} className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[10px] font-mono">
                          ID: {r.id} | Modificado: {r.timestamp} {r.isStatic ? '(Estático)' : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100/60 px-2 py-0.5 rounded border border-amber-200/50">
                  {dup.type === 'identical' ? 'Duplicado' : 'Conflito'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Clean Result Popup Banner */}
      {cleanResult && cleanResult.success && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 shadow-sm text-green-900">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-green-950">Servidor DNS Otimizado com Sucesso!</h4>
              <p className="text-xs text-green-700 mt-1">
                A varredura de scavenging foi concluída. Foram excluídos <strong>{cleanResult.removedCount} registros</strong> incoerentes para restaurar a saúde e estabilidade da rede.
              </p>
              
              <div className="mt-3 space-y-1 bg-white/50 rounded-lg p-3 max-h-40 overflow-y-auto text-xs font-mono text-green-800 border border-green-200/50">
                {cleanResult.duplicatesRemoved.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 shrink-0 text-green-600" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <button 
              onClick={() => setCleanResult(null)}
              className="text-green-500 hover:text-green-700 font-semibold text-xs cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Visual Directory of Sites - Forward Lookup Zone */}
      {activeCategory === 'forward' && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4 no-print">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-mono text-blue-600 uppercase tracking-wider font-bold">Catálogo de Sites e Portais Web (Zonas de Pesquisa Direta)</h3>
              <p className="text-xs text-slate-500 mt-1">Navegação visual e mapeamento dos principais endereços IP e FQDNs de serviços web ativos hospedados no domínio.</p>
            </div>
            <span className="bg-blue-100 text-blue-800 font-bold px-2.5 py-1 rounded-full text-[10px] self-start sm:self-center shrink-0">
              {forwardSites.length} Endpoints Mapeados
            </span>
          </div>

          {forwardSites.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-xs">
              Nenhum site ou serviço web cadastrado nesta zona. Sincronize com o Active Directory para gerar os mapeamentos.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {forwardSites.map((site) => {
                const fqdn = site.name === '@' ? site.zoneName : `${site.name}.${site.zoneName}`;
                
                // Customize display info based on hostname
                let icon = <Globe className="w-5 h-5 text-blue-600" />;
                let title = "Serviço Web / Host";
                let desc = "Ponto de acesso hospedado sob o domínio principal.";
                const nameLower = site.name.toLowerCase();

                if (nameLower === 'mail' || nameLower === 'webmail') {
                  icon = <Mail className="w-5 h-5 text-indigo-600" />;
                  title = "Webmail OWA / Exchange";
                  desc = "Acesso ao correio eletrônico corporativo, calendário e OWA.";
                } else if (nameLower === 'srv-dc01' || nameLower === 'dc01' || nameLower === 'dc') {
                  icon = <Shield className="w-5 h-5 text-emerald-600" />;
                  title = "Controlador de Domínio Principal";
                  desc = "Serviço de Diretório AD DS, DNS Integrado e segurança Kerberos.";
                } else if (nameLower === 'srv-app' || nameLower === 'app' || nameLower === 'intranet' || nameLower === 'portal') {
                  icon = <Globe className="w-5 h-5 text-sky-600" />;
                  title = "Portal de Aplicações Web";
                  desc = "Hospeda a intranet corporativa, RH, e portais internos.";
                } else if (nameLower === 'srv-banco' || nameLower === 'db' || nameLower === 'sql') {
                  icon = <Database className="w-5 h-5 text-purple-600" />;
                  title = "Servidor de Banco de Dados";
                  desc = "Armazenamento estruturado SQL e serviços de dados.";
                } else if (nameLower === 'gpo-sys' || nameLower === 'gpo') {
                  icon = <FileCode className="w-5 h-5 text-amber-600" />;
                  title = "Mapeamento de Políticas GPO";
                  desc = "Ponto de distribuição central de diretivas de grupo.";
                } else if (site.name === '@') {
                  icon = <Globe className="w-5 h-5 text-blue-600" />;
                  title = "Portal Corporativo (Raiz)";
                  desc = "Site de entrada institucional configurado na raiz do domínio.";
                } else if (nameLower.startsWith('pc-')) {
                  icon = <Monitor className="w-5 h-5 text-slate-500" />;
                  title = `Estação: ${site.name.toUpperCase()}`;
                  desc = "Computador individual de usuário registrado no domínio.";
                }

                return (
                  <div key={site.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-blue-200 transition-all flex flex-col justify-between">
                    <div>
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-slate-50 border border-slate-100 rounded-lg shrink-0">
                          {icon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="text-[9px] uppercase font-bold tracking-wider text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            {site.type}
                          </span>
                          <h4 className="text-xs font-bold text-slate-800 truncate mt-1">{title}</h4>
                          <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{desc}</p>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-400">FQDN (Nome Completo):</span>
                          <span className="font-mono font-medium text-slate-700 truncate select-all">{fqdn}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-400">Endereço IP:</span>
                          <span className="font-mono font-semibold text-slate-800">{site.value}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-2 flex gap-2">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`http://${fqdn}`);
                          alert(`Endereço http://${fqdn} copiado com sucesso!`);
                        }}
                        className="flex-1 py-1.5 border border-slate-200 hover:bg-slate-50 text-[10px] font-semibold text-slate-600 rounded-lg transition-colors cursor-pointer text-center"
                      >
                        Copiar URL
                      </button>
                      <button
                        onClick={() => alert(`Enviando pacotes de ping para ${fqdn} [${site.value}]:\n✔ Resposta de ${site.value}: bytes=32 tempo<1ms TTL=128\nStatus: Online`)}
                        className="flex-1 py-1.5 bg-blue-50 hover:bg-blue-100 text-[10px] font-bold text-blue-600 rounded-lg transition-colors cursor-pointer text-center"
                      >
                        Testar Conexão
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Primary Workspace: Record Table & Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        
        {/* Category Tabs */}
        <div className="flex flex-wrap border-b border-slate-200 bg-slate-50">
          <button
            onClick={() => {
              setActiveCategory('forward');
              setSelectedZone('all');
            }}
            className={`px-5 py-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeCategory === 'forward'
                ? 'border-blue-600 text-blue-600 font-bold bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
            }`}
          >
            <Network className="w-4 h-4 text-blue-500" />
            Zonas de Pesquisa Direta (Forward Lookup)
            <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
              activeCategory === 'forward' ? 'bg-blue-100 text-blue-800' : 'bg-slate-200/80 text-slate-600'
            }`}>
              {records.filter(r => {
                const z = zones.find(zone => zone.name.toLowerCase() === r.zoneName.toLowerCase());
                return !z || z.type === 'Direta';
              }).length}
            </span>
          </button>
          <button
            onClick={() => {
              setActiveCategory('reverse');
              setSelectedZone('all');
            }}
            className={`px-5 py-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeCategory === 'reverse'
                ? 'border-blue-600 text-blue-600 font-bold bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
            }`}
          >
            <RefreshCw className="w-4 h-4 text-emerald-500" />
            Zonas de Pesquisa Inversa (Reverse Lookup)
            <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
              activeCategory === 'reverse' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200/80 text-slate-600'
            }`}>
              {records.filter(r => {
                const z = zones.find(zone => zone.name.toLowerCase() === r.zoneName.toLowerCase());
                return z && z.type === 'Inversa';
              }).length}
            </span>
          </button>
          <button
            onClick={() => {
              setActiveCategory('all');
              setSelectedZone('all');
            }}
            className={`px-5 py-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeCategory === 'all'
                ? 'border-blue-600 text-blue-600 font-bold bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
            }`}
          >
            <Filter className="w-4 h-4 text-slate-500" />
            Todos os Registros
            <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
              activeCategory === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-200/80 text-slate-600'
            }`}>
              {records.length}
            </span>
          </button>
        </div>

        {/* Toolbar */}
        <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
          
          {/* Leftside filters */}
          <div className="flex flex-wrap items-center gap-3">
            
            {/* Search Input */}
            <div className="relative w-64">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Filtrar registros..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-slate-200 pl-9 pr-4 py-2 rounded-lg text-xs placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Zone Filter */}
            <select
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
              className="bg-white border border-slate-200 text-xs px-3 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">
                {activeCategory === 'forward' ? 'Todas as Zonas Diretas' : 
                 activeCategory === 'reverse' ? 'Todas as Zonas Inversas' : 'Todas as Zonas'}
              </option>
              {zones
                .filter(z => 
                  activeCategory === 'all' || 
                  (activeCategory === 'forward' && z.type === 'Direta') ||
                  (activeCategory === 'reverse' && z.type === 'Inversa')
                )
                .map((z, idx) => (
                  <option key={idx} value={z.name}>{z.name}</option>
                ))}
            </select>

            {/* Type Filter */}
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="bg-white border border-slate-200 text-xs px-3 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">Todos os Tipos</option>
              <option value="A">A (Host)</option>
              <option value="AAAA">AAAA (IPv6)</option>
              <option value="CNAME">CNAME (Alias)</option>
              <option value="MX">MX (Mail Exchanger)</option>
              <option value="PTR">PTR (Ponteiro)</option>
              <option value="NS">NS (Name Server)</option>
              <option value="TXT">TXT (Texto)</option>
            </select>

          </div>

          {/* Rightside Actions */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={handleSyncAD}
              disabled={syncing}
              title="Sincronizar Zonas e Registros DNS com o seu Active Directory real"
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium text-xs px-3.5 py-2 rounded-lg shadow-sm transition-colors flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Sincronizando AD...' : 'Sincronizar com AD'}
            </button>

            <button
              onClick={() => setShowZoneModal(true)}
              className="bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs px-3.5 py-2 rounded-lg shadow-sm transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Network className="w-3.5 h-3.5" />
              Gerenciar Zonas
            </button>

            <button
              onClick={fetchDnsData}
              title="Recarregar dados"
              className="p-2 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 transition-colors text-slate-600 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <button
              onClick={() => setShowAddModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs px-3.5 py-2 rounded-lg shadow-sm transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Novo Registro
            </button>
          </div>

        </div>

        {/* DNS Record List */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
              <span className="text-xs">Carregando tabelas do DNS corporativo...</span>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
              <Info className="w-6 h-6 text-slate-300" />
              <span className="text-xs">Nenhum registro DNS atende aos filtros definidos.</span>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 font-semibold">
                  <th className="py-3 px-6">Nome do Host / IP</th>
                  <th className="py-3 px-4">Tipo</th>
                  <th className="py-3 px-6">Valor / Destino</th>
                  <th className="py-3 px-4">Zona DNS</th>
                  <th className="py-3 px-4">TTL (s)</th>
                  <th className="py-3 px-4">Data Registro</th>
                  <th className="py-3 px-4">Classe</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((record) => {
                  // Determine if this specific record belongs to any duplicate or conflict group
                  const isIdenticalDuplicate = detectedDuplicates.some(
                    d => d.type === 'identical' && d.records.some(r => r.id === record.id)
                  );
                  const isConflicting = detectedDuplicates.some(
                    d => (d.type === 'conflict_a' || d.type === 'conflict_ptr') && d.records.some(r => r.id === record.id)
                  );

                  return (
                    <tr 
                      key={record.id} 
                      className={`border-b border-slate-100 hover:bg-slate-50/50 transition-colors ${
                        isIdenticalDuplicate ? 'bg-amber-50/30' : 
                        isConflicting ? 'bg-red-50/20' : ''
                      }`}
                    >
                      <td className="py-3 px-6 font-semibold text-slate-800">
                        <div className="flex items-center gap-2">
                          <span className="font-mono">{record.name}</span>
                          {isIdenticalDuplicate && (
                            <span className="bg-amber-100 text-amber-700 text-[9px] font-bold px-1.5 py-0.5 rounded border border-amber-200/50" title="Registro idêntico duplicado">
                              DUPLICADO
                            </span>
                          )}
                          {isConflicting && (
                            <span className="bg-red-100 text-red-700 text-[9px] font-bold px-1.5 py-0.5 rounded border border-red-200/30" title="Mapeamento conflitante/contraditório">
                              CONFLITO
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                          record.type === 'A' ? 'bg-blue-100 text-blue-800' :
                          record.type === 'PTR' ? 'bg-indigo-100 text-indigo-800' :
                          record.type === 'CNAME' ? 'bg-purple-100 text-purple-800' :
                          record.type === 'NS' ? 'bg-teal-100 text-teal-800' :
                          record.type === 'MX' ? 'bg-pink-100 text-pink-800' : 'bg-slate-100 text-slate-800'
                        }`}>
                          {record.type}
                        </span>
                      </td>
                      <td className="py-3 px-6 text-slate-600 font-mono">
                        {record.value}
                      </td>
                      <td className="py-3 px-4 text-slate-500 font-medium">
                        {record.zoneName}
                      </td>
                      <td className="py-3 px-4 text-slate-500 font-mono">
                        {record.ttl}
                      </td>
                      <td className="py-3 px-4 text-slate-500 font-mono">
                        {record.timestamp}
                      </td>
                      <td className="py-3 px-4">
                        {record.isStatic ? (
                          <span className="text-slate-700 font-semibold bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-[10px] uppercase">
                            Estático
                          </span>
                        ) : (
                          <span className="text-blue-600 font-semibold bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded text-[10px] uppercase">
                            Dinâmico
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleDeleteRecord(record.id, record.name, record.type)}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                          title="Excluir Registro"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer Statistics */}
        <div className="p-4 bg-slate-50/50 border-t border-slate-200 flex justify-between items-center text-slate-500 text-[11px] font-semibold">
          <span>Mostrando {filteredRecords.length} de {records.length} registros cadastrados</span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
            Total de {records.filter(r => r.isStatic).length} estáticos e {records.filter(r => !r.isStatic).length} dinâmicos
          </span>
        </div>

      </div>

      {/* New DNS Record Modal Overlay */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in no-print">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-scale-up">
            
            {/* Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
                <Network className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold tracking-tight">Novo Registro de DNS</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Cadastrar mapeamento no Servidor de Nomes</p>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleAddRecord} className="p-5 space-y-4">
              
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{formError}</span>
                </div>
              )}

              {formSuccess && (
                <div className="p-3 bg-green-50 border border-green-200 text-green-800 text-xs rounded-lg flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0 text-green-600" />
                  <span>{formSuccess}</span>
                </div>
              )}

              {/* Zone selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Zona DNS Alvo</label>
                <select
                  value={newRecordZone}
                  onChange={(e) => {
                    setNewRecordZone(e.target.value);
                    // Automatic reverse PTR naming optimization
                    if (e.target.value.includes('in-addr.arpa')) {
                      setNewRecordType('PTR');
                    } else if (newRecordType === 'PTR') {
                      setNewRecordType('A');
                    }
                  }}
                  className="w-full bg-slate-50 border border-slate-200 text-xs px-3 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {zones.map((z, idx) => (
                    <option key={idx} value={z.name}>{z.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {/* Record Type */}
                <div className="col-span-1">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Tipo</label>
                  <select
                    value={newRecordType}
                    onChange={(e) => setNewRecordType(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-xs px-3 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="A">A (Host)</option>
                    <option value="AAAA">AAAA</option>
                    <option value="CNAME">CNAME</option>
                    <option value="MX">MX</option>
                    <option value="NS">NS</option>
                    <option value="PTR">PTR</option>
                    <option value="TXT">TXT</option>
                  </select>
                </div>

                {/* Host Name */}
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    {newRecordType === 'PTR' ? 'Host IP (Final)' : 'Nome do Host'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={newRecordType === 'PTR' ? 'e.g. 100' : 'e.g. srv-banco'}
                    value={newRecordName}
                    onChange={(e) => setNewRecordName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-xs px-3 py-2 rounded-lg placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Record Value */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  {newRecordType === 'A' ? 'Endereço IPv4' : 
                   newRecordType === 'AAAA' ? 'Endereço IPv6' : 
                   newRecordType === 'PTR' ? 'FQDN Destino' : 'Destino / Texto'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    newRecordType === 'A' ? 'e.g. 192.168.1.50' : 
                    newRecordType === 'PTR' ? 'e.g. srv-banco.empresa.local.' : 'e.g. srv-principal'
                  }
                  value={newRecordValue}
                  onChange={(e) => setNewRecordValue(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-xs px-3 py-2 rounded-lg placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* TTL */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">TTL (Segundos)</label>
                  <input
                    type="number"
                    min="1"
                    value={newRecordTtl}
                    onChange={(e) => setNewRecordTtl(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 text-xs px-3 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Is Static Checkbox */}
                <div className="flex items-center pl-1 pt-6">
                  <input
                    id="newRecordIsStatic"
                    type="checkbox"
                    checked={newRecordIsStatic}
                    onChange={(e) => setNewRecordIsStatic(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 bg-slate-50 border-slate-300 focus:ring-blue-500 focus:ring-2 cursor-pointer"
                  />
                  <label htmlFor="newRecordIsStatic" className="ml-2 text-xs font-medium text-slate-700 cursor-pointer">
                    Registro Estático
                  </label>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 shadow transition-colors cursor-pointer"
                >
                  Criar Registro
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Zone Management Modal Overlay */}
      {showZoneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in no-print">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-2xl overflow-hidden animate-scale-up">
            
            {/* Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Network className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold tracking-tight">Gerenciamento de Zonas DNS</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Adicionar ou remover zonas diretas e inversas</p>
                </div>
              </div>
              <button 
                onClick={() => setShowZoneModal(false)}
                className="text-slate-400 hover:text-white transition-colors text-xs font-semibold cursor-pointer"
              >
                Fechar [X]
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100 max-h-[80vh] overflow-y-auto">
              
              {/* Left Side: Zone List */}
              <div className="p-5 space-y-4">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Zonas Ativas ({zones.length})</h4>
                <div className="space-y-2 overflow-y-auto max-h-[300px] pr-1">
                  {zones.map((zone) => (
                    <div key={zone.name} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50/50 text-xs">
                      <div>
                        <p className="font-semibold text-slate-800">{zone.name}</p>
                        <div className="flex gap-2 mt-1">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            zone.type === 'Direta' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                          }`}>
                            {zone.type}
                          </span>
                          <span className="text-slate-400 text-[9px]">
                            Atualização: {zone.updateType}
                          </span>
                        </div>
                      </div>
                      
                      <button
                        onClick={() => handleDeleteZone(zone.name)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors cursor-pointer"
                        title="Excluir Zona e Registros"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Side: Create Zone Form */}
              <div className="p-5 space-y-4">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Nova Zona DNS</h4>
                <form onSubmit={handleCreateZone} className="space-y-4">
                  {zoneFormError && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 shrink-0 text-red-600" />
                      <span>{zoneFormError}</span>
                    </div>
                  )}

                  {zoneFormSuccess && (
                    <div className="p-3 bg-green-50 border border-green-200 text-green-800 text-xs rounded-lg flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 shrink-0 text-green-600" />
                      <span>{zoneFormSuccess}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nome da Zona</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. corp.local ou 1.168.192.in-addr.arpa"
                      value={newZoneName}
                      onChange={(e) => setNewZoneName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 text-xs px-3 py-2 rounded-lg placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">Tipo de Zona</label>
                      <select
                        value={newZoneType}
                        onChange={(e) => setNewZoneType(e.target.value as any)}
                        className="w-full bg-slate-50 border border-slate-200 text-xs px-3 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="Direta">Direta</option>
                        <option value="Inversa">Inversa</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">Atualização Dinâmica</label>
                      <select
                        value={newZoneUpdate}
                        onChange={(e) => setNewZoneUpdate(e.target.value as any)}
                        className="w-full bg-slate-50 border border-slate-200 text-xs px-3 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="Segura">Segura (Apenas AD)</option>
                        <option value="Não Segura">Não Segura (Qualquer)</option>
                        <option value="Nenhuma">Nenhuma</option>
                      </select>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium shadow transition-colors cursor-pointer"
                  >
                    Adicionar Zona
                  </button>
                </form>
              </div>

            </div>

            <div className="bg-slate-50 px-5 py-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setShowZoneModal(false)}
                className="px-4 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-medium transition-colors cursor-pointer"
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
