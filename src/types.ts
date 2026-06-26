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

export interface InactivitySetting {
  thresholdDays: number;
  autoAction: 'none' | 'alert' | 'lock';
  notifyEmail: string;
}
