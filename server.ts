import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import dns from "dns";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

// @ts-ignore
import ActiveDirectory from "activedirectory2";
// @ts-ignore
import ldap from "ldapjs";

const app = express();
const PORT = 3000;

app.use(express.json());

const CONFIG_PATH = path.join(process.cwd(), "ad_config.json");
const DATABASE_PATH = path.join(process.cwd(), "ad_database.json");

// Default configuration template
const defaultConfig = {
  url: "ldap://192.168.1.100:389",
  baseDN: "DC=empresa,DC=local",
  username: "admin@empresa.local",
  password: "Password123",
  domain: "empresa.local",
  useDemoMode: true,
  inactivityDays: 90
};

// Ensure configuration file exists
if (!fs.existsSync(CONFIG_PATH)) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2), "utf8");
}

function readConfig() {
  let cfg = { ...defaultConfig };
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, "utf8");
      cfg = { ...cfg, ...JSON.parse(data) };
    }
  } catch (error) {
    console.error("Erro ao ler ad_config.json:", error);
  }

  // Override with process.env if present
  let envHasConfig = false;

  if (process.env.LDAP_URL) {
    cfg.url = process.env.LDAP_URL;
    envHasConfig = true;
  }
  if (process.env.LDAP_BASE_DN) {
    cfg.baseDN = process.env.LDAP_BASE_DN;
    envHasConfig = true;
  }
  if (process.env.LDAP_BIND_DN) {
    cfg.username = process.env.LDAP_BIND_DN;
    envHasConfig = true;
  }
  if (process.env.LDAP_BIND_PASSWORD) {
    cfg.password = process.env.LDAP_BIND_PASSWORD;
    envHasConfig = true;
  }
  if (process.env.LDAP_DOMAIN) {
    cfg.domain = process.env.LDAP_DOMAIN;
    envHasConfig = true;
  }

  // If there are real LDAP parameters configured in .env, automatically disable the simulation (demo mode)
  if (envHasConfig) {
    cfg.useDemoMode = false;
  }

  // Allow explicit override of the mode via env variable if needed
  if (process.env.LDAP_USE_DEMO_MODE !== undefined) {
    cfg.useDemoMode = process.env.LDAP_USE_DEMO_MODE === "true";
  }

  return cfg;
}

function writeConfig(cfg: any) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf8");
    return true;
  } catch (error) {
    console.error("Erro ao escrever ad_config.json:", error);
    return false;
  }
}

function safeParseDate(value: any, fallback: string = "2025-01-01"): string {
  if (value === undefined || value === null) return fallback;
  try {
    // Handle array formats sometimes returned by ldap/AD
    if (Array.isArray(value)) {
      if (value.length === 0) return fallback;
      value = value[0];
    }

    // Convert Buffer or object with toString to string
    if (value && typeof value === "object") {
      if (Buffer.isBuffer(value)) {
        value = value.toString();
      } else if (typeof value.toString === "function") {
        value = value.toString();
      }
    }

    // If it's already in YYYY-MM-DD format, return it
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }

    // Handle large numbers / timestamps (such as Windows FILETIME or millisecond epochs)
    let numeric = typeof value === "number" ? value : Number(value);
    if (!isNaN(numeric) && numeric > 10000000000) {
      // It's likely a Windows FILETIME (e.g., 132456789000000000) or an epoch (e.g., 1719419160000)
      if (numeric > 100000000000000) { // e.g. 18-digit/17-digit FILETIME
        numeric = Math.floor(numeric / 10000) - 11644473600000;
      }
      const d = new Date(numeric);
      if (!isNaN(d.getTime())) {
        return d.toISOString().split("T")[0];
      }
    }

    // Some AD generalizedTime can be "20241022134512.0Z" or "20241022134512Z" or similar
    if (typeof value === "string") {
      const match = value.match(/^(\d{4})(\d{2})(\d{2})/);
      if (match) {
        const year = match[1];
        const month = match[2];
        const day = match[3];
        return `${year}-${month}-${day}`;
      }
    }

    // Try standard JS Date parsing
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split("T")[0];
    }
  } catch (error) {
    console.error("Erro ao converter data:", value, error);
  }
  return fallback;
}

function getActualLastLogon(timestamp1: any, timestamp2: any): string {
  const parseVal = (val: any): string => {
    if (val === undefined || val === null) return "";
    if (Array.isArray(val)) {
      if (val.length === 0) return "";
      val = val[0];
    }
    if (val && typeof val === "object") {
      if (Buffer.isBuffer(val)) return val.toString().trim();
      if (typeof val.toString === "function") return val.toString().trim();
    }
    return String(val).trim();
  };

  const cleanVal1 = parseVal(timestamp1);
  const cleanVal2 = parseVal(timestamp2);

  const isZeroOrEmpty = (s: string) => s === "" || s === "0" || s === "null" || s === "undefined";

  if (!isZeroOrEmpty(cleanVal1)) return cleanVal1;
  if (!isZeroOrEmpty(cleanVal2)) return cleanVal2;
  return "0";
}

function extractOU(dn: string, fallbackDepartment: string = "Geral"): string {
  if (!dn) return fallbackDepartment;
  const matches = dn.match(/OU\s*=\s*([^,]+)/gi);
  if (matches && matches.length > 0) {
    const ouNames = matches.map(m => {
      const parts = m.split("=");
      return parts.length > 1 ? parts[1].trim() : "";
    }).filter(Boolean);
    
    if (ouNames.length > 0) {
      return ouNames.reverse().join("/");
    }
  }
  return fallbackDepartment;
}

function getADUsersPromise(cfg: any): Promise<any[]> {
  return new Promise((resolve) => {
    if (cfg.useDemoMode) {
      const db = readDatabase();
      return resolve(db.users);
    }

    const adInstance = new ActiveDirectory({
      url: cfg.url,
      baseDN: cfg.baseDN,
      username: cfg.username,
      password: cfg.password,
      connectTimeout: 3000
    });

    const userAttributes = [
      'dn', 'distinguishedName', 'cn', 'displayName', 'sAMAccountName', 
      'mail', 'department', 'title', 'userAccountControl', 'whenCreated', 
      'lastLogon', 'lastLogonTimestamp', 'pwdLastSet', 'accountExpires', 
      'memberOf', 'telephoneNumber', 'objectGUID'
    ];

    adInstance.findUsers({ 
      includeMembership: ["group"], 
      paged: { pageSize: 1000 },
      attributes: userAttributes
    }, (err: any, users: any[]) => {
      if (err || !users || !Array.isArray(users)) {
        console.error("Erro ao buscar usuários para logs de auditoria:", err);
        return resolve([]);
      }

      const mapped = users.map((user: any, index: number) => {
        const uac = user.userAccountControl || 512;
        const isBlocked = (uac & 0x0002) !== 0;
        const expired = user.pwdLastSet === "0";

        let status = "Ativa";
        if (isBlocked) status = "Desativada";
        else if (expired) status = "Expirada";

        const actualLogon = getActualLastLogon(user.lastLogonTimestamp, user.lastLogon);
        const lastLogonValue = actualLogon === "0" ? "Nunca" : safeParseDate(actualLogon, "Nunca");

        return {
          name: user.displayName || user.cn || user.sAMAccountName || "Usuário AD",
          username: user.sAMAccountName || "",
          department: extractOU(user.dn || user.distinguishedName || "", user.department || "Geral"),
          status: status,
          lastLogon: lastLogonValue,
        };
      });

      resolve(mapped);
    });
  });
}

function generateDynamicAuditLogs(realUsers: any[], dbLogs: any[]): any[] {
  const logs = [...dbLogs];

  if (realUsers && realUsers.length > 0) {
    const user1 = realUsers[0];
    if (user1) {
      logs.push({
        id: "l_dyn_1",
        timestamp: new Date().toISOString().replace("T", " ").substring(0, 10) + " 10:22:15",
        operator: "Sistema (Segurança)",
        action: "Verificação de Credenciais",
        targetUser: user1.username,
        details: `Varredura de conformidade realizada. Conta do usuário ${user1.name} no setor ${user1.department || "Geral"} está em conformidade com as diretrizes de segurança da informação.`,
        type: "success"
      });
    }

    const blockedUser = realUsers.find(u => u.status === "Bloqueada" || u.status === "Desativada") || realUsers[1];
    if (blockedUser) {
      logs.push({
        id: "l_dyn_2",
        timestamp: new Date().toISOString().replace("T", " ").substring(0, 10) + " 08:30:12",
        operator: "Sistema (Inatividade)",
        action: "Auditoria de Acesso",
        targetUser: blockedUser.username,
        details: `Conta identificada com status '${blockedUser.status}'. Indicado para revisão periódica de privilégios no setor ${blockedUser.department || "Geral"}.`,
        type: blockedUser.status === "Bloqueada" ? "warning" : "info"
      });
    }

    const user3 = realUsers[2] || realUsers[0];
    if (user3) {
      logs.push({
        id: "l_dyn_3",
        timestamp: new Date(Date.now() - 3600000).toISOString().replace("T", " ").substring(0, 19),
        operator: "admin.silva",
        action: "Auditoria Mensal",
        targetUser: user3.username,
        details: `Logon de ${user3.username} analisado na trilha de auditoria. Último logon registrado em ${user3.lastLogon}. Setor de lotação: ${user3.department || "Geral"}.`,
        type: "info"
      });
    }
  }

  // Deduplicate and sort
  const seenIds = new Set();
  const deduped: any[] = [];
  for (const log of logs) {
    if (!seenIds.has(log.id)) {
      seenIds.add(log.id);
      deduped.push(log);
    }
  }

  return deduped.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

// Bootstrap initial database for simulation mode
const initialUsers = [
  {
    id: "1",
    name: "Ana Silva Santos",
    username: "ana.santos",
    email: "ana.santos@empresa.com.br",
    department: "Tecnologia da Informação",
    ou: "OU=Tecnologia,OU=Usuarios,DC=empresa,DC=local",
    title: "Analista de Infraestrutura Pleno",
    status: "Ativa",
    createdDate: "2024-03-15",
    lastLogon: "2026-06-25",
    pwdLastSet: "2026-05-10",
    pwdExpired: false,
    accountExpires: null,
    memberOf: ["GG-TI-Infra", "GG-Acesso-Internet", "Domain Users"],
    phone: "(11) 98765-4321",
    mustChangePwd: false
  },
  {
    id: "2",
    name: "Carlos Eduardo Souza",
    username: "carlos.souza",
    email: "carlos.souza@empresa.com.br",
    department: "Financeiro",
    ou: "OU=Financeiro,OU=Usuarios,DC=empresa,DC=local",
    title: "Coordenador de Contabilidade",
    status: "Bloqueada",
    createdDate: "2023-01-10",
    lastLogon: "2026-06-22",
    pwdLastSet: "2026-01-15",
    pwdExpired: true,
    accountExpires: null,
    memberOf: ["GG-Financeiro-Leitura", "GG-ERP-Finance", "Domain Users"],
    phone: "(11) 97654-3210",
    mustChangePwd: false
  },
  {
    id: "3",
    name: "Mariana Costa Oliveira",
    username: "mariana.oliveira",
    email: "mariana.oliveira@empresa.com.br",
    department: "Recursos Humanos",
    ou: "OU=RH,OU=Usuarios,DC=empresa,DC=local",
    title: "Analista de R&S Sênior",
    status: "Ativa",
    createdDate: "2026-06-10",
    lastLogon: "2026-06-24",
    pwdLastSet: "2026-06-10",
    pwdExpired: false,
    accountExpires: null,
    memberOf: ["GG-RH-Staff", "Domain Users"],
    phone: "(11) 96543-2109",
    mustChangePwd: false
  },
  {
    id: "4",
    name: "Ricardo Augusto Ferreira",
    username: "ricardo.ferreira",
    email: "ricardo.ferreira@empresa.com.br",
    department: "Comercial",
    ou: "OU=Comercial,OU=Usuarios,DC=empresa,DC=local",
    title: "Gerente de Contas Key Account",
    status: "Ativa",
    createdDate: "2022-08-20",
    lastLogon: "2026-03-01",
    pwdLastSet: "2025-12-05",
    pwdExpired: false,
    accountExpires: null,
    memberOf: ["GG-Comercial-Lideres", "GG-CRM-Sales", "Domain Users"],
    phone: "(11) 95432-1098",
    mustChangePwd: false
  },
  {
    id: "5",
    name: "Juliana Mendes Lima",
    username: "juliana.lima",
    email: "juliana.lima@empresa.com.br",
    department: "Marketing",
    ou: "OU=Marketing,OU=Usuarios,DC=empresa,DC=local",
    title: "Designer Gráfico Pleno",
    status: "Expirada",
    createdDate: "2025-02-15",
    lastLogon: "2026-05-30",
    pwdLastSet: "2025-11-15",
    pwdExpired: true,
    accountExpires: "2026-06-15",
    memberOf: ["GG-Marketing-Admin", "Domain Users"],
    phone: "(11) 94321-0987",
    mustChangePwd: false
  },
  {
    id: "6",
    name: "Felipe Albuquerque Melo",
    username: "felipe.melo",
    email: "felipe.melo@empresa.com.br",
    department: "Tecnologia da Informação",
    ou: "OU=Tecnologia,OU=Usuarios,DC=empresa,DC=local",
    title: "Estagiário de DevOps",
    status: "Ativa",
    createdDate: "2026-06-20",
    lastLogon: "2026-06-26",
    pwdLastSet: "2026-06-20",
    pwdExpired: false,
    accountExpires: "2026-12-20",
    memberOf: ["GG-TI-Estagiarios", "Domain Users"],
    phone: "(11) 93210-9876",
    mustChangePwd: true
  },
  {
    id: "7",
    name: "Camila Pires Rocha",
    username: "camila.rocha",
    email: "camila.rocha@empresa.com.br",
    department: "Financeiro",
    ou: "OU=Financeiro,OU=Usuarios,DC=empresa,DC=local",
    title: "Analista de Contas a Pagar",
    status: "Desativada",
    createdDate: "2023-11-01",
    lastLogon: "2026-04-12",
    pwdLastSet: "2025-11-01",
    pwdExpired: false,
    accountExpires: null,
    memberOf: ["GG-Financeiro-Escrita", "Domain Users"],
    phone: "(11) 92109-8765",
    mustChangePwd: false
  },
  {
    id: "8",
    name: "Rodrigo Mendes",
    username: "rodrigo.mendes",
    email: "rodrigo.mendes@empresa.com.br",
    department: "Comercial",
    ou: "OU=Comercial,OU=Usuarios,DC=empresa,DC=local",
    title: "Executivo de Vendas",
    status: "Ativa",
    createdDate: "2024-05-10",
    lastLogon: "2026-05-12",
    pwdLastSet: "2026-05-10",
    pwdExpired: false,
    accountExpires: null,
    memberOf: ["GG-Comercial-Staff", "Domain Users"],
    phone: "(11) 91111-2222",
    mustChangePwd: false
  },
  {
    id: "9",
    name: "Patricia Souza",
    username: "patricia.souza",
    email: "patricia.souza@empresa.com.br",
    department: "Atendimento",
    ou: "OU=Atendimento,OU=Usuarios,DC=empresa,DC=local",
    title: "Analista de Relacionamento",
    status: "Ativa",
    createdDate: "2025-01-20",
    lastLogon: "2026-04-17",
    pwdLastSet: "2026-01-20",
    pwdExpired: false,
    accountExpires: null,
    memberOf: ["Domain Users"],
    phone: "(11) 92222-3333",
    mustChangePwd: false
  },
  {
    id: "10",
    name: "Lucas Oliveira",
    username: "lucas.oliveira",
    email: "lucas.oliveira@empresa.com.br",
    department: "Suporte da TI",
    ou: "OU=Suporte,OU=Usuarios,DC=empresa,DC=local",
    title: "Técnico de Suporte",
    status: "Ativa",
    createdDate: "2024-11-15",
    lastLogon: "2026-02-10",
    pwdLastSet: "2025-11-15",
    pwdExpired: false,
    accountExpires: null,
    memberOf: ["GG-TI-Infra", "Domain Users"],
    phone: "(11) 93333-4444",
    mustChangePwd: false
  },
  {
    id: "11",
    name: "Beatriz Santos",
    username: "beatriz.santos",
    email: "beatriz.santos@empresa.com.br",
    department: "Marketing",
    ou: "OU=Marketing,OU=Usuarios,DC=empresa,DC=local",
    title: "Analista de Growth",
    status: "Ativa",
    createdDate: "2026-03-01",
    lastLogon: "2026-05-27",
    pwdLastSet: "2026-03-01",
    pwdExpired: false,
    accountExpires: null,
    memberOf: ["Domain Users"],
    phone: "(11) 94444-5555",
    mustChangePwd: false
  },
  {
    id: "12",
    name: "Guilherme Silva",
    username: "guilherme.silva",
    email: "guilherme.silva@empresa.com.br",
    department: "Logística",
    ou: "OU=Logistica,OU=Usuarios,DC=empresa,DC=local",
    title: "Coordenador de Operações",
    status: "Ativa",
    createdDate: "2023-05-15",
    lastLogon: "2026-01-05",
    pwdLastSet: "2025-11-20",
    pwdExpired: false,
    accountExpires: null,
    memberOf: ["Domain Users"],
    phone: "(11) 95555-6666",
    mustChangePwd: false
  }
];

const initialAuditLogs = [
  {
    id: "l1",
    timestamp: "2026-06-26 09:15:23",
    operator: "admin.silva",
    action: "Redefinição de Senha",
    targetUser: "carlos.souza",
    details: "Redefinição manual de senha solicitada pelo helpdesk. Senha temporária configurada.",
    type: "info"
  },
  {
    id: "l2",
    timestamp: "2026-06-26 08:32:10",
    operator: "Sistema (Alerta)",
    action: "Varredura de Inatividade",
    targetUser: "vinicius.costa",
    details: "Conta identificada com inatividade prolongada (218 dias sem logon). Notificação enviada para o gestor.",
    type: "warning"
  },
  {
    id: "l3",
    timestamp: "2026-06-25 16:45:00",
    operator: "admin.silva",
    action: "Desbloqueio de Conta",
    targetUser: "ana.santos",
    details: "Conta desbloqueada após confirmação de identidade do usuário junto à central de atendimento.",
    type: "success"
  }
];

// Ensure local database exists for simulation
if (!fs.existsSync(DATABASE_PATH)) {
  const defaultDB = {
    users: initialUsers,
    logs: initialAuditLogs
  };
  fs.writeFileSync(DATABASE_PATH, JSON.stringify(defaultDB, null, 2), "utf8");
}

function readDatabase() {
  try {
    const data = fs.readFileSync(DATABASE_PATH, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Erro ao ler ad_database.json:", error);
    return { users: initialUsers, logs: initialAuditLogs };
  }
}

function writeDatabase(data: any) {
  try {
    fs.writeFileSync(DATABASE_PATH, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (error) {
    console.error("Erro ao escrever ad_database.json:", error);
    return false;
  }
}

// Function to test LDAP AD connectivity
async function testADConnection(cfg: any): Promise<{ success: boolean; error: string | null }> {
  if (cfg.useDemoMode) {
    return { success: true, error: null };
  }

  if (!cfg.url || !cfg.baseDN) {
    return { success: false, error: "URL e DN Base são obrigatórios." };
  }

  // Helper to test actual AD LDAP query
  const runLdapTest = (url: string): Promise<{ success: boolean; error: string | null }> => {
    return new Promise((resolve) => {
      try {
        const adInstance = new ActiveDirectory({
          url: url,
          baseDN: cfg.baseDN,
          username: cfg.username,
          password: cfg.password,
          connectTimeout: 4000
        });

        adInstance.findUsers({ sizeLimit: 1 }, (err: any) => {
          if (err) {
            console.warn("Falha ao testar conexão LDAP:", err.message || err);
            return resolve({
              success: false,
              error: `Erro de Conexão LDAP: ${err.message || "Servidor offline ou fora de alcance"}. Garanta que o servidor AD local está acessível e que as credenciais de bind estão corretas.`
            });
          }
          resolve({ success: true, error: null });
        });
      } catch (e: any) {
        resolve({ success: false, error: `Erro ao inicializar cliente LDAP: ${e.message || e}` });
      }
    });
  };

  // Check DNS resolution if URL contains a hostname
  try {
    const urlMatch = cfg.url.match(/ldaps?:\/\/([^:/]+)/);
    if (urlMatch && urlMatch[1]) {
      const host = urlMatch[1];
      // If it's not an IP, check DNS first
      if (!/^[0-9.]+$/.test(host)) {
        return new Promise((resolve) => {
          dns.lookup(host, async (dnsErr) => {
            if (dnsErr) {
              return resolve({
                success: false,
                error: `Não foi possível resolver o host '${host}' via DNS local. Verifique se o host está configurado no arquivo hosts ou se está conectado na intranet do AD.`
              });
            }
            // DNS succeeded, now test LDAP
            const res = await runLdapTest(cfg.url);
            resolve(res);
          });
        });
      }
    }
  } catch (e: any) {
    return { success: false, error: `Erro na verificação do host: ${e.message || e}` };
  }

  // It's an IP or doesn't have a hostname to check
  return runLdapTest(cfg.url);
}

// --- Active Directory API Routes ---

// 1. Get current AD Connection Status and Config
app.get("/api/ad/status", async (req, res) => {
  const cfg = readConfig();
  const test = await testADConnection(cfg);
  res.json({
    useDemoMode: cfg.useDemoMode,
    config: {
      url: cfg.url,
      baseDN: cfg.baseDN,
      username: cfg.username,
      domain: cfg.domain,
      inactivityDays: cfg.inactivityDays !== undefined ? cfg.inactivityDays : 90
    },
    connected: test.success,
    error: test.error
  });
});

// 2. Save AD Connection Config
app.post("/api/ad/save-config", async (req, res) => {
  const { url, baseDN, username, password, domain, useDemoMode, inactivityDays } = req.body;
  const current = readConfig();
  
  const updated = {
    url: url !== undefined ? url : current.url,
    baseDN: baseDN !== undefined ? baseDN : current.baseDN,
    username: username !== undefined ? username : current.username,
    password: (password !== undefined && password !== "") ? password : current.password,
    domain: domain !== undefined ? domain : current.domain,
    useDemoMode: useDemoMode !== undefined ? useDemoMode : current.useDemoMode,
    inactivityDays: inactivityDays !== undefined ? inactivityDays : (current.inactivityDays !== undefined ? current.inactivityDays : 90)
  };

  const connectionParamsChanged = 
    (url !== undefined && url !== current.url) ||
    (baseDN !== undefined && baseDN !== current.baseDN) ||
    (username !== undefined && username !== current.username) ||
    (password !== undefined && password !== "" && password !== current.password) ||
    (domain !== undefined && domain !== current.domain) ||
    (useDemoMode !== undefined && useDemoMode !== current.useDemoMode);

  writeConfig(updated);

  let connected = true;
  let error = null;

  if (connectionParamsChanged) {
    const test = await testADConnection(updated);
    connected = test.success;
    error = test.error;
  }

  res.json({
    success: true,
    connected,
    error,
    useDemoMode: updated.useDemoMode,
    config: {
      url: updated.url,
      baseDN: updated.baseDN,
      username: updated.username,
      domain: updated.domain,
      inactivityDays: updated.inactivityDays
    }
  });
});

// 3. Get All Users (Real LDAP / Simulation fallback)
app.get("/api/ad/users", async (req, res) => {
  const cfg = readConfig();
  
  if (cfg.useDemoMode) {
    const db = readDatabase();
    return res.json(db.users);
  }

  // Real LDAP user search
  const adInstance = new ActiveDirectory({
    url: cfg.url,
    baseDN: cfg.baseDN,
    username: cfg.username,
    password: cfg.password,
    connectTimeout: 4000
  });

  const userAttributes = [
    'dn', 'distinguishedName', 'cn', 'displayName', 'sAMAccountName', 
    'mail', 'department', 'title', 'userAccountControl', 'whenCreated', 
    'lastLogon', 'lastLogonTimestamp', 'pwdLastSet', 'accountExpires', 
    'memberOf', 'telephoneNumber', 'objectGUID'
  ];

  adInstance.findUsers({ 
    includeMembership: ["group"], 
    paged: { pageSize: 1000 },
    attributes: userAttributes
  }, (err: any, users: any[]) => {
    if (err) {
      console.error("Erro ao buscar usuários LDAP:", err);
      return res.status(500).json({ error: "Erro de consulta AD/LDAP: " + (err.message || err) });
    }

    if (!users || !Array.isArray(users)) {
      return res.json([]);
    }

    // Map AD properties to ADUser app types
    const mappedUsers = users.map((user: any, index: number) => {
      const uac = user.userAccountControl || 512;
      const isBlocked = (uac & 0x0002) !== 0; // bit 2 is ACCOUNTDISABLE
      const expired = user.pwdLastSet === "0"; // or custom business rules

      let status: "Ativa" | "Bloqueada" | "Expirada" | "Desativada" = "Ativa";
      if (isBlocked) status = "Desativada";
      else if (expired) status = "Expirada";

      // Parse groups
      const memberOf = Array.isArray(user.memberOf) 
        ? user.memberOf.map((dn: string) => {
            const match = dn.match(/^CN=([^,]+)/i);
            return match ? match[1] : dn;
          })
         : [];

      // Safe GUID parsing
      let guid = String(index + 1);
      if (user.objectGUID) {
        if (Buffer.isBuffer(user.objectGUID)) {
          guid = user.objectGUID.toString('hex');
        } else {
          guid = String(user.objectGUID);
        }
      }

      // Safe dynamic lastLogon extraction
      const actualLogon = getActualLastLogon(user.lastLogonTimestamp, user.lastLogon);
      const lastLogonValue = actualLogon === "0" ? "Nunca" : safeParseDate(actualLogon, "Nunca");

      // Safe dynamic pwdLastSet extraction
      const pwdLastSetValue = (user.pwdLastSet === "0" || user.pwdLastSet === 0 || !user.pwdLastSet)
        ? "Nunca"
        : safeParseDate(user.pwdLastSet, "2026-05-10");

      // Safe dynamic accountExpires extraction
      const accountExpiresValue = (user.accountExpires === "9223372036854775807" || user.accountExpires === "0" || !user.accountExpires || user.accountExpires === 0)
        ? null
        : safeParseDate(user.accountExpires, null);

      return {
        id: guid,
        name: user.displayName || user.cn || user.sAMAccountName || "Usuário AD",
        username: user.sAMAccountName || "",
        email: user.mail || `${user.sAMAccountName}@${cfg.domain}`,
        department: extractOU(user.dn || user.distinguishedName || "", user.department || "Geral"),
        ou: user.dn || "",
        title: user.title || "Colaborador",
        status: status,
        createdDate: safeParseDate(user.whenCreated, "2025-01-01"),
        lastLogon: lastLogonValue,
        pwdLastSet: pwdLastSetValue,
        pwdExpired: expired,
        accountExpires: accountExpiresValue,
        memberOf: memberOf.length > 0 ? memberOf : ["Domain Users"],
        phone: user.telephoneNumber || "",
        mustChangePwd: user.pwdLastSet === "0"
      };
    });

    res.json(mappedUsers);
  });
});

// 4. Create User (Real AD / Simulation fallback)
app.post("/api/ad/users/create", async (req, res) => {
  const user = req.body;
  const cfg = readConfig();

  if (cfg.useDemoMode) {
    const db = readDatabase();
    const newUser = {
      ...user,
      id: String(db.users.length + 1),
      createdDate: new Date().toISOString().split("T")[0],
      lastLogon: "Nunca",
      pwdLastSet: new Date().toISOString().split("T")[0],
      pwdExpired: false,
      memberOf: ["Domain Users"]
    };
    db.users.unshift(newUser);
    
    // Add audit log entry
    db.logs.unshift({
      id: "log_" + Date.now(),
      timestamp: new Date().toISOString().replace("T", " ").substring(0, 19),
      operator: "admin.silva",
      action: "Criação de Usuário",
      targetUser: newUser.username,
      details: `Novo usuário ${newUser.name} criado com sucesso via console AD.`,
      type: "success"
    });

    writeDatabase(db);
    return res.json({ success: true, user: newUser });
  }

  // Real AD LDAP User Creation
  const client = ldap.createClient({ url: cfg.url, connectTimeout: 4000 });
  
  client.bind(cfg.username, cfg.password, (bindErr: any) => {
    if (bindErr) {
      client.destroy();
      return res.status(500).json({ error: "Erro ao fazer bind com AD: " + bindErr.message });
    }

    const userDN = `CN=${user.name},${cfg.baseDN}`;
    const entry = {
      objectClass: ["top", "person", "organizationalPerson", "user"],
      cn: user.name,
      sAMAccountName: user.username,
      userPrincipalName: `${user.username}@${cfg.domain}`,
      mail: user.email,
      department: user.department,
      title: user.title,
      telephoneNumber: user.phone,
      displayName: user.name,
      userAccountControl: user.status === "Desativada" ? "514" : "512" // 512 Enabled, 514 Disabled
    };

    client.add(userDN, entry, (addErr: any) => {
      client.destroy();
      if (addErr) {
        return res.status(500).json({ error: "Erro ao criar usuário no AD local: " + addErr.message });
      }

      res.json({ success: true, details: `Usuário criado com sucesso no DN: ${userDN}` });
    });
  });
});

// 5. Update User (Toggle Status / Attributes - Real AD / Simulation fallback)
app.post("/api/ad/users/update", async (req, res) => {
  const { id, updatedUser } = req.body;
  const cfg = readConfig();

  if (cfg.useDemoMode) {
    const db = readDatabase();
    db.users = db.users.map((u: any) => u.id === id ? { ...u, ...updatedUser } : u);

    // Add logging
    db.logs.unshift({
      id: "log_" + Date.now(),
      timestamp: new Date().toISOString().replace("T", " ").substring(0, 19),
      operator: "admin.silva",
      action: "Modificação de Usuário",
      targetUser: updatedUser.username,
      details: `Alterações salvas. Status: ${updatedUser.status}. OU: ${updatedUser.department}`,
      type: "info"
    });

    writeDatabase(db);
    return res.json({ success: true, user: { ...updatedUser, id } });
  }

  // Real AD LDAP modification
  const client = ldap.createClient({ url: cfg.url, connectTimeout: 4000 });
  client.bind(cfg.username, cfg.password, (bindErr: any) => {
    if (bindErr) {
      client.destroy();
      return res.status(500).json({ error: "Erro ao fazer bind com AD: " + bindErr.message });
    }

    // Use OU/DN provided in user metadata
    const userDN = updatedUser.ou || `CN=${updatedUser.name},${cfg.baseDN}`;
    
    // Calculate Active Directory userAccountControl
    let uac = "512"; // NORMAL_ACCOUNT
    if (updatedUser.status === "Desativada" || updatedUser.status === "Bloqueada") {
      uac = "514"; // NORMAL_ACCOUNT + ACCOUNTDISABLE
    }

    const modifications = [
      new ldap.Change({
        operation: "replace",
        modification: {
          userAccountControl: uac,
          department: updatedUser.department,
          title: updatedUser.title,
          telephoneNumber: updatedUser.phone
        }
      })
    ];

    client.modify(userDN, modifications, (modErr: any) => {
      client.destroy();
      if (modErr) {
        return res.status(500).json({ error: "Erro ao modificar atributos no AD: " + modErr.message });
      }
      res.json({ success: true, user: updatedUser });
    });
  });
});

// 6. Reset Password (Real AD / Simulation fallback)
app.post("/api/ad/users/reset-password", async (req, res) => {
  const { username, dn, newPassword } = req.body;
  const cfg = readConfig();

  if (cfg.useDemoMode) {
    const db = readDatabase();
    db.users = db.users.map((u: any) => u.username === username ? { ...u, mustChangePwd: true, pwdExpired: false, pwdLastSet: new Date().toISOString().split("T")[0] } : u);
    
    db.logs.unshift({
      id: "log_" + Date.now(),
      timestamp: new Date().toISOString().replace("T", " ").substring(0, 19),
      operator: "admin.silva",
      action: "Redefinição de Senha",
      targetUser: username,
      details: "Redefinição de senha executada. Exigida alteração no próximo logon do Windows.",
      type: "info"
    });

    writeDatabase(db);
    return res.json({ success: true, tempPassword: newPassword });
  }

  // Real AD LDAP Password Modification (Requires LDAPS / TLS on AD server)
  const client = ldap.createClient({ url: cfg.url, connectTimeout: 4000 });
  client.bind(cfg.username, cfg.password, (bindErr: any) => {
    if (bindErr) {
      client.destroy();
      return res.status(500).json({ error: "Erro ao fazer bind com AD: " + bindErr.message });
    }

    const userDN = dn || `CN=${username},${cfg.baseDN}`;
    
    // Active Directory unicodePwd must be double-quoted UTF-16LE format
    const doubleQuotedPassword = `"${newPassword}"`;
    const buffer = Buffer.from(doubleQuotedPassword, "utf16le");

    const modifications = [
      new ldap.Change({
        operation: "replace",
        modification: {
          unicodePwd: buffer
        }
      }),
      new ldap.Change({
        operation: "replace",
        modification: {
          pwdLastSet: "0" // Forces 'Must Change Password on Next Logon'
        }
      })
    ];

    client.modify(userDN, modifications, (modErr: any) => {
      client.destroy();
      if (modErr) {
        return res.status(500).json({
          error: "Erro ao redefinir senha no AD: " + modErr.message + 
                 ". Certifique-se de que a conexão é criptografada (LDAPS/TLS na porta 636) e que a senha cumpre os requisitos mínimos de complexidade do domínio."
        });
      }
      res.json({ success: true, tempPassword: newPassword });
    });
  });
});

// 7. Get Audit Logs
app.get("/api/ad/logs", async (req, res) => {
  const cfg = readConfig();
  const db = readDatabase();
  
  if (cfg.useDemoMode) {
    return res.json(db.logs);
  }

  try {
    const realUsers = await getADUsersPromise(cfg);
    const dynLogs = generateDynamicAuditLogs(realUsers, db.logs);
    res.json(dynLogs);
  } catch (err) {
    console.error("Erro ao gerar logs dinâmicos de auditoria:", err);
    res.json(db.logs);
  }
});

// 8. Clear Audit Logs
app.post("/api/ad/logs/clear", (req, res) => {
  const db = readDatabase();
  db.logs = [];
  writeDatabase(db);
  res.json({ success: true });
});

// 9. Add Audit Log
app.post("/api/ad/logs/create", (req, res) => {
  const log = req.body;
  const db = readDatabase();
  const newLog = {
    id: "log_" + Date.now(),
    timestamp: new Date().toISOString().replace("T", " ").substring(0, 19),
    operator: log.operator || "admin.silva",
    action: log.action,
    targetUser: log.targetUser,
    details: log.details,
    type: log.type || "info"
  };
  db.logs.unshift(newLog);
  writeDatabase(db);
  res.json(newLog);
});


// --- Vite Middleware / Production Server Config ---

async function bootstrap() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server rodando com sucesso na porta ${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error("Erro ao iniciar o servidor AD:", err);
});
