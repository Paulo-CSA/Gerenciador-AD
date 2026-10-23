/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ADUser {
  id: string;
  name: string;
  username: string;
  email: string;
  department: string;
  ou: string; // Unidade Organizacional (e.g., OU=Usuarios,OU=TI,DC=empresa,DC=local)
  title: string; // Cargo
  status: 'Ativa' | 'Bloqueada' | 'Expirada' | 'Desativada';
  createdDate: string; // Data de criação
  lastLogon: string; // Último login
  pwdLastSet: string; // Última alteração de senha
  pwdExpired: boolean; // Senha expirada?
  accountExpires: string | null; // Data de expiração da conta (null se nunca expira)
  memberOf: string[]; // Grupos do AD
  phone: string;
  mustChangePwd: boolean; // Deve alterar senha no próximo logon
  passwordNeverExpires?: boolean; // Senha nunca expira
  userCannotChangePassword?: boolean; // Usuário não pode alterar senha
  logonScript?: string; // Script de logon (.bat)
}

export interface AuditLog {
  id: string;
  timestamp: string;
  operator: string;
  action: string;
  targetUser: string;
  details: string;
  type: 'success' | 'warning' | 'danger' | 'info';
}

export interface GPO {
  id: string;
  name: string;
  status: 'Ativo' | 'Desativado' | 'Apenas Computador' | 'Apenas Usuário';
  linkedTo: string[]; // OUs linked to, empty array if not in use / unlinked
  enforced: boolean;
  gpoType: 'Segurança' | 'Preferências' | 'Modelos Administrativos' | 'Software' | 'Scripts';
  description: string;
  modifiedDate: string;
  author: string;
}

export interface InactivitySetting {
  thresholdDays: number;
  autoAction: 'none' | 'alert' | 'lock';
  notifyEmail: string;
}

export interface ADComputer {
  id: string;
  name: string; // e.g., "WKS-FIN-01"
  dnsHostName: string; // e.g., "WKS-FIN-01.empresa.local"
  operatingSystem: string; // e.g., "Windows 11 Enterprise"
  operatingSystemVersion?: string; // e.g., "23H2"
  ou: string; // Unidade Organizacional (e.g., OU=Computadores,OU=TI,DC=empresa,DC=local)
  dn?: string; // Distinguished Name completo no AD (e.g., CN=WKS-01,OU=Estacoes,DC=inema,DC=intranet)
  distinguishedName?: string;
  userAccountControl?: number;
  lastLogon: string; // Último contato / logon no domínio (e.g., "2026-06-20" ou "Nunca")
  pwdLastSet: string;
  status: 'Ativo' | 'Obsoleto' | 'Desativado';
  whenCreated: string;
  description?: string;
  ipAddress?: string;
  managedBy?: string;
}

export interface ComputerInactivitySetting {
  thresholdDays: number; // 0 a 365 dias
  autoAction: 'none' | 'alert' | 'disable';
  notifyEmail: string;
}



