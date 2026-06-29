/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Users, 
  Search, 
  Download, 
  Shield, 
  ChevronRight, 
  FolderKanban, 
  UserCheck, 
  AlertCircle,
  XCircle,
  User,
  Layers,
  ShieldAlert
} from 'lucide-react';
import { ADUser } from '../types';

interface GroupsProps {
  users: ADUser[];
}

export default function Groups({ users }: GroupsProps) {
  // Tab view switcher: 'group' (group-centric) or 'user' (user-centric)
  const [viewMode, setViewMode] = useState<'group' | 'user'>('group');

  // --- Group-centric Mode State ---
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [memberSearchTerm, setMemberSearchTerm] = useState('');

  // --- User-centric Mode State ---
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Extract all unique groups and compute details
  const groupList = useMemo(() => {
    const groupsMap = new Map<string, { name: string; memberCount: number; activeCount: number }>();
    
    users.forEach(user => {
      const groups = user.memberOf || [];
      groups.forEach(groupName => {
        if (!groupsMap.has(groupName)) {
          groupsMap.set(groupName, {
            name: groupName,
            memberCount: 0,
            activeCount: 0
          });
        }
        const groupInfo = groupsMap.get(groupName)!;
        groupInfo.memberCount += 1;
        if (user.status === 'Ativa') {
          groupInfo.activeCount += 1;
        }
      });
    });

    return Array.from(groupsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [users]);

  // Filter groups based on search term
  const filteredGroups = useMemo(() => {
    return groupList.filter(g => 
      g.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [groupList, searchTerm]);

  // Get members of the selected group
  const groupMembers = useMemo(() => {
    if (!selectedGroup) return [];
    return users.filter(user => 
      (user.memberOf || []).includes(selectedGroup)
    ).sort((a, b) => a.name.localeCompare(b.name));
  }, [users, selectedGroup]);

  // Filter members based on search term
  const filteredMembers = useMemo(() => {
    return groupMembers.filter(m => 
      m.name.toLowerCase().includes(memberSearchTerm.toLowerCase()) ||
      m.username.toLowerCase().includes(memberSearchTerm.toLowerCase()) ||
      m.department.toLowerCase().includes(memberSearchTerm.toLowerCase()) ||
      m.title.toLowerCase().includes(memberSearchTerm.toLowerCase())
    );
  }, [groupMembers, memberSearchTerm]);

  // --- User-centric Mode Calculations ---
  // Filter all AD users based on search
  const filteredUsersList = useMemo(() => {
    if (!userSearchTerm) {
      return users.slice(0, 30); // Show top 30 initially to keep it clean
    }
    return users.filter(u => 
      u.name.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
      u.username.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
      u.department.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
      u.title.toLowerCase().includes(userSearchTerm.toLowerCase())
    );
  }, [users, userSearchTerm]);

  // Selected user details
  const selectedUser = useMemo(() => {
    if (!selectedUserId) return null;
    return users.find(u => u.id === selectedUserId) || null;
  }, [users, selectedUserId]);

  // Groups of the selected user
  const selectedUserGroups = useMemo(() => {
    if (!selectedUser) return [];
    return (selectedUser.memberOf || []).map(groupName => {
      const match = groupList.find(g => g.name === groupName);
      return {
        name: groupName,
        memberCount: match ? match.memberCount : 1,
        activeCount: match ? match.activeCount : 1
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [selectedUser, groupList]);

  // Set first user as selected by default when switching to user mode
  React.useEffect(() => {
    if (viewMode === 'user' && !selectedUserId && filteredUsersList.length > 0) {
      setSelectedUserId(filteredUsersList[0].id);
    }
  }, [viewMode, filteredUsersList, selectedUserId]);

  // Set the first group as selected by default if none is selected
  React.useEffect(() => {
    if (viewMode === 'group' && !selectedGroup && filteredGroups.length > 0) {
      setSelectedGroup(filteredGroups[0].name);
    }
  }, [viewMode, filteredGroups, selectedGroup]);

  // Export current group members to CSV
  const handleExportCSV = () => {
    if (!selectedGroup || filteredMembers.length === 0) return;

    const headers = ['Nome Completo', 'Logon (sAMAccountName)', 'E-mail', 'Departamento', 'Cargo', 'Status', 'Ultimo Logon'];
    const csvRows = [headers.join(';')];

    filteredMembers.forEach(u => {
      const row = [
        `"${u.name}"`,
        `"${u.username}"`,
        `"${u.email}"`,
        `"${u.department}"`,
        `"${u.title}"`,
        `"${u.status}"`,
        `"${u.lastLogon}"`
      ];
      csvRows.push(row.join(';'));
    });

    const csvContent = '\uFEFF' + csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `AD_Grupo_Membros_${selectedGroup}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export selected user's group memberships to CSV
  const handleExportUserGroupsCSV = () => {
    if (!selectedUser || selectedUserGroups.length === 0) return;

    const headers = ['Nome do Grupo', 'Total de Membros no AD', 'Membros Ativos no AD'];
    const csvRows = [headers.join(';')];

    selectedUserGroups.forEach(g => {
      const row = [
        `"${g.name}"`,
        `"${g.memberCount}"`,
        `"${g.activeCount}"`
      ];
      csvRows.push(row.join(';'));
    });

    const csvContent = '\uFEFF' + csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `AD_Grupos_do_Usuario_${selectedUser.username}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col gap-4 animate-fade-in" id="groups-section">
      
      {/* View Switcher Tabs */}
      <div className="flex bg-slate-100 p-1 rounded-xl self-start">
        <button
          onClick={() => setViewMode('group')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
            viewMode === 'group' 
              ? 'bg-white text-blue-700 shadow-xs' 
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          Visualizar por Grupo
        </button>
        <button
          onClick={() => setViewMode('user')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
            viewMode === 'user' 
              ? 'bg-white text-blue-700 shadow-xs' 
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <User className="w-3.5 h-3.5" />
          Localizar por Usuário
        </button>
      </div>

      {viewMode === 'group' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Column 1: Groups List */}
          <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-100 shadow-xs flex flex-col h-[calc(100vh-16rem)] min-h-[500px]">
            <div className="p-4 border-b border-slate-50">
              <div className="flex items-center gap-2 mb-3">
                <FolderKanban className="w-4 h-4 text-blue-500" />
                <h2 className="text-sm font-semibold text-slate-800">Grupos de Segurança e Distribuição</h2>
              </div>
              
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input 
                  type="text" 
                  placeholder="Buscar grupo no AD..."
                  className="w-full text-xs pl-9 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {filteredGroups.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  Nenhum grupo encontrado
                </div>
              ) : (
                filteredGroups.map((group) => (
                  <div 
                    key={group.name}
                    onClick={() => {
                      setSelectedGroup(group.name);
                      setMemberSearchTerm('');
                    }}
                    className={`p-3.5 flex items-center justify-between cursor-pointer transition-all ${
                      selectedGroup === group.name 
                        ? 'bg-blue-50/50 border-l-4 border-blue-500 pl-2.5' 
                        : 'hover:bg-slate-50/50 border-l-4 border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        selectedGroup === group.name ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'
                      }`}>
                        <Shield className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="font-semibold text-xs text-slate-800 block truncate" title={group.name}>
                          {group.name}
                        </span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          {group.memberCount} {group.memberCount === 1 ? 'membro' : 'membros'}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 rounded-full">
                        {group.activeCount} ativas
                      </span>
                      <ChevronRight className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                        selectedGroup === group.name ? 'transform translate-x-0.5 text-blue-500' : ''
                      }`} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Column 2 & 3: Group Members Detail */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-xs flex flex-col h-[calc(100vh-16rem)] min-h-[500px]">
            {selectedGroup ? (
              <>
                {/* Header Block */}
                <div className="p-4 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-mono font-bold uppercase text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                        Grupo de Segurança
                      </span>
                      <span className="text-[10px] text-slate-400">
                        CN={selectedGroup},OU=Groups,DC=empresa,DC=local
                      </span>
                    </div>
                    <h2 className="text-base font-bold text-slate-800 tracking-tight mt-1 truncate">
                      {selectedGroup}
                    </h2>
                    <p className="text-slate-400 text-[11px] mt-0.5">
                      Lista de contas que herdam privilégios deste grupo. Total de {groupMembers.length} usuários.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-start md:self-auto">
                    <button
                      onClick={handleExportCSV}
                      disabled={filteredMembers.length === 0}
                      className="text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors border border-slate-200 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-500" />
                      Exportar Membros
                    </button>
                  </div>
                </div>

                {/* Subheader / Search Filter for Members */}
                <div className="px-4 py-2 bg-slate-50/50 border-b border-slate-50 flex items-center shrink-0">
                  <div className="relative w-full max-w-xs">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                    <input 
                      type="text" 
                      placeholder="Filtrar membros..."
                      className="w-full text-[11px] pl-8 pr-3 py-1 border border-slate-200 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                      value={memberSearchTerm}
                      onChange={(e) => setMemberSearchTerm(e.target.value)}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 ml-auto font-mono">
                    Exibindo {filteredMembers.length} de {groupMembers.length}
                  </span>
                </div>

                {/* Members Table */}
                <div className="flex-1 overflow-auto">
                  {filteredMembers.length === 0 ? (
                    <div className="p-12 text-center text-slate-400 text-xs">
                      Nenhum usuário correspondente neste grupo
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/20 text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-50">
                          <th className="py-3 px-4 font-semibold">Nome Completo / Logon</th>
                          <th className="py-3 px-4 font-semibold">Departamento</th>
                          <th className="py-3 px-4 font-semibold">Cargo</th>
                          <th className="py-3 px-4 font-semibold text-center">Status</th>
                          <th className="py-3 px-4 font-semibold text-right">Último Logon</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {filteredMembers.map((member) => (
                          <tr key={member.id} className="hover:bg-slate-50/30 transition-colors">
                            <td className="py-3.5 px-4">
                              <div className="font-semibold text-slate-800">{member.name}</div>
                              <div className="text-[10px] font-mono text-slate-400 mt-0.5">{member.username}</div>
                            </td>
                            <td className="py-3.5 px-4 text-slate-600">{member.department}</td>
                            <td className="py-3.5 px-4 text-slate-500">{member.title}</td>
                            <td className="py-3.5 px-4">
                              <div className="flex justify-center">
                                {member.status === 'Ativa' && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                                    <UserCheck className="w-3 h-3" /> Ativa
                                  </span>
                                )}
                                {member.status === 'Bloqueada' && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full">
                                    <AlertCircle className="w-3 h-3" /> Bloqueada
                                  </span>
                                )}
                                {member.status === 'Expirada' && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
                                    <AlertCircle className="w-3 h-3" /> Expirada
                                  </span>
                                )}
                                {member.status === 'Desativada' && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-700 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">
                                    <XCircle className="w-3 h-3" /> Desativada
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono text-slate-500 text-[10px]">
                              {member.lastLogon === 'Nunca' ? (
                                <span className="text-red-500 font-semibold">Nunca</span>
                              ) : (
                                member.lastLogon
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-3">
                  <Users className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-semibold text-slate-700">Nenhum Grupo Selecionado</h3>
                <p className="text-slate-400 text-xs mt-1 max-w-xs">
                  Selecione um grupo na lista lateral para visualizar suas informações detalhadas e seus membros.
                </p>
              </div>
            )}
          </div>

        </div>
      ) : (
        /* User-centric Mode View */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Column 1: Users List with direct search */}
          <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-100 shadow-xs flex flex-col h-[calc(100vh-16rem)] min-h-[500px]">
            <div className="p-4 border-b border-slate-50">
              <div className="flex items-center gap-2 mb-3">
                <User className="w-4 h-4 text-blue-500" />
                <h2 className="text-sm font-semibold text-slate-800">Localizar Usuário no AD</h2>
              </div>
              
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input 
                  type="text" 
                  placeholder="Nome, logon ou cargo..."
                  className="w-full text-xs pl-9 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  value={userSearchTerm}
                  onChange={(e) => {
                    setUserSearchTerm(e.target.value);
                    setSelectedUserId(null); // Clear selected user when search changes to force recalculating
                  }}
                />
              </div>
              <span className="text-[9px] text-slate-400 mt-1.5 block">
                {userSearchTerm ? `Resultados da busca: ${filteredUsersList.length}` : 'Exibindo contas de exemplo inicial'}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {filteredUsersList.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  Nenhum usuário correspondente
                </div>
              ) : (
                filteredUsersList.map((user) => (
                  <div 
                    key={user.id}
                    onClick={() => setSelectedUserId(user.id)}
                    className={`p-3 flex items-center justify-between cursor-pointer transition-all ${
                      selectedUserId === user.id 
                        ? 'bg-blue-50/50 border-l-4 border-blue-500 pl-2' 
                        : 'hover:bg-slate-50/50 border-l-4 border-transparent'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <span className="font-semibold text-xs text-slate-800 block truncate" title={user.name}>
                        {user.name}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 block mt-0.5 truncate">
                        {user.username} • {user.department || 'Sem depto.'}
                      </span>
                    </div>

                    <div className="shrink-0">
                      {user.status === 'Ativa' && (
                        <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                          Ativa
                        </span>
                      )}
                      {user.status === 'Desativada' && (
                        <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">
                          Desat.
                        </span>
                      )}
                      {user.status === 'Bloqueada' && (
                        <span className="text-[9px] font-bold text-red-700 bg-red-50 px-1.5 py-0.5 rounded-full">
                          Bloq.
                        </span>
                      )}
                      {user.status === 'Expirada' && (
                        <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full">
                          Exp.
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Column 2 & 3: User's Group Membership Details */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-xs flex flex-col h-[calc(100vh-16rem)] min-h-[500px]">
            {selectedUser ? (
              <>
                {/* User Info Header Block */}
                <div className="p-4 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 bg-slate-50/30">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-11 h-11 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center shrink-0 border border-blue-200 shadow-xs font-bold text-sm">
                      {selectedUser.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-mono text-slate-500">
                          sAMAccountName: <strong className="text-slate-800">{selectedUser.username}</strong>
                        </span>
                        {selectedUser.status === 'Ativa' && (
                          <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-full">
                            Conta Ativa
                          </span>
                        )}
                        {selectedUser.status === 'Desativada' && (
                          <span className="text-[9px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-full">
                            Inativa
                          </span>
                        )}
                        {selectedUser.status === 'Bloqueada' && (
                          <span className="text-[9px] font-bold text-red-700 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-full">
                            Bloqueada
                          </span>
                        )}
                      </div>
                      <h2 className="text-base font-bold text-slate-800 tracking-tight mt-1 truncate">
                        {selectedUser.name}
                      </h2>
                      <p className="text-slate-400 text-[11px] mt-0.5 truncate">
                        {selectedUser.title} • {selectedUser.department} • {selectedUser.email}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-start md:self-auto">
                    <button
                      onClick={handleExportUserGroupsCSV}
                      disabled={selectedUserGroups.length === 0}
                      className="text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors border border-slate-200 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-500" />
                      Exportar Grupos
                    </button>
                  </div>
                </div>

                {/* Subheader Title */}
                <div className="px-4 py-2 bg-slate-100/50 border-b border-slate-100 flex items-center justify-between shrink-0">
                  <span className="text-[11px] font-semibold text-slate-700">
                    Grupos Vinculados a esta Conta ({selectedUserGroups.length})
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Membro Direto de Grupos de Segurança do AD
                  </span>
                </div>

                {/* Groups List Table */}
                <div className="flex-1 overflow-auto">
                  {selectedUserGroups.length === 0 ? (
                    <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
                      <ShieldAlert className="w-8 h-8 text-amber-500" />
                      <div>Este usuário não faz parte de nenhum grupo de segurança customizado.</div>
                      <div className="text-[10px] text-slate-400">Geralmente inserido apenas no padrão Domain Users</div>
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/20 text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-50">
                          <th className="py-3 px-4 font-semibold">Nome do Grupo</th>
                          <th className="py-3 px-4 font-semibold text-center">Total de Membros no AD</th>
                          <th className="py-3 px-4 font-semibold text-center">Membros Ativos no AD</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {selectedUserGroups.map((group) => (
                          <tr key={group.name} className="hover:bg-slate-50/30 transition-colors">
                            <td className="py-3.5 px-4 font-semibold text-slate-700">
                              <div className="flex items-center gap-2">
                                <Shield className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                <span>{group.name}</span>
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-center text-slate-600 font-mono">
                              {group.memberCount} {group.memberCount === 1 ? 'membro' : 'membros'}
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full font-mono">
                                {group.activeCount} contas ativas
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-3">
                  <User className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-semibold text-slate-700">Nenhum Usuário Selecionado</h3>
                <p className="text-slate-400 text-xs mt-1 max-w-xs">
                  Selecione um usuário na lista lateral para visualizar todos os grupos de segurança aos quais ele pertence.
                </p>
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
}
