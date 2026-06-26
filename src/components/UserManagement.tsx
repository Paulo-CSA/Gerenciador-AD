/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  UserPlus, 
  Lock, 
  Unlock, 
  UserMinus, 
  UserCheck, 
  RefreshCw, 
  MoreVertical, 
  ChevronRight, 
  X, 
  Calendar, 
  Mail, 
  Briefcase, 
  FileLock2, 
  Network,
  Users,
  Check,
  AlertOctagon,
  Trash2
} from 'lucide-react';
import { ADUser, AuditLog } from '../types';

interface UserManagementProps {
  users: ADUser[];
  onAddUser: (user: ADUser) => void;
  onUpdateUser: (user: ADUser) => void;
  onDeleteUser: (id: string) => void;
  onAddAuditLog: (log: AuditLog) => void;
  dashboardFilter: string | null;
  onClearDashboardFilter: () => void;
}

export default function UserManagement({
  users,
  onAddUser,
  onUpdateUser,
  onDeleteUser,
  onAddAuditLog,
  dashboardFilter,
  onClearDashboardFilter
}: UserManagementProps) {
  // State variables
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [departmentFilter, setDepartmentFilter] = useState<string>('todos');
  const [selectedUser, setSelectedUser] = useState<ADUser | null>(null);
  
  // Create User Form State
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserUsername, setNewUserUsername] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserDept, setNewUserDept] = useState('Tecnologia da Informação');
  const [newUserTitle, setNewUserTitle] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserOU, setNewUserOU] = useState('OU=Tecnologia,OU=Usuarios,DC=empresa,DC=local');
  const [newUserExpires, setNewUserExpires] = useState('');
  const [newUserMustChangePwd, setNewUserMustChangePwd] = useState(true);

  // Quick Action States
  const [resettingPassword, setResettingPassword] = useState(false);
  const [tempPassword, setTempPassword] = useState('');

  // Handle auto-completion of fields
  const handleNameChange = (val: string) => {
    setNewUserName(val);
    // Auto generate username
    const normalized = val.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
      .replace(/[^a-z\s]/g, ''); // remove non letters
    const parts = normalized.trim().split(/\s+/);
    if (parts.length >= 2) {
      const generated = `${parts[0]}.${parts[parts.length - 1]}`;
      setNewUserUsername(generated);
      setNewUserEmail(`${generated}@empresa.com.br`);
    } else if (parts.length === 1 && parts[0] !== '') {
      setNewUserUsername(parts[0]);
      setNewUserEmail(`${parts[0]}@empresa.com.br`);
    }
  };

  // Sync OU with department choice
  const handleDeptChange = (dept: string) => {
    setNewUserDept(dept);
    const code = dept.split(' ')[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z]/g, '');
    setNewUserOU(`OU=${code},OU=Usuarios,DC=empresa,DC=local`);
  };

  // Sync state if dashboard filter applies
  useEffect(() => {
    if (dashboardFilter) {
      if (dashboardFilter === 'Bloqueada') {
        setStatusFilter('Bloqueada');
      } else if (dashboardFilter === 'DesativadasMes') {
        setStatusFilter('Desativada');
      } else {
        setStatusFilter('todos');
      }
    }
  }, [dashboardFilter]);

  // Handle closing drawer/clearing dashboard filter
  const handleClearAllFilters = () => {
    setStatusFilter('todos');
    setDepartmentFilter('todos');
    setSearchTerm('');
    onClearDashboardFilter();
  };

  // Unique departments list for filters
  const departments = Array.from(new Set(users.map(u => u.department)));

  // Filter users list based on search and selected options
  const filteredUsers = users.filter(user => {
    // 1. Search term
    const matchesSearch = 
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.title.toLowerCase().includes(searchTerm.toLowerCase());

    // 2. Department filter
    const matchesDept = departmentFilter === 'todos' || user.department === departmentFilter;

    // 3. Status filter (takes priority or merges with dashboard filters)
    let matchesStatus = true;
    if (statusFilter !== 'todos') {
      matchesStatus = user.status === statusFilter;
    }

    // 4. Dashboard specific filters
    let matchesDashboard = true;
    if (dashboardFilter) {
      const CURRENT_YEAR_MONTH = '2026-06';
      if (dashboardFilter === 'AtivasLogonMes') {
        matchesDashboard = user.status === 'Ativa' && user.lastLogon.startsWith(CURRENT_YEAR_MONTH);
      } else if (dashboardFilter === 'CriadasMes') {
        matchesDashboard = user.createdDate.startsWith(CURRENT_YEAR_MONTH);
      } else if (dashboardFilter === 'Bloqueada') {
        matchesDashboard = user.status === 'Bloqueada';
      } else if (dashboardFilter === 'DesativadasMes') {
        matchesDashboard = user.status === 'Desativada';
      }
    }

    return matchesSearch && matchesDept && matchesStatus && matchesDashboard;
  });

  // Action handlers
  const handleToggleLock = (user: ADUser) => {
    const isLocked = user.status === 'Bloqueada';
    const updatedStatus = isLocked ? 'Ativa' : 'Bloqueada';
    const updatedUser: ADUser = {
      ...user,
      status: updatedStatus,
      lastLogon: updatedStatus === 'Ativa' ? '2026-06-26' : user.lastLogon
    };
    
    onUpdateUser(updatedUser);
    setSelectedUser(updatedUser);

    onAddAuditLog({
      id: Math.random().toString(),
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      operator: 'admin.silva',
      action: isLocked ? 'Desbloqueio de Conta' : 'Bloqueio de Conta',
      targetUser: user.username,
      details: isLocked 
        ? 'Conta desbloqueada com sucesso via console administrativa.' 
        : 'Conta bloqueada preventivamente pelo administrador por suspeita de intrusão.',
      type: isLocked ? 'success' : 'danger'
    });
  };

  const handleToggleEnable = (user: ADUser) => {
    const isDisabled = user.status === 'Desativada';
    const updatedStatus = isDisabled ? 'Ativa' : 'Desativada';
    const updatedUser: ADUser = {
      ...user,
      status: updatedStatus
    };

    onUpdateUser(updatedUser);
    setSelectedUser(updatedUser);

    onAddAuditLog({
      id: Math.random().toString(),
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      operator: 'admin.silva',
      action: isDisabled ? 'Ativação de Conta' : 'Desativação de Conta',
      targetUser: user.username,
      details: isDisabled 
        ? 'Objeto de usuário reativado e habilitado no Active Directory.' 
        : 'Objeto de usuário desativado administrativamente.',
      type: isDisabled ? 'success' : 'warning'
    });
  };

  const handleResetPassword = async (user: ADUser) => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
    let generatedPass = '';
    for (let i = 0; i < 10; i++) {
      generatedPass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    try {
      const res = await fetch('/api/ad/users/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username,
          dn: user.ou,
          newPassword: generatedPass
        })
      });
      const data = await res.json();
      
      if (!res.ok || data.error) {
        alert(data.error || 'Falha ao redefinir senha no AD.');
        return;
      }
      
      const updatedUser: ADUser = {
        ...user,
        pwdLastSet: '2026-06-26',
        pwdExpired: false,
        mustChangePwd: true
      };

      onUpdateUser(updatedUser);
      setSelectedUser(updatedUser);
      setTempPassword(generatedPass);
      setResettingPassword(true);

      onAddAuditLog({
        id: Math.random().toString(),
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        operator: 'admin.silva',
        action: 'Redefinição de Senha',
        targetUser: user.username,
        details: 'Senha redefinida com sucesso via API AD. Marcada para alteração obrigatória no próximo logon.',
        type: 'info'
      });
    } catch (err) {
      alert('Erro de conexão: não foi possível se comunicar com o backend do AD.');
    }
  };

  const handleDeleteUser = (user: ADUser) => {
    if (window.confirm(`Tem certeza que deseja EXCLUIR permanentemente o usuário ${user.name} (${user.username}) do Active Directory? Esta operação é irreversível.`)) {
      onDeleteUser(user.id);
      setSelectedUser(null);

      onAddAuditLog({
        id: Math.random().toString(),
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        operator: 'admin.silva',
        action: 'Exclusão de Usuário',
        targetUser: user.username,
        details: `Objeto de usuário ${user.name} removido permanentemente do AD local.`,
        type: 'danger'
      });
    }
  };

  const handleCreateUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName || !newUserUsername || !newUserEmail) {
      alert('Por favor, preencha todos os campos obrigatórios (Nome, Usuário e E-mail).');
      return;
    }

    const createdUser: ADUser = {
      id: (users.length + 1).toString(),
      name: newUserName,
      username: newUserUsername,
      email: newUserEmail,
      department: newUserDept,
      ou: newUserOU,
      title: newUserTitle || 'Colaborador',
      status: 'Ativa',
      createdDate: '2026-06-26',
      lastLogon: '2026-06-26', // Logon inicial na criação
      pwdLastSet: '2026-06-26',
      pwdExpired: false,
      accountExpires: newUserExpires || null,
      memberOf: ['Domain Users'],
      phone: newUserPhone || 'Não informado',
      mustChangePwd: newUserMustChangePwd
    };

    onAddUser(createdUser);
    setIsAddingUser(false);
    
    // Reset Form
    setNewUserName('');
    setNewUserUsername('');
    setNewUserEmail('');
    setNewUserTitle('');
    setNewUserPhone('');
    setNewUserExpires('');

    onAddAuditLog({
      id: Math.random().toString(),
      timestamp: '2026-06-26 10:06:28',
      operator: 'admin.silva',
      action: 'Criação de Usuário',
      targetUser: createdUser.username,
      details: `Objeto criado com sucesso na unidade organizacional ${createdUser.ou}. Atribuído grupo 'Domain Users'.`,
      type: 'success'
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 relative" id="user-management-section">
      
      {/* Search & Filter Left Column / Side Card */}
      <div className="lg:col-span-1 bg-white p-5 rounded-2xl border border-slate-100 shadow-xs h-fit space-y-5" id="filters-sidebar">
        <h3 className="font-display font-bold text-slate-800 text-sm tracking-tight flex items-center gap-2 border-b border-slate-100 pb-3">
          <Filter className="w-4 h-4 text-blue-500" />
          Filtros de Pesquisa
        </h3>

        {/* Text Search */}
        <div>
          <label className="text-xs font-semibold text-slate-500 block mb-1.5">Pesquisar termo</label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Nome, logon, email, cargo..."
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Status Filter */}
        <div>
          <label className="text-xs font-semibold text-slate-500 block mb-1.5">Status da Conta</label>
          <select 
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="todos">Todos os Status</option>
            <option value="Ativa">Ativa</option>
            <option value="Bloqueada">Bloqueada</option>
            <option value="Expirada">Expirada</option>
            <option value="Desativada">Desativada</option>
          </select>
        </div>

        {/* Department Filter */}
        <div>
          <label className="text-xs font-semibold text-slate-500 block mb-1.5">Departamento</label>
          <select 
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
          >
            <option value="todos">Todos os Departamentos</option>
            {departments.map(dept => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>
        </div>

        {/* Active Dashboard Badges */}
        {dashboardFilter && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-800">
            <p className="font-semibold flex items-center justify-between">
              Filtro ativo do Painel:
              <button onClick={onClearDashboardFilter} className="text-blue-600 hover:text-blue-800">
                <X className="w-3.5 h-3.5" />
              </button>
            </p>
            <p className="mt-1 font-medium bg-white border border-blue-200 px-2 py-0.5 rounded inline-block">
              {dashboardFilter === 'AtivasLogonMes' && 'Logon em Junho/2026'}
              {dashboardFilter === 'CriadasMes' && 'Criado em Junho/2026'}
              {dashboardFilter === 'Bloqueada' && 'Apenas Bloqueadas'}
              {dashboardFilter === 'DesativadasMes' && 'Desativadas no Mês'}
            </p>
          </div>
        )}

        {/* Clear Filters Button */}
        {(searchTerm || statusFilter !== 'todos' || departmentFilter !== 'todos' || dashboardFilter) && (
          <button 
            onClick={handleClearAllFilters}
            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-1.5 px-3 rounded-xl text-xs transition-colors"
          >
            Limpar todos os filtros
          </button>
        )}

        <div className="pt-2 border-t border-slate-100">
          <button 
            disabled
            className="w-full bg-slate-100 text-slate-400 font-semibold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-not-allowed opacity-60"
            title="Prover novos usuários está desabilitado nas políticas atuais"
          >
            <UserPlus className="w-4 h-4" />
            Criar Usuário AD (Desativado)
          </button>
        </div>
      </div>

      {/* Main Directory Table Column */}
      <div className="lg:col-span-3 space-y-4" id="directory-main-table">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
          
          <div className="p-4 border-b border-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-display font-bold text-slate-800 text-sm">Diretório de Usuários ({filteredUsers.length})</h3>
              <p className="text-slate-400 text-[11px]">Gerenciamento e ações em tempo real no banco de dados do AD</p>
            </div>
            <div className="text-[11px] text-slate-400 font-semibold bg-slate-50 border border-slate-100 px-2 py-1 rounded">
              Contas correspondentes: {filteredUsers.length} de {users.length}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-semibold uppercase tracking-wider bg-slate-50/50">
                  <th className="py-2.5 px-4">Nome completo / Logon</th>
                  <th className="py-2.5 px-4">Departamento / Unidade</th>
                  <th className="py-2.5 px-4">Último Logon</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-slate-600">
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => (
                    <tr 
                      key={user.id} 
                      className={`hover:bg-slate-50/75 transition-colors cursor-pointer ${selectedUser?.id === user.id ? 'bg-blue-50/30' : ''}`}
                      onClick={() => { setSelectedUser(user); setResettingPassword(false); }}
                    >
                      <td className="py-3 px-4">
                        <div>
                          <span className="font-semibold text-slate-800 text-xs block leading-tight">{user.name}</span>
                          <span className="font-mono text-[10px] text-slate-500">{user.username} | {user.email}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div>
                          <span className="text-slate-700 block">{user.department}</span>
                          <span className="text-[10px] text-slate-400 font-mono block max-w-xs truncate">{user.ou.split(',')[0]}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                        {user.lastLogon}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          user.status === 'Ativa' ? 'bg-emerald-50 text-emerald-700' :
                          user.status === 'Bloqueada' ? 'bg-red-50 text-red-700' :
                          user.status === 'Expirada' ? 'bg-amber-50 text-amber-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            user.status === 'Ativa' ? 'bg-emerald-500' :
                            user.status === 'Bloqueada' ? 'bg-red-500' :
                            user.status === 'Expirada' ? 'bg-amber-500' :
                            'bg-slate-400'
                          }`}></span>
                          {user.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          {user.status === 'Bloqueada' ? (
                            <button 
                              disabled
                              className="bg-slate-100 text-slate-400 p-1.5 rounded-lg cursor-not-allowed opacity-50"
                              title="Desbloquear Conta (Desabilitado)"
                            >
                              <Unlock className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button 
                              disabled
                              className="bg-slate-100 text-slate-400 p-1.5 rounded-lg cursor-not-allowed opacity-50"
                              title="Bloquear Conta (Desabilitado)"
                            >
                              <Lock className="w-3.5 h-3.5" />
                            </button>
                          )}
                          
                          <button 
                            disabled
                            className="bg-slate-100 text-slate-400 p-1.5 rounded-lg cursor-not-allowed opacity-50"
                            title="Resetar Senha (Desabilitado)"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>

                          <button 
                            onClick={() => { setSelectedUser(user); setResettingPassword(false); }}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-600 p-1.5 rounded-lg transition-colors cursor-pointer"
                            title="Ver propriedades do objeto"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      <div className="max-w-xs mx-auto space-y-2">
                        <AlertOctagon className="w-8 h-8 text-slate-300 mx-auto" />
                        <p className="font-semibold text-xs text-slate-600">Nenhum objeto AD encontrado</p>
                        <p className="text-[11px] text-slate-400">Tente ajustar seus termos de busca ou filtros aplicados.</p>
                        <button 
                          onClick={handleClearAllFilters}
                          className="bg-blue-50 text-blue-600 font-semibold px-3 py-1 rounded-lg text-[10px] mt-2 hover:bg-blue-100"
                        >
                          Redefinir filtros
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* User details Drawer / Sidebar (rendered as a overlay panel) */}
      {selectedUser && (
        <div className="fixed inset-y-0 right-0 w-full sm:w-110 bg-white shadow-2xl border-l border-slate-200 z-50 flex flex-col animate-slide-in p-0" id="user-details-panel">
          <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block font-mono">PROPRIEDADES DO DIRETÓRIO</span>
              <h4 className="text-sm font-display font-bold text-slate-800 truncate">{selectedUser.name}</h4>
            </div>
            <button 
              onClick={() => { setSelectedUser(null); setResettingPassword(false); }}
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            
            {/* Status Alert Highlight */}
            <div className={`p-3.5 rounded-xl border flex items-start gap-3 ${
              selectedUser.status === 'Ativa' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' :
              selectedUser.status === 'Bloqueada' ? 'bg-red-50 border-red-100 text-red-800' :
              selectedUser.status === 'Expirada' ? 'bg-amber-50 border-amber-100 text-amber-800' :
              'bg-slate-50 border-slate-100 text-slate-800'
            }`}>
              <div className="mt-0.5">
                {selectedUser.status === 'Ativa' && <UserCheck className="w-5 h-5 text-emerald-600" />}
                {selectedUser.status === 'Bloqueada' && <Lock className="w-5 h-5 text-red-600" />}
                {selectedUser.status === 'Expirada' && <Calendar className="w-5 h-5 text-amber-600" />}
                {selectedUser.status === 'Desativada' && <UserMinus className="w-5 h-5 text-slate-500" />}
              </div>
              <div className="text-xs leading-relaxed">
                <span className="font-bold block">Status da Conta: {selectedUser.status}</span>
                {selectedUser.status === 'Ativa' && 'A conta está habilitada e operacional. O logon está autorizado no domínio.'}
                {selectedUser.status === 'Bloqueada' && 'A conta atingiu o limite máximo de tentativas de login incorretas e foi bloqueada para segurança.'}
                {selectedUser.status === 'Expirada' && 'Esta credencial atingiu a data final programada de expiração e requer renovação.'}
                {selectedUser.status === 'Desativada' && 'Acesso desativado administrativamente pelo setor de TI. Logons rejeitados.'}
              </div>
            </div>

            {/* Generated Password Modal Overlay in Drawer */}
            {resettingPassword && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs space-y-2">
                <p className="font-semibold text-blue-900 flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-500" />
                  Senha Redefinida com Sucesso!
                </p>
                <p className="text-blue-800 leading-relaxed text-[11px]">
                  Passe a senha temporária abaixo para o colaborador. Ele será obrigado a alterá-la na tela de logon do Windows / VPN.
                </p>
                <div className="flex items-center justify-between bg-white border border-blue-200 px-3 py-2 rounded-lg font-mono font-bold text-slate-700 select-all tracking-wider text-sm">
                  <span>{tempPassword}</span>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(tempPassword);
                      alert('Senha copiada para a área de transferência!');
                    }}
                    className="text-[10px] text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded"
                  >
                    Copiar
                  </button>
                </div>
              </div>
            )}

            {/* General Profile fields */}
            <div className="space-y-4">
              <h5 className="text-xs font-bold text-slate-400 font-mono tracking-wider uppercase border-b border-slate-50 pb-1.5">
                INFORMAÇÕES DE CADASTRO
              </h5>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 block mb-0.5">Nome de Logon (sAMAccountName)</span>
                  <span className="font-mono font-semibold text-slate-700">{selectedUser.username}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">E-mail Principal</span>
                  <span className="font-mono text-slate-700 truncate block" title={selectedUser.email}>{selectedUser.email}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">Cargo / Função</span>
                  <span className="text-slate-700 font-medium">{selectedUser.title}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">Telefone Comercial</span>
                  <span className="text-slate-700">{selectedUser.phone}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">Departamento</span>
                  <span className="text-slate-700 font-semibold">{selectedUser.department}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">Unidade Organizacional (OU)</span>
                  <span className="text-slate-500 font-mono text-[10px] truncate block" title={selectedUser.ou}>{selectedUser.ou}</span>
                </div>
              </div>
            </div>

            {/* AD Security Attributes */}
            <div className="space-y-4">
              <h5 className="text-xs font-bold text-slate-400 font-mono tracking-wider uppercase border-b border-slate-50 pb-1.5">
                ATRIBUTOS DE SEGURANÇA AD
              </h5>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 block mb-0.5">Criado em:</span>
                  <span className="text-slate-700 font-medium">{selectedUser.createdDate}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">Último Logon no Domínio:</span>
                  <span className="text-slate-700 font-semibold">{selectedUser.lastLogon}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">Última Redefinição de Senha:</span>
                  <span className="text-slate-700">{selectedUser.pwdLastSet}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">Expiração da Conta:</span>
                  <span className="text-slate-700 font-semibold">
                    {selectedUser.accountExpires ? selectedUser.accountExpires : 'Nunca Expira'}
                  </span>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs space-y-2">
                <p className="font-semibold text-slate-400">Políticas Ativas do Usuário (Visualização):</p>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-slate-400 cursor-not-allowed">
                    <input 
                      type="checkbox" 
                      disabled
                      className="rounded text-slate-400 border-slate-200 focus:ring-0 cursor-not-allowed opacity-55"
                      checked={selectedUser.mustChangePwd}
                      readOnly
                    />
                    <span>Usuário deve alterar a senha no próximo logon</span>
                  </label>
                  <label className="flex items-center gap-2 text-slate-400 cursor-not-allowed">
                    <input 
                      type="checkbox" 
                      disabled
                      className="rounded text-slate-400 border-slate-200 focus:ring-0 cursor-not-allowed opacity-55"
                      checked={selectedUser.pwdExpired}
                      readOnly
                    />
                    <span>Senha atual expirada (Forçar expiração imediata)</span>
                  </label>
                </div>
              </div>
            </div>

            {/* AD Groups Listing */}
            <div className="space-y-3">
              <h5 className="text-xs font-bold text-slate-400 font-mono tracking-wider uppercase border-b border-slate-50 pb-1.5 flex justify-between items-center">
                <span>MEMBRO DE (GRUPOS AD)</span>
                <span className="bg-slate-100 text-slate-600 text-[10px] px-1.5 py-0.5 rounded-full font-bold">{selectedUser.memberOf.length}</span>
              </h5>
              <div className="flex flex-wrap gap-1.5">
                {selectedUser.memberOf.map(group => (
                  <span key={group} className="inline-flex items-center gap-1 bg-blue-50 border border-blue-100/50 text-blue-700 px-2 py-0.5 rounded text-[10px] font-mono font-medium">
                    <Users className="w-2.5 h-2.5" />
                    {group}
                  </span>
                ))}
              </div>
            </div>

          </div>

          {/* Drawer Actions Footer (Desabilitado) */}
          <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-wrap justify-between items-center gap-2">
            
            <div className="flex gap-2">
              {/* Unlock / Lock (Desabilitado) */}
              {selectedUser.status === 'Bloqueada' ? (
                <button 
                  disabled
                  className="bg-slate-100 text-slate-400 font-semibold py-1.5 px-3 rounded-lg text-xs flex items-center gap-1 cursor-not-allowed opacity-50"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  Desbloquear
                </button>
              ) : (
                <button 
                  disabled
                  className="bg-slate-100 text-slate-400 font-semibold py-1.5 px-3 rounded-lg text-xs flex items-center gap-1 cursor-not-allowed opacity-50"
                >
                  <Lock className="w-3.5 h-3.5" />
                  Bloquear
                </button>
              )}

              {/* Disable / Enable (Desabilitado) */}
              {selectedUser.status === 'Desativada' ? (
                <button 
                  disabled
                  className="bg-slate-100 text-slate-400 font-semibold py-1.5 px-3 rounded-lg text-xs flex items-center gap-1 cursor-not-allowed opacity-50"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  Habilitar
                </button>
              ) : (
                <button 
                  disabled
                  className="bg-slate-100 text-slate-400 font-semibold py-1.5 px-3 rounded-lg text-xs flex items-center gap-1 cursor-not-allowed opacity-50"
                >
                  <UserMinus className="w-3.5 h-3.5" />
                  Desabilitar
                </button>
              )}
            </div>

            <button 
              disabled
              className="bg-slate-100 text-slate-400 p-2 rounded-lg cursor-not-allowed opacity-50"
              title="Exclusão de Usuários desabilitada nas políticas atuais"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>

          </div>
        </div>
      )}

      {/* CREATE USER SLIDING DIALOG */}
      {isAddingUser && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full border border-slate-100 shadow-2xl overflow-hidden animate-zoom-in" id="create-user-modal">
            
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="bg-blue-50 p-2 rounded-xl text-blue-600">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-display font-bold text-slate-800">Prover Novo Usuário Active Directory</h4>
                  <p className="text-slate-400 text-[11px]">Insira as informações do novo objeto de conta do domínio</p>
                </div>
              </div>
              <button 
                onClick={() => setIsAddingUser(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUserSubmit}>
              <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                
                {/* Full name & logon */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600">Nome Completo <span className="text-red-500">*</span></label>
                    <input 
                      type="text" 
                      placeholder="Ex: Ana de Souza Silva"
                      required
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      value={newUserName}
                      onChange={(e) => handleNameChange(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600">Nome de logon (sAMAccountName) <span className="text-red-500">*</span></label>
                    <input 
                      type="text" 
                      placeholder="Ex: ana.silva"
                      required
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50"
                      value={newUserUsername}
                      onChange={(e) => setNewUserUsername(e.target.value)}
                    />
                  </div>
                </div>

                {/* Email and Phone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600">Endereço de E-mail <span className="text-red-500">*</span></label>
                    <input 
                      type="email" 
                      placeholder="Ex: ana.silva@empresa.com.br"
                      required
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600">Telefone Celular</label>
                    <input 
                      type="text" 
                      placeholder="Ex: (11) 98765-4321"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      value={newUserPhone}
                      onChange={(e) => setNewUserPhone(e.target.value)}
                    />
                  </div>
                </div>

                {/* Department and Cargo */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600">Departamento</label>
                    <select 
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500"
                      value={newUserDept}
                      onChange={(e) => handleDeptChange(e.target.value)}
                    >
                      <option value="Tecnologia da Informação">Tecnologia da Informação (TI)</option>
                      <option value="Financeiro">Financeiro</option>
                      <option value="Recursos Humanos">Recursos Humanos (RH)</option>
                      <option value="Comercial">Comercial</option>
                      <option value="Marketing">Marketing</option>
                      <option value="Operações">Operações</option>
                      <option value="Jurídico">Jurídico</option>
                      <option value="Diretoria">Diretoria</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600">Cargo / Função</label>
                    <input 
                      type="text" 
                      placeholder="Ex: Analista Financeiro Pleno"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      value={newUserTitle}
                      onChange={(e) => setNewUserTitle(e.target.value)}
                    />
                  </div>
                </div>

                {/* OU Path (calculated) */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Unidade Organizacional de Destino (OU Path)</label>
                  <input 
                    type="text" 
                    readOnly
                    className="w-full px-3 py-2 border border-slate-200 bg-slate-50 text-slate-500 rounded-xl text-xs font-mono cursor-not-allowed"
                    value={newUserOU}
                  />
                </div>

                {/* Account expiration and password configs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600">Expiração da Conta (Vencimento)</label>
                    <input 
                      type="date" 
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      value={newUserExpires}
                      onChange={(e) => setNewUserExpires(e.target.value)}
                    />
                    <span className="text-[10px] text-slate-400 block">Deixe em branco para contas por tempo indeterminado.</span>
                  </div>
                  
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex flex-col justify-center space-y-2">
                    <label className="flex items-center gap-2 text-xs text-slate-700 font-medium">
                      <input 
                        type="checkbox" 
                        className="rounded text-blue-600 focus:ring-blue-500"
                        checked={newUserMustChangePwd}
                        onChange={(e) => setNewUserMustChangePwd(e.target.checked)}
                      />
                      <span>Alterar senha no próximo logon</span>
                    </label>
                    <span className="text-[10px] text-slate-400 block leading-tight">
                      Força o usuário a definir uma senha pessoal segura e confidencial assim que efetuar o primeiro acesso.
                    </span>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-100 p-3.5 rounded-xl text-xs text-amber-800 leading-relaxed">
                  <strong>Atenção às Credenciais de Login</strong>
                  <p className="mt-0.5 text-[11px]">
                    Por padrão de segurança do Active Directory local, uma senha inicial aleatória forte será gerada no ato da provisão de segurança. Você poderá copiá-la ao final do cadastro para envio confidencial.
                  </p>
                </div>

              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsAddingUser(false)}
                  className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs shadow-sm hover:shadow-md transition-all cursor-pointer"
                >
                  Prover Usuário
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}
