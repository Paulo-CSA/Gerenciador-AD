/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ADUser, AuditLog } from './types';

// O ano atual do sistema é 2026. Data de referência: 2026-06-26.
export const initialUsers: ADUser[] = [
  {
    id: '1',
    name: 'Ana Silva Santos',
    username: 'ana.santos',
    email: 'ana.santos@empresa.com.br',
    department: 'Tecnologia da Informação',
    ou: 'OU=Tecnologia,OU=Usuarios,DC=empresa,DC=local',
    title: 'Analista de Infraestrutura Pleno',
    status: 'Ativa',
    createdDate: '2024-03-15',
    lastLogon: '2026-06-25',
    pwdLastSet: '2026-05-10',
    pwdExpired: false,
    accountExpires: null,
    memberOf: ['GG-TI-Infra', 'GG-Acesso-Internet', 'Domain Users'],
    phone: '(11) 98765-4321',
    mustChangePwd: false
  },
  {
    id: '2',
    name: 'Carlos Eduardo Souza',
    username: 'carlos.souza',
    email: 'carlos.souza@empresa.com.br',
    department: 'Financeiro',
    ou: 'OU=Financeiro,OU=Usuarios,DC=empresa,DC=local',
    title: 'Coordenador de Contabilidade',
    status: 'Bloqueada', // Bloqueada
    createdDate: '2023-01-10',
    lastLogon: '2026-06-22',
    pwdLastSet: '2026-01-15',
    pwdExpired: true,
    accountExpires: null,
    memberOf: ['GG-Financeiro-Leitura', 'GG-ERP-Finance', 'Domain Users'],
    phone: '(11) 97654-3210',
    mustChangePwd: false
  },
  {
    id: '3',
    name: 'Mariana Costa Oliveira',
    username: 'mariana.oliveira',
    email: 'mariana.oliveira@empresa.com.br',
    department: 'Recursos Humanos',
    ou: 'OU=RH,OU=Usuarios,DC=empresa,DC=local',
    title: 'Analista de R&S Sênior',
    status: 'Ativa', // Criada no mês vigente (Junho 2026)
    createdDate: '2026-06-10',
    lastLogon: '2026-06-24',
    pwdLastSet: '2026-06-10',
    pwdExpired: false,
    accountExpires: null,
    memberOf: ['GG-RH-Staff', 'Domain Users'],
    phone: '(11) 96543-2109',
    mustChangePwd: false
  },
  {
    id: '4',
    name: 'Ricardo Augusto Ferreira',
    username: 'ricardo.ferreira',
    email: 'ricardo.ferreira@empresa.com.br',
    department: 'Comercial',
    ou: 'OU=Comercial,OU=Usuarios,DC=empresa,DC=local',
    title: 'Gerente de Contas Key Account',
    status: 'Ativa', // Inativo há mais de 90 dias (último logon março 2026)
    createdDate: '2022-08-20',
    lastLogon: '2026-03-01',
    pwdLastSet: '2025-12-05',
    pwdExpired: false,
    accountExpires: null,
    memberOf: ['GG-Comercial-Lideres', 'GG-CRM-Sales', 'Domain Users'],
    phone: '(11) 95432-1098',
    mustChangePwd: false
  },
  {
    id: '5',
    name: 'Juliana Mendes Lima',
    username: 'juliana.lima',
    email: 'juliana.lima@empresa.com.br',
    department: 'Marketing',
    ou: 'OU=Marketing,OU=Usuarios,DC=empresa,DC=local',
    title: 'Designer Gráfico Pleno',
    status: 'Expirada', // Expirada (data de expiração no passado)
    createdDate: '2025-02-15',
    lastLogon: '2026-05-30',
    pwdLastSet: '2025-11-15',
    pwdExpired: true,
    accountExpires: '2026-06-15', // Expirou no mês vigente
    memberOf: ['GG-Marketing-Admin', 'Domain Users'],
    phone: '(11) 94321-0987',
    mustChangePwd: false
  },
  {
    id: '6',
    name: 'Felipe Albuquerque Melo',
    username: 'felipe.melo',
    email: 'felipe.melo@empresa.com.br',
    department: 'Tecnologia da Informação',
    ou: 'OU=Tecnologia,OU=Usuarios,DC=empresa,DC=local',
    title: 'Estagiário de DevOps',
    status: 'Ativa', // Criada no mês vigente
    createdDate: '2026-06-20',
    lastLogon: '2026-06-26',
    pwdLastSet: '2026-06-20',
    pwdExpired: false,
    accountExpires: '2026-12-20',
    memberOf: ['GG-TI-Estagiarios', 'Domain Users'],
    phone: '(11) 93210-9876',
    mustChangePwd: true
  },
  {
    id: '7',
    name: 'Camila Pires Rocha',
    username: 'camila.rocha',
    email: 'camila.rocha@empresa.com.br',
    department: 'Financeiro',
    ou: 'OU=Financeiro,OU=Usuarios,DC=empresa,DC=local',
    title: 'Analista de Contas a Pagar',
    status: 'Desativada', // Desativada administrativa
    createdDate: '2023-11-01',
    lastLogon: '2026-04-12',
    pwdLastSet: '2025-11-01',
    pwdExpired: false,
    accountExpires: null,
    memberOf: ['GG-Financeiro-Escrita', 'Domain Users'],
    phone: '(11) 92109-8765',
    mustChangePwd: false
  },
  {
    id: '8',
    name: 'Lucas Barbosa Gomes',
    username: 'lucas.gomes',
    email: 'lucas.gomes@empresa.com.br',
    department: 'Operações',
    ou: 'OU=Operacoes,OU=Usuarios,DC=empresa,DC=local',
    title: 'Coordenador de Logística',
    status: 'Ativa', // Inativo há mais de 120 dias
    createdDate: '2021-05-18',
    lastLogon: '2026-01-15',
    pwdLastSet: '2025-10-10',
    pwdExpired: true,
    accountExpires: null,
    memberOf: ['GG-Operacoes-Lideres', 'Domain Users'],
    phone: '(11) 91098-7654',
    mustChangePwd: false
  },
  {
    id: '9',
    name: 'Beatriz Martins Nunes',
    username: 'beatriz.nunes',
    email: 'beatriz.nunes@empresa.com.br',
    department: 'Recursos Humanos',
    ou: 'OU=RH,OU=Usuarios,DC=empresa,DC=local',
    title: 'Assistente de DP',
    status: 'Bloqueada',
    createdDate: '2025-07-01',
    lastLogon: '2026-06-21',
    pwdLastSet: '2026-01-05',
    pwdExpired: false,
    accountExpires: null,
    memberOf: ['GG-RH-DP', 'Domain Users'],
    phone: '(11) 90987-6543',
    mustChangePwd: false
  },
  {
    id: '10',
    name: 'Rodrigo Antunes Alves',
    username: 'rodrigo.alves',
    email: 'rodrigo.alves@empresa.com.br',
    department: 'Jurídico',
    ou: 'OU=Juridico,OU=Usuarios,DC=empresa,DC=local',
    title: 'Advogado Corporativo',
    status: 'Ativa',
    createdDate: '2024-09-12',
    lastLogon: '2026-06-25',
    pwdLastSet: '2026-03-12',
    pwdExpired: false,
    accountExpires: null,
    memberOf: ['GG-Juridico-Admin', 'Domain Users'],
    phone: '(11) 99876-1234',
    mustChangePwd: false
  },
  {
    id: '11',
    name: 'Priscila Valente Neves',
    username: 'priscila.neves',
    email: 'priscila.neves@empresa.com.br',
    department: 'Comercial',
    ou: 'OU=Comercial,OU=Usuarios,DC=empresa,DC=local',
    title: 'Executiva de Contas Jr',
    status: 'Ativa', // Criada no mês vigente
    createdDate: '2026-06-01',
    lastLogon: '2026-06-24',
    pwdLastSet: '2026-06-01',
    pwdExpired: false,
    accountExpires: '2027-06-01',
    memberOf: ['GG-Comercial-Vendas', 'Domain Users'],
    phone: '(11) 98765-5432',
    mustChangePwd: false
  },
  {
    id: '12',
    name: 'Gustavo Henrique Pinheiro',
    username: 'gustavo.pinheiro',
    email: 'gustavo.pinheiro@empresa.com.br',
    department: 'Tecnologia da Informação',
    ou: 'OU=Tecnologia,OU=Usuarios,DC=empresa,DC=local',
    title: 'Administrador de Banco de Dados',
    status: 'Ativa',
    createdDate: '2023-04-10',
    lastLogon: '2026-06-26',
    pwdLastSet: '2026-04-10',
    pwdExpired: false,
    accountExpires: null,
    memberOf: ['GG-TI-DBA', 'Domain Admins', 'Domain Users'],
    phone: '(11) 97654-4321',
    mustChangePwd: false
  },
  {
    id: '13',
    name: 'Fernanda Lins Albuquerque',
    username: 'fernanda.lins',
    email: 'fernanda.lins@empresa.com.br',
    department: 'Comercial',
    ou: 'OU=Comercial,OU=Usuarios,DC=empresa,DC=local',
    title: 'Supervisora de Vendas',
    status: 'Expirada', // Expirou no passado
    createdDate: '2024-01-20',
    lastLogon: '2026-02-15',
    pwdLastSet: '2025-07-20',
    pwdExpired: true,
    accountExpires: '2026-03-31',
    memberOf: ['GG-Comercial-Lideres', 'Domain Users'],
    phone: '(11) 96543-3210',
    mustChangePwd: false
  },
  {
    id: '14',
    name: 'Vinicius de Oliveira Costa',
    username: 'vinicius.costa',
    email: 'vinicius.costa@empresa.com.br',
    department: 'Marketing',
    ou: 'OU=Marketing,OU=Usuarios,DC=empresa,DC=local',
    title: 'Coordenador de Growth',
    status: 'Ativa', // Extremamente inativo (último login novembro 2025)
    createdDate: '2022-10-10',
    lastLogon: '2025-11-20',
    pwdLastSet: '2025-05-10',
    pwdExpired: true,
    accountExpires: null,
    memberOf: ['GG-Marketing-Lideres', 'Domain Users'],
    phone: '(11) 95432-2109',
    mustChangePwd: false
  },
  {
    id: '15',
    name: 'Gabriel Martins Santos',
    username: 'gabriel.santos',
    email: 'gabriel.santos@empresa.com.br',
    department: 'Diretoria',
    ou: 'OU=Diretoria,OU=Usuarios,DC=empresa,DC=local',
    title: 'Diretor de Operações (COO)',
    status: 'Ativa',
    createdDate: '2021-01-01',
    lastLogon: '2026-06-25',
    pwdLastSet: '2026-01-05',
    pwdExpired: false,
    accountExpires: null,
    memberOf: ['GG-Diretoria', 'GG-Aprovadores-C-Level', 'Domain Users'],
    phone: '(11) 94321-1098',
    mustChangePwd: false
  }
];

export const initialAuditLogs: AuditLog[] = [
  {
    id: 'l1',
    timestamp: '2026-06-26 09:15:23',
    operator: 'admin.silva',
    action: 'Redefinição de Senha',
    targetUser: 'carlos.souza',
    details: 'Redefinição manual de senha solicitada pelo helpdesk. Senha temporária configurada.',
    type: 'info'
  },
  {
    id: 'l2',
    timestamp: '2026-06-26 08:32:10',
    operator: 'Sistema (Alerta)',
    action: 'Varredura de Inatividade',
    targetUser: 'vinicius.costa',
    details: 'Conta identificada com inatividade prolongada (218 dias sem logon). Notificação enviada para o gestor.',
    type: 'warning'
  },
  {
    id: 'l3',
    timestamp: '2026-06-25 16:45:00',
    operator: 'admin.silva',
    action: 'Desbloqueio de Conta',
    targetUser: 'ana.santos',
    details: 'Conta desbloqueada após confirmação de identidade do usuário junto à central de atendimento.',
    type: 'success'
  },
  {
    id: 'l4',
    timestamp: '2026-06-20 14:10:00',
    operator: 'admin.silva',
    action: 'Criação de Usuário',
    targetUser: 'felipe.melo',
    details: 'Novo usuário criado na OU de Tecnologia. Atribuídos grupos de estágio padrão.',
    type: 'success'
  },
  {
    id: 'l5',
    timestamp: '2026-06-15 00:05:00',
    operator: 'Sistema AD',
    action: 'Expiração de Conta',
    targetUser: 'juliana.lima',
    details: 'Conta de prestador expirada automaticamente ao atingir o limite de vigência (2026-06-15).',
    type: 'danger'
  },
  {
    id: 'l6',
    timestamp: '2026-06-10 10:22:15',
    operator: 'admin.silva',
    action: 'Criação de Usuário',
    targetUser: 'mariana.oliveira',
    details: 'Novo usuário criado na OU de Recursos Humanos. Senha inicial enviada.',
    type: 'success'
  }
];
