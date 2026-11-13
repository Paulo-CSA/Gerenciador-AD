import http from "http";
import https from "https";
import crypto from "crypto";
import {
  createNtlmType1,
  createNtlmType3,
  ntlmSealMessage,
  NtlmSessionKeys,
  parseDomainUser,
  parseNtlmType2,
} from "./ntlm.js";

function xmlEscape(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function derLen(len: number): Buffer {
  if (len < 0x80) return Buffer.from([len]);
  if (len <= 0xff) return Buffer.from([0x81, len]);
  return Buffer.from([0x82, (len >> 8) & 0xff, len & 0xff]);
}

function derTag(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), derLen(content.length), content]);
}

// Wrap raw NTLMSSP Type 1 inside GSS-API / SPNEGO NegTokenInit (OID 1.3.6.1.4.1.311.2.2.10)
function wrapSpnegoType1(ntlmType1: Buffer): Buffer {
  const oidSpnego = Buffer.from([0x06, 0x06, 0x2b, 0x06, 0x01, 0x05, 0x05, 0x02]);
  const oidNtlm = Buffer.from([
    0x06, 0x0a, 0x2b, 0x06, 0x01, 0x04, 0x01, 0x82, 0x37, 0x02, 0x02, 0x0a,
  ]);
  const mechTypes = derTag(0xa0, derTag(0x30, oidNtlm));
  const mechToken = derTag(0xa2, derTag(0x04, ntlmType1));
  const negTokenInit = derTag(0xa0, derTag(0x30, Buffer.concat([mechTypes, mechToken])));
  return derTag(0x60, Buffer.concat([oidSpnego, negTokenInit]));
}

// Wrap raw NTLMSSP Type 3 inside SPNEGO NegTokenResp
function wrapSpnegoType3(ntlmType3: Buffer): Buffer {
  const responseToken = derTag(0xa2, derTag(0x04, ntlmType3));
  return derTag(0xa1, derTag(0x30, responseToken));
}

function buildEncryptedWinRmBody(ntlmSession: NtlmSessionKeys, soapXml: string): Buffer {
  const plainBuf = Buffer.from(soapXml, "utf8");
  const { signature, ciphertext } = ntlmSealMessage(ntlmSession, plainBuf);

  const sigLenBuf = Buffer.alloc(4);
  sigLenBuf.writeUInt32LE(signature.length, 0);
  const encryptedBlob = Buffer.concat([sigLenBuf, signature, ciphertext]);

  const head = Buffer.from(
    `--Encrypted Boundary\r\n` +
      `Content-Type: application/HTTP-SPNEGO-session-encrypted\r\n` +
      `OriginalContent: type=application/soap+xml;charset=UTF-8;Length=${plainBuf.length}\r\n` +
      `--Encrypted Boundary\r\n` +
      `Content-Type: application/octet-stream\r\n`,
    "ascii"
  );
  const tail = Buffer.from(`\r\n--Encrypted Boundary--\r\n`, "ascii");
  return Buffer.concat([head, encryptedBlob, tail]);
}

interface HttpResp {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

function httpRequest(opts: {
  protocol: "http:" | "https:";
  host: string;
  port: number;
  agent: http.Agent | https.Agent;
  headers: Record<string, string | number>;
  body: Buffer;
  timeoutMs?: number;
}): Promise<HttpResp> {
  return new Promise((resolve, reject) => {
    const lib = opts.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        host: opts.host,
        port: opts.port,
        path: "/wsman",
        method: "POST",
        agent: opts.agent,
        headers: {
          ...opts.headers,
          "Content-Length": opts.body.length,
        },
        timeout: opts.timeoutMs ?? 9000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error(`Timeout WinRM na porta ${opts.port} de ${opts.host}.`));
    });
    req.on("error", reject);
    req.write(opts.body);
    req.end();
  });
}

function buildCreateShellSoap(host: string): string {
  const msgId = `uuid:${crypto.randomUUID()}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
  xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"
  xmlns:w="http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd"
  xmlns:p="http://schemas.microsoft.com/wbem/wsman/1/windows/wsman.xsd"
  xmlns:rsp="http://schemas.microsoft.com/wbem/wsman/1/windows/shell">
  <s:Header>
    <a:To>http://${xmlEscape(host)}/wsman</a:To>
    <w:ResourceURI s:mustUnderstand="true">http://schemas.microsoft.com/wbem/wsman/1/windows/shell/cmd</w:ResourceURI>
    <a:ReplyTo><a:Address s:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</a:Address></a:ReplyTo>
    <a:Action s:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2004/09/transfer/Create</a:Action>
    <w:MaxEnvelopeSize s:mustUnderstand="true">153600</w:MaxEnvelopeSize>
    <a:MessageID>${msgId}</a:MessageID>
    <w:Locale xml:lang="en-US" s:mustUnderstand="false"/>
    <p:DataLocale xml:lang="en-US" s:mustUnderstand="false"/>
    <w:OptionSet s:mustUnderstand="true">
      <w:Option Name="WINRS_NOPROFILE">TRUE</w:Option>
      <w:Option Name="WINRS_CODEPAGE">65001</w:Option>
    </w:OptionSet>
    <w:OperationTimeout>PT10.000S</w:OperationTimeout>
  </s:Header>
  <s:Body>
    <rsp:Shell>
      <rsp:InputStreams>stdin</rsp:InputStreams>
      <rsp:OutputStreams>stdout stderr</rsp:OutputStreams>
    </rsp:Shell>
  </s:Body>
</s:Envelope>`;
}

function buildRunCommandSoap(host: string, shellId: string, command: string, args: string[]): string {
  const msgId = `uuid:${crypto.randomUUID()}`;
  const argsXml = args.map((a) => `<rsp:Arguments>${xmlEscape(a)}</rsp:Arguments>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
  xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"
  xmlns:w="http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd"
  xmlns:rsp="http://schemas.microsoft.com/wbem/wsman/1/windows/shell">
  <s:Header>
    <a:To>http://${xmlEscape(host)}/wsman</a:To>
    <w:ResourceURI s:mustUnderstand="true">http://schemas.microsoft.com/wbem/wsman/1/windows/shell/cmd</w:ResourceURI>
    <a:ReplyTo><a:Address s:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</a:Address></a:ReplyTo>
    <a:Action s:mustUnderstand="true">http://schemas.microsoft.com/wbem/wsman/1/windows/shell/Command</a:Action>
    <w:MaxEnvelopeSize s:mustUnderstand="true">153600</w:MaxEnvelopeSize>
    <a:MessageID>${msgId}</a:MessageID>
    <w:SelectorSet><w:Selector Name="ShellId">${xmlEscape(shellId)}</w:Selector></w:SelectorSet>
    <w:OperationTimeout>PT10.000S</w:OperationTimeout>
  </s:Header>
  <s:Body>
    <rsp:CommandLine>
      <rsp:Command>${xmlEscape(command)}</rsp:Command>
      ${argsXml}
    </rsp:CommandLine>
  </s:Body>
</s:Envelope>`;
}

function buildDeleteShellSoap(host: string, shellId: string): string {
  const msgId = `uuid:${crypto.randomUUID()}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
  xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"
  xmlns:w="http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd">
  <s:Header>
    <a:To>http://${xmlEscape(host)}/wsman</a:To>
    <w:ResourceURI s:mustUnderstand="true">http://schemas.microsoft.com/wbem/wsman/1/windows/shell/cmd</w:ResourceURI>
    <a:ReplyTo><a:Address s:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</a:Address></a:ReplyTo>
    <a:Action s:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2004/09/transfer/Delete</a:Action>
    <w:MaxEnvelopeSize s:mustUnderstand="true">153600</w:MaxEnvelopeSize>
    <a:MessageID>${msgId}</a:MessageID>
    <w:SelectorSet><w:Selector Name="ShellId">${xmlEscape(shellId)}</w:Selector></w:SelectorSet>
    <w:OperationTimeout>PT5.000S</w:OperationTimeout>
  </s:Header>
  <s:Body/>
</s:Envelope>`;
}

function tryDecryptWinRmResponse(ntlmSession: NtlmSessionKeys | null, resp: HttpResp): string {
  const ct = String(resp.headers["content-type"] || "");
  if (!ntlmSession || !ct.toLowerCase().includes("multipart/encrypted")) {
    return resp.body.toString("utf8");
  }
  const marker = Buffer.from("Content-Type: application/octet-stream\r\n", "ascii");
  const idx = resp.body.indexOf(marker);
  if (idx === -1) return resp.body.toString("utf8");

  let start = idx + marker.length;
  // Skip optional \r\n if present after header
  if (resp.body[start] === 0x0d && resp.body[start + 1] === 0x0a) start += 2;

  const endBoundary = resp.body.indexOf(Buffer.from("\r\n--Encrypted Boundary", "ascii"), start);
  const blob = endBoundary !== -1 ? resp.body.subarray(start, endBoundary) : resp.body.subarray(start);
  if (blob.length < 20) return resp.body.toString("utf8");

  const sigLen = blob.readUInt32LE(0);
  const ciphertext = blob.subarray(4 + sigLen);
  return ntlmSession.serverSealRc4.process(ciphertext).toString("utf8");
}

async function runWinRmAttempt(params: {
  protocol: "http:" | "https:";
  host: string;
  port: number;
  username: string;
  password: string;
  domain: string;
  commandText: string;
}): Promise<{ ok: boolean; error?: string; tryNext?: boolean }> {
  const agent =
    params.protocol === "https:"
      ? new https.Agent({ keepAlive: true, maxSockets: 1, rejectUnauthorized: false })
      : new http.Agent({ keepAlive: true, maxSockets: 1 });

  try {
    const soapCreate = buildCreateShellSoap(params.host);
    const useHttps = params.protocol === "https:";
    const scheme = "Negotiate";

    // Step 1: Send Type 1 Negotiate (SPNEGO wrapped)
    const type1 = createNtlmType1(!useHttps);
    const spnego1 = wrapSpnegoType1(type1);
    const initResp = await httpRequest({
      protocol: params.protocol,
      host: params.host,
      port: params.port,
      agent,
      headers: {
        Authorization: `${scheme} ${spnego1.toString("base64")}`,
        "Content-Type": "application/soap+xml;charset=UTF-8",
      },
      body: Buffer.alloc(0),
    });

    if (initResp.statusCode === 401) {
      const wwwAuth = ([] as string[])
        .concat(initResp.headers["www-authenticate"] || [])
        .join(", ");

      const match = wwwAuth.match(/(?:Negotiate|NTLM)\s+([A-Za-z0-9+/=]+)/i);
      if (!match) {
        // Fallback to Basic over HTTPS if server only offers Basic
        if (useHttps && /Basic/i.test(wwwAuth)) {
          const parsed = parseDomainUser(params.username, params.domain);
          const basicUser = parsed.domain ? `${parsed.domain}\\${parsed.user}` : parsed.user;
          const basicAuth = Buffer.from(`${basicUser}:${params.password}`, "utf8").toString("base64");
          const basicResp = await httpRequest({
            protocol: params.protocol,
            host: params.host,
            port: params.port,
            agent,
            headers: {
              Authorization: `Basic ${basicAuth}`,
              "Content-Type": "application/soap+xml;charset=UTF-8",
            },
            body: Buffer.from(soapCreate, "utf8"),
          });
          if (basicResp.statusCode !== 200) {
            return { ok: false, error: `WinRM HTTPS Basic HTTP ${basicResp.statusCode}` };
          }
          const shellId = basicResp.body.toString("utf8").match(/<rsp:ShellId>([^<]+)<\/rsp:ShellId>/)?.[1];
          if (!shellId) return { ok: false, error: "WinRM HTTPS não retornou ShellId." };
          const cmdSoap = buildRunCommandSoap(params.host, shellId, "msg.exe", [
            "*",
            "/TIME:0",
            params.commandText,
          ]);
          const cmdResp = await httpRequest({
            protocol: params.protocol,
            host: params.host,
            port: params.port,
            agent,
            headers: {
              Authorization: `Basic ${basicAuth}`,
              "Content-Type": "application/soap+xml;charset=UTF-8",
            },
            body: Buffer.from(cmdSoap, "utf8"),
          });
          await httpRequest({
            protocol: params.protocol,
            host: params.host,
            port: params.port,
            agent,
            headers: {
              Authorization: `Basic ${basicAuth}`,
              "Content-Type": "application/soap+xml;charset=UTF-8",
            },
            body: Buffer.from(buildDeleteShellSoap(params.host, shellId), "utf8"),
          }).catch(() => {});
          return cmdResp.statusCode === 200
            ? { ok: true }
            : { ok: false, error: `WinRM comando retornou HTTP ${cmdResp.statusCode}` };
        }

        return { ok: false, error: `WinRM HTTP 401 sem desafio NTLM/Negotiate (${wwwAuth || "vazio"}).` };
      }

      const type2 = parseNtlmType2(Buffer.from(match[1], "base64"));
      const ntlmSession = createNtlmType3({
        username: params.username,
        password: params.password,
        fallbackDomain: params.domain,
        type2,
        requestSeal: !useHttps,
      });

      const spnego3 = wrapSpnegoType3(ntlmSession.type3Message);
      const sendSoap = async (soap: string, extraAuth?: string): Promise<HttpResp> => {
        if (useHttps) {
          return httpRequest({
            protocol: params.protocol,
            host: params.host,
            port: params.port,
            agent,
            headers: {
              ...(extraAuth ? { Authorization: extraAuth } : {}),
              "Content-Type": "application/soap+xml;charset=UTF-8",
            },
            body: Buffer.from(soap, "utf8"),
          });
        }
        const sealedBody = buildEncryptedWinRmBody(ntlmSession, soap);
        return httpRequest({
          protocol: params.protocol,
          host: params.host,
          port: params.port,
          agent,
          headers: {
            ...(extraAuth ? { Authorization: extraAuth } : {}),
            "Content-Type":
              'multipart/encrypted;protocol="application/HTTP-SPNEGO-session-encrypted";boundary="Encrypted Boundary"',
          },
          body: sealedBody,
        });
      };

      const createResp = await sendSoap(soapCreate, `${scheme} ${spnego3.toString("base64")}`);
      if (createResp.statusCode === 401) {
        return { ok: false, error: "Credenciais AD recusadas pelo WinRM no destino (HTTP 401)." };
      }
      if (createResp.statusCode !== 200) {
        return {
          ok: false,
          error: `WinRM CreateShell falhou (HTTP ${createResp.statusCode}).`,
        };
      }

      const createXml = tryDecryptWinRmResponse(useHttps ? null : ntlmSession, createResp);
      const shellId =
        createXml.match(/<rsp:ShellId>([^<]+)<\/rsp:ShellId>/)?.[1] ||
        createXml.match(/Name="ShellId">([^<]+)</)?.[1];
      if (!shellId) {
        return { ok: false, error: "WinRM conectado, mas ShellId não foi encontrado na resposta SOAP." };
      }

      const cmdSoap = buildRunCommandSoap(params.host, shellId, "msg.exe", [
        "*",
        "/TIME:0",
        params.commandText,
      ]);
      const cmdResp = await sendSoap(cmdSoap);
      await sendSoap(buildDeleteShellSoap(params.host, shellId)).catch(() => {});

      if (cmdResp.statusCode === 200) {
        return { ok: true };
      }
      return { ok: false, error: `WinRM executou CreateShell mas falhou no comando (HTTP ${cmdResp.statusCode}).` };
    }

    return { ok: false, error: `WinRM retornou HTTP inesperado (${initResp.statusCode}).` };
  } catch (err: any) {
    const code = err?.code || "";
    if (code === "ECONNREFUSED") {
      return {
        ok: false,
        tryNext: true,
        error: `Porta WinRM ${params.port} recusada em ${params.host} (WinRM não habilitado ou bloqueado no firewall).`,
      };
    }
    return {
      ok: false,
      tryNext: true,
      error: err?.message || `Falha WinRM em ${params.host}:${params.port}`,
    };
  } finally {
    agent.destroy();
  }
}

export async function sendWinRmDirect(opts: {
  dest: string;
  text: string;
  username: string;
  password: string;
  domain?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const dest = String(opts.dest || "").trim();
  if (!dest) return { ok: false, error: "IP/Destino não informado." };
  if (!opts.username || !opts.password) {
    return {
      ok: false,
      error: "Credenciais do Active Directory não configuradas no servidor (necessárias para WinRM).",
    };
  }

  const safeText = String(opts.text || "").replace(/\r?\n/g, " ").trim().slice(0, 950);

  // Try HTTP WinRM (5985) with SPNEGO/NTLMv2 message encryption first
  const res5985 = await runWinRmAttempt({
    protocol: "http:",
    host: dest,
    port: 5985,
    username: opts.username,
    password: opts.password,
    domain: opts.domain || "",
    commandText: safeText,
  });
  if (res5985.ok) return { ok: true };

  // Fallback to HTTPS WinRM (5986) if HTTP 5985 was refused/unreachable
  if (res5985.tryNext) {
    const res5986 = await runWinRmAttempt({
      protocol: "https:",
      host: dest,
      port: 5986,
      username: opts.username,
      password: opts.password,
      domain: opts.domain || "",
      commandText: safeText,
    });
    if (res5986.ok) return { ok: true };
    return {
      ok: false,
      error: `${res5985.error} | HTTPS 5986: ${res5986.error}`,
    };
  }

  return { ok: false, error: res5985.error };
}
