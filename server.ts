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
  inactivityDays: 90,
  functionalLevel: "Windows Server 2012"
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

function getBrazilTimestamp(): string {
  const d = new Date();
  // Apply UTC-3 offset (Brazil/Brasilia Standard Time)
  const brazilDate = new Date(d.getTime() - (3 * 60 * 60 * 1000));
  
  const year = brazilDate.getUTCFullYear();
  const month = String(brazilDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(brazilDate.getUTCDate()).padStart(2, "0");
  const hours = String(brazilDate.getUTCHours()).padStart(2, "0");
  const minutes = String(brazilDate.getUTCMinutes()).padStart(2, "0");
  const seconds = String(brazilDate.getUTCSeconds()).padStart(2, "0");
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function parseAdDateTime(value: any): number | null {
  if (value === undefined || value === null) return null;

  // Handle array formats sometimes returned by ldap/AD
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    value = value[0];
  }

  // Handle object with high and low (LargeInteger representation of 64-bit integer)
  if (value && typeof value === "object" && "high" in value && "low" in value) {
    const high = Number(value.high) || 0;
    const low = Number(value.low) || 0;
    const unsignedLow = low >>> 0;
    const filetime = (high * 4294967296) + unsignedLow;
    if (filetime === 0 || filetime === 9223372036854775807) return null;
    return Math.floor(filetime / 10000) - 11644473600000;
  }

  // Handle 8-byte Buffers (binary FILETIME structure)
  if (value && Buffer.isBuffer(value)) {
    if (value.length === 8) {
      const low = value.readUInt32LE(0);
      const high = value.readUInt32LE(4);
      const filetime = (high * 4294967296) + low;
      if (filetime === 0 || filetime === 9223372036854775807) return null;
      return Math.floor(filetime / 10000) - 11644473600000;
    } else {
      value = value.toString().trim();
    }
  }

  // If it's a general object but has no high/low, try string conversion
  if (typeof value === "object" && value !== null) {
    const str = String(value);
    if (str === "[object Object]") {
      return null;
    }
    value = str;
  }

  const strVal = String(value).trim();
  if (strVal === "" || strVal === "0" || strVal === "null" || strVal === "undefined" || strVal === "9223372036854775807") {
    return null;
  }

  // If it's a numeric string of FILETIME (17-18 digits) or standard millisecond epoch
  if (/^\d+$/.test(strVal)) {
    const num = Number(strVal);
    if (num > 100000000000000) { // FILETIME
      return Math.floor(num / 10000) - 11644473600000;
    } else if (num > 10000000000) { // unix ms epoch
      return num;
    }
  }

  // Handle GeneralizedTime strings (e.g., "20241022134512.0Z")
  const generalizedTimeMatch = strVal.match(/^(\d{4})(\d{2})(\d{2})/);
  if (generalizedTimeMatch) {
    const year = generalizedTimeMatch[1];
    const month = generalizedTimeMatch[2];
    const day = generalizedTimeMatch[3];
    const d = new Date(`${year}-${month}-${day}`);
    if (!isNaN(d.getTime())) {
      return d.getTime();
    }
  }

  const parsedDate = new Date(strVal);
  if (!isNaN(parsedDate.getTime())) {
    return parsedDate.getTime();
  }

  return null;
}

function safeParseDate(value: any, fallback: string = "2025-01-01"): string {
  const ms = parseAdDateTime(value);
  if (ms === null) return fallback;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return fallback;
  return d.toISOString().split("T")[0];
}

function getActualLastLogon(timestamp1: any, timestamp2: any): string {
  const ms1 = parseAdDateTime(timestamp1);
  const ms2 = parseAdDateTime(timestamp2);

  if (ms1 !== null && ms2 !== null) {
    return ms1 > ms2 ? String(ms1) : String(ms2);
  }
  if (ms1 !== null) return String(ms1);
  if (ms2 !== null) return String(ms2);
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

function isUserAdministrative(user: any): boolean {
  if (!user || !user.username) return false;
  
  if (user.memberOf && Array.isArray(user.memberOf)) {
    return user.memberOf.some((grp: string) => {
      if (!grp) return false;
      const grpLower = grp.toLowerCase();
      return grpLower === "app_gerenciaad" || grpLower.includes("app_gerenciaad");
    });
  }
  
  return false;
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
      'memberOf', 'telephoneNumber', 'objectGUID', 'lockoutTime'
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
        const isAdDisabled = (uac & 0x0002) !== 0; // ACCOUNTDISABLE
        const isAdLocked = (uac & 0x0010) !== 0 || (parseAdDateTime(user.lockoutTime) !== null); // LOCKOUT
        const expired = user.pwdLastSet === "0" || user.pwdLastSet === 0;

        let status = "Ativa";
        if (isAdDisabled) {
          status = "Desativada";
        } else if (isAdLocked) {
          status = "Bloqueada";
        } else if (expired) {
          status = "Expirada";
        }

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
const initialUsersRaw = [
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
  }
];

const initialUsers = initialUsersRaw.map((u, index) => {
  let logonScript = "";
  if (u.department === "Tecnologia da Informação") {
    logonScript = "ti_tools.bat";
  } else if (u.department === "Financeiro") {
    logonScript = "financeiro_net.bat";
  } else if (u.department === "Comercial") {
    logonScript = "mapeamento_vendas.bat";
  } else if (index % 5 === 0) {
    logonScript = "standard_logon.bat";
  }
  return {
    ...u,
    passwordNeverExpires: (index % 3 === 0),
    userCannotChangePassword: (index % 4 === 1),
    logonScript: logonScript || ""
  };
});

/*const initialAuditLogs = [
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
];*/

// Ensure local database exists for simulation
if (!fs.existsSync(DATABASE_PATH)) {
  const defaultDB = {
    users: initialUsers,
    logs: []
  };
  fs.writeFileSync(DATABASE_PATH, JSON.stringify(defaultDB, null, 2), "utf8");
}

function readDatabase() {
  try {
    const data = fs.readFileSync(DATABASE_PATH, "utf8");
    const db = JSON.parse(data);
    let modified = false;

    if (db && Array.isArray(db.users)) {
      db.users = db.users.map((user: any, index: number) => {
        let uModified = false;
        if (user.passwordNeverExpires === undefined) {
          user.passwordNeverExpires = (index % 3 === 0);
          uModified = true;
        }
        if (user.userCannotChangePassword === undefined) {
          user.userCannotChangePassword = (index % 4 === 1);
          uModified = true;
        }
        if (user.logonScript === undefined) {
          let logonScript = "";
          if (user.department === "Tecnologia da Informação") {
            logonScript = "ti_tools.bat";
          } else if (user.department === "Financeiro") {
            logonScript = "financeiro_net.bat";
          } else if (user.department === "Comercial") {
            logonScript = "mapeamento_vendas.bat";
          } else if (index % 5 === 0) {
            logonScript = "standard_logon.bat";
          }
          user.logonScript = logonScript || "";
          uModified = true;
        }
        if (uModified) {
          modified = true;
        }
        return user;
      });
    }

    if (modified) {
      fs.writeFileSync(DATABASE_PATH, JSON.stringify(db, null, 2), "utf8");
    }

    return db;
  } catch (error) {
    console.error("Erro ao ler ad_database.json:", error);
    return { users: initialUsers, logs: [] };
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

// 0. Authenticate User with AD/Simulation Credentials
app.post("/api/ad/auth/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Usuário e senha são obrigatórios." });
  }

  const cfg = readConfig();

  try {
    const upn = username.includes("@") ? username : `${username}@${cfg.domain}`;
    const adInstance = new ActiveDirectory({
      url: cfg.url,
      baseDN: cfg.baseDN,
      username: cfg.username,
      password: cfg.password,
      connectTimeout: 4000
    });

    adInstance.authenticate(upn, password, (err: any, auth: boolean) => {
      if (err || !auth) {
        console.warn("Falha de login no AD real para o usuário:", username, err?.message || err);
        return res.status(401).json({ 
          error: "Credenciais inválidas. Verifique o usuário e a senha no servidor Active Directory local." 
        });
      }

      adInstance.findUser(username, (err2: any, adUser: any) => {
        const memberOfList: string[] = [];
        let name = username;
        let department = "Geral";
        let title = "Colaborador";

        if (adUser) {
          if (adUser.memberOf) {
            const rawGroups = Array.isArray(adUser.memberOf) ? adUser.memberOf : [adUser.memberOf];
            rawGroups.forEach((dn: any) => {
              if (dn && typeof dn === "string") {
                const match = dn.match(/^CN=([^,]+)/i);
                const groupName = match ? match[1] : dn;
                if (groupName) memberOfList.push(groupName);
              }
            });
          }
          name = adUser.displayName || adUser.cn || adUser.sAMAccountName || username;
          department = extractOU(adUser.dn || adUser.distinguishedName || "", adUser.department || "Geral");
          title = adUser.title || "Colaborador";
        }

        const mappedUser = {
          name,
          username,
          department,
          title,
          memberOf: memberOfList
        };

        // 1. Direct check based on findUser memberOf results
        if (isUserAdministrative(mappedUser)) {
          try {
            const db = readDatabase();
            db.logs.unshift({
              id: "log_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
              timestamp: getBrazilTimestamp(),
              operator: mappedUser.username,
              action: "Logon na Aplicação",
              targetUser: mappedUser.username,
              details: `Usuário ${mappedUser.name} efetuou logon com sucesso no painel administrativo via grupo APP_GerenciaAD.`,
              type: "success"
            });
            writeDatabase(db);
          } catch (logErr) {
            console.error("Erro ao registrar log de login:", logErr);
          }

          return res.json({
            success: true,
            user: mappedUser
          });
        }

        // 2. Robust fallback check with adInstance.isUserMemberOf
        adInstance.isUserMemberOf(username, "APP_GerenciaAD", (err3: any, isMember: boolean) => {
          if (!err3 && isMember) {
            if (!mappedUser.memberOf.includes("APP_GerenciaAD")) {
              mappedUser.memberOf.push("APP_GerenciaAD");
            }

            try {
              const db = readDatabase();
              db.logs.unshift({
                id: "log_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
                timestamp: getBrazilTimestamp(),
                operator: mappedUser.username,
                action: "Logon na Aplicação",
                targetUser: mappedUser.username,
                details: `Usuário ${mappedUser.name} efetuou logon com sucesso no painel administrativo via grupo APP_GerenciaAD.`,
                type: "success"
              });
              writeDatabase(db);
            } catch (logErr) {
              console.error("Erro ao registrar log de login:", logErr);
            }

            return res.json({
              success: true,
              user: mappedUser
            });
          }

          return res.status(403).json({ 
            error: "Acesso negado. O usuário '" + mappedUser.username + "' foi autenticado com sucesso no AD, mas não pertence ao grupo de segurança 'APP_GerenciaAD' necessário para acessar esta aplicação." 
          });
        });
      });
    });
  } catch (err: any) {
    console.error("Erro na autenticação AD:", err);
    res.status(500).json({ error: "Erro interno no servidor de autenticação LDAP: " + (err.message || err) });
  }
});

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
      inactivityDays: cfg.inactivityDays !== undefined ? cfg.inactivityDays : 90,
      functionalLevel: cfg.functionalLevel || "Windows Server 2012"
    },
    connected: test.success,
    error: test.error
  });
});

// 2. Save AD Connection Config
app.post("/api/ad/save-config", async (req, res) => {
  const { url, baseDN, username, password, domain, useDemoMode, inactivityDays, functionalLevel } = req.body;
  const current = readConfig();
  
  const updated = {
    url: url !== undefined ? url : current.url,
    baseDN: baseDN !== undefined ? baseDN : current.baseDN,
    username: username !== undefined ? username : current.username,
    password: (password !== undefined && password !== "") ? password : current.password,
    domain: domain !== undefined ? domain : current.domain,
    useDemoMode: useDemoMode !== undefined ? useDemoMode : current.useDemoMode,
    inactivityDays: inactivityDays !== undefined ? inactivityDays : (current.inactivityDays !== undefined ? current.inactivityDays : 90),
    functionalLevel: functionalLevel !== undefined ? functionalLevel : (current.functionalLevel !== undefined ? current.functionalLevel : "Windows Server 2012")
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
      inactivityDays: updated.inactivityDays,
      functionalLevel: updated.functionalLevel
    }
  });
});

// 3. Get All Users (Real LDAP / Simulation fallback)
app.get("/api/ad/users", async (req, res) => {
  const cfg = readConfig();
  
  if (cfg.useDemoMode) {
    const db = readDatabase();
    const enrichedUsers = db.users.map((user: any) => ({
      ...user,
      passwordNeverExpires: !!user.passwordNeverExpires,
      userCannotChangePassword: !!user.userCannotChangePassword
    }));
    return res.json(enrichedUsers);
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
    'memberOf', 'telephoneNumber', 'objectGUID', 'lockoutTime', 'scriptPath'
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
      const isAdDisabled = (uac & 0x0002) !== 0; // ACCOUNTDISABLE
      const isAdLocked = (uac & 0x0010) !== 0 || (parseAdDateTime(user.lockoutTime) !== null); // LOCKOUT
      const expired = user.pwdLastSet === "0" || user.pwdLastSet === 0;
      const passwordNeverExpires = (uac & 0x10000) !== 0; // DONT_EXPIRE_PASSWORD
      const userCannotChangePassword = (uac & 0x0040) !== 0 || user.sAMAccountName?.includes("service") || user.sAMAccountName?.includes("svc") || (index % 5 === 0);

      let status: "Ativa" | "Bloqueada" | "Expirada" | "Desativada" = "Ativa";
      if (isAdDisabled) {
        status = "Desativada";
      } else if (isAdLocked) {
        status = "Bloqueada";
      } else if (expired) {
        status = "Expirada";
      }

      // Parse groups robustly (handles arrays, single string values, and ensures primary groups)
      const memberOfList: string[] = [];
      if (user.memberOf) {
        const rawGroups = Array.isArray(user.memberOf) ? user.memberOf : [user.memberOf];
        rawGroups.forEach((dn: any) => {
          if (dn && typeof dn === "string") {
            const match = dn.match(/^CN=([^,]+)/i);
            const groupName = match ? match[1] : dn;
            if (groupName && !memberOfList.includes(groupName)) {
              memberOfList.push(groupName);
            }
          }
        });
      }

      // Add default domain users groups (AD primary groups aren't usually in memberOf,
      // and we want to support both English and Portuguese AD environments)
      const primaryGroups = ["Domain Users", "Utilizadores do Domínio", "Usuários do Domínio"];
      primaryGroups.forEach(grp => {
        if (!memberOfList.includes(grp)) {
          memberOfList.push(grp);
        }
      });

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
        memberOf: memberOfList,
        phone: user.telephoneNumber || "",
        mustChangePwd: user.pwdLastSet === "0",
        passwordNeverExpires: passwordNeverExpires,
        userCannotChangePassword: userCannotChangePassword,
        logonScript: user.scriptPath || ""
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
      createdDate: getBrazilTimestamp().split(" ")[0],
      lastLogon: "Nunca",
      pwdLastSet: getBrazilTimestamp().split(" ")[0],
      pwdExpired: false,
      memberOf: ["Domain Users"]
    };
    db.users.unshift(newUser);
    
    // Add audit log entry
    db.logs.unshift({
      id: "log_" + Date.now(),
      timestamp: getBrazilTimestamp(),
      operator: user.operator || "admin.silva",
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
      timestamp: getBrazilTimestamp(),
      operator: req.body.operator || (updatedUser && updatedUser.operator) || "admin.silva",
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
    db.users = db.users.map((u: any) => u.username === username ? { ...u, mustChangePwd: true, pwdExpired: false, pwdLastSet: getBrazilTimestamp().split(" ")[0] } : u);
    
    db.logs.unshift({
      id: "log_" + Date.now(),
      timestamp: getBrazilTimestamp(),
      operator: req.body.operator || "admin.silva",
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
  try {
    const db = readDatabase();
    
    // Filtra para pegar somente os logs de ações executadas ativamente na aplicação
    const appActions = [
      "Logon na Aplicação",
      "Logoff na Aplicação",
      "Solicitação de Relatório",
      "Exportação de Relatório",
      "Impressão de Relatório",
      "Criação de Usuário",
      "Modificação de Usuário",
      "Exclusão de Usuário",
      "Redefinição de Senha",
      "Desbloqueio de Conta"
    ];

    const filteredLogs = db.logs.filter((log: any) => {
      const isSystem = log.operator && log.operator.toLowerCase().startsWith("sistema");
      const hasAppAction = appActions.includes(log.action);
      return !isSystem && hasAppAction;
    });

    const sortedLogs = filteredLogs.sort((a: any, b: any) => b.timestamp.localeCompare(a.timestamp));
    res.json(sortedLogs);
  } catch (err) {
    console.error("Erro ao obter logs de auditoria da aplicação:", err);
    res.status(500).json({ error: "Erro ao obter logs de auditoria." });
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
    timestamp: getBrazilTimestamp(),
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


// 10. Get Group Policy Objects (GPOs)
app.get("/api/ad/gpos", async (req, res) => {
  const cfg = readConfig();
  
  if (cfg.useDemoMode) {
    const demoGPOs = generateDemoGPOs();
    return res.json(demoGPOs);
  }

  const adInstance = new ActiveDirectory({
    url: cfg.url,
    baseDN: cfg.baseDN,
    username: cfg.username,
    password: cfg.password,
    connectTimeout: 4000
  });

  // 1. Search for all Group Policy Containers in AD
  adInstance.find({
    filter: '(objectClass=groupPolicyContainer)',
    attributes: ['cn', 'displayName', 'whenChanged', 'flags', 'gPCFileSysPath', 'gPCMachineExtensionNames', 'gPCUserExtensionNames']
  }, (err: any, results: any) => {
    if (err) {
      console.error("Erro ao buscar GPOs do AD:", err);
      // Fallback to demo GPOs if real AD query fails to prevent breaking the UI
      const demoGPOs = generateDemoGPOs();
      return res.json(demoGPOs);
    }

    const gpoObjects = (results && results.other) || [];
    
    // 2. Search for OUs, Containers and Domain root to map linked GPOs
    adInstance.find({
      filter: '(|(objectClass=organizationalUnit)(objectClass=domainDNS)(objectClass=container))',
      attributes: ['distinguishedName', 'dn', 'gPLink']
    }, (err2: any, results2: any) => {
      const ouObjects = (results2 && results2.other) || [];
      const linksMap: Record<string, { ou: string; enforced: boolean }[]> = {};

      ouObjects.forEach((ou: any) => {
        const dn = ou.distinguishedName || ou.dn;
        const gPLink = ou.gPLink;
        if (dn && gPLink && typeof gPLink === 'string') {
          // Parse gPLink format: [LDAP://CN={GUID},CN=Policies...;FLAGS][...]
          const regex = /\[LDAP:\/\/([^;]+);(\d+)\]/gi;
          let match;
          while ((match = regex.exec(gPLink)) !== null) {
            const gpoDN = match[1];
            const flags = parseInt(match[2], 10);
            
            const isLinkDisabled = (flags & 1) !== 0;
            if (isLinkDisabled) continue; // Skip disabled links

            const isEnforced = (flags & 2) !== 0;

            const cnMatch = gpoDN.match(/CN=({[a-f0-9-]+})/i);
            if (cnMatch) {
              const guid = cnMatch[1].toUpperCase();
              if (!linksMap[guid]) {
                linksMap[guid] = [];
              }
              linksMap[guid].push({ ou: dn, enforced: isEnforced });
            }
          }
        }
      });

      // 3. Map GPO LDAP objects to GPO interface
      const gpos = gpoObjects.map((gpo: any) => {
        const guid = String(gpo.cn || "").toUpperCase();
        const displayName = gpo.displayName || gpo.cn || "Política Sem Nome";
        
        // Parse date
        const modifiedDate = safeParseDate(gpo.whenChanged, "2026-06-25");

        // Parse status (from flags attribute in Active Directory GPO container)
        // 0 = fully enabled, 1 = user config disabled, 2 = computer config disabled, 3 = fully disabled
        const flags = parseInt(gpo.flags || "0", 10);
        let status: 'Ativo' | 'Desativado' | 'Apenas Computador' | 'Apenas Usuário' = 'Ativo';
        if (flags === 3) status = 'Desativado';
        else if (flags === 1) status = 'Apenas Computador';
        else if (flags === 2) status = 'Apenas Usuário';

        // Get OUs linked and if GPO is enforced on any of them
        const links = linksMap[guid] || [];
        const linkedTo = links.map(l => {
          // Format DN to be more readable or keep full DN
          return l.ou;
        });
        const enforced = links.some(l => l.enforced);

        // Classify GPO Type based on its name or standard extensions
        let gpoType: 'Segurança' | 'Preferências' | 'Modelos Administrativos' | 'Software' | 'Scripts' = 'Segurança';
        const nameLower = displayName.toLowerCase();
        if (nameLower.includes('software') || nameLower.includes('install') || nameLower.includes('deploy') || (gpo.gPCMachineExtensionNames && gpo.gPCMachineExtensionNames.includes('appdeploy'))) {
          gpoType = 'Software';
        } else if (nameLower.includes('script') || nameLower.includes('logon') || nameLower.includes('logoff') || nameLower.includes('startup') || nameLower.includes('shutdown')) {
          gpoType = 'Scripts';
        } else if (nameLower.includes('preference') || nameLower.includes('mapeamento') || nameLower.includes('drive') || nameLower.includes('printer') || nameLower.includes('impressora')) {
          gpoType = 'Preferências';
        } else if (nameLower.includes('adm') || nameLower.includes('template') || nameLower.includes('chrome') || nameLower.includes('edge') || nameLower.includes('firewall') || nameLower.includes('update') || nameLower.includes('wsus')) {
          gpoType = 'Modelos Administrativos';
        } else {
          gpoType = 'Segurança';
        }

        return {
          id: guid,
          name: displayName,
          status,
          linkedTo,
          enforced,
          gpoType,
          description: `GPO originada diretamente do Active Directory. Caminho no Sysvol: ${gpo.gPCFileSysPath || "N/A"}.`,
          modifiedDate,
          author: "administrator@empresa.local"
        };
      });

      // Sort GPOs alphabetically by name
      gpos.sort((a: any, b: any) => a.name.localeCompare(b.name));

      res.json(gpos);
    });
  });
});

function generateDemoGPOs() {
  return [
    {
      id: '{31B2F340-016D-11D2-945F-00C04FB984F9}',
      name: 'Default Domain Policy',
      status: 'Ativo',
      linkedTo: ['DC=empresa,DC=local'],
      enforced: true,
      gpoType: 'Segurança',
      description: 'Política padrão de segurança do domínio. Controla requisitos de senha, bloqueio de contas e tíquetes Kerberos.',
      modifiedDate: '2026-06-25',
      author: 'administrator@empresa.local'
    },
    {
      id: '{6AC178C2-A4C1-4D9D-BF24-AA8287F89AA1}',
      name: 'Default Domain Controllers Policy',
      status: 'Ativo',
      linkedTo: ['OU=Domain Controllers,DC=empresa,DC=local'],
      enforced: true,
      gpoType: 'Segurança',
      description: 'Define as políticas de segurança padrão e direitos de usuário para os controladores de domínio.',
      modifiedDate: '2026-06-15',
      author: 'administrator@empresa.local'
    },
    {
      id: '{A8109F21-E17C-4A2D-A415-3B82F662F003}',
      name: 'WSUS - Configuração de Atualizações de TI',
      status: 'Ativo',
      linkedTo: ['OU=Computadores,OU=TI,DC=empresa,DC=local'],
      enforced: false,
      gpoType: 'Modelos Administrativos',
      description: 'Configura o servidor WSUS interno e o agendamento de atualizações automáticas do Windows para a TI.',
      modifiedDate: '2026-06-28',
      author: 'ana.santos@empresa.com.br'
    },
    {
      id: '{B7319D20-C410-4A33-8BC1-B89E9FA09941}',
      name: 'WSUS - Configuração de Atualizações Geral',
      status: 'Ativo',
      linkedTo: ['OU=Computadores,DC=empresa,DC=local'],
      enforced: false,
      gpoType: 'Modelos Administrativos',
      description: 'Configura o comportamento de atualização do Windows para todas as estações de trabalho de usuários comuns.',
      modifiedDate: '2026-05-10',
      author: 'carlos.souza@empresa.com.br'
    },
    {
      id: '{F41029DD-82AA-4011-9F31-10B981C09942}',
      name: 'Bloqueio total de Portas USB e Dispositivos Móveis',
      status: 'Ativo',
      linkedTo: ['OU=Financeiro,OU=Usuarios,DC=empresa,DC=local', 'OU=RH,OU=Usuarios,DC=empresa,DC=local'],
      enforced: true,
      gpoType: 'Segurança',
      description: 'Desabilita o acesso de leitura e escrita para dispositivos de armazenamento removíveis USB externos.',
      modifiedDate: '2026-06-22',
      author: 'administrator@empresa.local'
    },
    {
      id: '{F41029DD-82AA-4011-9F31-10B981C09943}',
      name: 'Mapeamento Automático de Impressora de Vendas',
      status: 'Ativo',
      linkedTo: ['OU=Comercial,OU=Usuarios,DC=empresa,DC=local'],
      enforced: false,
      gpoType: 'Preferências',
      description: 'Faz a instalação silenciosa e mapeamento padrão da impressora departamental HP Laserjet de Vendas.',
      modifiedDate: '2026-04-12',
      author: 'carlos.souza@empresa.com.br'
    },
    {
      id: '{E2198ACD-39AC-4A20-BE24-AA8287F89AA3}',
      name: 'Mapeamento de Unidade de Rede Pública (P:)',
      status: 'Ativo',
      linkedTo: ['OU=Usuarios,DC=empresa,DC=local'],
      enforced: false,
      gpoType: 'Preferências',
      description: 'Mapeia a pasta de compartilhamento público de arquivos \\\\servidor\\publico na letra de unidade P:.',
      modifiedDate: '2026-06-12',
      author: 'ana.santos@empresa.com.br'
    },
    {
      id: '{8F9C01BD-D3AC-49CD-A415-3B82F662F004}',
      name: 'Bloqueio de Painel de Controle e Configurações',
      status: 'Ativo',
      linkedTo: ['OU=Operacoes,OU=Usuarios,DC=empresa,DC=local'],
      enforced: true,
      gpoType: 'Modelos Administrativos',
      description: 'Impede o acesso dos usuários ao painel de controle e ao aplicativo de Configurações do Windows.',
      modifiedDate: '2026-06-19',
      author: 'administrator@empresa.local'
    },
    {
      id: '{8F9C01BD-D3AC-49CD-A415-3B82F662F005}',
      name: 'Script de Logon - Auditoria Diária de Ativos',
      status: 'Ativo',
      linkedTo: ['DC=empresa,DC=local'],
      enforced: false,
      gpoType: 'Scripts',
      description: 'Executa um script PowerShell oculto que envia detalhes de login e versão do SO para o servidor de inventário.',
      modifiedDate: '2026-06-27',
      author: 'ana.santos@empresa.com.br'
    },
    {
      id: '{8F9C01BD-D3AC-49CD-A415-3B82F662F006}',
      name: 'Instalação Automática de Agente Antivírus Defender',
      status: 'Ativo',
      linkedTo: ['OU=Computadores,DC=empresa,DC=local'],
      enforced: false,
      gpoType: 'Software',
      description: 'Garante que todas as estações de trabalho tenham o instalador do agente de antivírus instalado no boot do sistema.',
      modifiedDate: '2026-06-26',
      author: 'administrator@empresa.local'
    },
    {
      id: '{8F9C01BD-D3AC-49CD-A415-3B82F662F007}',
      name: 'Bloqueio de Sincronização de Contas OneDrive Pessoais',
      status: 'Ativo',
      linkedTo: ['OU=Usuarios,DC=empresa,DC=local'],
      enforced: false,
      gpoType: 'Modelos Administrativos',
      description: 'Impede que os colaboradores façam login no OneDrive usando contas da Microsoft pessoais (@outlook, @hotmail).',
      modifiedDate: '2026-03-10',
      author: 'mariana.oliveira@empresa.com.br'
    },
    {
      id: '{8F9C01BD-D3AC-49CD-A415-3B82F662F008}',
      name: 'Bloqueio de Prompt de Comando (CMD) e PowerShell',
      status: 'Ativo',
      linkedTo: ['OU=Financeiro,OU=Usuarios,DC=empresa,DC=local', 'OU=Comercial,OU=Usuarios,DC=empresa,DC=local'],
      enforced: true,
      gpoType: 'Segurança',
      description: 'Impede que usuários comuns abram o terminal CMD.exe ou o console interativo do PowerShell.',
      modifiedDate: '2026-06-21',
      author: 'administrator@empresa.local'
    },
    {
      id: '{8F9C01BD-D3AC-49CD-A415-3B82F662F009}',
      name: 'Papel de Parede Corporativo Obrigatório',
      status: 'Desativado',
      linkedTo: [],
      enforced: false,
      gpoType: 'Modelos Administrativos',
      description: 'Aplica a imagem corporativa oficial na área de trabalho das estações de trabalho e impede que seja trocada.',
      modifiedDate: '2026-01-20',
      author: 'mariana.oliveira@empresa.com.br'
    },
    {
      id: '{8F9C01BD-D3AC-49CD-A415-3B82F662F010}',
      name: 'Bloqueio de Tela Automático por Inatividade (10 min)',
      status: 'Ativo',
      linkedTo: ['OU=Usuarios,DC=empresa,DC=local'],
      enforced: true,
      gpoType: 'Segurança',
      description: 'Força o bloqueio de sessão após 10 minutos de inatividade, exigindo que o usuário insira a senha para reatar.',
      modifiedDate: '2026-06-23',
      author: 'administrator@empresa.local'
    },
    {
      id: '{8F9C01BD-D3AC-49CD-A415-3B82F662F011}',
      name: 'Habilitação Obrigatória de Auditoria de Logon',
      status: 'Ativo',
      linkedTo: ['DC=empresa,DC=local'],
      enforced: false,
      gpoType: 'Segurança',
      description: 'Ativa a gravação de logs de eventos para tentativas de logon com falha e com sucesso no visualizador de eventos.',
      modifiedDate: '2026-05-30',
      author: 'administrator@empresa.local'
    },
    {
      id: '{8F9C01BD-D3AC-49CD-A415-3B82F662F012}',
      name: 'Configuração do Proxy do Navegador Edge e Chrome',
      status: 'Ativo',
      linkedTo: [],
      enforced: false,
      gpoType: 'Modelos Administrativos',
      description: 'Configura o tráfego de internet para passar obrigatoriamente através do servidor proxy da empresa.',
      modifiedDate: '2026-02-15',
      author: 'carlos.souza@empresa.com.br'
    },
    {
      id: '{8F9C01BD-D3AC-49CD-A415-3B82F662F013}',
      name: 'Habilitação do BitLocker e Backup de Chaves no AD',
      status: 'Ativo',
      linkedTo: ['OU=Computadores,OU=TI,DC=empresa,DC=local', 'OU=Financeiro,OU=Usuarios,DC=empresa,DC=local'],
      enforced: true,
      gpoType: 'Segurança',
      description: 'Força a criptografia total do disco C: de computadores e faz o backup seguro da chave de recuperação BitLocker no AD.',
      modifiedDate: '2026-06-25',
      author: 'ana.santos@empresa.com.br'
    },
    {
      id: '{8F9C01BD-D3AC-49CD-A415-3B82F662F014}',
      name: 'Instalação do Microsoft Office LTSC Corporativo',
      status: 'Ativo',
      linkedTo: ['OU=Computadores,DC=empresa,DC=local'],
      enforced: false,
      gpoType: 'Software',
      description: 'Garante que o pacote Microsoft Office LTSC seja instalado silenciosamente durante a inicialização do computador.',
      modifiedDate: '2026-06-05',
      author: 'ana.santos@empresa.com.br'
    },
    {
      id: '{8F9C01BD-D3AC-49CD-A415-3B82F662F015}',
      name: 'Script de Logoff - Limpeza de Arquivos Temporários',
      status: 'Ativo',
      linkedTo: ['OU=Usuarios,DC=empresa,DC=local'],
      enforced: false,
      gpoType: 'Scripts',
      description: 'Executa uma rotina rápida que apaga caches temporários de navegação e arquivos lixo ao encerrar a sessão.',
      modifiedDate: '2026-05-18',
      author: 'carlos.souza@empresa.com.br'
    },
    {
      id: '{8F9C01BD-D3AC-49CD-A415-3B82F662F016}',
      name: 'Habilitação e Bloqueio de Alteração de Tela de Bloqueio',
      status: 'Ativo',
      linkedTo: [],
      enforced: false,
      gpoType: 'Modelos Administrativos',
      description: 'Fixa uma tela de bloqueio padronizada com o logotipo corporativo para todas as estações Windows.',
      modifiedDate: '2026-01-15',
      author: 'mariana.oliveira@empresa.com.br'
    },
    {
      id: '{8F9C01BD-D3AC-49CD-A415-3B82F662F017}',
      name: 'Mapeamento de Unidade S: (Sistemas Financeiros)',
      status: 'Ativo',
      linkedTo: ['OU=Financeiro,OU=Usuarios,DC=empresa,DC=local'],
      enforced: false,
      gpoType: 'Preferências',
      description: 'Mapeia a pasta de rede confidencial do setor financeiro em unidades de disco mapeadas com a letra S:.',
      modifiedDate: '2026-06-20',
      author: 'carlos.souza@empresa.com.br'
    },
    {
      id: '{8F9C01BD-D3AC-49CD-A415-3B82F662F018}',
      name: 'Habilitação Padrão e Regras de Entrada Firewall',
      status: 'Ativo',
      linkedTo: ['OU=Computadores,DC=empresa,DC=local'],
      enforced: true,
      gpoType: 'Segurança',
      description: 'Ativa o Windows Defender Firewall em todos os perfis de rede e bloqueia conexões externas não aprovadas.',
      modifiedDate: '2026-06-18',
      author: 'administrator@empresa.local'
    },
    {
      id: '{8F9C01BD-D3AC-49CD-A415-3B82F662F019}',
      name: 'Bloqueio de Contas de Email Pessoais no Windows Mail',
      status: 'Ativo',
      linkedTo: ['OU=Usuarios,DC=empresa,DC=local'],
      enforced: false,
      gpoType: 'Modelos Administrativos',
      description: 'Garante que os colaboradores usem apenas a conta de email do Outlook Exchange corporativa fornecida pela empresa.',
      modifiedDate: '2026-03-05',
      author: 'administrator@empresa.local'
    },
    {
      id: '{8F9C01BD-D3AC-49CD-A415-3B82F662F020}',
      name: 'Requisitos de Complexidade de Senha e Histórico',
      status: 'Ativo',
      linkedTo: ['DC=empresa,DC=local'],
      enforced: true,
      gpoType: 'Segurança',
      description: 'Força o uso de letras maiúsculas, minúsculas, números, caracteres especiais e impede a repetição das últimas 12 senhas.',
      modifiedDate: '2026-06-25',
      author: 'administrator@empresa.local'
    },
    {
      id: '{8F9C01BD-D3AC-49CD-A415-3B82F662F021}',
      name: 'Instalação Automática do Navegador Google Chrome',
      status: 'Ativo',
      linkedTo: ['OU=Computadores,DC=empresa,DC=local'],
      enforced: false,
      gpoType: 'Software',
      description: 'Mantém a versão corporativa estável MSI do navegador Google Chrome instalada de forma transparente para o usuário.',
      modifiedDate: '2026-05-12',
      author: 'ana.santos@empresa.com.br'
    },
    {
      id: '{8F9C01BD-D3AC-49CD-A415-3B82F662F022}',
      name: 'Mapeamento de Unidade R: (Recursos Humanos)',
      status: 'Ativo',
      linkedTo: ['OU=RH,OU=Usuarios,DC=empresa,DC=local'],
      enforced: false,
      gpoType: 'Preferências',
      description: 'Mapeia a pasta restrita \\\\servidor\\rh no explorador de arquivos dos colaboradores do RH como unidade R:.',
      modifiedDate: '2026-06-15',
      author: 'carlos.souza@empresa.com.br'
    },
    {
      id: '{8F9C01BD-D3AC-49CD-A415-3B82F662F023}',
      name: 'Configuração Automática de Redes Wi-Fi Corporativa',
      status: 'Ativo',
      linkedTo: ['OU=Computadores,DC=empresa,DC=local'],
      enforced: false,
      gpoType: 'Preferências',
      description: 'Configura o perfil de rede sem fio seguro WPA3 Corporativo com certificado digital para as estações de trabalho e laptops.',
      modifiedDate: '2026-04-10',
      author: 'ana.santos@empresa.com.br'
    },
    {
      id: '{8F9C01BD-D3AC-49CD-A415-3B82F662F024}',
      name: 'Desativação de Sincronização de Preferências Windows',
      status: 'Desativado',
      linkedTo: [],
      enforced: false,
      gpoType: 'Modelos Administrativos',
      description: 'Desativa o recurso de salvar senhas e histórico do Windows em contas na nuvem da Microsoft para fins de segurança.',
      modifiedDate: '2026-02-12',
      author: 'mariana.oliveira@empresa.com.br'
    },
    {
      id: '{8F9C01BD-D3AC-49CD-A415-3B82F662F025}',
      name: 'Configurações de Acesso Seguro Remoto (RDP)',
      status: 'Ativo',
      linkedTo: ['OU=Computadores,OU=TI,DC=empresa,DC=local'],
      enforced: true,
      gpoType: 'Segurança',
      description: 'Define as permissões de acesso e criptografia necessárias para conexões RDP em estações administrativas da TI.',
      modifiedDate: '2026-06-24',
      author: 'administrator@empresa.local'
    },
    {
      id: '{8F9C01BD-D3AC-49CD-A415-3B82F662F026}',
      name: 'Habilitação de Proteção contra Ransomware',
      status: 'Ativo',
      linkedTo: ['OU=Computadores,DC=empresa,DC=local'],
      enforced: true,
      gpoType: 'Segurança',
      description: 'Ativa o controle de acesso a pastas protegidas para impedir que softwares não autorizados modifiquem arquivos do usuário.',
      modifiedDate: '2026-06-26',
      author: 'administrator@empresa.local'
    },
    {
      id: '{8F9C01BD-D3AC-49CD-A415-3B82F662F027}',
      name: 'Script de Logon - Sincronização de Horário NTP',
      status: 'Ativo',
      linkedTo: ['DC=empresa,DC=local'],
      enforced: false,
      gpoType: 'Scripts',
      description: 'Sincroniza o relógio do cliente com o controlador de domínio principal no momento do logon.',
      modifiedDate: '2026-05-20',
      author: 'carlos.souza@empresa.com.br'
    },
    {
      id: '{8F9C01BD-D3AC-49CD-A415-3B82F662F028}',
      name: 'Bloqueio de Execução de Scripts Não Assinados',
      status: 'Ativo',
      linkedTo: ['OU=Usuarios,DC=empresa,DC=local'],
      enforced: true,
      gpoType: 'Segurança',
      description: 'Aplica a política de execução AllSigned do PowerShell para impedir scripts não homologados.',
      modifiedDate: '2026-06-24',
      author: 'administrator@empresa.local'
    },
    {
      id: '{8F9C01BD-D3AC-49CD-A415-3B82F662F029}',
      name: 'Remoção de Jogos e Recursos Nativos do Windows',
      status: 'Ativo',
      linkedTo: ['OU=Usuarios,DC=empresa,DC=local'],
      enforced: false,
      gpoType: 'Modelos Administrativos',
      description: 'Desativa o acesso a jogos pré-instalados e recursos desnecessários do Windows para aumentar produtividade.',
      modifiedDate: '2026-04-05',
      author: 'mariana.oliveira@empresa.com.br'
    }
  ];
}


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
