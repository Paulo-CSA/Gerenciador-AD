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

export interface DNSZone {
  name: string;
  type: 'Direta' | 'Inversa';
  updateType: 'Segura' | 'Não Segura' | 'Nenhuma';
}

export interface DNSRecord {
  id: string;
  zoneName: string;
  name: string; // e.g., "srv-dc01", "@", "100"
  type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'PTR' | 'NS' | 'SRV';
  value: string; // e.g., "192.168.1.100"
  ttl: number;
  timestamp: string; // AD aging timestamp
  isStatic: boolean;
}



