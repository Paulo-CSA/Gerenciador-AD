import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import dns from "dns";

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
  useDemoMode: true
};

// Ensure configuration file exists
if (!fs.existsSync(CONFIG_PATH)) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2), "utf8");
}

function readConfig() {
  try {
    const data = fs.readFileSync(CONFIG_PATH, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Erro ao ler ad_config.json:", error);
    return defaultConfig;
  }
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

        adInstance.findUsers((err: any) => {
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
      domain: cfg.domain
    },
    connected: test.success,
    error: test.error
  });
});

// 2. Save AD Connection Config
app.post("/api/ad/save-config", async (req, res) => {
  const { url, baseDN, username, password, domain, useDemoMode } = req.body;
  const current = readConfig();
  
  const updated = {
    url: url !== undefined ? url : current.url,
    baseDN: baseDN !== undefined ? baseDN : current.baseDN,
    username: username !== undefined ? username : current.username,
    password: password !== undefined ? password : current.password,
    domain: domain !== undefined ? domain : current.domain,
    useDemoMode: useDemoMode !== undefined ? useDemoMode : current.useDemoMode
  };

  writeConfig(updated);
  const test = await testADConnection(updated);

  res.json({
    success: true,
    connected: test.success,
    error: test.error,
    useDemoMode: updated.useDemoMode
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

  adInstance.findUsers({ includeMembership: ["group"] }, (err: any, users: any[]) => {
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

      return {
        id: user.objectGUID || String(index + 1),
        name: user.displayName || user.cn || user.sAMAccountName || "Usuário AD",
        username: user.sAMAccountName || "",
        email: user.mail || `${user.sAMAccountName}@${cfg.domain}`,
        department: user.department || "Geral",
        ou: user.dn || "",
        title: user.title || "Colaborador",
        status: status,
        createdDate: user.whenCreated ? new Date(user.whenCreated).toISOString().split("T")[0] : "2025-01-01",
        lastLogon: user.lastLogonTimestamp ? new Date(user.lastLogonTimestamp).toISOString().split("T")[0] : "2026-06-25",
        pwdLastSet: user.pwdLastSet ? "2026-05-10" : "2026-05-10",
        pwdExpired: expired,
        accountExpires: user.accountExpires === "9223372036854775807" || !user.accountExpires ? null : "2026-12-31",
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
app.get("/api/ad/logs", (req, res) => {
  const db = readDatabase();
  res.json(db.logs);
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
