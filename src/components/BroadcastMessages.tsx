/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Send,
  Bell,
  Clock,
  Terminal,
  Monitor,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Info,
  Search,
  CheckSquare,
  Square,
  Play,
  Pause,
  Trash2,
  Download,
  Copy,
  Check,
  Calendar,
  RefreshCw,
  Volume2,
  ShieldAlert,
  ExternalLink,
  X,
  Eye,
  Radio,
  Laptop,
  Server
} from 'lucide-react';
import {
  ADComputer,
  BroadcastDeliverySummary,
  BroadcastMessage,
  BroadcastScheduleType,
  ConnectedWorkstation,
  MessageUrgency
} from '../types';

interface BroadcastMessagesProps {
  computers: ADComputer[];
  messages: BroadcastMessage[];
  connectedWorkstations: ConnectedWorkstation[];
  wsConnected: boolean;
  currentUsername: string;
  adDomain?: string;
  showPopupsInConsole: boolean;
  onTogglePopupsInConsole: (val: boolean) => void;
  testStationName: string;
  onChangeTestStationName: (name: string) => void;
  onRefreshMessages: () => Promise<void> | void;
  onMessageCreated?: (msg: BroadcastMessage) => void;
}

const WEEK_DAYS = [
  { id: 0, label: 'Dom' },
  { id: 1, label: 'Seg' },
  { id: 2, label: 'Ter' },
  { id: 3, label: 'Qua' },
  { id: 4, label: 'Qui' },
  { id: 5, label: 'Sex' },
  { id: 6, label: 'Sáb' }
];

const QUICK_TEMPLATES = [
  {
    label: 'Reinicialização 15 min',
    urgency: 'warning' as MessageUrgency,
    category: 'Reinicialização Obrigatória',
    title: 'Reinicialização Programada das Estações em 15 Minutos',
    body: 'Prezado(a) colaborador(a), aplicaremos atualizações críticas de segurança do Windows. Por favor, salve todos os seus arquivos abertos. Seu computador será reiniciado em 15 minutos.'
  },
  {
    label: 'Manutenção ERP / Rede',
    urgency: 'info' as MessageUrgency,
    category: 'Manutenção Programada',
    title: 'Janela de Manutenção Programada nos Servidores',
    body: 'Informamos que hoje às 19h00 haverá manutenção preventiva nos servidores de arquivos e sistemas internos. Duração estimada: 30 minutos.'
  },
  {
    label: 'Alerta Crítico de Segurança',
    urgency: 'urgent' as MessageUrgency,
    category: 'Segurança da Informação',
    title: 'ALERTA URGENTE: Tentativa de Phishing Detectada',
    body: 'Atenção imediata: não abra anexos nem clique em links de e-mails com assunto "Fatura Pendente". Caso tenha clicado, desconecte o cabo de rede e contate o Service Desk imediatamente (Ramal 200).'
  }
];

function formatScheduleLabel(msg: BroadcastMessage): string {
  if (msg.scheduleType === 'immediate') return 'Envio Imediato';
  if (msg.scheduleType === 'once') {
    return msg.scheduledAt ? `Único (${msg.scheduledAt.replace('T', ' ')})` : 'Único';
  }
  if (msg.scheduleType === 'daily') {
    return `Diário às ${msg.recurrenceTime || '09:00'}`;
  }
  if (msg.scheduleType === 'weekly') {
    const names = (msg.recurrenceDays || []).map((d) => WEEK_DAYS.find((w) => w.id === d)?.label || d).join(', ');
    return `Semanal (${names}) às ${msg.recurrenceTime || '09:00'}`;
  }
  if (msg.scheduleType === 'monthly') {
    const day = msg.recurrenceDays?.[0] || 1;
    return `Mensal (Dia ${day}) às ${msg.recurrenceTime || '09:00'}`;
  }
  return msg.scheduleType;
}

export default function BroadcastMessages({
  computers,
  messages,
  connectedWorkstations,
  wsConnected,
  currentUsername,
  adDomain = 'inema.intranet',
  showPopupsInConsole,
  onTogglePopupsInConsole,
  testStationName,
  onChangeTestStationName,
  onRefreshMessages,
  onMessageCreated
}: BroadcastMessagesProps) {
  const [subTab, setSubTab] = useState<'compose' | 'schedules' | 'history' | 'powershell'>('compose');

  // Composer form states
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [urgency, setUrgency] = useState<MessageUrgency>('warning');
  const [category, setCategory] = useState('Comunicado Geral');
  const [targetMode, setTargetMode] = useState<'all' | 'selected'>('all');
  const [selectedMachines, setSelectedMachines] = useState<string[]>([]);
  const [onlyActiveMachines, setOnlyActiveMachines] = useState(true);
  const [machineSearch, setMachineSearch] = useState('');
  const [machineOuFilter, setMachineOuFilter] = useState('todos');

  // Desktop popup behavior
  const [requireAck, setRequireAck] = useState(true);
  const [playSound, setPlaySound] = useState(true);
  const [autoCloseSeconds, setAutoCloseSeconds] = useState(0);
  const [deliveryMethod, setDeliveryMethod] = useState<'realtime_agent' | 'powershell_msg' | 'hybrid'>('hybrid');

  // Scheduling states
  const [scheduleType, setScheduleType] = useState<BroadcastScheduleType>('immediate');
  const [scheduledAt, setScheduledAt] = useState(() => {
    const d = new Date(Date.now() + 30 * 60 * 1000);
    const localIso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    return localIso;
  });
  const [recurrenceTime, setRecurrenceTime] = useState('09:00');
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([1, 3, 5]);
  const [monthlyDay, setMonthlyDay] = useState<number>(1);

  // Action & feedback states
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'warning' | 'error'; text: string } | null>(null);
  const [lastDeliveryNotice, setLastDeliveryNotice] = useState<{
    messageId: string;
    title: string;
    summary: BroadcastDeliverySummary;
    targetMode: 'all' | 'selected';
    targets: string[];
  } | null>(null);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [detailMessage, setDetailMessage] = useState<BroadcastMessage | null>(null);

  // PowerShell tab states
  const [psTab, setPsTab] = useState<'push' | 'agent' | 'gpo'>('push');
  const [psScriptCode, setPsScriptCode] = useState('');
  const [loadingPs, setLoadingPs] = useState(false);
  const [copiedPs, setCopiedPs] = useState(false);

  const showToast = (type: 'success' | 'warning' | 'error', text: string) => {
    setFeedback({ type, text });
    window.setTimeout(() => setFeedback(null), 6500);
  };

  const copyQuickCommand = (key: string, cmd: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(cmd);
      setCopiedCmd(key);
      window.setTimeout(() => setCopiedCmd(null), 2500);
    }
  };

  // Distinct OUs for target machine filter
  const distinctOUs = useMemo(() => {
    const set = new Set<string>();
    computers.forEach((c) => {
      if (c.ou) set.add(c.ou);
    });
    return Array.from(set).sort();
  }, [computers]);

  // Filtered machine list for equipment picker
  const filteredComputers = useMemo(() => {
    const term = machineSearch.toLowerCase();
    return computers.filter((c) => {
      if (onlyActiveMachines && c.status === 'Desativado') return false;
      if (machineOuFilter !== 'todos' && c.ou !== machineOuFilter) return false;
      if (!term) return true;
      return (
        c.name.toLowerCase().includes(term) ||
        (c.ipAddress && c.ipAddress.toLowerCase().includes(term)) ||
        (c.ou && c.ou.toLowerCase().includes(term)) ||
        (c.operatingSystem && c.operatingSystem.toLowerCase().includes(term))
      );
    });
  }, [computers, machineSearch, machineOuFilter, onlyActiveMachines]);

  // KPI metrics
  const sentMessages = useMemo(
    () => messages.filter((m) => m.status === 'enviada' || m.runCount > 0),
    [messages]
  );
  const scheduledMessages = useMemo(
    () => messages.filter((m) => m.status === 'agendada' || m.status === 'pausada'),
    [messages]
  );
  const activeSchedulesCount = useMemo(
    () => messages.filter((m) => m.status === 'agendada').length,
    [messages]
  );
  const workstationClients = useMemo(
    () => connectedWorkstations.filter((c) => c.role === 'workstation'),
    [connectedWorkstations]
  );

  const onlineWorkstationSet = useMemo(() => {
    const set = new Set<string>();
    workstationClients.forEach((c) => {
      if (c.machineName) set.add(c.machineName.split('.')[0].toUpperCase());
    });
    return set;
  }, [workstationClients]);

  const ackStats = useMemo(() => {
    let total = 0;
    let confirmed = 0;
    for (const m of sentMessages) {
      for (const r of m.receipts || []) {
        total++;
        if (r.status === 'confirmada') confirmed++;
      }
    }
    const pct = total > 0 ? Math.round((confirmed / total) * 100) : 0;
    return { total, confirmed, pct };
  }, [sentMessages]);

  // Keep open detail drawer synced when messages refresh
  useEffect(() => {
    if (detailMessage) {
      const updated = messages.find((m) => m.id === detailMessage.id);
      if (updated) setDetailMessage(updated);
    }
  }, [messages, detailMessage]);

  // Fetch PowerShell script when entering PowerShell tab or switching mode
  useEffect(() => {
    if (subTab !== 'powershell') return;
    if (psTab === 'gpo') return;

    const loadScript = async () => {
      setLoadingPs(true);
      try {
        const params = new URLSearchParams({
          type: psTab === 'agent' ? 'agent' : 'push',
          title: title || 'Aviso Importante de TI',
          body: body || 'Favor salvar seus documentos. Manutenção programada em 15 minutos.',
          urgency,
          targetMode,
          targets: selectedMachines.join(',')
        });
        const res = await fetch(`/api/messages/powershell-script?${params.toString()}`);
        const data = await res.json();
        if (data.script) setPsScriptCode(data.script);
      } catch (err) {
        console.error('Erro ao carregar script PowerShell:', err);
      } finally {
        setLoadingPs(false);
      }
    };

    loadScript();
  }, [subTab, psTab, title, body, urgency, targetMode, selectedMachines]);

  const gpoBatWrapper = useMemo(() => {
    const serverUrl = window.location.origin;
    return `@echo off
REM Script de Logon GPO para iniciar o Agente de Pop-ups em Tempo Real nas Estacoes
REM Salve o arquivo DirectoryAdmin-DesktopAgent.ps1 no compartilhamento NETLOGON do AD:
REM \\\\${adDomain}\\NETLOGON\\DirectoryAdmin-DesktopAgent.ps1

start "" /B powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "\\\\${adDomain}\\NETLOGON\\DirectoryAdmin-DesktopAgent.ps1" -ServerUrl "${serverUrl}"
exit /b 0`;
  }, [adDomain]);

  const toggleMachine = (name: string) => {
    setSelectedMachines((prev) =>
      prev.includes(name) ? prev.filter((m) => m !== name) : [...prev, name]
    );
  };

  const handleSelectAllVisible = () => {
    const visibleNames = filteredComputers.map((c) => c.name);
    const allSelected = visibleNames.length > 0 && visibleNames.every((n) => selectedMachines.includes(n));
    if (allSelected) {
      const visibleSet = new Set(visibleNames);
      setSelectedMachines((prev) => prev.filter((n) => !visibleSet.has(n)));
    } else {
      setSelectedMachines((prev) => Array.from(new Set([...prev, ...visibleNames])));
    }
  };

  const toggleWeekDay = (dayId: number) => {
    setRecurrenceDays((prev) => {
      if (prev.includes(dayId)) {
        return prev.length > 1 ? prev.filter((d) => d !== dayId) : prev;
      }
      return [...prev, dayId].sort((a, b) => a - b);
    });
  };

  const handleApplyTemplate = (tpl: (typeof QUICK_TEMPLATES)[number]) => {
    setTitle(tpl.title);
    setBody(tpl.body);
    setUrgency(tpl.urgency);
    setCategory(tpl.category);
  };

  const handleSubmitBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      showToast('error', 'Preencha o título e a mensagem do aviso.');
      return;
    }
    if (targetMode === 'selected' && selectedMachines.length === 0) {
      showToast('error', 'Selecione pelo menos um equipamento ou escolha "Todas as Máquinas".');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        body: body.trim(),
        urgency,
        category,
        sender: currentUsername || 'admin.silva',
        targetMode,
        targetMachines: targetMode === 'all' ? [] : selectedMachines,
        onlyActiveMachines,
        requireAck,
        playSound,
        autoCloseSeconds,
        deliveryMethod,
        scheduleType,
        scheduledAt: scheduleType === 'once' ? new Date(scheduledAt).toISOString() : undefined,
        recurrenceTime: ['daily', 'weekly', 'monthly'].includes(scheduleType) ? recurrenceTime : undefined,
        recurrenceDays:
          scheduleType === 'weekly'
            ? recurrenceDays
            : scheduleType === 'monthly'
            ? [monthlyDay]
            : undefined
      };

      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        showToast('error', data.error || 'Falha ao processar envio da mensagem.');
      } else {
        if (data.message) onMessageCreated?.(data.message);
        await onRefreshMessages();

        if (scheduleType !== 'immediate') {
          setLastDeliveryNotice(null);
          showToast('success', 'Agendamento automático salvo e ativado no servidor!');
          setSubTab('schedules');
        } else {
          const summary: BroadcastDeliverySummary | undefined = data.deliverySummary;
          if (summary && summary.pendingAgentCount > 0) {
            setLastDeliveryNotice({
              messageId: data.message?.id || '',
              title: title.trim(),
              summary,
              targetMode,
              targets: targetMode === 'all' ? [] : selectedMachines
            });
            if (summary.onlineAgentCount > 0) {
              showToast(
                'warning',
                `Pop-up entregue em ${summary.onlineAgentCount} estação(ões) online. ${summary.pendingAgentCount} máquina(s) aguardando agente ou disparo PowerShell.`
              );
            } else {
              showToast(
                'warning',
                `Mensagem salva na fila, mas nenhuma estação alvo está com o Agente Receptor conectado neste momento.`
              );
            }
          } else {
            setLastDeliveryNotice(null);
            showToast('success', 'Pop-up entregue em tempo real nas estações selecionadas!');
          }
        }
      }
    } catch (err: any) {
      showToast('error', err.message || 'Erro de comunicação com o servidor.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDispatchNow = async (id: string) => {
    try {
      const res = await fetch(`/api/messages/${id}/dispatch-now`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        await onRefreshMessages();
        const summary: BroadcastDeliverySummary | undefined = data.deliverySummary;
        if (summary && summary.pendingAgentCount > 0 && data.message) {
          setLastDeliveryNotice({
            messageId: data.message.id,
            title: data.message.title,
            summary,
            targetMode: data.message.targetMode,
            targets: data.message.targetMachines || []
          });
          setSubTab('compose');
          showToast(
            'warning',
            summary.onlineAgentCount > 0
              ? `Entregue em ${summary.onlineAgentCount} estação(ões) online; ${summary.pendingAgentCount} aguardando agente/push.`
              : 'Mensagem colocada na fila, mas as estações alvo não estão com o Agente Receptor conectado.'
          );
        } else {
          setLastDeliveryNotice(null);
          showToast('success', 'Mensagem disparada imediatamente em tempo real!');
        }
      }
    } catch {
      showToast('error', 'Erro ao disparar mensagem.');
    }
  };

  const handleTogglePause = async (id: string) => {
    try {
      const res = await fetch(`/api/messages/${id}/toggle-pause`, { method: 'POST' });
      if (res.ok) {
        await onRefreshMessages();
        showToast('success', 'Status do agendamento atualizado.');
      }
    } catch {
      showToast('error', 'Erro ao alterar status do agendamento.');
    }
  };

  const handleDeleteMessage = async (id: string) => {
    if (!window.confirm('Deseja remover este registro / agendamento de mensagem?')) return;
    try {
      const res = await fetch(`/api/messages/${id}`, { method: 'DELETE' });
      if (res.ok) {
        if (detailMessage?.id === id) setDetailMessage(null);
        await onRefreshMessages();
        showToast('success', 'Registro removido.');
      }
    } catch {
      showToast('error', 'Erro ao excluir mensagem.');
    }
  };

  const handleCopyCode = (text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedPs(true);
      setTimeout(() => setCopiedPs(false), 2000);
    }
  };

  const handleDownloadPs = (type: 'push' | 'agent', customMsg?: BroadcastMessage) => {
    const params = new URLSearchParams({
      type,
      download: 'true',
      messageId: customMsg?.id || '',
      title: customMsg?.title || title || 'Aviso Importante de TI',
      body: customMsg?.body || body || 'Favor salvar seus documentos.',
      urgency: customMsg?.urgency || urgency,
      targetMode: customMsg?.targetMode || targetMode,
      targets: (customMsg?.targetMachines || selectedMachines).join(',')
    });
    window.location.href = `/api/messages/powershell-script?${params.toString()}`;
  };

  const handleEnableBrowserNotifications = async () => {
    if (typeof Notification === 'undefined') {
      showToast('error', 'Este navegador não suporta notificações nativas do sistema.');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      showToast('success', 'Notificações Desktop nativas habilitadas neste navegador!');
    } else {
      showToast('error', 'Permissão de notificação negada no navegador.');
    }
  };

  const openWorkstationReceiverTab = () => {
    const machine =
      testStationName !== 'CONSOLE-ADMIN'
        ? testStationName
        : selectedMachines[0] || 'NB-INEMA-12440';
    const url = `${window.location.origin}/?receiver=${encodeURIComponent(machine)}`;
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Preview colors
  const previewHeaderClass =
    urgency === 'urgent'
      ? 'bg-red-600'
      : urgency === 'warning'
      ? 'bg-amber-600'
      : 'bg-blue-600';
  const previewBorderClass =
    urgency === 'urgent'
      ? 'border-red-500'
      : urgency === 'warning'
      ? 'border-amber-500'
      : 'border-blue-500';
  const previewUrgencyText =
    urgency === 'urgent'
      ? 'ALERTA URGENTE'
      : urgency === 'warning'
      ? 'AVISO DE ATENÇÃO'
      : 'COMUNICADO INFORMATIVO';

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span>Comunicação Corporativa</span>
            <span aria-hidden="true">·</span>
            <span>Domínio {adDomain}</span>
            <span aria-hidden="true">·</span>
            <span className={wsConnected ? 'text-emerald-600 font-semibold' : 'text-amber-600 font-semibold'}>
              {wsConnected ? 'Canal Tempo Real Ativo' : 'Reconectando Canal'}
            </span>
          </div>
          <h2 className="text-xl font-display font-bold text-slate-900 tracking-tight">
            Mensageria na Rede & Pop-ups Desktop em Tempo Real
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Envie avisos imediatos ou agendados com níveis de urgência para toda a rede ou equipamentos específicos, com integração PowerShell e confirmação de leitura.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleEnableBrowserNotifications}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Bell className="w-3.5 h-3.5 text-blue-600" />
            Notificações OS
          </button>

          <button
            type="button"
            onClick={openWorkstationReceiverTab}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap"
            title="Abrir modo receptor em outra aba simulando uma estação de trabalho conectada"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Abrir Receptor Estação ({testStationName})
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-medium ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : feedback.type === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : feedback.type === 'warning' ? (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            ) : (
              <AlertOctagon className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button type="button" onClick={() => setFeedback(null)} className="cursor-pointer opacity-70 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Actionable Delivery Diagnosis when target workstations are not running the Desktop Agent */}
      {lastDeliveryNotice && lastDeliveryNotice.summary.pendingAgentCount > 0 && (
        <div className="bg-amber-50/90 border border-amber-300 rounded-xl p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-900">
                  Ação necessária para exibir o pop-up na tela da estação remota
                </h4>
                <p className="text-xs text-slate-700 leading-relaxed">
                  O alerta <strong>"{lastDeliveryNotice.title}"</strong> está pronto para{' '}
                  <strong>
                    {lastDeliveryNotice.summary.offlineMachines.length > 0
                      ? lastDeliveryNotice.summary.offlineMachines.join(', ')
                      : `${lastDeliveryNotice.summary.pendingAgentCount} máquina(s)`}
                  </strong>
                  , mas {lastDeliveryNotice.summary.onlineAgentCount === 0 ? 'nenhuma delas está' : 'parte delas não está'} com o{' '}
                  <strong>Agente Desktop Windows</strong> ativo no momento
                  {lastDeliveryNotice.summary.serverPlatform !== 'win32'
                    ? ` (o servidor web atual roda em ${lastDeliveryNotice.summary.serverPlatform}, sem acesso RPC/msg.exe direto à intranet)`
                    : ''}
                  . Escolha uma das opções abaixo para entregar na tela da estação:
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setLastDeliveryNotice(null)}
              className="text-slate-400 hover:text-slate-700 cursor-pointer p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Option 1: Instant Push from Admin's Windows PC */}
            <div className="bg-white border border-amber-200 rounded-lg p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-900">
                  1. Disparar AGORA do seu PC Admin Windows (Rede Interna)
                </span>
                <button
                  type="button"
                  onClick={() =>
                    copyQuickCommand(
                      'push_now',
                      `powershell -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; irm '${window.location.origin}/api/messages/push.ps1?messageId=${encodeURIComponent(lastDeliveryNotice.messageId)}' | iex"`
                    )
                  }
                  className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-[11px] font-semibold cursor-pointer inline-flex items-center gap-1 shrink-0"
                >
                  {copiedCmd === 'push_now' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  {copiedCmd === 'push_now' ? 'Copiado!' : 'Copiar Comando'}
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                Cole no PowerShell do seu computador na rede <code className="font-mono">{adDomain}</code>: envia imediatamente via <code className="font-mono">msg.exe</code> e WinRM WPF para a estação alvo e atualiza o recibo aqui.
              </p>
              <pre className="p-2 bg-slate-900 text-slate-200 rounded text-[10px] font-mono overflow-x-auto">
                {`powershell -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; irm '${window.location.origin}/api/messages/push.ps1?messageId=${encodeURIComponent(lastDeliveryNotice.messageId)}' | iex"`}
              </pre>
            </div>

            {/* Option 2: Run Agent on Target Machine */}
            <div className="bg-white border border-amber-200 rounded-lg p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-900">
                  2. Ativar Agente em Tempo Real na Estação (ou GPO)
                </span>
                <button
                  type="button"
                  onClick={() =>
                    copyQuickCommand(
                      'agent_now',
                      `powershell -ExecutionPolicy Bypass -WindowStyle Hidden -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; irm '${window.location.origin}/api/messages/agent.ps1' | iex"`
                    )
                  }
                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-[11px] font-semibold cursor-pointer inline-flex items-center gap-1 shrink-0"
                >
                  {copiedCmd === 'agent_now' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copiedCmd === 'agent_now' ? 'Copiado!' : 'Copiar Agente'}
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                Execute na estação Windows (ou implante na GPO de logon): a máquina aparecerá como <strong>Online</strong> no painel e abrirá o pop-up automaticamente em até 3 segundos.
              </p>
              <pre className="p-2 bg-slate-900 text-slate-200 rounded text-[10px] font-mono overflow-x-auto">
                {`powershell -ExecutionPolicy Bypass -WindowStyle Hidden -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; irm '${window.location.origin}/api/messages/agent.ps1' | iex"`}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* 4 Metric Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Disparos Realizados</span>
            <Send className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-2">
            {sentMessages.length}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">Mensagens enviadas na rede</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Agendamentos Ativos</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-2">
            {activeSchedulesCount}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">Tarefas automáticas programadas</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Estações Online (WS)</span>
            <Radio className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-2">
            {workstationClients.length}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {connectedWorkstations.length} sessões totais conectadas
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Leituras Confirmadas</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-2">
            {ackStats.confirmed}
            <span className="text-sm font-normal text-slate-400">/{ackStats.total}</span>
          </p>
          <p className="text-xs text-slate-400 mt-0.5">Taxa de ciência: {ackStats.pct}%</p>
        </div>
      </div>

      {/* Sub-navigation Tabs + Console Popup Toggle */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-xl">
          <button
            type="button"
            onClick={() => setSubTab('compose')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap ${
              subTab === 'compose'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            Nova Mensagem
          </button>
          <button
            type="button"
            onClick={() => setSubTab('schedules')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap ${
              subTab === 'schedules'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            Agendamentos ({scheduledMessages.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('history')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap ${
              subTab === 'history'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Histórico & Recibos ({sentMessages.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('powershell')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap ${
              subTab === 'powershell'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            Integração PowerShell & GPO
          </button>
        </div>

        {/* Live console popup tester controls */}
        <div className="flex flex-wrap items-center gap-3 bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs">
          <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
            <input
              type="checkbox"
              checked={showPopupsInConsole}
              onChange={(e) => onTogglePopupsInConsole(e.target.checked)}
              className="rounded border-slate-300"
            />
            Simular pop-up neste console
          </label>
          <div className="h-4 w-px bg-slate-200 hidden sm:block" />
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Estação simulada:</span>
            <select
              value={testStationName}
              onChange={(e) => onChangeTestStationName(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs font-mono text-slate-700 focus:outline-none"
            >
              <option value="CONSOLE-ADMIN">CONSOLE-ADMIN</option>
              {computers.slice(0, 30).map((c) => (
                <option key={c.id || c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* TAB 1: COMPOSE & DISPATCH */}
      {subTab === 'compose' && (
        <form onSubmit={handleSubmitBroadcast} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Message Details, Urgency & Schedule */}
          <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">1. Conteúdo & Nível de Urgência</h3>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-400 mr-1">Modelos rápidos:</span>
                {QUICK_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.label}
                    type="button"
                    onClick={() => handleApplyTemplate(tpl)}
                    className="px-2.5 py-1 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors cursor-pointer"
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Urgency Selector */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700">
                Nível de Urgência do Pop-up Desktop
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => setUrgency('info')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    urgency === 'info'
                      ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-500/20'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-blue-700">
                    <Info className="w-4 h-4" />
                    Informativo
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Notificação discreta no canto da tela para avisos de rotina.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setUrgency('warning')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    urgency === 'warning'
                      ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-500/20'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-700">
                    <AlertTriangle className="w-4 h-4" />
                    Atenção / Aviso
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Destaque âmbar para manutenções e reinicializações próximas.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setUrgency('urgent')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    urgency === 'urgent'
                      ? 'bg-red-50 border-red-600 ring-2 ring-red-500/20'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-red-700">
                    <AlertOctagon className="w-4 h-4" />
                    Urgente / Crítico
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Pop-up central sobreposto (Topmost) com alerta sonoro imediato.
                  </p>
                </button>
              </div>
            </div>

            {/* Category & Title */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Categoria
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  <option value="Comunicado Geral">Comunicado Geral</option>
                  <option value="Manutenção Programada">Manutenção Programada</option>
                  <option value="Reinicialização Obrigatória">Reinicialização Obrigatória</option>
                  <option value="Segurança da Informação">Segurança da Informação</option>
                  <option value="Incidente de Rede">Incidente de Rede</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Título do Alerta *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Manutenção programada no servidor de arquivos às 18h"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Body */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Mensagem para os Usuários Logados *
              </label>
              <textarea
                rows={4}
                required
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Digite o comunicado completo que será exibido no pop-up desktop..."
                className="w-full px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 leading-relaxed"
              />
            </div>

            {/* Behavior & Integration options */}
            <div className="pt-4 border-t border-slate-100 space-y-4">
              <h4 className="text-xs font-bold text-slate-800">2. Comportamento do Pop-up & Integração</h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requireAck}
                    onChange={(e) => setRequireAck(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300"
                  />
                  <div>
                    <span className="block text-xs font-semibold text-slate-800">Exigir confirmação (Ciente)</span>
                    <span className="block text-[11px] text-slate-500">
                      Registra usuário e hora em que o alerta foi lido na estação.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={playSound}
                    onChange={(e) => setPlaySound(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300"
                  />
                  <div>
                    <span className="block text-xs font-semibold text-slate-800">Emitir alerta sonoro</span>
                    <span className="block text-[11px] text-slate-500">
                      Reproduz sinal acústico no desktop ao abrir o pop-up.
                    </span>
                  </div>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Método de Entrega na Rede
                  </label>
                  <select
                    value={deliveryMethod}
                    onChange={(e) => setDeliveryMethod(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="hybrid">Híbrido (WebSocket Tempo Real + Agente PowerShell)</option>
                    <option value="realtime_agent">Apenas Agente Tempo Real (WebSocket / SSE)</option>
                    <option value="powershell_msg">Script PowerShell Remoto (WinRM / msg.exe)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Auto-fechamento na Tela
                  </label>
                  <select
                    value={autoCloseSeconds}
                    disabled={requireAck}
                    onChange={(e) => setAutoCloseSeconds(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none disabled:opacity-60"
                  >
                    <option value={0}>Permanente até o usuário clicar</option>
                    <option value={15}>Fechar automaticamente em 15 segundos</option>
                    <option value={30}>Fechar automaticamente em 30 segundos</option>
                    <option value={60}>Fechar automaticamente em 60 segundos</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Automatic Scheduling */}
            <div className="pt-4 border-t border-slate-100 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800">3. Agendamento Automático</h4>
                <span className="text-[11px] text-slate-400">Executado automaticamente pelo servidor</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  { id: 'immediate', label: 'Enviar Agora' },
                  { id: 'once', label: 'Data Única' },
                  { id: 'daily', label: 'Diário' },
                  { id: 'weekly', label: 'Semanal' },
                  { id: 'monthly', label: 'Mensal' }
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setScheduleType(opt.id as BroadcastScheduleType)}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                      scheduleType === opt.id
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {scheduleType === 'once' && (
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Data e Horário do Disparo Programado
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="px-3 py-2 text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              )}

              {(scheduleType === 'daily' || scheduleType === 'weekly' || scheduleType === 'monthly') && (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex flex-wrap items-center gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Horário do Disparo
                      </label>
                      <input
                        type="time"
                        value={recurrenceTime}
                        onChange={(e) => setRecurrenceTime(e.target.value)}
                        className="px-3 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-lg"
                      />
                    </div>

                    {scheduleType === 'monthly' && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Dia do Mês (1-28)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={28}
                          value={monthlyDay}
                          onChange={(e) => setMonthlyDay(Math.min(28, Math.max(1, Number(e.target.value) || 1)))}
                          className="w-24 px-3 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-lg"
                        />
                      </div>
                    )}
                  </div>

                  {scheduleType === 'weekly' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Dias da Semana
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {WEEK_DAYS.map((day) => {
                          const active = recurrenceDays.includes(day.id);
                          return (
                            <button
                              key={day.id}
                              type="button"
                              onClick={() => toggleWeekDay(day.id)}
                              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold border cursor-pointer transition-colors ${
                                active
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {day.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Submit Bar */}
            <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                Destino:{' '}
                <strong className="text-slate-800">
                  {targetMode === 'all'
                    ? onlyActiveMachines
                      ? `Todas as máquinas ativas (${computers.filter((c) => c.status !== 'Desativado').length})`
                      : `Todas as máquinas do AD (${computers.length})`
                    : `${selectedMachines.length} equipamento(s) selecionado(s)`}
                </strong>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSubTab('powershell')}
                  className="px-3.5 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Terminal className="w-3.5 h-3.5" />
                  Ver Script PowerShell
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={`px-5 py-2.5 text-xs font-bold text-white rounded-lg transition-colors cursor-pointer inline-flex items-center gap-2 shadow-xs disabled:opacity-60 ${
                    urgency === 'urgent'
                      ? 'bg-red-600 hover:bg-red-700'
                      : urgency === 'warning'
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {scheduleType === 'immediate' ? <Send className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                  {submitting
                    ? 'Processando...'
                    : scheduleType === 'immediate'
                    ? 'Enviar Pop-up Agora'
                    : 'Criar Agendamento Automático'}
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Target Selection + Live Desktop Preview */}
          <div className="lg:col-span-5 space-y-6">
            {/* Target Selection Panel */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">Equipamentos de Destino</h3>
                <span className="text-xs font-mono text-slate-500">
                  {targetMode === 'all' ? 'Broadcast Geral' : `${selectedMachines.length} selec.`}
                </span>
              </div>

              {/* All vs Selected segmented toggle */}
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setTargetMode('all')}
                  className={`py-2 px-3 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    targetMode === 'all'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Todas as Máquinas
                </button>
                <button
                  type="button"
                  onClick={() => setTargetMode('selected')}
                  className={`py-2 px-3 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    targetMode === 'selected'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Escolher Equipamentos
                </button>
              </div>

              {targetMode === 'all' ? (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                      <Monitor className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">
                        Envio Global para Toda a Rede ({adDomain})
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Todas as estações desktop conectadas e usuários logados receberão o aviso em tempo real.
                      </p>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 pt-2 border-t border-slate-200/70 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={onlyActiveMachines}
                      onChange={(e) => setOnlyActiveMachines(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    <span>
                      Ignorar máquinas desativadas no AD ({computers.filter((c) => c.status !== 'Desativado').length} ativas)
                    </span>
                  </label>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Search & OU Filter */}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Buscar máquina, IP ou SO..."
                        value={machineSearch}
                        onChange={(e) => setMachineSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    {distinctOUs.length > 0 && (
                      <select
                        value={machineOuFilter}
                        onChange={(e) => setMachineOuFilter(e.target.value)}
                        className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg max-w-[160px] truncate"
                      >
                        <option value="todos">Todas as OUs</option>
                        {distinctOUs.map((ou) => (
                          <option key={ou} value={ou}>
                            {ou}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Quick Selection Toolbar */}
                  <div className="flex items-center justify-between text-[11px]">
                    <button
                      type="button"
                      onClick={handleSelectAllVisible}
                      className="text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                    >
                      Alternar visíveis ({filteredComputers.length})
                    </button>
                    {selectedMachines.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedMachines([])}
                        className="text-slate-500 hover:text-slate-800 font-medium cursor-pointer"
                      >
                        Limpar seleção ({selectedMachines.length})
                      </button>
                    )}
                  </div>

                  {/* Equipment Checkbox List */}
                  <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                    {filteredComputers.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-400">
                        Nenhum equipamento encontrado com os filtros atuais.
                      </div>
                    ) : (
                      filteredComputers.map((comp) => {
                        const checked = selectedMachines.includes(comp.name);
                        const isAgentOnline = onlineWorkstationSet.has(comp.name.split('.')[0].toUpperCase());
                        const isSrv =
                          comp.name.toLowerCase().startsWith('srv') ||
                          comp.operatingSystem.toLowerCase().includes('server');
                        const isNb =
                          comp.name.toLowerCase().startsWith('nb') ||
                          comp.name.toLowerCase().includes('note');

                        return (
                          <div
                            key={comp.id || comp.name}
                            onClick={() => toggleMachine(comp.name)}
                            className={`px-3 py-2 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                              checked ? 'bg-blue-50/60' : 'hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {checked ? (
                                <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-400 shrink-0" />
                              )}
                              {isSrv ? (
                                <Server className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              ) : isNb ? (
                                <Laptop className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              ) : (
                                <Monitor className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              )}
                              <div className="min-w-0">
                                <p className="text-xs font-mono font-bold text-slate-800 truncate">
                                  {comp.name}
                                </p>
                                <p className="text-[10px] text-slate-400 truncate">
                                  {comp.ipAddress || 'DHCP'} · {comp.ou}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span
                                className={`text-[10px] font-semibold ${
                                  isAgentOnline ? 'text-emerald-600' : 'text-slate-400'
                                }`}
                                title={
                                  isAgentOnline
                                    ? 'Agente Desktop conectado em tempo real'
                                    : 'Sem Agente Desktop conectado (recebe via script PowerShell/msg.exe ou quando o agente iniciar)'
                                }
                              >
                                {isAgentOnline ? 'Agente Online' : 'Sem Agente'}
                              </span>
                              <span className="text-slate-200">|</span>
                              <span
                                className={`text-[10px] font-medium ${
                                  comp.status === 'Desativado' ? 'text-slate-400' : 'text-slate-600'
                                }`}
                              >
                                {comp.status}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Live Windows Desktop Popup Preview */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" />
                  Pré-visualização do Pop-up Desktop
                </h3>
                {playSound && (
                  <span className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                    <Volume2 className="w-3.5 h-3.5" />
                    Com som
                  </span>
                )}
              </div>

              <div className={`rounded-xl border-2 ${previewBorderClass} overflow-hidden shadow-md bg-white`}>
                <div className={`${previewHeaderClass} px-4 py-2.5 text-white flex items-center justify-between`}>
                  <div className="flex items-center gap-2 min-w-0">
                    {urgency === 'urgent' ? (
                      <AlertOctagon className="w-4 h-4 shrink-0" />
                    ) : urgency === 'warning' ? (
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                    ) : (
                      <Info className="w-4 h-4 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider opacity-90 block">
                        {previewUrgencyText} · {category}
                      </span>
                      <p className="text-xs font-bold truncate">
                        {title || 'Título do comunicado aparecerá aqui'}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {body || 'O texto completo do alerta enviado aos usuários logados nas estações de trabalho será exibido nesta área.'}
                  </p>
                  <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 text-[11px] text-slate-500">
                    <span>Por {currentUsername}</span>
                    <span className={`px-3 py-1 rounded-md text-white font-semibold ${previewHeaderClass}`}>
                      {requireAck ? 'Confirmar Leitura (Ciente)' : 'OK'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* TAB 2: SCHEDULES */}
      {subTab === 'schedules' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-slate-900">Agendamentos Automáticos</h3>
              <p className="text-xs text-slate-500">
                Mensagens programadas para disparo automático único ou recorrente nas estações do domínio.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onRefreshMessages()}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg cursor-pointer inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Atualizar
              </button>
              <button
                type="button"
                onClick={() => setSubTab('compose')}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
              >
                + Novo Agendamento
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Mensagem & Urgência</th>
                  <th className="py-3 px-4">Destino</th>
                  <th className="py-3 px-4">Periodicidade</th>
                  <th className="py-3 px-4">Próximo Disparo</th>
                  <th className="py-3 px-4">Execuções</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {scheduledMessages.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <Calendar className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                      <p className="font-semibold text-slate-700 text-sm">Nenhum agendamento ativo ou pausado</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Crie um agendamento único, diário, semanal ou mensal na aba "Nova Mensagem".
                      </p>
                    </td>
                  </tr>
                ) : (
                  scheduledMessages.map((msg) => (
                    <tr key={msg.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{msg.title}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <span
                            className={`font-semibold ${
                              msg.urgency === 'urgent'
                                ? 'text-red-600'
                                : msg.urgency === 'warning'
                                ? 'text-amber-600'
                                : 'text-blue-600'
                            }`}
                          >
                            {msg.urgency === 'urgent'
                              ? 'Urgente'
                              : msg.urgency === 'warning'
                              ? 'Atenção'
                              : 'Informativo'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{msg.category}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {msg.targetMode === 'all' ? (
                          <span className="font-medium text-slate-700">Todas as Máquinas</span>
                        ) : (
                          <span className="font-mono text-[11px] text-slate-700">
                            {msg.targetMachines.length} equipamento(s)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-medium">{formatScheduleLabel(msg)}</td>
                      <td className="py-3 px-4 font-mono tabular-nums text-[11px]">
                        {msg.nextRunAt ? new Date(msg.nextRunAt).toLocaleString('pt-BR') : '—'}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums">{msg.runCount || 0}x</td>
                      <td className="py-3 px-4">
                        {msg.status === 'agendada' ? (
                          <span className="text-emerald-700 font-semibold">Agendado</span>
                        ) : (
                          <span className="text-amber-700 font-semibold">Pausado</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleDispatchNow(msg.id)}
                            className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md font-semibold text-[11px] cursor-pointer inline-flex items-center gap-1"
                            title="Disparar imediatamente agora"
                          >
                            <Play className="w-3 h-3" />
                            Disparar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleTogglePause(msg.id)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-semibold text-[11px] cursor-pointer inline-flex items-center gap-1"
                          >
                            {msg.status === 'agendada' ? (
                              <>
                                <Pause className="w-3 h-3" /> Pausar
                              </>
                            ) : (
                              <>
                                <Play className="w-3 h-3" /> Retomar
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteMessage(msg.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-md cursor-pointer"
                            title="Excluir agendamento"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: HISTORY & RECEIPTS */}
      {subTab === 'history' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-slate-900">Histórico de Mensagens & Confirmações</h3>
              <p className="text-xs text-slate-500">
                Acompanhe quais estações receberam o pop-up em tempo real e quais usuários confirmaram a leitura.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onRefreshMessages()}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg cursor-pointer inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Atualizar Recibos
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Título & Urgência</th>
                  <th className="py-3 px-4">Alvo</th>
                  <th className="py-3 px-4">Último Disparo</th>
                  <th className="py-3 px-4">Entregues / Confirmadas</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {sentMessages.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      <Send className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                      <p className="font-semibold text-slate-700 text-sm">Nenhum comunicado enviado ainda</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Envie um alerta pela aba "Nova Mensagem" para visualizar os recibos por estação.
                      </p>
                    </td>
                  </tr>
                ) : (
                  sentMessages.map((msg) => {
                    const receipts = msg.receipts || [];
                    const confirmed = receipts.filter((r) => r.status === 'confirmada').length;
                    const delivered = receipts.filter((r) => r.status === 'entregue' || r.status === 'confirmada').length;
                    return (
                      <tr key={msg.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{msg.title}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                            <span
                              className={`font-semibold ${
                                msg.urgency === 'urgent'
                                  ? 'text-red-600'
                                  : msg.urgency === 'warning'
                                  ? 'text-amber-600'
                                  : 'text-blue-600'
                              }`}
                            >
                              {msg.urgency === 'urgent'
                                ? 'Urgente'
                                : msg.urgency === 'warning'
                                ? 'Atenção'
                                : 'Informativo'}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>Por {msg.sender}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {msg.targetMode === 'all' ? (
                            <span>Todas as Máquinas ({receipts.length})</span>
                          ) : (
                            <span className="font-mono text-[11px]">
                              {msg.targetMachines.slice(0, 3).join(', ')}
                              {msg.targetMachines.length > 3 ? ` +${msg.targetMachines.length - 3}` : ''}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-[11px]">
                          {msg.sentAt || msg.createdAt}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-xs">
                          <span className="text-blue-700 font-semibold">{delivered} entr.</span>
                          <span className="text-slate-400 mx-1">/</span>
                          <span className="text-emerald-700 font-semibold">{confirmed} ciente</span>
                          <span className="text-slate-400 ml-1">({receipts.length} alvo)</span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setDetailMessage(msg)}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-semibold text-[11px] cursor-pointer"
                            >
                              Ver Recibos
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDispatchNow(msg.id)}
                              className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md font-semibold text-[11px] cursor-pointer"
                            >
                              Reenviar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadPs('push', msg)}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded-md font-semibold text-[11px] cursor-pointer inline-flex items-center gap-1"
                              title="Baixar script PowerShell (.ps1) desta mensagem"
                            >
                              <Terminal className="w-3 h-3" />
                              .PS1
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteMessage(msg.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 rounded-md cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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
      )}

      {/* TAB 4: POWERSHELL & GPO INTEGRATION */}
      {subTab === 'powershell' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-slate-900">Integração Nativa via Script PowerShell & GPO</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Utilize os scripts prontos abaixo para disparar pop-ups WPF/msg.exe via WinRM ou instalar o agente em tempo real via Política de Grupo (GPO).
              </p>
            </div>

            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setPsTab('push')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                  psTab === 'push' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Disparo Remoto (.ps1)
              </button>
              <button
                type="button"
                onClick={() => setPsTab('agent')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                  psTab === 'agent' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Agente Tempo Real (.ps1)
              </button>
              <button
                type="button"
                onClick={() => setPsTab('gpo')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                  psTab === 'gpo' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Wrapper GPO (.bat)
              </button>
            </div>
          </div>

          {/* Info strip for selected PowerShell mode */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-slate-600 space-y-1">
              {psTab === 'push' && (
                <>
                  <p className="font-bold text-slate-800">
                    Script de Disparo Direto (Enviar-Alerta-AD.ps1)
                  </p>
                  <p>
                    Executa a partir da estação do administrador usando WinRM (<code className="font-mono">Invoke-Command</code>) e <code className="font-mono">msg.exe</code> com janela gráfica WPF configurada para{' '}
                    <strong>{targetMode === 'all' ? 'todas as máquinas ativas do AD' : `${selectedMachines.length || 1} máquina(s) selecionada(s)`}</strong>.
                  </p>
                </>
              )}
              {psTab === 'agent' && (
                <>
                  <p className="font-bold text-slate-800">
                    Agente Residente nas Estações (DirectoryAdmin-DesktopAgent.ps1)
                  </p>
                  <p>
                    Mantém escuta contínua nesta API (<code className="font-mono">/api/messages/pending</code>) no contexto do usuário logado, exibe pop-ups estilizados com som e reporta confirmação de leitura (ACK) em tempo real.
                  </p>
                </>
              )}
              {psTab === 'gpo' && (
                <>
                  <p className="font-bold text-slate-800">
                    Implantação via GPO / Script de Logon (.BAT)
                  </p>
                  <p>
                    Configure este arquivo no caminho <code className="font-mono">\\{adDomain}\NETLOGON</code> e associe à GPO de Logon do Usuário para iniciar o agente silenciosamente em todas as estações Windows.
                  </p>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleCopyCode(psTab === 'gpo' ? gpoBatWrapper : psScriptCode)}
                className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5"
              >
                {copiedPs ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedPs ? 'Copiado!' : 'Copiar Código'}
              </button>
              {psTab !== 'gpo' && (
                <button
                  type="button"
                  onClick={() => handleDownloadPs(psTab === 'agent' ? 'agent' : 'push')}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Baixar .ps1
                </button>
              )}
            </div>
          </div>

          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>
                {psTab === 'push'
                  ? 'Enviar-Alerta-AD.ps1'
                  : psTab === 'agent'
                  ? 'DirectoryAdmin-DesktopAgent.ps1'
                  : 'iniciar_agente_alertas.bat'}
              </span>
              <span>PowerShell 5.1 / 7+ · Windows 10 / 11 / Server</span>
            </div>
            <pre className="p-4 text-xs font-mono text-slate-200 overflow-x-auto max-h-[460px] leading-relaxed">
              {loadingPs && psTab !== 'gpo' ? 'Gerando script PowerShell...' : psTab === 'gpo' ? gpoBatWrapper : psScriptCode}
            </pre>
          </div>
        </div>
      )}

      {/* Slide-over Drawer for Per-Machine Delivery Receipts */}
      {detailMessage && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col border-l border-slate-200">
            <div className="p-6 border-b border-slate-200 flex items-start justify-between gap-4">
              <div>
                <div className="text-xs text-slate-500 mb-1">
                  Recibos por Estação · {detailMessage.sentAt || detailMessage.createdAt}
                </div>
                <h3 className="text-base font-bold text-slate-900">{detailMessage.title}</h3>
                <p className="text-xs text-slate-600 mt-1">{detailMessage.body}</p>
              </div>
              <button
                type="button"
                onClick={() => setDetailMessage(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px]">
                      <th className="py-2.5 px-3">Estação / IP</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Entregue em</th>
                      <th className="py-2.5 px-3">Confirmado por</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(detailMessage.receipts || []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-400">
                          Aguardando entrega para estações conectadas.
                        </td>
                      </tr>
                    ) : (
                      detailMessage.receipts.map((rec) => (
                        <tr key={rec.machineName} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-mono">
                            <div className="font-bold text-slate-800">{rec.machineName}</div>
                            {rec.ipAddress && <div className="text-[10px] text-slate-400">{rec.ipAddress}</div>}
                          </td>
                          <td className="py-2.5 px-3 font-semibold">
                            {rec.status === 'confirmada' ? (
                              <span className="text-emerald-700">Confirmada (Ciente)</span>
                            ) : rec.status === 'entregue' ? (
                              <span className="text-blue-700">Pop-up Exibido</span>
                            ) : (
                              <span className="text-slate-400">Aguardando Agente</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-[11px] text-slate-500">
                            {rec.deliveredAt || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-[11px] text-slate-600">
                            {rec.acknowledgedBy ? (
                              <span>
                                <strong>{rec.acknowledgedBy}</strong> · {rec.acknowledgedAt}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <button
                type="button"
                onClick={() => handleDownloadPs('push', detailMessage)}
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg cursor-pointer inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Baixar Script PowerShell (.ps1)
              </button>
              <button
                type="button"
                onClick={() => setDetailMessage(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg cursor-pointer"
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
