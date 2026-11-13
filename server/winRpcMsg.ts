import net from "net";
import crypto from "crypto";
import { createNtlmType1, createNtlmType3, NtlmSessionKeys, parseNtlmType2 } from "./ntlm.js";

const SMB2_PROTO_ID = Buffer.from([0xfe, 0x53, 0x4d, 0x42]);

const CMD = {
  NEGOTIATE: 0x0000,
  SESSION_SETUP: 0x0001,
  LOGOFF: 0x0002,
  TREE_CONNECT: 0x0003,
  TREE_DISCONNECT: 0x0004,
  CREATE: 0x0005,
  CLOSE: 0x0006,
  READ: 0x0008,
  WRITE: 0x0009,
  IOCTL: 0x000b,
} as const;

const STATUS = {
  SUCCESS: 0x00000000,
  MORE_PROCESSING_REQUIRED: 0xc0000016,
  PENDING: 0x00000103,
  BUFFER_OVERFLOW: 0x80000005,
} as const;

// UUIDs in mixed-endian DCE/RPC wire format
const UUID_NDR32 = uuidToBytes("8a885d04-1ceb-11c9-9fe8-08002b104860");
const UUID_LEGACY_WINSTATION = uuidToBytes("5ca4a760-ebb1-11cf-8611-00a0245420ed");
const UUID_TERMSRV_SESSION = uuidToBytes("484809d6-4239-471b-b5bc-61df8c23ac48");

function uuidToBytes(uuid: string): Buffer {
  const clean = uuid.replace(/-/g, "");
  const out = Buffer.alloc(16);
  out.writeUInt32LE(parseInt(clean.slice(0, 8), 16) >>> 0, 0);
  out.writeUInt16LE(parseInt(clean.slice(8, 12), 16), 4);
  out.writeUInt16LE(parseInt(clean.slice(12, 16), 16), 6);
  Buffer.from(clean.slice(16, 32), "hex").copy(out, 8);
  return out;
}

export function formatNtStatus(code: number): string {
  const u = code >>> 0;
  const hex = "0x" + u.toString(16).padStart(8, "0").toUpperCase();
  const map: Record<number, string> = {
    0xc000006d: "Credenciais inválidas no destino (STATUS_LOGON_FAILURE)",
    0xc000006e: "Restrição na conta de usuário (STATUS_ACCOUNT_RESTRICTION)",
    0xc0000072: "Conta desativada no AD (STATUS_ACCOUNT_DISABLED)",
    0xc0000022: "Acesso negado no destino (STATUS_ACCESS_DENIED — verifique permissão de admin/WINSTATION_MSG)",
    0x80070005: "Acesso negado no destino (E_ACCESSDENIED — conta precisa de permissão WINSTATION_MSG/Admin)",
    0xc0000034: "Pipe RPC não encontrado na estação (STATUS_OBJECT_NAME_NOT_FOUND)",
    0xc00000ac: "Pipe RPC temporariamente indisponível (STATUS_PIPE_NOT_AVAILABLE)",
    0xc00000cc: "Compartilhamento IPC$ inacessível (STATUS_BAD_NETWORK_NAME)",
    0xc0000001: "Falha interna no serviço remoto (STATUS_UNSUCCESSFUL)",
  };
  return map[u] ? `${map[u]} [${hex}]` : `Erro Windows [${hex}]`;
}

class Smb2Connection {
  private socket: net.Socket;
  private recvBuf = Buffer.alloc(0);
  private pendingFrames: Array<{ resolve: (buf: Buffer) => void; reject: (err: Error) => void }> = [];
  private closed = false;
  private messageId = 0n;
  private sessionId = 0n;
  private treeId = 0;
  private signingRequired = false;
  private authenticated = false;
  private signingKey: Buffer | null = null;
  private callId = 1;

  constructor(host: string, port: number = 445, timeoutMs: number = 10000) {
    this.socket = new net.Socket();
    this.socket.setTimeout(timeoutMs);

    this.socket.on("data", (chunk: Buffer) => {
      this.recvBuf = Buffer.concat([this.recvBuf, chunk]);
      this.drainFrames();
    });

    this.socket.on("error", (err) => {
      this.failAll(err);
    });

    this.socket.on("timeout", () => {
      this.failAll(new Error(`Timeout ao conectar na porta ${port} de ${host} (verifique firewall TCP 445).`));
      this.socket.destroy();
    });

    this.socket.on("close", () => {
      this.closed = true;
      this.failAll(new Error("Conexão SMB2 encerrada inesperadamente."));
    });
  }

  private failAll(err: Error) {
    while (this.pendingFrames.length > 0) {
      const waiter = this.pendingFrames.shift();
      waiter?.reject(err);
    }
  }

  private drainFrames() {
    while (this.recvBuf.length >= 4) {
      const frameLen =
        ((this.recvBuf[1] << 16) | (this.recvBuf[2] << 8) | this.recvBuf[3]) >>> 0;
      if (this.recvBuf.length < 4 + frameLen) break;
      const packet = Buffer.from(this.recvBuf.subarray(4, 4 + frameLen));
      this.recvBuf = this.recvBuf.subarray(4 + frameLen);
      const waiter = this.pendingFrames.shift();
      waiter?.resolve(packet);
    }
  }

  connect(host: string, port: number = 445): Promise<void> {
    return new Promise((resolve, reject) => {
      const onErr = (err: Error) => {
        cleanup();
        reject(err);
      };
      const onConnect = () => {
        cleanup();
        resolve();
      };
      const cleanup = () => {
        this.socket.removeListener("error", onErr);
        this.socket.removeListener("connect", onConnect);
      };
      this.socket.once("error", onErr);
      this.socket.once("connect", onConnect);
      this.socket.connect(port, host);
    });
  }

  close() {
    if (!this.closed) {
      this.closed = true;
      try {
        this.socket.destroy();
      } catch {
        // ignore
      }
    }
  }

  private nextFrame(): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      if (this.closed) return reject(new Error("Conexão SMB2 fechada."));
      this.pendingFrames.push({ resolve, reject });
    });
  }

  private async transact(
    command: number,
    body: Buffer,
    options?: { treeId?: number; creditCharge?: number }
  ): Promise<{ status: number; header: Buffer; body: Buffer }> {
    const msgId = this.messageId++;
    const packet = Buffer.alloc(64 + body.length);
    SMB2_PROTO_ID.copy(packet, 0);
    packet.writeUInt16LE(64, 4); // StructureSize
    packet.writeUInt16LE(options?.creditCharge ?? 1, 6); // CreditCharge
    packet.writeUInt32LE(0, 8); // Status
    packet.writeUInt16LE(command, 12);
    packet.writeUInt16LE(1, 14); // CreditRequest
    packet.writeUInt32LE(0, 16); // Flags
    packet.writeUInt32LE(0, 20); // NextCommand
    packet.writeBigUInt64LE(msgId, 24);
    packet.writeUInt32LE(0, 32); // Reserved
    packet.writeUInt32LE(options?.treeId ?? this.treeId, 36);
    packet.writeBigUInt64LE(this.sessionId, 40);
    body.copy(packet, 64);

    if (this.authenticated && this.signingRequired && this.signingKey && this.sessionId !== 0n) {
      packet.writeUInt32LE(0x00000008, 16); // SMB2_FLAGS_SIGNED
      const sig = crypto
        .createHmac("sha256", this.signingKey)
        .update(packet)
        .digest()
        .subarray(0, 16);
      sig.copy(packet, 48);
    }

    const nbHeader = Buffer.alloc(4);
    nbHeader[0] = 0;
    nbHeader[1] = (packet.length >> 16) & 0xff;
    nbHeader[2] = (packet.length >> 8) & 0xff;
    nbHeader[3] = packet.length & 0xff;

    this.socket.write(Buffer.concat([nbHeader, packet]));

    while (true) {
      const resp = await this.nextFrame();
      if (resp.length < 64 || !resp.subarray(0, 4).equals(SMB2_PROTO_ID)) {
        throw new Error("Pacote de resposta SMB2 inválido.");
      }
      const status = resp.readUInt32LE(8) >>> 0;
      const flags = resp.readUInt32LE(16) >>> 0;
      // Ignore STATUS_PENDING interim async responses and wait for final completion frame
      if (status === STATUS.PENDING && (flags & 0x00000002)) {
        continue;
      }
      return {
        status,
        header: resp.subarray(0, 64),
        body: resp.subarray(64),
      };
    }
  }

  async negotiate(): Promise<void> {
    const dialects = [0x0202, 0x0210];
    const body = Buffer.alloc(36 + dialects.length * 2);
    body.writeUInt16LE(36, 0); // StructureSize
    body.writeUInt16LE(dialects.length, 2); // DialectCount
    body.writeUInt16LE(0x0001, 4); // SecurityMode: SIGNING_ENABLED
    // Capabilities(8..12) = 0
    crypto.randomBytes(16).copy(body, 12); // ClientGuid
    for (let i = 0; i < dialects.length; i++) {
      body.writeUInt16LE(dialects[i], 36 + i * 2);
    }

    const resp = await this.transact(CMD.NEGOTIATE, body, { treeId: 0, creditCharge: 0 });
    if (resp.status !== STATUS.SUCCESS) {
      throw new Error(`SMB2 NEGOTIATE falhou: ${formatNtStatus(resp.status)}`);
    }
    const secMode = resp.body.readUInt16LE(2);
    if (secMode & 0x0002) {
      this.signingRequired = true;
    }
  }

  async authenticate(username: string, password: string, fallbackDomain: string): Promise<void> {
    const type1 = createNtlmType1(false);
    const body1 = Buffer.alloc(24 + type1.length);
    body1.writeUInt16LE(25, 0); // StructureSize
    body1[2] = 0; // Flags
    body1[3] = 0x01; // SecurityMode: SIGNING_ENABLED
    body1.writeUInt32LE(0, 4); // Capabilities
    body1.writeUInt32LE(0, 8); // Channel
    body1.writeUInt16LE(64 + 24, 12); // SecurityBufferOffset
    body1.writeUInt16LE(type1.length, 14); // SecurityBufferLength
    type1.copy(body1, 24);

    const resp1 = await this.transact(CMD.SESSION_SETUP, body1, { treeId: 0 });
    if (
      resp1.status !== STATUS.MORE_PROCESSING_REQUIRED &&
      resp1.status !== STATUS.SUCCESS
    ) {
      throw new Error(`SMB2 SESSION_SETUP (etapa 1) falhou: ${formatNtStatus(resp1.status)}`);
    }

    this.sessionId = resp1.header.readBigUInt64LE(40);
    const secOff = resp1.body.readUInt16LE(4) - 64;
    const secLen = resp1.body.readUInt16LE(6);
    const secBuf = resp1.body.subarray(secOff, secOff + secLen);
    const type2 = parseNtlmType2(secBuf);

    const session: NtlmSessionKeys = createNtlmType3({
      username,
      password,
      fallbackDomain,
      type2,
      requestSeal: false,
    });
    this.signingKey = session.exportedSessionKey;

    const type3 = session.type3Message;
    const body2 = Buffer.alloc(24 + type3.length);
    body2.writeUInt16LE(25, 0);
    body2[2] = 0;
    body2[3] = 0x01;
    body2.writeUInt32LE(0, 4);
    body2.writeUInt32LE(0, 8);
    body2.writeUInt16LE(64 + 24, 12);
    body2.writeUInt16LE(type3.length, 14);
    type3.copy(body2, 24);

    const resp2 = await this.transact(CMD.SESSION_SETUP, body2, { treeId: 0 });
    if (resp2.status !== STATUS.SUCCESS) {
      throw new Error(`Autenticação SMB2/NTLMv2 falhou: ${formatNtStatus(resp2.status)}`);
    }
    this.sessionId = resp2.header.readBigUInt64LE(40);
    this.authenticated = true;
  }

  async treeConnectIpc(host: string): Promise<void> {
    const sharePath = Buffer.from(`\\\\${host}\\IPC$`, "utf16le");
    const body = Buffer.alloc(8 + sharePath.length);
    body.writeUInt16LE(9, 0); // StructureSize
    body.writeUInt16LE(0, 2); // Flags
    body.writeUInt16LE(64 + 8, 4); // PathOffset
    body.writeUInt16LE(sharePath.length, 6); // PathLength
    sharePath.copy(body, 8);

    const resp = await this.transact(CMD.TREE_CONNECT, body, { treeId: 0 });
    if (resp.status !== STATUS.SUCCESS) {
      throw new Error(`Falha ao conectar em \\\\${host}\\IPC$: ${formatNtStatus(resp.status)}`);
    }
    this.treeId = resp.header.readUInt32LE(36);
  }

  async openPipe(pipeName: string): Promise<Buffer> {
    const nameBuf = Buffer.from(pipeName, "utf16le");
    const body = Buffer.alloc(56 + nameBuf.length);
    body.writeUInt16LE(57, 0); // StructureSize
    body[2] = 0; // SecurityFlags
    body[3] = 0; // RequestedOplockLevel: NONE
    body.writeUInt32LE(2, 4); // ImpersonationLevel: Impersonation
    // SmbCreateFlags (8..16) = 0, Reserved (16..24) = 0
    body.writeUInt32LE(0x0012019f, 24); // DesiredAccess
    body.writeUInt32LE(0, 28); // FileAttributes
    body.writeUInt32LE(3, 32); // ShareAccess: FILE_SHARE_READ | FILE_SHARE_WRITE
    body.writeUInt32LE(1, 36); // CreateDisposition: FILE_OPEN
    body.writeUInt32LE(0, 40); // CreateOptions
    body.writeUInt16LE(64 + 56, 44); // NameOffset
    body.writeUInt16LE(nameBuf.length, 46); // NameLength
    body.writeUInt32LE(0, 48); // CreateContextsOffset
    body.writeUInt32LE(0, 52); // CreateContextsLength
    nameBuf.copy(body, 56);

    const resp = await this.transact(CMD.CREATE, body);
    if (resp.status !== STATUS.SUCCESS) {
      throw new Error(`Falha ao abrir pipe \\${pipeName}: ${formatNtStatus(resp.status)}`);
    }
    return Buffer.from(resp.body.subarray(64, 80)); // 16-byte SMB2_FILEID
  }

  async closeHandle(fileId: Buffer): Promise<void> {
    const body = Buffer.alloc(24);
    body.writeUInt16LE(24, 0); // StructureSize
    body.writeUInt16LE(0, 2); // Flags
    fileId.copy(body, 8);
    try {
      await this.transact(CMD.CLOSE, body);
    } catch {
      // ignore cleanup error
    }
  }

  async treeDisconnect(): Promise<void> {
    const body = Buffer.alloc(4);
    body.writeUInt16LE(4, 0);
    try {
      await this.transact(CMD.TREE_DISCONNECT, body);
    } catch {
      // ignore
    }
  }

  async logoff(): Promise<void> {
    const body = Buffer.alloc(4);
    body.writeUInt16LE(4, 0);
    try {
      await this.transact(CMD.LOGOFF, body, { treeId: 0 });
    } catch {
      // ignore
    }
  }

  private async pipeRead(fileId: Buffer, length: number = 8192): Promise<Buffer> {
    const body = Buffer.alloc(48);
    body.writeUInt16LE(49, 0); // StructureSize
    body[2] = 0; // Padding
    body[3] = 0; // Flags
    body.writeUInt32LE(length, 4); // Length
    body.writeBigUInt64LE(0n, 8); // Offset
    fileId.copy(body, 16); // FileId
    body.writeUInt32LE(1, 32); // MinimumCount
    // Channel/RemainingBytes/ReadChannelInfo = 0
    const resp = await this.transact(CMD.READ, body);
    if (resp.status !== STATUS.SUCCESS && resp.status !== STATUS.BUFFER_OVERFLOW) {
      throw new Error(`SMB2 READ falhou: ${formatNtStatus(resp.status)}`);
    }
    const dataOff = resp.body[2] - 64;
    const dataLen = resp.body.readUInt32LE(4);
    return Buffer.from(resp.body.subarray(dataOff, dataOff + dataLen));
  }

  private async transceivePipe(fileId: Buffer, rpcPdu: Buffer): Promise<Buffer> {
    const body = Buffer.alloc(56 + rpcPdu.length);
    body.writeUInt16LE(57, 0); // StructureSize
    body.writeUInt32LE(0x0011c017, 4); // FSCTL_PIPE_TRANSCEIVE
    fileId.copy(body, 8); // FileId (8..24)
    body.writeUInt32LE(64 + 56, 24); // InputOffset
    body.writeUInt32LE(rpcPdu.length, 28); // InputCount
    body.writeUInt32LE(0, 32); // MaxInputResponse
    body.writeUInt32LE(64 + 56, 36); // OutputOffset
    body.writeUInt32LE(0, 40); // OutputCount
    body.writeUInt32LE(65535, 44); // MaxOutputResponse
    body.writeUInt32LE(0x00000001, 48); // Flags: SMB2_0_IOCTL_IS_FSCTL
    rpcPdu.copy(body, 56);

    const resp = await this.transact(CMD.IOCTL, body);
    if (resp.status !== STATUS.SUCCESS && resp.status !== STATUS.BUFFER_OVERFLOW) {
      throw new Error(`SMB2 FSCTL_PIPE_TRANSCEIVE falhou: ${formatNtStatus(resp.status)}`);
    }
    const outOff = resp.body.readUInt32LE(32) - 64;
    const outLen = resp.body.readUInt32LE(36);
    const firstChunk = Buffer.from(resp.body.subarray(outOff, outOff + outLen));

    if (resp.status === STATUS.BUFFER_OVERFLOW) {
      const extra = await this.pipeRead(fileId, 65535);
      return Buffer.concat([firstChunk, extra]);
    }
    return firstChunk;
  }

  async rpcBind(fileId: Buffer, interfaceUuid: Buffer, verMajor: number = 1, verMinor: number = 0): Promise<void> {
    const cid = this.callId++;
    const pdu = Buffer.alloc(72);
    pdu[0] = 5; // rpc_vers
    pdu[1] = 0; // rpc_vers_minor
    pdu[2] = 11; // PTYPE = BIND
    pdu[3] = 0x03; // PFC_FIRST_FRAG | PFC_LAST_FRAG
    pdu.writeUInt32LE(0x00000010, 4); // Little-endian ASCII/IEEE NDR
    pdu.writeUInt16LE(72, 8); // frag_length
    pdu.writeUInt16LE(0, 10); // auth_length
    pdu.writeUInt32LE(cid, 12); // call_id
    pdu.writeUInt16LE(4280, 16); // max_xmit_frag
    pdu.writeUInt16LE(4280, 18); // max_recv_frag
    pdu.writeUInt32LE(0, 20); // assoc_group_id
    pdu[24] = 1; // p_context_elem.n_context_elem
    // pdu[25..28] reserved/pad
    pdu.writeUInt16LE(0, 28); // p_cont_id
    pdu[30] = 1; // n_transfer_syn
    pdu[31] = 0; // reserved
    interfaceUuid.copy(pdu, 32); // abstract_syntax UUID
    pdu.writeUInt16LE(verMajor, 48);
    pdu.writeUInt16LE(verMinor, 50);
    UUID_NDR32.copy(pdu, 52); // transfer_syntax NDR32
    pdu.writeUInt16LE(2, 68);
    pdu.writeUInt16LE(0, 70);

    const resp = await this.transceivePipe(fileId, pdu);
    if (resp.length < 24 || resp[2] !== 12) {
      throw new Error(`DCE/RPC BIND rejeitado (packetType=${resp[2] ?? "desconhecido"}).`);
    }
  }

  async rpcCall(fileId: Buffer, opnum: number, stub: Buffer): Promise<Buffer> {
    const cid = this.callId++;
    const fragLen = 24 + stub.length;
    const pdu = Buffer.alloc(fragLen);
    pdu[0] = 5;
    pdu[1] = 0;
    pdu[2] = 0; // REQUEST
    pdu[3] = 0x03; // FIRST | LAST
    pdu.writeUInt32LE(0x00000010, 4);
    pdu.writeUInt16LE(fragLen, 8);
    pdu.writeUInt16LE(0, 10);
    pdu.writeUInt32LE(cid, 12);
    pdu.writeUInt32LE(stub.length, 16); // alloc_hint
    pdu.writeUInt16LE(0, 20); // p_cont_id
    pdu.writeUInt16LE(opnum, 22);
    stub.copy(pdu, 24);

    let resp = await this.transceivePipe(fileId, pdu);
    const chunks: Buffer[] = [];

    while (true) {
      if (resp.length < 24) {
        throw new Error("Resposta DCE/RPC incompleta.");
      }
      const ptype = resp[2];
      const pfcFlags = resp[3];
      const thisFragLen = resp.readUInt16LE(8);
      if (ptype === 3) {
        // FAULT
        const faultCode = resp.length >= 28 ? resp.readUInt32LE(24) : 0;
        throw new Error(`DCE/RPC FAULT na chamada opnum ${opnum}: ${formatNtStatus(faultCode)}`);
      }
      if (ptype !== 2) {
        throw new Error(`Resposta DCE/RPC inesperada (ptype=${ptype}).`);
      }
      const end = Math.min(resp.length, thisFragLen);
      chunks.push(resp.subarray(24, end));
      if (pfcFlags & 0x02) break; // PFC_LAST_FRAG
      resp = await this.pipeRead(fileId, 65535);
    }

    return Buffer.concat(chunks);
  }
}

function encodeNdrConformantString(text: string): Buffer {
  const utf16 = Buffer.from(text + "\0", "utf16le");
  const charCount = text.length + 1;
  const rawLen = 12 + utf16.length;
  const paddedLen = (rawLen + 3) & ~3;
  const buf = Buffer.alloc(paddedLen);
  buf.writeUInt32LE(charCount, 0); // MaxCount
  buf.writeUInt32LE(0, 4); // Offset
  buf.writeUInt32LE(charCount, 8); // ActualCount
  utf16.copy(buf, 12);
  return buf;
}

async function enumerateActiveSessionIds(conn: Smb2Connection): Promise<number[]> {
  let fileId: Buffer | null = null;
  try {
    fileId = await conn.openPipe("Ctx_WinStation_API_service");
    await conn.rpcBind(fileId, UUID_LEGACY_WINSTATION, 1, 0);

    // Opnum 0: RpcWinStationOpenServer
    const openResp = await conn.rpcCall(fileId, 0, Buffer.alloc(0));
    if (openResp.length < 24) return [];
    const pResult = openResp.readUInt32LE(0);
    const hServer = openResp.subarray(4, 24);
    if (pResult !== 0) return [];

    try {
      // Opnum 3: RpcWinStationEnumerate
      const enumStub = Buffer.alloc(36);
      hServer.copy(enumStub, 0);
      // pEntries=0, pLogonId=NULL(0), pByteCount=0, pIndex=0
      const enumResp = await conn.rpcCall(fileId, 3, enumStub);
      if (enumResp.length < 16) return [];

      const enumStatus = enumResp.readUInt32LE(0);
      const entries = enumResp.readUInt32LE(4);
      const referentId = enumResp.readUInt32LE(8);
      if (enumStatus !== 0 || entries === 0 || referentId === 0 || enumResp.length < 16) {
        return [];
      }

      const maxCount = enumResp.readUInt32LE(12);
      const dataStart = 16;
      const dataEnd = dataStart + maxCount;
      if (dataEnd > enumResp.length || entries === 0) return [];

      const entrySize = Math.floor(maxCount / entries);
      if (entrySize < 12) return [];

      const activeIds: number[] = [];
      const fallbackIds: number[] = [];
      for (let i = 0; i < entries; i++) {
        const off = dataStart + i * entrySize;
        const sessionId = enumResp.readUInt32LE(off);
        const state = enumResp.readUInt32LE(off + entrySize - 4);
        if (sessionId === 0 || sessionId >= 65536) continue;
        // WINSTATIONSTATECLASS: 0 = Active, 1 = Connected, 4 = Disconnected
        if (state === 0 || state === 1) {
          activeIds.push(sessionId);
        } else if (state !== 6 && state !== 9) {
          fallbackIds.push(sessionId);
        }
      }
      return activeIds.length > 0 ? activeIds : fallbackIds;
    } finally {
      // Opnum 1: RpcWinStationCloseServer
      try {
        await conn.rpcCall(fileId, 1, hServer);
      } catch {
        // ignore
      }
    }
  } catch {
    return [];
  } finally {
    if (fileId) {
      await conn.closeHandle(fileId);
    }
  }
}

export interface DirectRpcMsgOptions {
  dest: string;
  title: string;
  message: string;
  urgency?: "info" | "warning" | "urgent";
  username: string;
  password: string;
  domain?: string;
  timeoutSeconds?: number;
  port?: number;
}

export async function sendWindowsRpcMsg(
  opts: DirectRpcMsgOptions
): Promise<{ ok: boolean; sessionsNotified?: number; error?: string }> {
  const dest = String(opts.dest || "").trim();
  if (!dest) return { ok: false, error: "IP/Destino não informado." };
  if (!opts.username || !opts.password) {
    return {
      ok: false,
      error: "Credenciais do Active Directory não configuradas no servidor (necessárias para autenticar SMB2/RPC no Windows de destino).",
    };
  }

  const targetPort = opts.port ?? 445;
  const conn = new Smb2Connection(dest, targetPort, 11000);
  let lsmFileId: Buffer | null = null;

  try {
    await conn.connect(dest, targetPort);
    await conn.negotiate();
    await conn.authenticate(opts.username, opts.password, opts.domain || "");
    await conn.treeConnectIpc(dest);

    let sessionIds = await enumerateActiveSessionIds(conn);
    const hadExactEnum = sessionIds.length > 0;
    if (!hadExactEnum) {
      // Probe common interactive user sessions (1..5) cleanly via TermSrvSession::RpcOpenSession
      sessionIds = [1, 2, 3, 4, 5];
    }

    lsmFileId = await conn.openPipe("LSM_API_service");
    await conn.rpcBind(lsmFileId, UUID_TERMSRV_SESSION, 1, 0);

    // MB_OK (0) | MB_SETFOREGROUND (0x10000) | MB_TOPMOST (0x40000) + icon
    const iconFlag =
      opts.urgency === "urgent" ? 0x00000010 : opts.urgency === "warning" ? 0x00000030 : 0x00000040;
    const style = iconFlag | 0x00010000 | 0x00040000;

    const titleNdr = encodeNdrConformantString(opts.title.slice(0, 240));
    const msgNdr = encodeNdrConformantString(opts.message.slice(0, 950));
    const timeoutVal = Math.max(0, Number(opts.timeoutSeconds) || 0);

    let notifiedCount = 0;
    let lastAccessDeniedErr = "";

    for (const sid of sessionIds) {
      const openStub = Buffer.alloc(4);
      openStub.writeInt32LE(sid, 0);
      let openResp: Buffer;
      try {
        openResp = await conn.rpcCall(lsmFileId, 0, openStub); // RpcOpenSession
      } catch (err: any) {
        lastAccessDeniedErr = err?.message || String(err);
        continue;
      }

      if (openResp.length < 24) continue;
      const hSession = openResp.subarray(0, 20);
      const openHr = openResp.readUInt32LE(20) >>> 0;
      if (openHr !== 0) {
        if (openHr === 0x80070005) {
          lastAccessDeniedErr = formatNtStatus(openHr);
        }
        continue;
      }

      try {
        // Opnum 9: RpcShowMessageBox
        const tail = Buffer.alloc(12);
        tail.writeUInt32LE(style >>> 0, 0); // ulStyle
        tail.writeUInt32LE(timeoutVal >>> 0, 4); // ulTimeout
        tail.writeInt32LE(1, 8); // bDoNotWait = TRUE

        const showStub = Buffer.concat([hSession, titleNdr, msgNdr, tail]);
        const showResp = await conn.rpcCall(lsmFileId, 9, showStub);
        if (showResp.length >= 8) {
          const showHr = showResp.readUInt32LE(4) >>> 0;
          if (showHr === 0) {
            notifiedCount++;
          } else {
            lastAccessDeniedErr = formatNtStatus(showHr);
          }
        }
      } finally {
        // Opnum 1: RpcCloseSession
        try {
          await conn.rpcCall(lsmFileId, 1, hSession);
        } catch {
          // ignore
        }
      }
    }

    if (notifiedCount > 0) {
      return { ok: true, sessionsNotified: notifiedCount };
    }
    if (lastAccessDeniedErr) {
      return { ok: false, error: lastAccessDeniedErr };
    }
    return {
      ok: false,
      error: "SMB2/RPC conectado ao IP, porém nenhuma sessão de usuário ativa (SessionId >= 1) foi localizada no momento.",
    };
  } catch (err: any) {
    const code = err?.code || "";
    if (code === "ECONNREFUSED") {
      return { ok: false, error: `Porta TCP 445 (SMB/RPC) recusada em ${dest}. Verifique firewall/File and Printer Sharing.` };
    }
    if (code === "EHOSTUNREACH" || code === "ENETUNREACH") {
      return { ok: false, error: `Host ${dest} inalcançável pela rede a partir do servidor.` };
    }
    return { ok: false, error: err?.message || "Falha no envio SMB2/RPC para a estação Windows." };
  } finally {
    if (lsmFileId) await conn.closeHandle(lsmFileId);
    await conn.treeDisconnect();
    await conn.logoff();
    conn.close();
  }
}
