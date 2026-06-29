/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  BellRing, 
  Settings, 
  Clock, 
  Mail, 
  ShieldAlert, 
  Check, 
  Lock, 
  AlertTriangle,
  UserX,
  XCircle,
  Sparkles,
  HelpCircle,
  Inbox,
  Download
} from 'lucide-react';
import { ADUser, AuditLog, InactivitySetting } from '../types';

interface AlertsProps {
  users: ADUser[];
  onUpdateUser: (user: ADUser) => void;
  onAddAuditLog: (log: AuditLog) => void;
  inactivityDays: number;
  onUpdateInactivityDays: (days: number) => void;
}

export default function Alerts({
  users,
  onUpdateUser,
  onAddAuditLog,
  inactivityDays,
  onUpdateInactivityDays
}: AlertsProps) {
  // Alert settings local state (and global prop sync)
  const [tempInactivityDays, setTempInactivityDays] = useState(inactivityDays);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    setTempInactivityDays(inactivityDays);
  }, [inactivityDays]);

  // List of dismissed (whitelisted) users for current session
  const [dismissedUserIds, setDismissedUserIds] = useState<string[]>([]);

  // Function to calculate difference in days
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
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Filter inactive users who are still 'Ativa' (not blocked or disabled or expired)
  const inactiveUsers = users.filter(user => {
    if (user.status !== 'Ativa') return false;
    if (dismissedUserIds.includes(user.id)) return false;
    
    const days = getDaysInactive(user.lastLogon);
    return days >= inactivityDays;
  });

  // Handle setting updates
  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateInactivityDays(tempInactivityDays);
    setSuccessMsg('Configurações de políticas de inatividade salvas com sucesso!');
    setTimeout(() => setSuccessMsg(''), 4000);

    onAddAuditLog({
      id: Math.random().toString(),
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      operator: 'admin.silva',
      action: 'Alteração de Diretriz',
      targetUser: 'Sistema',
      details: `Limite de inatividade configurado para ${tempInactivityDays} dias.`,
      type: 'info'
    });
  };

  // Perform individual mitigation actions
  const handleLockAccount = (user: ADUser) => {
    const updatedUser: ADUser = {
      ...user,
      status: 'Bloqueada'
    };
    onUpdateUser(updatedUser);

    onAddAuditLog({
      id: Math.random().toString(),
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      operator: 'Sistema (Alerta)',
      action: 'Bloqueio Automático',
      targetUser: user.username,
      details: `Conta bloqueada administrativamente por inatividade prolongada (${getDaysInactive(user.lastLogon)} dias sem logon no domínio).`,
      type: 'danger'
    });
    alert(`Conta do usuário ${user.name} foi BLOQUEADA com sucesso por inatividade.`);
  };

  const handleSendWarning = (user: ADUser) => {
    onAddAuditLog({
      id: Math.random().toString(),
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      operator: 'Sistema (E-mail)',
      action: 'Notificação Enviada',
      targetUser: user.username,
      details: `E-mail de aviso de expiração e inatividade enviado automaticamente para o endereço ${user.email}. Prazo de 7 dias para logon regular.`,
      type: 'warning'
    });
    alert(`E-mail de notificação enviado para ${user.email}. Solicitando logon nos próximos 7 dias.`);
  };

  const handleDismissAlert = (userId: string, userName: string) => {
    setDismissedUserIds(prev => [...prev, userId]);
    onAddAuditLog({
      id: Math.random().toString(),
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      operator: 'admin.silva',
      action: 'Alerta Dispensado',
      targetUser: userName,
      details: 'Alerta de inatividade dispensado manualmente pelo administrador. Usuário mantido ativo temporariamente.',
      type: 'info'
    });
  };

  const handleExportCSV = () => {
    if (inactiveUsers.length === 0) return;

    const headers = ['Nome Completo', 'Logon (sAMAccountName)', 'E-mail', 'Departamento', 'Cargo', 'Dias Inativo', 'Ultimo Logon'];
    const csvRows = [headers.join(';')];

    inactiveUsers.forEach(u => {
      const daysInactive = getDaysInactive(u.lastLogon);
      const row = [
        `"${u.name}"`,
        `"${u.username}"`,
        `"${u.email}"`,
        `"${u.department}"`,
        `"${u.title}"`,
        `"${daysInactive}"`,
        `"${u.lastLogon}"`
      ];
      csvRows.push(row.join(';'));
    });

    const csvContent = '\uFEFF' + csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const todayStr = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `AD_Alertas_Inatividade_${inactivityDays}d_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in" id="alerts-section">
      
      {/* Alert Rules & Config Sidebar (1 col) */}
      <div className="lg:col-span-1 bg-white p-5 rounded-2xl border border-slate-100 shadow-xs h-fit space-y-5" id="alerts-config">
        <h3 className="font-display font-bold text-slate-800 text-sm pb-3 border-b border-slate-100 flex items-center gap-2">
          <Settings className="w-4 h-4 text-blue-500" />
          Políticas de Inatividade AD
        </h3>

        <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
          
          {/* Days Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="font-semibold text-slate-600 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                Limite de Inatividade
              </label>
              <span className="bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded font-mono">
                {tempInactivityDays} dias
              </span>
            </div>
            <input 
              type="range" 
              min="15" 
              max="180" 
              step="5"
              className="w-full accent-blue-600 cursor-pointer h-1.5 bg-slate-100 rounded-lg"
              value={tempInactivityDays}
              onChange={(e) => setTempInactivityDays(Number(e.target.value))}
            />
            <span className="text-[10px] text-slate-400 block">
              Contas sem logon no período estipulado serão sinalizadas para auditoria de segurança.
            </span>
          </div>

          {/* Success messages */}
          {successMsg && (
            <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 p-3 rounded-xl flex items-start gap-2">
              <Check className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
              <p className="text-[11px] leading-relaxed">{successMsg}</p>
            </div>
          )}

          {/* Save Button */}
          <button 
            type="submit"
            className="w-full bg-slate-800 hover:bg-slate-900 text-white font-semibold py-2 px-3 rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            Salvar Políticas AD
          </button>

        </form>

        <div className="bg-amber-50 border border-amber-100 p-3.5 rounded-xl text-xs text-amber-800 space-y-1.5">
          <div className="flex gap-2 items-start">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="leading-relaxed text-[11px]">
              <strong className="block mb-0.5">Segurança ISO 27001</strong>
              A desativação automática de contas inativas é uma das principais exigências para auditoria de TI da ISO 27001 e conformidade regulatória para evitar vetores de "Contas Órfãs".
            </div>
          </div>
        </div>
      </div>

      {/* Flagged Accounts Work list (2 cols) */}
      <div className="lg:col-span-2 space-y-4" id="alerts-worklist">
        
        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
          
          <div className="p-4 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <BellRing className="w-4 h-4 text-amber-500 animate-swing" />
                <h3 className="font-display font-bold text-slate-800 text-sm">Alertas Ativos de Inatividade ({inactiveUsers.length})</h3>
              </div>
              <p className="text-slate-400 text-[11px]">Usuários com inatividade superior a <strong className="text-blue-600">{inactivityDays} dias</strong> que continuam com acesso autorizado</p>
            </div>
            
            <div className="flex items-center gap-2 self-start md:self-auto">
              <button
                onClick={handleExportCSV}
                disabled={inactiveUsers.length === 0}
                className="text-[11px] font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-colors border border-slate-200 cursor-pointer"
                title="Exportar usuários inativos exibidos em CSV"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                Exportar CSV
              </button>
              <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                Revisão Requerida
              </span>
            </div>
          </div>

          <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
            {inactiveUsers.length > 0 ? (
              inactiveUsers.map(user => {
                const daysInactive = getDaysInactive(user.lastLogon);
                return (
                  <div key={user.id} className="p-4 hover:bg-slate-50/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    
                    {/* User summary details */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800 text-xs">{user.name}</span>
                        <span className="bg-amber-100 text-amber-800 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded">
                          {daysInactive} dias inativo
                        </span>
                      </div>
                      <p className="font-mono text-[10px] text-slate-500">{user.username} | {user.email}</p>
                      
                      <div className="flex items-center gap-4 text-[10px] text-slate-400 pt-1">
                        <span>Depto: <strong>{user.department}</strong></span>
                        <span>Último logon: <strong>{user.lastLogon}</strong></span>
                      </div>
                    </div>

                    {/* Quick mitigation actions */}
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <button 
                        onClick={() => handleDismissAlert(user.id, user.name)}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold px-2.5 py-1.5 rounded-lg text-[10px] transition-colors cursor-pointer"
                        title="Ignorar alerta para esta sessão"
                      >
                        Ignorar
                      </button>
                      <button 
                        disabled
                        className="bg-slate-100 text-slate-400 font-semibold px-2.5 py-1.5 rounded-lg text-[10px] cursor-not-allowed opacity-50"
                        title="Envio de e-mail de alerta desabilitado"
                      >
                        Enviar Alerta
                      </button>
                      <button 
                        disabled
                        className="bg-slate-100 text-slate-400 font-semibold px-2.5 py-1.5 rounded-lg text-[10px] flex items-center gap-1.5 cursor-not-allowed opacity-50"
                        title="Bloqueio de contas desabilitado"
                      >
                        <UserX className="w-3 h-3" />
                        Bloquear
                      </button>
                    </div>

                  </div>
                );
              })
            ) : (
              <div className="p-12 text-center text-slate-400 bg-slate-50/50">
                <div className="max-w-xs mx-auto space-y-2">
                  <div className="bg-emerald-50 text-emerald-600 p-3.5 rounded-full w-fit mx-auto border border-emerald-100">
                    <Check className="w-6 h-6" />
                  </div>
                  <h4 className="font-display font-semibold text-slate-700 text-xs">Zero Contas Inativas</h4>
                  <p className="text-[11px] text-slate-400">
                    Excelente! No momento, não há contas ativas com inatividade prolongada superior a {inactivityDays} dias de acordo com os critérios definidos.
                  </p>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Quick Tips */}
        <div className="bg-blue-50/50 border border-blue-100/50 rounded-2xl p-5 flex gap-4">
          <div className="bg-white text-blue-600 p-2.5 rounded-xl border border-blue-100 h-fit">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="text-xs space-y-1.5 leading-relaxed text-blue-950">
            <strong className="block font-display text-slate-800">Dicas de Gestão de Políticas de Grupo (GPO)</strong>
            <p className="text-[11px] text-slate-600">
              Contas inativas ocorrem comumente por desligamentos não informados formalmente ao helpdesk ou licenças médicas longas. Implemente uma GPO de bloqueio automático para contas de prestadores de serviço com expiração forçada ou configure revisões automáticas no Azure AD / local AD com scripts PowerShell agendados.
            </p>
          </div>
        </div>

      </div>

    </div>
  );
}
