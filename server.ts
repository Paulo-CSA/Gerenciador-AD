import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import os from "os";
import { createServer as createViteServer } from "vite";
import dns from "dns";
import { execFile } from "child_process";
import dotenv from "dotenv";
import { WebSocketServer, WebSocket } from "ws";

// Load environment variables from .env file
dotenv.config();

// Prevent unhandled errors from crashing the process (such as unhandled 'error' events in LDAP sockets)
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception capturada pelo servidor AD:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection capturada pelo servidor AD em:", promise, "motivo:", reason);
});

// @ts-ignore
import ActiveDirectory from "activedirectory2";
// @ts-ignore
import ldap from "ldapjs";

const app = express();
const PORT = 3000;

app.use(express.json());

const CONFIG_PATH = path.join(process.cwd(), "ad_config.json");
const DATABASE_PATH = path.join(process.cwd(), "ad_database.json");
const MESSAGES_PATH = path.join(process.cwd(), "ad_messages.json");

// Default configuration template
const defaultConfig = {
  url: "ldap://172.16.0.1:389",
  baseDN: "DC=inema,DC=intranet",
  username: "sistemas.infra@inema.intranet",
  password: "kp2J$FM%^e$mxG",
  domain: "inema.intranet",
  useDemoMode: false,
  inactivityDays: 90,
  computerInactivityDays: 240,
  functionalLevel: "Windows Server 2012"
};

// Ensure configuration file exists
if (!fs.existsSync(CONFIG_PATH)) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2), "utf8");
}

function cleanConfigString(val: any): string {
  if (val === undefined || val === null) return "";
  let s = String(val).trim();
  // Strip outer quotes if enclosed
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.substring(1, s.length - 1).trim();
  }
  // Strip leading/trailing dots or extra punctuation from typo inputs
  s = s.replace(/^[.\s"']+|[.\s"']+$/g, "");
  return s;
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

  // Override with process.env if present (supporting both standard and typo/dot prefix keys)
  let envHasConfig = false;

  const rawUrl = process.env.LDAP_URL || process.env[".LDAP_URL"];
  if (rawUrl) {
    cfg.url = cleanConfigString(rawUrl);
    envHasConfig = true;
  }
  const rawBaseDN = process.env.LDAP_BASE_DN || process.env[".LDAP_BASE_DN"];
  if (rawBaseDN) {
    cfg.baseDN = cleanConfigString(rawBaseDN);
    envHasConfig = true;
  }
  const rawBindDN = process.env.LDAP_BIND_DN || process.env[".LDAP_BIND_DN"];
  if (rawBindDN) {
    cfg.username = cleanConfigString(rawBindDN);
    envHasConfig = true;
  }
  const rawPassword = process.env.LDAP_BIND_PASSWORD || process.env[".LDAP_BIND_PASSWORD"];
  if (rawPassword) {
    cfg.password = cleanConfigString(rawPassword);
    envHasConfig = true;
  }
  const rawDomain = process.env.LDAP_DOMAIN || process.env[".LDAP_DOMAIN"];
  if (rawDomain) {
    cfg.domain = cleanConfigString(rawDomain);
    envHasConfig = true;
  }

  // Check if explicit demo mode override is provided via environment
  const rawDemoMode = process.env.LDAP_USE_DEMO_MODE || process.env[".LDAP_USE_DEMO_MODE"];
  if (rawDemoMode !== undefined) {
    cfg.useDemoMode = cleanConfigString(rawDemoMode) === "true";
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

interface CachedADComputer {
  name: string;
  dn: string;
  guid: string;
  canonicalPath: string;
  userAccountControl: number;
  ipAddress?: string;
  operatingSystem?: string;
}
const globalComputersCache = new Map<string, CachedADComputer>();
const dnsIpCache = new Map<string, string>();

function cleanValidIp(ip?: string): string | undefined {
  if (!ip) return undefined;
  let s = String(ip).trim();
  if (s.startsWith("::ffff:")) s = s.slice(7);
  if (
    !s ||
    s === "::1" ||
    s === "127.0.0.1" ||
    s.toLowerCase().includes("dhcp") ||
    s.toLowerCase().includes("dinâmico") ||
    s.toLowerCase().includes("dinamico")
  ) {
    return undefined;
  }
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(s)) return s;
  return undefined;
}

function isWindowsServerOS(os?: string): boolean {
  return String(os || "").toLowerCase().includes("server");
}

function asyncLookupHost(fqdn: string) {
  if (!fqdn || dnsIpCache.has(fqdn)) return;
  dns.lookup(fqdn, { family: 4 }, (err, address) => {
    if (!err && address) {
      dnsIpCache.set(fqdn, address);
    }
  });
}

/**
 * Converts an LDAP DN (e.g. CN=NB-INEMA-12440,OU=NOTEBOOKS,OU=ZOOLOGICO,OU=UR-PARQUES-POSTOS AVANCADOS,OU=WORKSTATION,DC=inema,DC=intranet)
 * into a canonical path (e.g. inema.intranet/WORKSTATION/UR-PARQUES-POSTOS AVANCADOS/ZOOLOGICO/NOTEBOOKS/NB-INEMA-12440)
 */
function dnToCanonicalPath(dn: string, domainFallback?: string): string {
  if (!dn) return "";
  
  // Extract CN
  const cnMatch = dn.match(/CN\s*=\s*([^,]+)/i);
  const cn = cnMatch ? cnMatch[1].trim() : "";

  // Extract OUs in reverse order (bottom-up in LDAP -> top-down in canonical path)
  const ouMatches = dn.match(/OU\s*=\s*([^,]+)/gi) || [];
  const ous = ouMatches.map(m => {
    const parts = m.split("=");
    return parts.length > 1 ? parts[1].trim() : "";
  }).filter(Boolean).reverse();

  // Extract DCs for domain
  const dcMatches = dn.match(/DC\s*=\s*([^,]+)/gi) || [];
  let domain = dcMatches.map(m => {
    const parts = m.split("=");
    return parts.length > 1 ? parts[1].trim() : "";
  }).filter(Boolean).join(".");

  if (!domain && domainFallback) {
    domain = domainFallback;
  }

  const parts: string[] = [];
  if (domain) parts.push(domain);
  if (ous.length > 0) parts.push(...ous);
  if (cn) parts.push(cn);

  return parts.join("/");
}

/**
 * Converts a canonical path (e.g. inema.intranet/WORKSTATION/UR-PARQUES-POSTOS AVANCADOS/ZOOLOGICO/NOTEBOOKS/NB-INEMA-12440)
 * into an LDAP DN (e.g. CN=NB-INEMA-12440,OU=NOTEBOOKS,OU=ZOOLOGICO,OU=UR-PARQUES-POSTOS AVANCADOS,OU=WORKSTATION,DC=inema,DC=intranet)
 */
function canonicalPathToDN(canonicalPath: string, domainFallback: string, baseDNFallback: string): { name: string; dn: string } {
  if (!canonicalPath) return { name: "", dn: "" };
  
  const rawParts = canonicalPath.split("/").map(p => p.trim()).filter(Boolean);
  if (rawParts.length === 0) return { name: "", dn: "" };

  const machineName = rawParts[rawParts.length - 1];
  const cleanName = machineName.endsWith("$") ? machineName.slice(0, -1) : machineName;

  const ouParts = rawParts.slice(0, -1);
  let baseDN = baseDNFallback || "DC=inema,DC=intranet";

  // Check if first part is domain (contains a dot like inema.intranet)
  if (ouParts.length > 0 && ouParts[0].includes(".")) {
    const domainStr = ouParts.shift()!;
    baseDN = domainStr.split(".").map(d => `DC=${d}`).join(",");
  }

  let dn = "";
  if (ouParts.length > 0) {
    // Reverse OUs so deepest OU comes right after CN
    const ous = [...ouParts].reverse().map(ou => `OU=${ou}`).join(",");
    dn = `CN=${cleanName},${ous},${baseDN}`;
  } else {
    dn = `CN=${cleanName},${baseDN}`;
  }

  return { name: cleanName, dn };
}

/**
 * Resolves any identifier format (cleanName, sAMAccountName, SID, GUID, DN, or Canonical Path)
 * into the computer's clean name and exact LDAP DN.
 */
function resolveComputerIdentifier(
  input: string | undefined,
  cfg: any
): { name: string; dn?: string; uac?: number } {
  if (!input || typeof input !== "string") {
    return { name: "" };
  }
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();

  // 1. Check in-memory AD cache (populated from latest query)
  const cached = globalComputersCache.get(lower);
  if (cached) {
    return { name: cached.name, dn: cached.dn, uac: cached.userAccountControl };
  }

  // 2. Check if input is an LDAP DN (e.g. CN=NB-INEMA-12440,OU=...,DC=inema,DC=intranet)
  if (/^CN=/i.test(trimmed) && /DC=/i.test(trimmed)) {
    const cnMatch = trimmed.match(/^CN=([^,]+)/i);
    const name = cnMatch ? cnMatch[1].trim() : trimmed;
    const cleanName = name.endsWith("$") ? name.slice(0, -1) : name;
    return { name: cleanName, dn: trimmed };
  }

  // 3. Check if input is a Canonical Path (e.g. inema.intranet/WORKSTATION/.../NB-INEMA-12440)
  if (trimmed.includes("/")) {
    const { name, dn } = canonicalPathToDN(trimmed, cfg.domain, cfg.baseDN);
    return { name, dn };
  }

  // 4. Default clean machine name
  const cleanName = trimmed.endsWith("$") ? trimmed.slice(0, -1) : trimmed;
  return { name: cleanName };
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

function computePastDateServer(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDemoComputers(domain: string = "inema.intranet") {
  return [
    {
      id: 'c1',
      name: 'SRV-DC-01',
      dnsHostName: `SRV-DC-01.${domain}`,
      operatingSystem: 'Windows Server 2022 Datacenter',
      operatingSystemVersion: '21H2 (Build 20348)',
      ou: 'OU=Domain Controllers,DC=inema,DC=intranet',
      lastLogon: computePastDateServer(0),
      pwdLastSet: computePastDateServer(30),
      status: 'Ativo',
      whenCreated: '2022-01-10',
      description: 'Controlador de Domínio Primário (PDC Emulator / GC)',
      ipAddress: '172.16.0.1',
      managedBy: 'admin.silva'
    },
    {
      id: 'c2',
      name: 'SRV-APP-PROD01',
      dnsHostName: `SRV-APP-PROD01.${domain}`,
      operatingSystem: 'Windows Server 2019 Standard',
      operatingSystemVersion: '1809 (Build 17763)',
      ou: 'OU=Servidores,OU=TI',
      lastLogon: computePastDateServer(2),
      pwdLastSet: computePastDateServer(45),
      status: 'Ativo',
      whenCreated: '2023-05-15',
      description: 'Servidor de Aplicações Internas e ERP',
      ipAddress: '172.16.0.25',
      managedBy: 'ana.santos'
    },
    {
      id: 'c3',
      name: 'SRV-BACKUP-01',
      dnsHostName: `SRV-BACKUP-01.${domain}`,
      operatingSystem: 'Windows Server 2016 Standard',
      operatingSystemVersion: '1607 (Build 14393)',
      ou: 'OU=Servidores,OU=TI',
      lastLogon: computePastDateServer(4),
      pwdLastSet: computePastDateServer(80),
      status: 'Ativo',
      whenCreated: '2021-08-20',
      description: 'Servidor de Backup Centralizado Veeam',
      ipAddress: '172.16.0.30',
      managedBy: 'gustavo.pinheiro'
    },
    {
      id: 'c4',
      name: 'SRV-LEGACY-FILE',
      dnsHostName: `SRV-LEGACY-FILE.${domain}`,
      operatingSystem: 'Windows Server 2008 R2 Enterprise',
      operatingSystemVersion: '6.1.7601 SP1',
      ou: 'OU=Servidores,OU=TI',
      lastLogon: computePastDateServer(285),
      pwdLastSet: computePastDateServer(310),
      status: 'Obsoleto',
      whenCreated: '2017-03-12',
      description: 'Servidor antigo de arquivos descontinuado - pendente desativação no AD',
      ipAddress: '172.16.0.98',
      managedBy: 'admin.silva'
    },
    {
      id: 'c5',
      name: 'WKS-TI-ANA01',
      dnsHostName: `WKS-TI-ANA01.${domain}`,
      operatingSystem: 'Windows 11 Pro',
      operatingSystemVersion: '23H2 (Build 22631)',
      ou: 'OU=Computadores,OU=TI',
      lastLogon: computePastDateServer(1),
      pwdLastSet: computePastDateServer(20),
      status: 'Ativo',
      whenCreated: '2024-03-20',
      description: 'Estação de Trabalho - Ana Santos (Infraestrutura)',
      ipAddress: '172.16.10.101',
      managedBy: 'ana.santos'
    },
    {
      id: 'c6',
      name: 'WKS-TI-DEV02',
      dnsHostName: `WKS-TI-DEV02.${domain}`,
      operatingSystem: 'Windows 11 Enterprise',
      operatingSystemVersion: '23H2 (Build 22631)',
      ou: 'OU=Computadores,OU=TI',
      lastLogon: computePastDateServer(14),
      pwdLastSet: computePastDateServer(40),
      status: 'Ativo',
      whenCreated: '2024-05-10',
      description: 'Estação Desenvolvimento Frontend',
      ipAddress: '172.16.10.102',
      managedBy: 'felipe.melo'
    },
    {
      id: 'c7',
      name: 'WKS-FIN-CARLOS',
      dnsHostName: `WKS-FIN-CARLOS.${domain}`,
      operatingSystem: 'Windows 10 Pro',
      operatingSystemVersion: '22H2 (Build 19045)',
      ou: 'OU=Computadores,OU=Financeiro',
      lastLogon: computePastDateServer(5),
      pwdLastSet: computePastDateServer(50),
      status: 'Ativo',
      whenCreated: '2023-01-15',
      description: 'Estação Coordenadoria Financeira',
      ipAddress: '172.16.20.15',
      managedBy: 'carlos.souza'
    },
    {
      id: 'c8',
      name: 'WKS-FIN-REC02',
      dnsHostName: `WKS-FIN-REC02.${domain}`,
      operatingSystem: 'Windows 10 Enterprise',
      operatingSystemVersion: '21H2',
      ou: 'OU=Computadores,OU=Financeiro',
      lastLogon: computePastDateServer(98),
      pwdLastSet: computePastDateServer(120),
      status: 'Obsoleto',
      whenCreated: '2022-11-04',
      description: 'Ponto fixo de recepção fiscal - colaborador transferido',
      ipAddress: '172.16.20.44',
      managedBy: 'carlos.souza'
    },
    {
      id: 'c9',
      name: 'WKS-RH-MARI',
      dnsHostName: `WKS-RH-MARI.${domain}`,
      operatingSystem: 'Windows 11 Pro',
      operatingSystemVersion: '23H2',
      ou: 'OU=Computadores,OU=RH',
      lastLogon: computePastDateServer(3),
      pwdLastSet: computePastDateServer(15),
      status: 'Ativo',
      whenCreated: '2024-06-12',
      description: 'Estação Mariana Costa (Recursos Humanos)',
      ipAddress: '172.16.30.22',
      managedBy: 'mariana.oliveira'
    },
    {
      id: 'c10',
      name: 'WKS-RH-ESTAGIO',
      dnsHostName: `WKS-RH-ESTAGIO.${domain}`,
      operatingSystem: 'Windows 10 Pro',
      operatingSystemVersion: '20H2',
      ou: 'OU=Computadores,OU=RH',
      lastLogon: computePastDateServer(142),
      pwdLastSet: computePastDateServer(160),
      status: 'Obsoleto',
      whenCreated: '2023-03-01',
      description: 'Mesa de estágio RH - vaga congelada há mais de 4 meses',
      ipAddress: '172.16.30.50',
      managedBy: 'mariana.oliveira'
    },
    {
      id: 'c11',
      name: 'NOTE-DIR-GABRIEL',
      dnsHostName: `NOTE-DIR-GABRIEL.${domain}`,
      operatingSystem: 'Windows 11 Pro for Workstations',
      operatingSystemVersion: '23H2',
      ou: 'OU=Computadores,OU=Diretoria',
      lastLogon: computePastDateServer(1),
      pwdLastSet: computePastDateServer(18),
      status: 'Ativo',
      whenCreated: '2023-08-10',
      description: 'Notebook Corporativo Dell XPS - Diretoria Operacional',
      ipAddress: '172.16.5.10',
      managedBy: 'gabriel.santos'
    },
    {
      id: 'c12',
      name: 'NOTE-VENDAS-04',
      dnsHostName: `NOTE-VENDAS-04.${domain}`,
      operatingSystem: 'Windows 10 Pro',
      operatingSystemVersion: '21H1',
      ou: 'OU=Computadores,OU=Comercial',
      lastLogon: computePastDateServer(218),
      pwdLastSet: computePastDateServer(230),
      status: 'Obsoleto',
      whenCreated: '2022-04-18',
      description: 'Notebook de campo - vendedor externo desligado',
      ipAddress: '172.16.40.75',
      managedBy: 'ricardo.ferreira'
    },
    {
      id: 'c13',
      name: 'WKS-COM-RICARDO',
      dnsHostName: `WKS-COM-RICARDO.${domain}`,
      operatingSystem: 'Windows 10 Enterprise',
      operatingSystemVersion: '21H2',
      ou: 'OU=Computadores,OU=Comercial',
      lastLogon: computePastDateServer(116),
      pwdLastSet: computePastDateServer(140),
      status: 'Obsoleto',
      whenCreated: '2022-09-05',
      description: 'Estação comercial Key Account sem atividade recente',
      ipAddress: '172.16.40.12',
      managedBy: 'ricardo.ferreira'
    },
    {
      id: 'c14',
      name: 'WKS-OP-LOG01',
      dnsHostName: `WKS-OP-LOG01.${domain}`,
      operatingSystem: 'Windows 10 IoT Enterprise',
      operatingSystemVersion: '1909',
      ou: 'OU=Computadores,OU=Operacoes',
      lastLogon: computePastDateServer(315),
      pwdLastSet: computePastDateServer(330),
      status: 'Obsoleto',
      whenCreated: '2021-06-25',
      description: 'Terminal de expedição galpão antigo',
      ipAddress: '172.16.50.88',
      managedBy: 'lucas.gomes'
    },
    {
      id: 'c15',
      name: 'WKS-DESK-ANTIGO',
      dnsHostName: `WKS-DESK-ANTIGO.${domain}`,
      operatingSystem: 'Windows 7 Professional',
      operatingSystemVersion: '6.1 SP1',
      ou: 'OU=Desativados',
      lastLogon: computePastDateServer(362),
      pwdLastSet: computePastDateServer(370),
      status: 'Desativado',
      whenCreated: '2016-11-20',
      description: 'Computador descontinuado por obsolescência de hardware',
      ipAddress: '172.16.99.11',
      managedBy: 'admin.silva'
    },
    {
      id: 'c16',
      name: 'VM-TESTE-QA',
      dnsHostName: `VM-TESTE-QA.${domain}`,
      operatingSystem: 'Windows 10 Enterprise LTSC',
      operatingSystemVersion: '21H2',
      ou: 'OU=Computadores,OU=TI',
      lastLogon: computePastDateServer(42),
      pwdLastSet: computePastDateServer(60),
      status: 'Ativo',
      whenCreated: '2024-01-15',
      description: 'Máquina Virtual de Homologação e Testes de GPO',
      ipAddress: '172.16.10.240',
      managedBy: 'ana.santos'
    },
    {
      id: 'c17',
      name: 'WKS-RECEP-01',
      dnsHostName: `WKS-RECEP-01.${domain}`,
      operatingSystem: 'Windows 10 Pro',
      operatingSystemVersion: '22H2',
      ou: 'OU=Computadores,OU=Geral',
      lastLogon: computePastDateServer(7),
      pwdLastSet: computePastDateServer(30),
      status: 'Ativo',
      whenCreated: '2023-09-01',
      description: 'Computador da Recepção Principal - Controle de Catracas',
      ipAddress: '172.16.60.10',
      managedBy: 'admin.silva'
    },
    {
      id: 'c18',
      name: 'LAPTOP-MKT-VINIC',
      dnsHostName: `LAPTOP-MKT-VINIC.${domain}`,
      operatingSystem: 'Windows 11 Pro',
      operatingSystemVersion: '22H2',
      ou: 'OU=Computadores,OU=Marketing',
      lastLogon: computePastDateServer(252),
      pwdLastSet: computePastDateServer(270),
      status: 'Obsoleto',
      whenCreated: '2022-10-15',
      description: 'Laptop Growth Marketing - colaborador em licença prolongada',
      ipAddress: '172.16.70.33',
      managedBy: 'vinicius.costa'
    },
    {
      id: 'c19',
      name: 'WKS-LEGACY-XP01',
      dnsHostName: `WKS-LEGACY-XP01.${domain}`,
      operatingSystem: 'Windows XP Professional',
      operatingSystemVersion: '5.1 SP3',
      ou: 'OU=Quarentena',
      lastLogon: 'Nunca',
      pwdLastSet: '2015-05-10',
      status: 'Desativado',
      whenCreated: '2015-05-10',
      description: 'Máquina fabril legada desativada no domínio',
      ipAddress: '172.16.99.99',
      managedBy: 'admin.silva'
    },
    {
      id: 'c20',
      name: 'WKS-TREINA-01',
      dnsHostName: `WKS-TREINA-01.${domain}`,
      operatingSystem: 'Windows 10 Pro',
      operatingSystemVersion: '21H2',
      ou: 'OU=Computadores,OU=RH',
      lastLogon: computePastDateServer(368),
      pwdLastSet: computePastDateServer(380),
      status: 'Obsoleto',
      whenCreated: '2020-04-12',
      description: 'Sala de treinamento - sem uso há mais de 1 ano',
      ipAddress: '172.16.30.80',
      managedBy: 'mariana.oliveira'
    },
    {
      id: 'c21',
      name: 'WKS-ENG-PROJ03',
      dnsHostName: `WKS-ENG-PROJ03.${domain}`,
      operatingSystem: 'Windows 11 Pro',
      operatingSystemVersion: '23H2 (Build 22631)',
      ou: 'OU=Computadores,OU=Engenharia',
      lastLogon: computePastDateServer(242),
      pwdLastSet: computePastDateServer(260),
      status: 'Ativo',
      whenCreated: '2023-09-15',
      description: 'Estação de trabalho CAD/Projetos - analista em licença médica prolongada',
      ipAddress: '172.16.80.14',
      managedBy: 'admin.silva'
    },
    {
      id: 'c22',
      name: 'WKS-ATEND-02',
      dnsHostName: `WKS-ATEND-02.${domain}`,
      operatingSystem: 'Windows 10 Pro',
      operatingSystemVersion: '22H2',
      ou: 'OU=Computadores,OU=Atendimento',
      lastLogon: computePastDateServer(245),
      pwdLastSet: computePastDateServer(270),
      status: 'Ativo',
      whenCreated: '2022-12-01',
      description: 'Ponto fixo de atendimento presencial - guichê desativado sem baixa no AD',
      ipAddress: '172.16.60.25',
      managedBy: 'carlos.souza'
    },
    {
      id: 'c23',
      name: 'NOTE-CONSULT-04',
      dnsHostName: `NOTE-CONSULT-04.${domain}`,
      operatingSystem: 'Windows 11 Enterprise',
      operatingSystemVersion: '22H2',
      ou: 'OU=Computadores,OU=Consultoria',
      lastLogon: computePastDateServer(258),
      pwdLastSet: computePastDateServer(280),
      status: 'Ativo',
      whenCreated: '2023-04-10',
      description: 'Notebook institucional cedido a auditoria externa finalizada',
      ipAddress: '172.16.40.90',
      managedBy: 'ana.santos'
    },
    {
      id: 'c24',
      name: 'SRV-TESTE-LEG01',
      dnsHostName: `SRV-TESTE-LEG01.${domain}`,
      operatingSystem: 'Windows Server 2012 R2 Standard',
      operatingSystemVersion: '6.3 (Build 9600)',
      ou: 'OU=Servidores,OU=TI',
      lastLogon: computePastDateServer(272),
      pwdLastSet: computePastDateServer(300),
      status: 'Ativo',
      whenCreated: '2019-11-20',
      description: 'Servidor legado de testes de homologação - sem comunicação com PDC há mais de 8 meses',
      ipAddress: '172.16.0.77',
      managedBy: 'admin.silva'
    },
    {
      id: 'NB-INEMA-12440',
      name: 'NB-INEMA-12440',
      dnsHostName: `NB-INEMA-12440.${domain}`,
      operatingSystem: 'Windows 11 Enterprise',
      operatingSystemVersion: '23H2 (Build 22631)',
      ou: 'NOTEBOOKS/ZOOLOGICO/UR-PARQUES-POSTOS AVANCADOS/WORKSTATION',
      canonicalPath: `${domain}/WORKSTATION/UR-PARQUES-POSTOS AVANCADOS/ZOOLOGICO/NOTEBOOKS/NB-INEMA-12440`,
      dn: `CN=NB-INEMA-12440,OU=NOTEBOOKS,OU=ZOOLOGICO,OU=UR-PARQUES-POSTOS AVANCADOS,OU=WORKSTATION,DC=inema,DC=intranet`,
      lastLogon: computePastDateServer(124),
      pwdLastSet: computePastDateServer(124),
      status: 'Obsoleto',
      whenCreated: '2023-08-10',
      description: 'Notebook de campo - Zoológico / Postos Avançados (Usuário: roberto.almeida)',
      ipAddress: '172.16.45.112',
      managedBy: 'roberto.almeida',
      lastUser: 'roberto.almeida'
    }
  ].map(comp => ({
    ...comp,
    lastUser: (comp as any).lastUser || comp.managedBy || (comp.name.startsWith('SRV') ? 'SYSTEM (Servidor)' : 'admin.silva')
  }));
}

// Ensure local database exists for simulation
if (!fs.existsSync(DATABASE_PATH)) {
  const defaultDB = {
    users: initialUsers,
    computers: getDemoComputers(),
    logs: []
  };
  fs.writeFileSync(DATABASE_PATH, JSON.stringify(defaultDB, null, 2), "utf8");
}

function readDatabase() {
  try {
    const data = fs.readFileSync(DATABASE_PATH, "utf8");
    const db = JSON.parse(data);
    let modified = false;

    if (!db.computers || !Array.isArray(db.computers) || db.computers.length < 24) {
      db.computers = getDemoComputers(readConfig().domain);
      modified = true;
    }

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
    return { users: initialUsers, computers: getDemoComputers(), logs: [] };
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
      computerInactivityDays: cfg.computerInactivityDays !== undefined ? cfg.computerInactivityDays : 90,
      functionalLevel: cfg.functionalLevel || "Windows Server 2012"
    },
    connected: test.success,
    error: test.error
  });
});

// 2. Save AD Connection Config
app.post("/api/ad/save-config", async (req, res) => {
  const { url, baseDN, username, password, domain, useDemoMode, inactivityDays, computerInactivityDays, functionalLevel } = req.body;
  const current = readConfig();
  
  const updated = {
    url: url !== undefined ? url : current.url,
    baseDN: baseDN !== undefined ? baseDN : current.baseDN,
    username: username !== undefined ? username : current.username,
    password: (password !== undefined && password !== "") ? password : current.password,
    domain: domain !== undefined ? domain : current.domain,
    useDemoMode: useDemoMode !== undefined ? useDemoMode : current.useDemoMode,
    inactivityDays: inactivityDays !== undefined ? inactivityDays : (current.inactivityDays !== undefined ? current.inactivityDays : 90),
    computerInactivityDays: computerInactivityDays !== undefined ? computerInactivityDays : (current.computerInactivityDays !== undefined ? current.computerInactivityDays : 90),
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
      computerInactivityDays: updated.computerInactivityDays,
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
    'memberOf', 'telephoneNumber', 'objectGUID', 'lockoutTime', 'scriptPath', 'primaryGroupID'
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
      const userCannotChangePassword = (uac & 0x0040) !== 0;

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
      let isDomainAdmin = (user.primaryGroupID && String(user.primaryGroupID) === "512");

      if (user.memberOf) {
        const rawGroups = Array.isArray(user.memberOf) ? user.memberOf : [user.memberOf];
        rawGroups.forEach((dn: any) => {
          if (dn && typeof dn === "string") {
            const match = dn.match(/^CN=([^,]+)/i);
            const groupName = match ? match[1] : dn;
            if (groupName) {
              const lower = groupName.toLowerCase();
              const isVar = lower === "domain admins" || 
                            lower === "admins. do domínio" || 
                            lower === "admins do domínio" || 
                            lower === "admins do dominio" || 
                            lower === "administradores do domínio" ||
                            lower === "administradores do dominio";
              const isDomainUserVar = lower === "domain users" || 
                                      lower === "usuários do domínio" || 
                                      lower === "usuarios do domínio" || 
                                      lower === "usuarios do dominio" || 
                                      lower === "utilizadores do domínio" || 
                                      lower === "utilizadores do dominio";
              if (isVar) {
                isDomainAdmin = true;
              } else if (isDomainUserVar) {
                // Ignore variations to consolidate into "Usuários do Domínio"
              } else {
                if (!memberOfList.includes(groupName)) {
                  memberOfList.push(groupName);
                }
              }
            }
          }
        });
      }

      if (isDomainAdmin) {
        if (!memberOfList.includes("Administradores do Domínio")) {
          memberOfList.push("Administradores do Domínio");
        }
      }

      // Add default domain users group (AD primary groups aren't usually in memberOf)
      if (!memberOfList.includes("Usuários do Domínio")) {
        memberOfList.push("Usuários do Domínio");
      }

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

    const modifications: any[] = [
      new ldap.Change({
        operation: "replace",
        modification: {
          type: "userAccountControl",
          values: [String(uac)]
        }
      })
    ];

    if (updatedUser.department) {
      modifications.push(new ldap.Change({
        operation: "replace",
        modification: {
          type: "department",
          values: [String(updatedUser.department)]
        }
      }));
    }
    if (updatedUser.title) {
      modifications.push(new ldap.Change({
        operation: "replace",
        modification: {
          type: "title",
          values: [String(updatedUser.title)]
        }
      }));
    }
    if (updatedUser.phone) {
      modifications.push(new ldap.Change({
        operation: "replace",
        modification: {
          type: "telephoneNumber",
          values: [String(updatedUser.phone)]
        }
      }));
    }

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
          type: "unicodePwd",
          values: [buffer]
        }
      }),
      new ldap.Change({
        operation: "replace",
        modification: {
          type: "pwdLastSet",
          values: ["0"] // Forces 'Must Change Password on Next Logon'
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
  try {
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
      
      try {
        // 2. Search for OUs, Containers and Domain root to map linked GPOs
        adInstance.find({
          filter: '(|(objectClass=organizationalUnit)(objectClass=domainDNS)(objectClass=container))',
          attributes: ['distinguishedName', 'dn', 'gPLink']
        }, (err2: any, results2: any) => {
          if (err2) {
            console.error("Erro ao buscar vínculos de GPOs no AD (err2):", err2);
            // Fallback to demo GPOs if OU query fails due to permission degradation or other issues
            const demoGPOs = generateDemoGPOs();
            return res.json(demoGPOs);
          }

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
      } catch (innerErr) {
        console.error("Erro interno ao processar vínculos de GPOs:", innerErr);
        const demoGPOs = generateDemoGPOs();
        return res.json(demoGPOs);
      }
    });
  } catch (error) {
    console.error("Erro geral no endpoint de GPOs:", error);
    const demoGPOs = generateDemoGPOs();
    return res.json(demoGPOs);
  }
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

// ==========================================
// AD COMPUTERS ENDPOINTS (Real AD / Simulation)
// ==========================================

// GET /api/ad/computers
app.get("/api/ad/computers", async (req, res) => {
  const cfg = readConfig();

  // If demo mode is explicitly enabled, return the simulation database
  if (cfg.useDemoMode) {
    const db = readDatabase();
    return res.json(db.computers || []);
  }

  // Real AD query for computer objects
  try {
    const adInstance = new ActiveDirectory({
      url: cfg.url,
      baseDN: cfg.baseDN,
      username: cfg.username,
      password: cfg.password,
      connectTimeout: 5000
    });

    const compAttributes = [
      "dn",
      "distinguishedName",
      "cn",
      "sAMAccountName",
      "dNSHostName",
      "operatingSystem",
      "operatingSystemVersion",
      "lastLogonTimestamp",
      "lastLogon",
      "pwdLastSet",
      "whenCreated",
      "userAccountControl",
      "description",
      "managedBy",
      "objectGUID",
      "objectSid",
      "canonicalName",
      "ipHostNumber",
      "networkAddress",
      "comment",
      "location"
    ];

    // Query computers using AD filter (&(objectCategory=computer)(sAMAccountName=*))
    adInstance.find(
      {
        filter: "(&(objectCategory=computer)(sAMAccountName=*))",
        attributes: compAttributes,
        paged: { pageSize: 1000 }
      },
      (err: any, results: any) => {
        if (err) {
          console.error("Erro ao buscar computadores no Active Directory real:", err.message || err);
          return res.status(503).json({
            error: `Erro ao buscar computadores no Active Directory (${cfg.url}): ${err.message || err}`,
            connected: false,
            isRealAD: true,
            computers: []
          });
        }

        const rawList = Array.isArray(results)
          ? results
          : [...(results?.other || []), ...(results?.users || [])];

        const seenNames = new Set<string>();
        const mappedComputers: any[] = [];

        for (let idx = 0; idx < rawList.length; idx++) {
          const comp = rawList[idx];
          const rawName = comp.sAMAccountName || comp.samaccountname || comp.cn || "";
          if (!rawName) continue;

          // Strip trailing dollar sign convention from AD machine accounts
          const cleanName = rawName.endsWith("$") ? rawName.slice(0, -1) : rawName;
          const lowerName = cleanName.toLowerCase();
          if (seenNames.has(lowerName)) continue;
          seenNames.add(lowerName);

          const uac = parseInt(comp.userAccountControl || comp.useraccountcontrol || "4096", 10);
          const isCompDisabled = (uac & 0x0002) !== 0;

          const actualLogon = getActualLastLogon(
            comp.lastLogonTimestamp || comp.lastlogontimestamp,
            comp.lastLogon || comp.lastlogon
          );
          const lastLogonValue = actualLogon === "0" ? "Nunca" : safeParseDate(actualLogon, "Nunca");

          let status: "Ativo" | "Obsoleto" | "Desativado" = "Ativo";
          if (isCompDisabled) {
            status = "Desativado";
          }

          let fullDN = comp.dn || comp.distinguishedName || comp.distinguishedname || "";
          if (!fullDN && comp.dn?.toString) {
            fullDN = comp.dn.toString();
          }

          let guid = fullDN || cleanName;
          if (comp.objectGUID || comp.objectguid) {
            const og = comp.objectGUID || comp.objectguid;
            if (Buffer.isBuffer(og)) {
              guid = og.toString("hex");
            } else {
              guid = String(og);
            }
          } else if (comp.objectSid || comp.objectsid) {
            const os = comp.objectSid || comp.objectsid;
            guid = String(os);
          }

          let canonicalPath = comp.canonicalName || comp.canonicalname || "";
          if (!canonicalPath && fullDN) {
            canonicalPath = dnToCanonicalPath(fullDN, cfg.domain);
          }

          const ouDisplay = extractOU(fullDN, "Computadores");

          const fqdn = comp.dNSHostName || comp.dnshostname || `${cleanName}.${cfg.domain}`;
          asyncLookupHost(fqdn);

          // 1. IP resolution: check AD attribute, regex in description/comment, or DNS cache
          let ipAddress = comp.ipHostNumber || comp.iphostnumber || comp.networkAddress || comp.networkaddress || "";
          if (Array.isArray(ipAddress)) ipAddress = ipAddress[0];
          ipAddress = String(ipAddress || "").trim();

          if (!ipAddress && (comp.description || comp.comment)) {
            const combinedText = `${comp.description || ""} ${comp.comment || ""}`;
            const ipMatch = combinedText.match(/\b(?:10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}\b/);
            if (ipMatch) {
              ipAddress = ipMatch[0];
            }
          }

          if (!ipAddress) {
            if (dnsIpCache.has(fqdn)) {
              ipAddress = dnsIpCache.get(fqdn)!;
            } else {
              ipAddress = "Dinâmico (DHCP)";
            }
          }

          const osName = comp.operatingSystem || comp.operatingsystem || "Windows Workstation";

          // Update memory cache for this computer so any future operation resolves instantly
          const cacheEntry: CachedADComputer = {
            name: cleanName,
            dn: fullDN,
            guid: guid,
            canonicalPath: canonicalPath,
            userAccountControl: uac,
            ipAddress: cleanValidIp(ipAddress),
            operatingSystem: osName
          };
          globalComputersCache.set(cleanName.toLowerCase(), cacheEntry);
          globalComputersCache.set(`${cleanName.toLowerCase()}$`, cacheEntry);
          if (guid) globalComputersCache.set(guid.toLowerCase(), cacheEntry);
          if (fullDN) globalComputersCache.set(fullDN.toLowerCase(), cacheEntry);
          if (canonicalPath) globalComputersCache.set(canonicalPath.toLowerCase(), cacheEntry);

          // 2. Last logged / assigned user extraction
          let lastUser = "";
          if (comp.managedBy || comp.managedby) {
            const mb = String(comp.managedBy || comp.managedby);
            const cnMatch = mb.match(/CN\s*=\s*([^,]+)/i);
            lastUser = cnMatch ? cnMatch[1].trim() : mb.trim();
          }

          if (!lastUser && comp.description) {
            const desc = String(comp.description);
            const userMatch = desc.match(/(?:usu[aá]rio|user|respons[aá]vel|colaborador)\s*[:=-]?\s*([a-zA-ZÀ-ÿ0-9._\s-]+)/i)
                           || desc.match(/-\s*([a-zA-ZÀ-ÿ0-9._\s-]+)$/i);
            if (userMatch) {
              lastUser = userMatch[1].trim();
            }
          }

          if (!lastUser) {
            if (cleanName.toLowerCase().startsWith("srv")) {
              lastUser = "SYSTEM (Servidor)";
            } else {
              lastUser = "Não registrado";
            }
          }

          mappedComputers.push({
            id: cleanName, // CRITICAL: Always use machine name (e.g. NB-INEMA-12440), never raw SID/GUID
            name: cleanName,
            guid: guid,
            dnsHostName: fqdn,
            operatingSystem: comp.operatingSystem || comp.operatingsystem || "Windows Workstation",
            operatingSystemVersion: comp.operatingSystemVersion || comp.operatingsystemversion || "",
            ou: ouDisplay,
            dn: fullDN,
            distinguishedName: fullDN,
            canonicalPath: canonicalPath,
            userAccountControl: uac,
            lastLogon: lastLogonValue,
            pwdLastSet: safeParseDate(comp.pwdLastSet || comp.pwdlastset, "Nunca"),
            status,
            whenCreated: safeParseDate(comp.whenCreated || comp.whencreated, "2024-01-01"),
            description: comp.description || `Computador registrado no domínio ${cfg.domain}`,
            ipAddress: ipAddress,
            managedBy: comp.managedBy || comp.managedby || "",
            lastUser: lastUser
          });
        }

        // Return the real computers list
        res.json(mappedComputers);
      }
    );
  } catch (error: any) {
    console.error("Exceção na consulta de computadores AD:", error);
    res.status(503).json({
      error: `Exceção ao conectar no Active Directory (${cfg.url}): ${error.message || error}`,
      connected: false,
      isRealAD: true,
      computers: []
    });
  }
});

/**
 * Helper to dynamically locate a computer by name/DN and update its userAccountControl in Active Directory
 */
/**
 * Helper to dynamically locate a computer by name, DN, canonical path, or SID/GUID
 * and update its userAccountControl in Active Directory
 */
async function disableOrEnableComputerInAD(
  cfg: any,
  computerIdentifier: string,
  knownDN: string | undefined,
  disable: boolean
): Promise<{ success: boolean; dn?: string; uac?: number; error?: string }> {
  return new Promise((resolve) => {
    let resolved = false;
    const safeResolve = (res: { success: boolean; dn?: string; uac?: number; error?: string }) => {
      if (!resolved) {
        resolved = true;
        resolve(res);
      }
    };

    // 1. Resolve identifier to clean computer name and DN
    const info = resolveComputerIdentifier(computerIdentifier, cfg);
    const cleanName = info.name || (computerIdentifier.endsWith("$") ? computerIdentifier.slice(0, -1) : computerIdentifier);
    let targetDN = (knownDN && knownDN.includes("DC=")) 
      ? knownDN 
      : (info.dn && info.dn.includes("DC=") ? info.dn : null);

    const client = ldap.createClient({ url: cfg.url, connectTimeout: 6000 });

    client.on("error", (err: any) => {
      console.warn("Erro de conexão no cliente LDAP durante desativação de máquina:", err.message);
      safeResolve({ success: false, error: "Erro de conexão com Active Directory: " + err.message });
    });

    client.bind(cfg.username, cfg.password, (bindErr: any) => {
      if (bindErr) {
        try { client.destroy(); } catch (_) {}
        return safeResolve({
          success: false,
          error: `Falha na autenticação (Bind) com o AD: ${bindErr.message}. Verifique as permissões de ${cfg.username}`
        });
      }

      // Execution helper to modify userAccountControl attribute
      const executeModify = (dnToModify: string, currentUacVal: any) => {
        try {
          let currentUac = 4096;
          if (Array.isArray(currentUacVal)) {
            currentUac = parseInt(String(currentUacVal[0]), 10) || 4096;
          } else if (currentUacVal !== undefined && currentUacVal !== null) {
            currentUac = parseInt(String(currentUacVal), 10) || 4096;
          }

          // Bit 2 (0x0002) is ACCOUNTDISABLE
          const newUac = disable ? (currentUac | 2) : (currentUac & ~2);

          const change = new ldap.Change({
            operation: "replace",
            modification: {
              type: "userAccountControl",
              values: [String(newUac)]
            }
          });

          client.modify(dnToModify, [change], (modErr: any) => {
            try { client.destroy(); } catch (_) {}
            if (modErr) {
              let errMsg = modErr.message || String(modErr);
              if (modErr.code === 50 || errMsg.toLowerCase().includes("insufficient access")) {
                errMsg = `Permissão negada no Active Directory (Código 50: Insufficient Access Rights). O usuário '${cfg.username}' não possui direitos de escrita para desativar/modificar contas de computador na OU '${dnToModify}'. Delegue permissão de redefinir/desativar conta no AD.`;
              }
              console.error(`Erro ao modificar userAccountControl para ${dnToModify}:`, errMsg);
              return safeResolve({ success: false, dn: dnToModify, error: errMsg });
            }

            console.log(`Conta de computador ${cleanName} (${dnToModify}) ${disable ? 'desativada' : 'reativada'} com sucesso no AD. Novo UAC: ${newUac}`);

            // Update memory cache
            const existing = globalComputersCache.get(cleanName.toLowerCase());
            if (existing) {
              existing.userAccountControl = newUac;
            }

            safeResolve({ success: true, dn: dnToModify, uac: newUac });
          });
        } catch (modifyEx: any) {
          try { client.destroy(); } catch (_) {}
          console.error("Exceção ao executar modify no AD:", modifyEx);
          safeResolve({ success: false, error: "Exceção ao modificar objeto no AD: " + (modifyEx.message || modifyEx) });
        }
      };

      // Subtree search across baseDN if targetDN is not directly verified
      const doSubtreeSearch = () => {
        const searchFilter = `(&(objectCategory=computer)(|(sAMAccountName=${cleanName}$)(sAMAccountName=${cleanName})(cn=${cleanName})))`;
        const searchOpts = {
          filter: searchFilter,
          scope: "sub",
          attributes: ["dn", "distinguishedName", "userAccountControl", "sAMAccountName", "cn"]
        };

        client.search(cfg.baseDN, searchOpts, (searchErr: any, searchRes: any) => {
          if (searchErr) {
            try { client.destroy(); } catch (_) {}
            return safeResolve({ success: false, error: "Erro na busca do computador no AD: " + searchErr.message });
          }

          let foundEntry: any = null;
          searchRes.on("searchEntry", (entry: any) => {
            foundEntry = entry.object;
          });

          searchRes.on("error", (sErr: any) => {
            try { client.destroy(); } catch (_) {}
            safeResolve({ success: false, error: "Erro ao localizar objeto de computador no AD: " + sErr.message });
          });

          searchRes.on("end", () => {
            const finalDN = foundEntry?.dn || foundEntry?.distinguishedName || targetDN;
            if (!finalDN) {
              try { client.destroy(); } catch (_) {}
              return safeResolve({
                success: false,
                error: `Computador '${cleanName}' não foi localizado no domínio (${cfg.baseDN}). Verifique se a conta existe no AD.`
              });
            }

            const currentUac = parseInt(foundEntry?.userAccountControl || String(info.uac || "4096"), 10);
            executeModify(finalDN, currentUac);
          });
        });
      };

      // If we already have a valid targetDN (e.g. from canonical path or cache), verify it with a quick base search
      if (targetDN) {
        client.search(
          targetDN,
          { scope: "base", attributes: ["dn", "distinguishedName", "userAccountControl", "sAMAccountName", "cn"] },
          (baseErr: any, baseRes: any) => {
            if (baseErr) {
              return doSubtreeSearch();
            }
            let baseEntry: any = null;
            baseRes.on("searchEntry", (entry: any) => {
              baseEntry = entry.object;
            });
            baseRes.on("error", () => {
              doSubtreeSearch();
            });
            baseRes.on("end", () => {
              if (baseEntry) {
                const uac = parseInt(baseEntry.userAccountControl || String(info.uac || "4096"), 10);
                executeModify(targetDN!, uac);
              } else {
                doSubtreeSearch();
              }
            });
          }
        );
      } else {
        doSubtreeSearch();
      }
    });
  });
}

// POST /api/ad/computers/update
app.post("/api/ad/computers/update", async (req, res) => {
  const { id, updatedComputer, operator } = req.body;
  const cfg = readConfig();

  if (cfg.useDemoMode) {
    const db = readDatabase();
    if (Array.isArray(db.computers)) {
      db.computers = db.computers.map((c: any) => 
        (c.id === id || c.name === updatedComputer?.name) ? { ...c, ...updatedComputer } : c
      );
    }

    db.logs.unshift({
      id: "log_" + Date.now(),
      timestamp: getBrazilTimestamp(),
      operator: operator || "admin.silva",
      action: updatedComputer.status === 'Desativado' ? "Desativação de Computador" : "Modificação de Computador",
      targetUser: updatedComputer.name || id,
      details: `Conta de máquina ${updatedComputer.name} atualizada no AD (Modo Simulação). Status: ${updatedComputer.status}. Motivo: Gestão de Ativos Obsoletos.`,
      type: updatedComputer.status === 'Desativado' ? "danger" : "info"
    });

    writeDatabase(db);
    return res.json({ success: true, computer: updatedComputer });
  }

  // Real Active Directory modification
  const compName = updatedComputer?.name || id;
  const compDN = updatedComputer?.dn || updatedComputer?.distinguishedName;
  const shouldDisable = updatedComputer?.status === 'Desativado';

  const result = await disableOrEnableComputerInAD(cfg, compName, compDN, shouldDisable);

  if (!result.success) {
    console.error("Falha ao modificar computador no AD Real:", result.error);
    return res.status(500).json({ 
      success: false, 
      error: result.error || "Não foi possível desativar a conta de computador no Active Directory." 
    });
  }

  // Record audit log
  const db = readDatabase();
  db.logs.unshift({
    id: "log_" + Date.now(),
    timestamp: getBrazilTimestamp(),
    operator: operator || cfg.username || "sistemas.infra",
    action: shouldDisable ? "Desativação de Computador no AD Real" : "Reativação de Computador no AD Real",
    targetUser: compName,
    details: `Conta de máquina ${compName} (${result.dn}) foi ${shouldDisable ? 'desativada' : 'reativada'} com sucesso no controlador de domínio (${cfg.domain}). UAC: ${result.uac}.`,
    type: shouldDisable ? "danger" : "success"
  });
  writeDatabase(db);

  return res.json({ 
    success: true, 
    computer: { ...updatedComputer, dn: result.dn, status: shouldDisable ? 'Desativado' : 'Ativo' },
    message: `Conta de máquina ${compName} ${shouldDisable ? 'desativada' : 'reativada'} com sucesso no Active Directory!`
  });
});

// POST /api/ad/computers/disable-batch
app.post("/api/ad/computers/disable-batch", async (req, res) => {
  const { ids, computers: compObjects, operator } = req.body;
  const cfg = readConfig();

  if (cfg.useDemoMode) {
    const db = readDatabase();
    const idSet = new Set(ids || []);

    if (Array.isArray(db.computers)) {
      db.computers = db.computers.map((c: any) => {
        if (idSet.has(c.id) || idSet.has(c.name)) {
          return { ...c, status: 'Desativado' };
        }
        return c;
      });
    }

    db.logs.unshift({
      id: "log_" + Date.now(),
      timestamp: getBrazilTimestamp(),
      operator: operator || "admin.silva",
      action: "Desativação em Lote de Computadores",
      targetUser: `${ids?.length || 0} computadores`,
      details: `${ids?.length || 0} computadores obsoletos foram desativados em lote pela política de inatividade do AD (Modo Simulação).`,
      type: "warning"
    });

    writeDatabase(db);
    return res.json({ success: true, count: ids?.length || 0 });
  }

  // Real Active Directory Batch Disable
  const itemsToProcess: Array<{ identifier: string; knownDN?: string }> = [];

  if (Array.isArray(compObjects) && compObjects.length > 0) {
    for (const c of compObjects) {
      const name = c.name || c.id;
      const dn = c.dn || c.distinguishedName;
      itemsToProcess.push({ identifier: name, knownDN: dn });
    }
  } else if (Array.isArray(ids)) {
    for (const id of ids) {
      itemsToProcess.push({ identifier: id });
    }
  }

  const results: any[] = [];
  const errors: string[] = [];

  for (const item of itemsToProcess) {
    const resDisable = await disableOrEnableComputerInAD(cfg, item.identifier, item.knownDN, true);
    if (resDisable.success) {
      results.push({ name: item.identifier, dn: resDisable.dn });
    } else {
      errors.push(`${item.identifier}: ${resDisable.error}`);
    }
  }

  // Record audit log
  const db = readDatabase();
  db.logs.unshift({
    id: "log_" + Date.now(),
    timestamp: getBrazilTimestamp(),
    operator: operator || cfg.username || "sistemas.infra",
    action: "Desativação em Lote no AD Real",
    targetUser: `${results.length} computadores`,
    details: `${results.length} computadores obsoletos foram desativados com sucesso no domínio ${cfg.domain}.${errors.length > 0 ? ` Erros (${errors.length}): ${errors.join("; ")}` : ""}`,
    type: errors.length > 0 ? "warning" : "danger"
  });
  writeDatabase(db);

  if (results.length === 0 && errors.length > 0) {
    return res.status(500).json({ 
      success: false, 
      count: 0, 
      error: `Falha ao desativar computadores no Active Directory: ${errors[0]}`,
      errors 
    });
  }

  return res.json({ 
    success: true, 
    count: results.length, 
    failedCount: errors.length,
    errors: errors.length > 0 ? errors : undefined 
  });
});



// ==========================================
// MENSAGERIA & POP-UPS EM TEMPO REAL + SCHEDULER + POWERSHELL
// ==========================================

interface ServerBroadcastMessage {
  id: string;
  title: string;
  body: string;
  urgency: "info" | "warning" | "urgent";
  category: string;
  sender: string;
  targetMode: "all" | "selected";
  targetMachines: string[];
  onlyActiveMachines?: boolean;
  requireAck: boolean;
  playSound: boolean;
  autoCloseSeconds: number;
  deliveryMethod: "msg_exe" | "winrm";
  targetIpMap?: Record<string, string>;
  fallbackComputers?: Array<{ name: string; ipAddress?: string; operatingSystem?: string; status?: string }>;
  scheduleType: "immediate" | "once" | "daily" | "weekly" | "monthly";
  scheduledAt?: string;
  recurrenceTime?: string;
  recurrenceDays?: number[];
  status: "enviada" | "agendada" | "pausada" | "cancelada";
  createdAt: string;
  sentAt?: string;
  nextRunAt?: string;
  runCount: number;
  receipts: Array<{
    machineName: string;
    ipAddress?: string;
    status: "pendente" | "entregue" | "confirmada" | "falha";
    deliveredAt?: string;
    acknowledgedAt?: string;
    acknowledgedBy?: string;
    errorDetail?: string;
  }>;
  gatewayDispatchedAt?: string;
}

interface WsClientMeta {
  ws: WebSocket;
  clientId: string;
  machineName: string;
  username: string;
  role: "workstation" | "console";
  ip: string;
  connectedAt: string;
}

interface PollingAgentMeta {
  clientId: string;
  machineName: string;
  username: string;
  ip: string;
  connectedAt: string;
  lastSeenMs: number;
  lastSeenAt: string;
  isGateway?: boolean;
}

const connectedWsClients = new Map<string, WsClientMeta>();
const connectedPollingAgents = new Map<string, PollingAgentMeta>();
const connectedMsgGateways = new Map<string, PollingAgentMeta>();
const pendingGatewayMessageIds = new Set<string>();
const sseClients = new Map<string, { res: express.Response; machineName: string }>();

function normalizeHostKey(name?: string): string {
  return String(name || "").trim().split(".")[0].toUpperCase();
}

function cleanupExpiredPollingAgents(): boolean {
  const now = Date.now();
  let changed = false;
  for (const [key, meta] of connectedPollingAgents.entries()) {
    if (now - meta.lastSeenMs > 45000) {
      connectedPollingAgents.delete(key);
      changed = true;
    }
  }
  for (const [key, meta] of connectedMsgGateways.entries()) {
    if (now - meta.lastSeenMs > 45000) {
      connectedMsgGateways.delete(key);
      changed = true;
    }
  }
  return changed;
}

function readMessages(): ServerBroadcastMessage[] {
  try {
    if (!fs.existsSync(MESSAGES_PATH)) {
      const initialMessages: ServerBroadcastMessage[] = [];
      fs.writeFileSync(MESSAGES_PATH, JSON.stringify(initialMessages, null, 2), "utf8");
      return initialMessages;
    }
    const raw = fs.readFileSync(MESSAGES_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("Erro ao ler ad_messages.json:", err);
    return [];
  }
}

function writeMessages(messages: ServerBroadcastMessage[]) {
  try {
    fs.writeFileSync(MESSAGES_PATH, JSON.stringify(messages, null, 2), "utf8");
    return true;
  } catch (err) {
    console.error("Erro ao gravar ad_messages.json:", err);
    return false;
  }
}

function getConnectedWorkstationsSnapshot() {
  cleanupExpiredPollingAgents();
  const list: Array<{
    clientId: string;
    machineName: string;
    username: string;
    role: "workstation" | "console";
    channel: "websocket" | "powershell_agent" | "msg_gateway";
    ip: string;
    connectedAt: string;
    lastSeenAt?: string;
  }> = [];

  const seenWorkstations = new Set<string>();

  for (const c of connectedWsClients.values()) {
    if (c.role === "workstation" && c.machineName) {
      seenWorkstations.add(normalizeHostKey(c.machineName));
    }
    list.push({
      clientId: c.clientId,
      machineName: c.machineName,
      username: c.username,
      role: c.role,
      channel: "websocket",
      ip: c.ip,
      connectedAt: c.connectedAt
    });
  }

  for (const agent of connectedPollingAgents.values()) {
    const key = normalizeHostKey(agent.machineName);
    if (!seenWorkstations.has(key)) {
      seenWorkstations.add(key);
      list.push({
        clientId: agent.clientId,
        machineName: agent.machineName,
        username: agent.username,
        role: "workstation",
        channel: "powershell_agent",
        ip: agent.ip,
        connectedAt: agent.connectedAt,
        lastSeenAt: agent.lastSeenAt
      });
    }
  }

  for (const gw of connectedMsgGateways.values()) {
    list.push({
      clientId: gw.clientId,
      machineName: gw.machineName,
      username: gw.username,
      role: "workstation",
      channel: "msg_gateway",
      ip: gw.ip,
      connectedAt: gw.connectedAt,
      lastSeenAt: gw.lastSeenAt
    });
  }

  return list;
}

function isKnownWindowsServerMachine(machineName?: string): boolean {
  if (!machineName) return false;
  const keyLower = machineName.trim().split(".")[0].toLowerCase();
  const cached = globalComputersCache.get(keyLower);
  if (cached && isWindowsServerOS(cached.operatingSystem)) return true;
  const db = readDatabase();
  const dbComp = (db.computers || []).find(
    (c: any) => String(c.name || "").trim().split(".")[0].toLowerCase() === keyLower
  );
  if (dbComp && isWindowsServerOS(dbComp.operatingSystem)) return true;
  return false;
}

function broadcastWsEvent(eventType: string, payload: any, targetMode?: "all" | "selected", targetMachines?: string[]) {
  const dataStr = JSON.stringify({ type: eventType, payload });
  const targetSet = targetMachines && targetMachines.length > 0
    ? new Set(targetMachines.map((m) => normalizeHostKey(m)))
    : null;

  for (const client of connectedWsClients.values()) {
    if (client.ws.readyState !== WebSocket.OPEN) continue;

    if (eventType === "message:broadcast") {
      const mUpper = normalizeHostKey(client.machineName);
      if (targetMode === "selected" && targetSet) {
        if (client.role === "workstation" && mUpper !== "ALL" && !targetSet.has(mUpper)) {
          continue;
        }
      } else if (targetMode === "all" && client.role === "workstation") {
        if (isKnownWindowsServerMachine(client.machineName)) {
          continue;
        }
      }
    }

    try {
      client.ws.send(dataStr);
    } catch (e) {
      // ignore closed socket race
    }
  }

  // Also push to SSE workstation listeners
  if (eventType === "message:broadcast") {
    for (const sse of sseClients.values()) {
      const mUpper = normalizeHostKey(sse.machineName);
      if (targetMode === "selected" && targetSet && mUpper && mUpper !== "ALL" && !targetSet.has(mUpper)) {
        continue;
      }
      if (targetMode === "all" && isKnownWindowsServerMachine(sse.machineName)) {
        continue;
      }
      try {
        sse.res.write(`event: broadcast\ndata: ${JSON.stringify(payload)}\n\n`);
      } catch (e) {
        // ignore broken pipe
      }
    }
  }
}

function computeNextRunAt(
  scheduleType: "immediate" | "once" | "daily" | "weekly" | "monthly",
  scheduledAt?: string,
  recurrenceTime?: string,
  recurrenceDays?: number[],
  fromNow: boolean = false
): string | undefined {
  if (scheduleType === "immediate") return undefined;

  if (scheduleType === "once") {
    return scheduledAt || undefined;
  }

  const timeParts = (recurrenceTime || "09:00").split(":");
  const hour = parseInt(timeParts[0] || "9", 10);
  const minute = parseInt(timeParts[1] || "0", 10);

  const now = new Date();
  const candidate = new Date(now);
  candidate.setSeconds(0, 0);
  candidate.setHours(hour, minute, 0, 0);

  if (scheduleType === "daily") {
    if (candidate.getTime() <= now.getTime() || fromNow) {
      candidate.setDate(candidate.getDate() + 1);
    }
    return candidate.toISOString();
  }

  if (scheduleType === "weekly") {
    const days = Array.isArray(recurrenceDays) && recurrenceDays.length > 0 ? recurrenceDays : [1];
    for (let offset = 0; offset <= 7; offset++) {
      const test = new Date(candidate);
      test.setDate(candidate.getDate() + offset);
      if (days.includes(test.getDay())) {
        if (offset === 0 && (test.getTime() <= now.getTime() || fromNow)) {
          continue;
        }
        return test.toISOString();
      }
    }
    candidate.setDate(candidate.getDate() + 7);
    return candidate.toISOString();
  }

  if (scheduleType === "monthly") {
    const targetDay = Array.isArray(recurrenceDays) && recurrenceDays.length > 0 ? recurrenceDays[0] : 1;
    candidate.setDate(targetDay);
    if (candidate.getTime() <= now.getTime() || fromNow) {
      candidate.setMonth(candidate.getMonth() + 1);
      candidate.setDate(targetDay);
    }
    return candidate.toISOString();
  }

  return undefined;
}

function buildTargetReceipts(
  targetMode: "all" | "selected",
  targetMachines: string[],
  onlyActiveMachines: boolean,
  targetIpMap?: Record<string, string>,
  fallbackComputers?: Array<{ name: string; ipAddress?: string; operatingSystem?: string; status?: string }>
) {
  cleanupExpiredPollingAgents();
  const cfg = readConfig();
  let knownComputers: Array<{ name: string; ipAddress?: string; operatingSystem?: string; status?: string }> = [];

  if (cfg.useDemoMode) {
    const db = readDatabase();
    knownComputers = (db.computers || []).map((c: any) => ({
      name: c.name,
      ipAddress: cleanValidIp(c.ipAddress),
      operatingSystem: c.operatingSystem,
      status: c.status
    }));
  } else if (globalComputersCache.size > 0) {
    const seen = new Set<string>();
    for (const c of globalComputersCache.values()) {
      const key = normalizeHostKey(c.name);
      if (!seen.has(key)) {
        seen.add(key);
        const isDisabled = (c.userAccountControl & 0x0002) !== 0;
        knownComputers.push({
          name: c.name,
          ipAddress: cleanValidIp(c.ipAddress) || cleanValidIp(dnsIpCache.get(`${c.name}.${cfg.domain}`)),
          operatingSystem: c.operatingSystem,
          status: isDisabled ? "Desativado" : "Ativo"
        });
      }
    }
  } else if (Array.isArray(fallbackComputers) && fallbackComputers.length > 0) {
    knownComputers = fallbackComputers.map((c) => ({
      name: c.name,
      ipAddress: cleanValidIp(c.ipAddress),
      operatingSystem: c.operatingSystem,
      status: c.status
    }));
  }

  const onlineWsOrSseMap = new Set<string>();
  const onlinePollingMap = new Set<string>();
  const liveIpByHost = new Map<string, string>();

  for (const client of connectedWsClients.values()) {
    if (client.machineName && client.role === "workstation") {
      const key = normalizeHostKey(client.machineName);
      onlineWsOrSseMap.add(key);
      const validIp = cleanValidIp(client.ip);
      if (validIp) liveIpByHost.set(key, validIp);
    }
  }
  for (const sse of sseClients.values()) {
    if (sse.machineName) {
      onlineWsOrSseMap.add(normalizeHostKey(sse.machineName));
    }
  }
  for (const agent of connectedPollingAgents.values()) {
    if (agent.machineName) {
      const key = normalizeHostKey(agent.machineName);
      onlinePollingMap.add(key);
      const validIp = cleanValidIp(agent.ip);
      if (validIp && !liveIpByHost.has(key)) liveIpByHost.set(key, validIp);
    }
  }

  // Normalize custom IP map keys by host key
  const customIpByHost = new Map<string, string>();
  if (targetIpMap && typeof targetIpMap === "object") {
    for (const [k, v] of Object.entries(targetIpMap)) {
      const validIp = cleanValidIp(v);
      if (validIp) {
        customIpByHost.set(normalizeHostKey(k), validIp);
        customIpByHost.set(k.trim().toUpperCase(), validIp);
      }
    }
  }

  const resolveIp = (machineName: string, knownIp?: string): string | undefined => {
    const key = normalizeHostKey(machineName);
    return (
      customIpByHost.get(key) ||
      customIpByHost.get(machineName.trim().toUpperCase()) ||
      cleanValidIp(machineName) ||
      cleanValidIp(knownIp) ||
      liveIpByHost.get(key) ||
      cleanValidIp(dnsIpCache.get(`${machineName}.${cfg.domain}`))
    );
  };

  const nowTs = getBrazilTimestamp();
  const receipts: ServerBroadcastMessage["receipts"] = [];

  if (targetMode === "selected") {
    const uniqueTargets = Array.from(new Set(targetMachines.map((m) => m.trim()).filter(Boolean)));
    for (const name of uniqueTargets) {
      const key = normalizeHostKey(name);
      const found = knownComputers.find((k) => normalizeHostKey(k.name) === key);
      const isOnlineWs = onlineWsOrSseMap.has(key);
      receipts.push({
        machineName: found ? found.name : name,
        ipAddress: resolveIp(found ? found.name : name, found?.ipAddress),
        status: isOnlineWs ? "entregue" : "pendente",
        deliveredAt: isOnlineWs ? nowTs : undefined
      });
    }
  } else {
    // Send to All: ignore disabled machines (when checkbox checked) AND NEVER send to Windows Server OS
    const filtered = knownComputers.filter((k) => {
      if (onlyActiveMachines && k.status === "Desativado") return false;
      if (isWindowsServerOS(k.operatingSystem)) return false;
      return true;
    });
    for (const comp of filtered) {
      const key = normalizeHostKey(comp.name);
      const isOnlineWs = onlineWsOrSseMap.has(key);
      receipts.push({
        machineName: comp.name,
        ipAddress: resolveIp(comp.name, comp.ipAddress),
        status: isOnlineWs ? "entregue" : "pendente",
        deliveredAt: isOnlineWs ? nowTs : undefined
      });
    }
  }

  return { receipts, onlineWsOrSseMap, onlinePollingMap };
}

function resolveWindowsMsgExePath(): string {
  const windir = process.env.WINDIR || "C:\\Windows";
  const candidates = [
    path.join(windir, "Sysnative", "msg.exe"),
    path.join(windir, "System32", "msg.exe"),
    "msg.exe"
  ];
  for (const p of candidates) {
    if (p === "msg.exe" || fs.existsSync(p)) return p;
  }
  return "msg.exe";
}

function establishWindowsIpcSession(dest: string, username: string, password: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    execFile(
      "net",
      ["use", `\\\\${dest}\\IPC$`, `/user:${username}`, password],
      { timeout: 6000, windowsHide: true },
      (err, stdout, stderr) => {
        if (!err) return resolve({ ok: true });
        const out = (stderr || stdout || err.message || "").trim();
        // Error 1219 = multiple connections to a server using >1 user; already authenticated
        if (out.includes("1219")) return resolve({ ok: true });
        resolve({ ok: false, error: out });
      }
    );
  });
}

function execMsgExeDirect(msgPath: string, dest: string, text: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const safeText = String(text || "").replace(/\r?\n/g, " ").trim().slice(0, 950);
    execFile(
      msgPath,
      ["*", `/SERVER:${dest}`, "/TIME:0", safeText],
      { timeout: 12000, windowsHide: true },
      (err, stdout, stderr) => {
        if (!err) return resolve({ ok: true });
        const detail = (stderr || stdout || err.message || "Falha no msg.exe").trim();
        resolve({ ok: false, error: detail });
      }
    );
  });
}

async function sendMsgExeToWindowsHost(dest: string, text: string): Promise<{ ok: boolean; error?: string }> {
  if (process.platform !== "win32") {
    return {
      ok: false,
      error: `Servidor web rodando em ${process.platform} (${os.hostname()}): msg.exe nativo só executa em servidor Windows ou via Despachante Windows.`
    };
  }
  const msgPath = resolveWindowsMsgExePath();
  const firstTry = await execMsgExeDirect(msgPath, dest, text);
  if (firstTry.ok) return firstTry;

  // If server runs as LocalSystem / service account without domain token, retry after authenticating IPC$ with AD service credentials
  const cfg = readConfig();
  if (cfg.username && cfg.password) {
    const ipcRes = await establishWindowsIpcSession(dest, cfg.username, cfg.password);
    if (ipcRes.ok) {
      const retry = await execMsgExeDirect(msgPath, dest, text);
      if (retry.ok) return retry;
      return { ok: false, error: retry.error || firstTry.error };
    }
    return { ok: false, error: `${firstTry.error} | IPC$ (${cfg.username}): ${ipcRes.error}` };
  }

  return firstTry;
}

function execWinRmPowerShell(
  dest: string,
  text: string,
  cred?: { username: string; password: string }
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const safeText = String(text || "").slice(0, 950);
    const psCmd = cred
      ? "$sec = ConvertTo-SecureString $env:AD_PUSH_PASS -AsPlainText -Force; $c = New-Object System.Management.Automation.PSCredential($env:AD_PUSH_USER, $sec); Invoke-Command -ComputerName $env:AD_PUSH_DEST -Credential $c -ScriptBlock { param($m) msg.exe * /TIME:0 $m } -ArgumentList $env:AD_PUSH_TEXT -ErrorAction Stop"
      : "Invoke-Command -ComputerName $env:AD_PUSH_DEST -ScriptBlock { param($m) msg.exe * /TIME:0 $m } -ArgumentList $env:AD_PUSH_TEXT -ErrorAction Stop";

    execFile(
      "powershell.exe",
      ["-NoProfile", "-Command", psCmd],
      {
        timeout: 12000,
        windowsHide: true,
        env: {
          ...process.env,
          AD_PUSH_DEST: dest,
          AD_PUSH_TEXT: safeText,
          ...(cred ? { AD_PUSH_USER: cred.username, AD_PUSH_PASS: cred.password } : {})
        }
      },
      (err, stdout, stderr) => {
        if (!err) return resolve({ ok: true });
        const detail = (stderr || stdout || err.message || "Falha no WinRM").trim();
        resolve({ ok: false, error: detail });
      }
    );
  });
}

async function sendWinRmToWindowsHost(dest: string, text: string): Promise<{ ok: boolean; error?: string }> {
  if (process.platform !== "win32") {
    return {
      ok: false,
      error: `Servidor web rodando em ${process.platform} (${os.hostname()}): WinRM nativo requer servidor Windows ou Despachante Windows.`
    };
  }
  const firstTry = await execWinRmPowerShell(dest, text);
  if (firstTry.ok) return firstTry;

  const cfg = readConfig();
  if (cfg.username && cfg.password) {
    const retry = await execWinRmPowerShell(dest, text, { username: cfg.username, password: cfg.password });
    if (retry.ok) return retry;
    return { ok: false, error: retry.error || firstTry.error };
  }

  return firstTry;
}

export interface DispatchDeliverySummary {
  totalTargets: number;
  onlineAgentCount: number;
  pendingAgentCount: number;
  nativePushAttempted: boolean;
  nativePushSucceeded: number;
  nativePushFailed: number;
  gatewayOnline: boolean;
  serverPlatform: string;
  serverHostname: string;
  nativePushErrors: Array<{ machineName: string; dest: string; error: string }>;
  offlineMachines: string[];
}

async function dispatchBroadcastMessage(
  messageId: string,
  triggeredByScheduler: boolean = false
): Promise<{ message: ServerBroadcastMessage; deliverySummary: DispatchDeliverySummary } | null> {
  cleanupExpiredPollingAgents();
  const messages = readMessages();
  const idx = messages.findIndex((m) => m.id === messageId);
  if (idx === -1) return null;

  const msg = messages[idx];
  const nowTs = getBrazilTimestamp();

  msg.sentAt = nowTs;
  msg.runCount = (msg.runCount || 0) + 1;
  const { receipts, onlineWsOrSseMap, onlinePollingMap } = buildTargetReceipts(
    msg.targetMode,
    msg.targetMachines,
    Boolean(msg.onlyActiveMachines),
    msg.targetIpMap,
    msg.fallbackComputers
  );
  msg.receipts = receipts;

  const normalizedMethod: "msg_exe" | "winrm" = msg.deliveryMethod === "winrm" ? "winrm" : "msg_exe";

  // Attempt native Windows delivery (WinRM or msg.exe) automatically when backend runs on Windows
  let nativePushAttempted = false;
  let nativePushSucceeded = 0;
  let nativePushFailed = 0;
  const nativePushErrors: Array<{ machineName: string; dest: string; error: string }> = [];

  if (process.platform === "win32" && msg.receipts.length > 0) {
    nativePushAttempted = true;
    const badge =
      msg.urgency === "urgent" ? "ALERTA URGENTE" : msg.urgency === "warning" ? "AVISO DE ATENCAO" : "COMUNICADO DE TI";
    const formattedMsg = `[${badge}] ${msg.title} - ${msg.body}`;
    const targetsToPush = msg.receipts.slice(0, 40);

    await Promise.all(
      targetsToPush.map(async (rec) => {
        // Always prioritize IP address instead of hostname to bypass DNS issues
        const validIp = cleanValidIp(rec.ipAddress);
        const targetDest = validIp || rec.machineName;
        const result =
          normalizedMethod === "winrm"
            ? await sendWinRmToWindowsHost(targetDest, formattedMsg)
            : await sendMsgExeToWindowsHost(targetDest, formattedMsg);
        if (result.ok) {
          nativePushSucceeded++;
          if (rec.status === "pendente" || rec.status === "falha") {
            rec.status = "entregue";
            rec.deliveredAt = nowTs;
            rec.errorDetail = undefined;
          }
        } else {
          nativePushFailed++;
          const errDetail = validIp
            ? (result.error || "Falha ao enviar para o IP.")
            : `Sem IP cadastrado (tentou hostname ${targetDest}): ${result.error || "Falha RPC/DNS"}`;
          if (rec.status === "pendente") {
            rec.status = "falha";
            rec.errorDetail = errDetail;
          }
          nativePushErrors.push({ machineName: rec.machineName, dest: targetDest, error: errDetail });
        }
      })
    );
  } else if (process.platform !== "win32") {
    // Queue for any connected Windows msg.exe / WinRM Gateway inside the domain
    pendingGatewayMessageIds.add(msg.id);
  }

  if (msg.scheduleType === "immediate" || msg.scheduleType === "once") {
    msg.status = "enviada";
    msg.nextRunAt = undefined;
  } else {
    msg.status = "agendada";
    msg.nextRunAt = computeNextRunAt(
      msg.scheduleType,
      msg.scheduledAt,
      msg.recurrenceTime,
      msg.recurrenceDays,
      true
    );
  }

  messages[idx] = msg;
  writeMessages(messages);

  const gatewayOnline = connectedMsgGateways.size > 0;
  let onlineAgentCount = 0;
  const offlineMachines: string[] = [];
  for (const r of msg.receipts) {
    const key = normalizeHostKey(r.machineName);
    const hasLiveChannel =
      r.status === "entregue" ||
      r.status === "confirmada" ||
      onlineWsOrSseMap.has(key) ||
      onlinePollingMap.has(key) ||
      gatewayOnline;
    if (hasLiveChannel) {
      onlineAgentCount++;
    } else {
      offlineMachines.push(r.ipAddress ? `${r.machineName} (${r.ipAddress})` : r.machineName);
    }
  }

  const deliverySummary: DispatchDeliverySummary = {
    totalTargets: msg.receipts.length,
    onlineAgentCount,
    pendingAgentCount: Math.max(0, msg.receipts.length - onlineAgentCount),
    nativePushAttempted,
    nativePushSucceeded,
    nativePushFailed,
    gatewayOnline,
    serverPlatform: process.platform,
    serverHostname: os.hostname(),
    nativePushErrors: nativePushErrors.slice(0, 10),
    offlineMachines: offlineMachines.slice(0, 12)
  };

  // Add audit log
  const db = readDatabase();
  const targetLabel = msg.targetMode === "all"
    ? (msg.onlyActiveMachines ? "Todas as estações ativas (excl. Windows Server)" : "Todas as estações (excl. Windows Server)")
    : `${msg.targetMachines.length} máquina(s): ${msg.targetMachines.slice(0, 5).join(", ")}${msg.targetMachines.length > 5 ? "..." : ""}`;

  db.logs.unshift({
    id: "log_" + Date.now(),
    timestamp: nowTs,
    operator: triggeredByScheduler ? "Agendador Automático" : (msg.sender || "admin.silva"),
    action: triggeredByScheduler ? "Disparo Automático de Mensagem" : "Envio de Alerta na Rede",
    targetUser: targetLabel,
    details: `[${msg.urgency.toUpperCase()} | ${normalizedMethod.toUpperCase()}] "${msg.title}" processada para ${targetLabel} (${onlineAgentCount} com entrega/canal ativo, ${deliverySummary.pendingAgentCount} pendente(s)).`,
    type: msg.urgency === "urgent" ? "danger" : msg.urgency === "warning" ? "warning" : "info"
  });
  writeDatabase(db);

  // Push real-time WebSocket + SSE popup event
  broadcastWsEvent("message:broadcast", msg, msg.targetMode, msg.targetMachines);
  broadcastWsEvent("message:updated", msg);

  return { message: msg, deliverySummary };
}

// Background scheduler checking due messages every 10 seconds
setInterval(() => {
  try {
    const messages = readMessages();
    const nowMs = Date.now();
    for (const msg of messages) {
      if (msg.status === "agendada" && msg.nextRunAt) {
        const dueMs = new Date(msg.nextRunAt).getTime();
        if (!isNaN(dueMs) && dueMs <= nowMs) {
          console.log(`[Scheduler] Disparando mensagem agendada: ${msg.title} (${msg.id})`);
          dispatchBroadcastMessage(msg.id, true);
        }
      }
    }
    if (cleanupExpiredPollingAgents()) {
      broadcastWsEvent("clients:status", getConnectedWorkstationsSnapshot());
    }
  } catch (err) {
    console.error("Erro no agendador de mensagens:", err);
  }
}, 10000);

function generateWindowsMsgBatScript(opts: {
  title: string;
  body: string;
  urgency: string;
  targetMode: "all" | "selected";
  resolvedTargets: Array<{ machineName: string; ipAddress?: string }>;
}) {
  const badge =
    opts.urgency === "urgent" ? "ALERTA URGENTE" : opts.urgency === "warning" ? "AVISO DE ATENCAO" : "COMUNICADO DE TI";
  const cleanTitle = (opts.title || "Comunicado de TI").replace(/["%\r\n]/g, " ").trim();
  const cleanBody = (opts.body || "Mensagem administrativa enviada pelo setor de TI.").replace(/["%]/g, " ").replace(/\r?\n/g, " ").trim();

  if (opts.resolvedTargets.length > 0) {
    const lines = opts.resolvedTargets.map((t) => {
      const dest = t.ipAddress || t.machineName;
      const ipNote = t.ipAddress ? `IP: ${t.ipAddress}` : `Sem IP cadastrado - usando nome ${t.machineName}`;
      return `echo Enviando pop-up nativo Windows para ${t.machineName} (${ipNote})...\nmsg.exe * /SERVER:${dest} /TIME:0 "[${badge}] ${cleanTitle} - ${cleanBody}"`;
    });

    return `@echo off
chcp 65001 >nul
REM ========================================================================
REM Disparo Nativo via Windows msg.exe por Endereco IP (Ignora Windows Server em Envio Global)
REM ========================================================================
${lines.join("\n\n")}

echo.
echo Concluido.
pause
`;
  }

  return `@echo off
chcp 65001 >nul
REM Nenhum equipamento com IP resolvido no cache no momento.
REM Exemplo de disparo direto por IP:
echo Informe o IP ou carregue os computadores do AD antes de baixar.
pause
`;
}

function generatePushPowerShellScript(opts: {
  title: string;
  body: string;
  urgency: string;
  deliveryMethod: "msg_exe" | "winrm";
  targetMode: "all" | "selected";
  resolvedTargets: Array<{ machineName: string; ipAddress?: string }>;
  domain: string;
  serverUrl: string;
  messageId?: string;
}) {
  const safeTitle = (opts.title || "Comunicado de TI").replace(/"/g, '`"');
  const safeBody = (opts.body || "Mensagem administrativa enviada pelo setor de TI.").replace(/"/g, '`"');

  let targetBlock = "";
  if (opts.resolvedTargets.length > 0) {
    const items = opts.resolvedTargets.map((t) => {
      const dest = t.ipAddress || t.machineName;
      return `    @{ Name = "${t.machineName}"; Dest = "${dest}" }`;
    });
    targetBlock = `# Destinos priorizando IP (Windows Server ja excluido quando em envio global)
$Targets = @(
${items.join(",\n")}
)`;
  } else if (opts.targetMode === "all") {
    targetBlock = `# Consulta estacoes ativas no AD (${opts.domain}) ignorando Windows Server e priorizando IPv4
Import-Module ActiveDirectory -ErrorAction SilentlyContinue
$Targets = Get-ADComputer -Filter { Enabled -eq $true -and OperatingSystem -notlike "*Server*" } -Properties IPv4Address, OperatingSystem | ForEach-Object {
    @{ Name = $_.Name; Dest = $(if ($_.IPv4Address) { $_.IPv4Address } else { $_.Name }) }
}`;
  } else {
    targetBlock = `$Targets = @()`;
  }

  const urgencyLabel =
    opts.urgency === "urgent" ? "ALERTA URGENTE" : opts.urgency === "warning" ? "AVISO DE ATENCAO" : "COMUNICADO DE TI";

  const dispatchBlock =
    opts.deliveryMethod === "winrm"
      ? `    try {
        Invoke-Command -ComputerName $Dest -ScriptBlock { param($m) msg.exe * /TIME:0 $m } -ArgumentList $MsgTexto -ErrorAction Stop
        Write-Host " [OK - WinRM por IP]" -ForegroundColor Green
        if ($MessageId -and $ServerApiUrl) {
            try {
                $bodyJson = @{ machineName = $MachineName } | ConvertTo-Json
                Invoke-RestMethod -Uri "$ServerApiUrl/api/messages/$MessageId/delivered" -Method Post -ContentType "application/json" -Body $bodyJson -ErrorAction SilentlyContinue | Out-Null
            } catch {}
        }
    } catch {
        Write-Host " [Falha WinRM ($Dest): $($_.Exception.Message)]" -ForegroundColor Red
    }`
      : `    $output = & msg.exe * /SERVER:$Dest /TIME:0 "$MsgTexto" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host " [OK - Exibido na tela via msg.exe]" -ForegroundColor Green
        if ($MessageId -and $ServerApiUrl) {
            try {
                $bodyJson = @{ machineName = $MachineName } | ConvertTo-Json
                Invoke-RestMethod -Uri "$ServerApiUrl/api/messages/$MessageId/delivered" -Method Post -ContentType "application/json" -Body $bodyJson -ErrorAction SilentlyContinue | Out-Null
            } catch {}
        }
    } else {
        Write-Host " [Falha msg.exe ($Dest): $output]" -ForegroundColor Red
    }`;

  return `<#
.SYNOPSIS
    Disparo Nativo de Mensagens via ${opts.deliveryMethod === "winrm" ? "WinRM" : "Windows msg.exe"} por Endereco IP
.DESCRIPTION
    Arquivo local nativo que prioriza o endereco IP para contornar falhas de DNS
    e envia o alerta para a sessao ativa do usuario.
#>

[CmdletBinding()]
param(
    [string]$Titulo = "${safeTitle}",
    [string]$Mensagem = "${safeBody}",
    [string]$ServerApiUrl = "${opts.serverUrl}",
    [string]$MessageId = "${opts.messageId || ""}"
)

${targetBlock}

Write-Host "Disparando alerta (${opts.deliveryMethod === "winrm" ? "WinRM" : "msg.exe"}) para $($Targets.Count) estacao(oes) via IP..." -ForegroundColor Cyan
$MsgTexto = "[${urgencyLabel}] $Titulo\`r\`n\`r\`n$Mensagem"

foreach ($Item in $Targets) {
    $MachineName = $Item.Name
    $Dest = $Item.Dest
    Write-Host " -> $MachineName ($Dest)..." -NoNewline
${dispatchBlock}
}
`;
}

function generateMsgGatewayScript(serverUrl: string) {
  return `<#
.SYNOPSIS
    Despachante Central Windows msg.exe / WinRM por IP (DirectoryAdmin MSG Gateway)
.DESCRIPTION
    Execute este script em UM servidor Windows ou PC de TI dentro da rede interna.
    Ele NAO precisa ser instalado nas estacoes dos usuarios e prioriza o envio
    diretamente para o endereco IP (contornando falhas de DNS).
#>

param(
    [string]$ServerUrl = "${serverUrl}",
    [int]$IntervaloSegundos = 3
)

[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$GatewayHost = $env:COMPUTERNAME
$GatewayUser = $env:USERNAME

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host " DirectoryAdmin - Despachante Nativo Windows (msg.exe & WinRM por IP)" -ForegroundColor Cyan
Write-Host " Host: $GatewayHost ($GatewayUser) | Painel: $ServerUrl" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

while ($true) {
    try {
        $queueUrl = "$ServerUrl/api/messages/gateway-queue?host=$([uri]::EscapeDataString($GatewayHost))&user=$([uri]::EscapeDataString($GatewayUser))"
        $resp = Invoke-RestMethod -Uri $queueUrl -Method Get -TimeoutSec 10

        if ($resp -and $resp.jobs) {
            foreach ($job in $resp.jobs) {
                $badge = "COMUNICADO DE TI"
                if ($job.urgency -eq "warning") { $badge = "AVISO DE ATENCAO" }
                elseif ($job.urgency -eq "urgent") { $badge = "ALERTA URGENTE" }

                $msgText = "[$badge] $($job.title)\`r\`n\`r\`n$($job.body)"
                $method = if ($job.deliveryMethod -eq "winrm") { "winrm" } else { "msg_exe" }
                $results = @()

                Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Processando '$($job.title)' [$method] para $($job.targets.Count) estacao(oes)..." -ForegroundColor Yellow

                foreach ($target in $job.targets) {
                    $dest = if ($target.ipAddress -and $target.ipAddress.Trim() -ne "") { $target.ipAddress.Trim() } else { $target.machineName }

                    if ($method -eq "winrm") {
                        try {
                            Invoke-Command -ComputerName $dest -ScriptBlock { param($m) msg.exe * /TIME:0 $m } -ArgumentList $msgText -ErrorAction Stop
                            Write-Host "   OK [WinRM] -> $($target.machineName) ($dest)" -ForegroundColor Green
                            $results += @{ machineName = $target.machineName; success = $true; errorDetail = "" }
                        } catch {
                            $errMsg = $_.Exception.Message
                            Write-Host "   FALHA [WinRM] -> $($target.machineName) ($dest): $errMsg" -ForegroundColor Red
                            $results += @{ machineName = $target.machineName; success = $false; errorDetail = $errMsg }
                        }
                    } else {
                        $out = & msg.exe * /SERVER:$dest /TIME:0 "$msgText" 2>&1
                        if ($LASTEXITCODE -eq 0) {
                            Write-Host "   OK [msg.exe] -> $($target.machineName) ($dest)" -ForegroundColor Green
                            $results += @{ machineName = $target.machineName; success = $true; errorDetail = "" }
                        } else {
                            $errMsg = ($out | Out-String).Trim()
                            Write-Host "   FALHA [msg.exe] -> $($target.machineName) ($dest): $errMsg" -ForegroundColor Red
                            $results += @{ machineName = $target.machineName; success = $false; errorDetail = $errMsg }
                        }
                    }
                }

                $reportPayload = @{ gatewayHost = $GatewayHost; results = $results } | ConvertTo-Json -Depth 4
                Invoke-RestMethod -Uri "$ServerUrl/api/messages/$($job.id)/gateway-report" -Method Post -ContentType "application/json; charset=utf-8" -Body $reportPayload -ErrorAction SilentlyContinue | Out-Null
            }
        }
    } catch {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Aguardando conexao com $ServerUrl..." -ForegroundColor DarkGray
    }
    Start-Sleep -Seconds $IntervaloSegundos
}
`;
}

// GET /api/messages
app.get("/api/messages", (req, res) => {
  const messages = readMessages();
  res.json({
    messages: messages.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")),
    connectedWorkstations: getConnectedWorkstationsSnapshot(),
    serverPlatform: process.platform,
    serverHostname: os.hostname(),
    gatewayOnline: connectedMsgGateways.size > 0
  });
});

// POST /api/messages/test-ip (Direct diagnostic dispatch from server to an IP)
app.post("/api/messages/test-ip", async (req, res) => {
  const ip = cleanValidIp(req.body?.ip) || String(req.body?.ip || "").trim();
  const method: "msg_exe" | "winrm" = req.body?.deliveryMethod === "winrm" ? "winrm" : "msg_exe";
  const text = String(req.body?.text || "[TESTE TI] Mensagem de teste direto do servidor DirectoryAdmin.").trim();

  if (!ip) {
    return res.status(400).json({ ok: false, error: "Informe um endereço IP válido (ex: 172.16.6.44)." });
  }

  if (process.platform !== "win32") {
    return res.json({
      ok: false,
      serverPlatform: process.platform,
      serverHostname: os.hostname(),
      gatewayOnline: connectedMsgGateways.size > 0,
      error: `Este servidor web roda em ${process.platform} (${os.hostname()}). O Linux não executa ${method === "winrm" ? "WinRM PowerShell" : "msg.exe"} diretamente — use o Despachante Windows (DirectoryAdmin-MsgGateway.ps1) em 1 máquina Windows da rede.`
    });
  }

  const result =
    method === "winrm"
      ? await sendWinRmToWindowsHost(ip, text)
      : await sendMsgExeToWindowsHost(ip, text);

  return res.json({
    ...result,
    serverPlatform: process.platform,
    serverHostname: os.hostname(),
    gatewayOnline: connectedMsgGateways.size > 0
  });
});

// POST /api/messages/send
app.post("/api/messages/send", async (req, res) => {
  try {
    const {
      title,
      body,
      urgency = "info",
      category = "Comunicado Geral",
      sender = "admin.silva",
      targetMode = "all",
      targetMachines = [],
      targetIpMap = {},
      fallbackComputers = [],
      onlyActiveMachines = true,
      requireAck = true,
      playSound = true,
      autoCloseSeconds = 0,
      deliveryMethod = "msg_exe",
      scheduleType = "immediate",
      scheduledAt,
      recurrenceTime,
      recurrenceDays
    } = req.body;

    if (!title || !body) {
      return res.status(400).json({ error: "Título e conteúdo da mensagem são obrigatórios." });
    }

    if (targetMode === "selected" && (!Array.isArray(targetMachines) || targetMachines.length === 0)) {
      return res.status(400).json({ error: "Selecione pelo menos uma máquina de destino ou escolha 'Todas as Máquinas'." });
    }

    if (scheduleType === "once" && !scheduledAt) {
      return res.status(400).json({ error: "Informe a data e hora para o agendamento único." });
    }

    const normalizedMethod: "msg_exe" | "winrm" = deliveryMethod === "winrm" ? "winrm" : "msg_exe";

    const id = "msg_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6);
    const createdAt = getBrazilTimestamp();
    const nextRunAt = computeNextRunAt(scheduleType, scheduledAt, recurrenceTime, recurrenceDays, false);

    const newMsg: ServerBroadcastMessage = {
      id,
      title: String(title).trim(),
      body: String(body).trim(),
      urgency,
      category,
      sender,
      targetMode,
      targetMachines: targetMode === "all" ? [] : targetMachines,
      targetIpMap: targetIpMap && typeof targetIpMap === "object" ? targetIpMap : undefined,
      fallbackComputers: Array.isArray(fallbackComputers) && fallbackComputers.length > 0 ? fallbackComputers : undefined,
      onlyActiveMachines: Boolean(onlyActiveMachines),
      requireAck: Boolean(requireAck),
      playSound: Boolean(playSound),
      autoCloseSeconds: Number(autoCloseSeconds) || 0,
      deliveryMethod: normalizedMethod,
      scheduleType,
      scheduledAt,
      recurrenceTime,
      recurrenceDays,
      status: scheduleType === "immediate" ? "enviada" : "agendada",
      createdAt,
      nextRunAt,
      runCount: 0,
      receipts: []
    };

    const messages = readMessages();
    messages.unshift(newMsg);
    writeMessages(messages);

    if (scheduleType === "immediate") {
      const result = await dispatchBroadcastMessage(id, false);
      return res.json({
        success: true,
        message: result?.message,
        deliverySummary: result?.deliverySummary
      });
    } else {
      const db = readDatabase();
      db.logs.unshift({
        id: "log_" + Date.now(),
        timestamp: createdAt,
        operator: sender,
        action: "Agendamento de Mensagem",
        targetUser: targetMode === "all" ? "Todas as máquinas" : `${targetMachines.length} máquina(s)`,
        details: `Agendamento '${scheduleType}' criado para "${newMsg.title}". Próximo disparo: ${nextRunAt || scheduledAt}.`,
        type: "info"
      });
      writeDatabase(db);
      broadcastWsEvent("message:updated", newMsg);
      return res.json({ success: true, message: newMsg });
    }
  } catch (err: any) {
    console.error("Erro ao enviar/agendar mensagem:", err);
    return res.status(500).json({ error: err.message || "Erro interno ao processar mensagem." });
  }
});

// POST /api/messages/:id/dispatch-now
app.post("/api/messages/:id/dispatch-now", async (req, res) => {
  const { id } = req.params;
  const result = await dispatchBroadcastMessage(id, false);
  if (!result) {
    return res.status(404).json({ error: "Mensagem não encontrada." });
  }
  return res.json({
    success: true,
    message: result.message,
    deliverySummary: result.deliverySummary
  });
});

// POST /api/messages/:id/toggle-pause
app.post("/api/messages/:id/toggle-pause", (req, res) => {
  const { id } = req.params;
  const messages = readMessages();
  const idx = messages.findIndex((m) => m.id === id);
  if (idx === -1) return res.status(404).json({ error: "Agendamento não encontrado." });

  const msg = messages[idx];
  if (msg.status === "agendada") {
    msg.status = "pausada";
  } else if (msg.status === "pausada") {
    msg.status = "agendada";
    msg.nextRunAt = computeNextRunAt(msg.scheduleType, msg.scheduledAt, msg.recurrenceTime, msg.recurrenceDays, false);
  }
  messages[idx] = msg;
  writeMessages(messages);
  broadcastWsEvent("message:updated", msg);
  return res.json({ success: true, message: msg });
});

// DELETE /api/messages/:id
app.delete("/api/messages/:id", (req, res) => {
  const { id } = req.params;
  pendingGatewayMessageIds.delete(id);
  const messages = readMessages();
  const filtered = messages.filter((m) => m.id !== id);
  writeMessages(filtered);
  broadcastWsEvent("message:deleted", { id });
  return res.json({ success: true });
});

// POST /api/messages/:id/delivered
app.post("/api/messages/:id/delivered", (req, res) => {
  const { id } = req.params;
  const { machineName, ipAddress } = req.body;
  const messages = readMessages();
  const idx = messages.findIndex((m) => m.id === id);
  if (idx === -1) return res.status(404).json({ error: "Mensagem não encontrada." });

  const msg = messages[idx];
  const nowTs = getBrazilTimestamp();
  const mKey = normalizeHostKey(machineName || "ESTACAO-LOCAL");
  const existing = msg.receipts.find((r) => normalizeHostKey(r.machineName) === mKey);

  if (existing) {
    if (existing.status === "pendente" || existing.status === "falha") {
      existing.status = "entregue";
      existing.deliveredAt = nowTs;
      existing.errorDetail = undefined;
    }
    if (ipAddress && !existing.ipAddress) existing.ipAddress = ipAddress;
  } else {
    msg.receipts.push({
      machineName: machineName || "ESTACAO-LOCAL",
      ipAddress,
      status: "entregue",
      deliveredAt: nowTs
    });
  }

  messages[idx] = msg;
  writeMessages(messages);
  broadcastWsEvent("message:updated", msg);
  return res.json({ success: true, message: msg });
});

// POST /api/messages/:id/ack
app.post("/api/messages/:id/ack", (req, res) => {
  const { id } = req.params;
  const { machineName, username, ipAddress } = req.body;
  const messages = readMessages();
  const idx = messages.findIndex((m) => m.id === id);
  if (idx === -1) return res.status(404).json({ error: "Mensagem não encontrada." });

  const msg = messages[idx];
  const nowTs = getBrazilTimestamp();
  const mKey = normalizeHostKey(machineName || "ESTACAO-LOCAL");
  const existing = msg.receipts.find((r) => normalizeHostKey(r.machineName) === mKey);

  if (existing) {
    existing.status = "confirmada";
    existing.deliveredAt = existing.deliveredAt || nowTs;
    existing.acknowledgedAt = nowTs;
    existing.acknowledgedBy = username || existing.acknowledgedBy || "Usuário Logado";
    existing.errorDetail = undefined;
    if (ipAddress && !existing.ipAddress) existing.ipAddress = ipAddress;
  } else {
    msg.receipts.push({
      machineName: machineName || "ESTACAO-LOCAL",
      ipAddress,
      status: "confirmada",
      deliveredAt: nowTs,
      acknowledgedAt: nowTs,
      acknowledgedBy: username || "Usuário Logado"
    });
  }

  messages[idx] = msg;
  writeMessages(messages);
  broadcastWsEvent("message:ack", { messageId: id, machineName, username, acknowledgedAt: nowTs, message: msg });
  broadcastWsEvent("message:updated", msg);
  return res.json({ success: true, message: msg });
});

// GET /api/messages/gateway-queue (Polled by local Windows msg.exe Gateway inside the domain)
app.get("/api/messages/gateway-queue", (req, res) => {
  const rawHost = String(req.query.host || "GATEWAY-MSG").trim();
  const rawUser = String(req.query.user || "admin").trim();
  const hostKey = normalizeHostKey(rawHost);

  if (hostKey) {
    const isNew = !connectedMsgGateways.has(hostKey);
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "";
    const nowTs = getBrazilTimestamp();
    const prev = connectedMsgGateways.get(hostKey);
    connectedMsgGateways.set(hostKey, {
      clientId: prev?.clientId || `gw_${hostKey}`,
      machineName: rawHost,
      username: rawUser,
      ip: ip || prev?.ip || "",
      connectedAt: prev?.connectedAt || nowTs,
      lastSeenMs: Date.now(),
      lastSeenAt: nowTs,
      isGateway: true
    });
    if (isNew) {
      broadcastWsEvent("clients:status", getConnectedWorkstationsSnapshot());
    }
  }

  const messages = readMessages();
  const jobs: Array<{
    id: string;
    title: string;
    body: string;
    urgency: string;
    deliveryMethod: "msg_exe" | "winrm";
    targets: Array<{ machineName: string; ipAddress?: string }>;
  }> = [];

  for (const msg of messages) {
    if (!pendingGatewayMessageIds.has(msg.id)) continue;
    const pendingTargets = (msg.receipts || [])
      .filter((r) => r.status === "pendente")
      .map((r) => ({ machineName: r.machineName, ipAddress: r.ipAddress }));
    if (pendingTargets.length > 0) {
      jobs.push({
        id: msg.id,
        title: msg.title,
        body: msg.body,
        urgency: msg.urgency,
        deliveryMethod: msg.deliveryMethod === "winrm" ? "winrm" : "msg_exe",
        targets: pendingTargets
      });
    } else {
      pendingGatewayMessageIds.delete(msg.id);
    }
  }

  res.json({ jobs });
});

// POST /api/messages/:id/gateway-report (Receives per-machine msg.exe delivery results from Windows Gateway)
app.post("/api/messages/:id/gateway-report", (req, res) => {
  const { id } = req.params;
  const { results } = req.body;
  pendingGatewayMessageIds.delete(id);

  const messages = readMessages();
  const idx = messages.findIndex((m) => m.id === id);
  if (idx === -1) return res.status(404).json({ error: "Mensagem não encontrada." });

  const msg = messages[idx];
  const nowTs = getBrazilTimestamp();
  msg.gatewayDispatchedAt = nowTs;

  const resultsList = Array.isArray(results) ? results : results ? [results] : [];
  for (const item of resultsList) {
    if (!item || !item.machineName) continue;
    const mKey = normalizeHostKey(item.machineName);
    const rec = msg.receipts.find((r) => normalizeHostKey(r.machineName) === mKey);
    if (rec) {
      if (item.success) {
        rec.status = "entregue";
        rec.deliveredAt = nowTs;
        rec.errorDetail = undefined;
      } else {
        rec.status = "falha";
        rec.errorDetail = item.errorDetail || "Falha ao executar msg.exe na estação destino.";
      }
    }
  }

  messages[idx] = msg;
  writeMessages(messages);
  broadcastWsEvent("message:updated", msg);
  return res.json({ success: true, message: msg });
});

// GET /api/messages/pending (For browser/SSE or local listener polling)
app.get("/api/messages/pending", (req, res) => {
  const rawMachine = String(req.query.machine || "").trim();
  const rawUser = String(req.query.user || "usuario.windows").trim();
  const machineKey = normalizeHostKey(rawMachine);

  if (rawMachine && machineKey) {
    const isNew = !connectedPollingAgents.has(machineKey);
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "";
    const nowTs = getBrazilTimestamp();
    const prev = connectedPollingAgents.get(machineKey);
    connectedPollingAgents.set(machineKey, {
      clientId: prev?.clientId || `ps_${machineKey}`,
      machineName: rawMachine,
      username: rawUser || prev?.username || "usuario.windows",
      ip: ip || prev?.ip || "",
      connectedAt: prev?.connectedAt || nowTs,
      lastSeenMs: Date.now(),
      lastSeenAt: nowTs
    });
    if (isNew) {
      broadcastWsEvent("clients:status", getConnectedWorkstationsSnapshot());
    }
  }

  const messages = readMessages();
  const recentSent = messages.filter((m) => {
    if (m.status !== "enviada" && m.runCount === 0) return false;
    if (m.targetMode === "selected" && machineKey) {
      const targetMatch = m.targetMachines.some((t) => normalizeHostKey(t) === machineKey);
      if (!targetMatch) return false;
    }
    if (machineKey) {
      const acked = m.receipts.some((r) => normalizeHostKey(r.machineName) === machineKey && r.status === "confirmada");
      if (acked) return false;
    }
    return true;
  }).slice(0, 5);

  res.json({ messages: recentSent });
});

// GET /api/messages/stream (Server-Sent Events for Desktop Listeners)
app.get("/api/messages/stream", (req, res) => {
  const machineName = String(req.query.machine || "ESTACAO-SSE").trim();
  const clientId = "sse_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  sseClients.set(clientId, { res, machineName });
  res.write(`event: connected\ndata: ${JSON.stringify({ clientId, machineName })}\n\n`);

  const keepAlive = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
      clearInterval(keepAlive);
    }
  }, 25000);

  req.on("close", () => {
    clearInterval(keepAlive);
    sseClients.delete(clientId);
  });
});

// GET /api/messages/powershell-script (Clean downloadable .bat / .ps1 / Gateway scripts - NO irm|iex, NO Bypass, NO Hidden)
app.get("/api/messages/powershell-script", (req, res) => {
  const cfg = readConfig();
  const type = String(req.query.type || "bat");
  const messageId = String(req.query.messageId || "").trim();
  let title = String(req.query.title || "Aviso Importante de TI");
  let body = String(req.query.body || "Favor salvar seus documentos. Reinicializacao programada em 10 minutos.");
  let urgency = String(req.query.urgency || "warning");
  let deliveryMethod: "msg_exe" | "winrm" = req.query.deliveryMethod === "winrm" ? "winrm" : "msg_exe";
  let targetMode: "all" | "selected" = req.query.targetMode === "selected" ? "selected" : "all";
  let targetMachines = req.query.targets
    ? String(req.query.targets).split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  let targetIpMap: Record<string, string> | undefined = undefined;
  if (req.query.targetIps) {
    try {
      targetIpMap = JSON.parse(String(req.query.targetIps));
    } catch {}
  }

  let resolvedTargets: Array<{ machineName: string; ipAddress?: string }> = [];

  if (messageId) {
    const found = readMessages().find((m) => m.id === messageId);
    if (found) {
      title = found.title;
      body = found.body;
      urgency = found.urgency;
      deliveryMethod = found.deliveryMethod === "winrm" ? "winrm" : "msg_exe";
      targetMode = found.targetMode;
      targetMachines = found.targetMachines || [];
      if (found.receipts && found.receipts.length > 0) {
        resolvedTargets = found.receipts.map((r) => ({ machineName: r.machineName, ipAddress: r.ipAddress }));
      } else {
        targetIpMap = found.targetIpMap;
      }
    }
  }

  if (resolvedTargets.length === 0) {
    const built = buildTargetReceipts(targetMode, targetMachines, true, targetIpMap);
    resolvedTargets = built.receipts.map((r) => ({ machineName: r.machineName, ipAddress: r.ipAddress }));
  }

  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers.host || `localhost:${PORT}`;
  const serverUrl = `${protocol}://${host}`;

  let scriptContent = "";
  let fileName = "Enviar-Mensagem-Windows.bat";

  if (type === "bat") {
    scriptContent = generateWindowsMsgBatScript({ title, body, urgency, targetMode, resolvedTargets });
    fileName = "Enviar-Mensagem-Windows.bat";
  } else if (type === "gateway") {
    scriptContent = generateMsgGatewayScript(serverUrl);
    fileName = "DirectoryAdmin-MsgGateway.ps1";
  } else {
    scriptContent = generatePushPowerShellScript({
      title,
      body,
      urgency,
      deliveryMethod,
      targetMode,
      resolvedTargets,
      domain: cfg.domain || "inema.intranet",
      serverUrl,
      messageId
    });
    fileName = "Enviar-Alerta-MSG.ps1";
  }

  if (req.query.download === "true") {
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.send(scriptContent);
  }

  return res.json({ script: scriptContent });
});

// --- Vite Middleware / Production Server Config ---

async function bootstrap() {
  const httpServer = http.createServer(app);

  // Attach Real-Time WebSocket Server for Desktop Pop-ups & Live Console Sync
  const wss = new WebSocketServer({ server: httpServer, path: "/ws/messages" });

  wss.on("connection", (ws, req) => {
    const reqUrl = new URL(req.url || "/ws/messages", `http://${req.headers.host || "localhost"}`);
    const machineName = (reqUrl.searchParams.get("machine") || "CONSOLE-WEB").trim();
    const username = (reqUrl.searchParams.get("user") || "admin").trim();
    const role = reqUrl.searchParams.get("role") === "workstation" ? "workstation" : "console";
    const clientId = "ws_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6);
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "";

    connectedWsClients.set(clientId, {
      ws,
      clientId,
      machineName,
      username,
      role,
      ip,
      connectedAt: getBrazilTimestamp()
    });

    // Notify client with initial status and broadcast updated client list
    try {
      ws.send(JSON.stringify({
        type: "init",
        payload: {
          clientId,
          machineName,
          connectedWorkstations: getConnectedWorkstationsSnapshot()
        }
      }));
    } catch {}

    broadcastWsEvent("clients:status", getConnectedWorkstationsSnapshot());

    ws.on("message", (raw) => {
      try {
        const parsed = JSON.parse(raw.toString());
        if (parsed.type === "register") {
          const meta = connectedWsClients.get(clientId);
          if (meta) {
            if (parsed.machineName) meta.machineName = String(parsed.machineName).trim();
            if (parsed.username) meta.username = String(parsed.username).trim();
            if (parsed.role === "workstation" || parsed.role === "console") meta.role = parsed.role;
            broadcastWsEvent("clients:status", getConnectedWorkstationsSnapshot());
          }
        }
      } catch {}
    });

    ws.on("close", () => {
      connectedWsClients.delete(clientId);
      broadcastWsEvent("clients:status", getConnectedWorkstationsSnapshot());
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false
      },
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

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server + WebSocket rodando com sucesso na porta ${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error("Erro ao iniciar o servidor AD:", err);
});
