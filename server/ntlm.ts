import crypto from "crypto";

// Pure TypeScript RFC 1320 MD4 implementation (Node 22 OpenSSL 3 disables MD4 by default)
export function md4(input: Buffer | string): Buffer {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  const origBitLen = BigInt(buf.length) * 8n;

  const padLen = (56 - ((buf.length + 1) % 64) + 64) % 64;
  const padded = Buffer.alloc(buf.length + 1 + padLen + 8);
  buf.copy(padded, 0);
  padded[buf.length] = 0x80;
  padded.writeBigUInt64LE(origBitLen, padded.length - 8);

  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  const rotl = (x: number, n: number) => ((x << n) | (x >>> (32 - n))) >>> 0;
  const f = (x: number, y: number, z: number) => ((x & y) | (~x & z)) >>> 0;
  const g = (x: number, y: number, z: number) => ((x & y) | (x & z) | (y & z)) >>> 0;
  const h = (x: number, y: number, z: number) => (x ^ y ^ z) >>> 0;

  const x = new Uint32Array(16);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      x[i] = padded.readUInt32LE(offset + i * 4);
    }
    const aa = a;
    const bb = b;
    const cc = c;
    const dd = d;

    // Round 1
    a = rotl((a + f(b, c, d) + x[0]) >>> 0, 3);
    d = rotl((d + f(a, b, c) + x[1]) >>> 0, 7);
    c = rotl((c + f(d, a, b) + x[2]) >>> 0, 11);
    b = rotl((b + f(c, d, a) + x[3]) >>> 0, 19);
    a = rotl((a + f(b, c, d) + x[4]) >>> 0, 3);
    d = rotl((d + f(a, b, c) + x[5]) >>> 0, 7);
    c = rotl((c + f(d, a, b) + x[6]) >>> 0, 11);
    b = rotl((b + f(c, d, a) + x[7]) >>> 0, 19);
    a = rotl((a + f(b, c, d) + x[8]) >>> 0, 3);
    d = rotl((d + f(a, b, c) + x[9]) >>> 0, 7);
    c = rotl((c + f(d, a, b) + x[10]) >>> 0, 11);
    b = rotl((b + f(c, d, a) + x[11]) >>> 0, 19);
    a = rotl((a + f(b, c, d) + x[12]) >>> 0, 3);
    d = rotl((d + f(a, b, c) + x[13]) >>> 0, 7);
    c = rotl((c + f(d, a, b) + x[14]) >>> 0, 11);
    b = rotl((b + f(c, d, a) + x[15]) >>> 0, 19);

    // Round 2
    const k2 = 0x5a827999;
    a = rotl((a + g(b, c, d) + x[0] + k2) >>> 0, 3);
    d = rotl((d + g(a, b, c) + x[4] + k2) >>> 0, 5);
    c = rotl((c + g(d, a, b) + x[8] + k2) >>> 0, 9);
    b = rotl((b + g(c, d, a) + x[12] + k2) >>> 0, 13);
    a = rotl((a + g(b, c, d) + x[1] + k2) >>> 0, 3);
    d = rotl((d + g(a, b, c) + x[5] + k2) >>> 0, 5);
    c = rotl((c + g(d, a, b) + x[9] + k2) >>> 0, 9);
    b = rotl((b + g(c, d, a) + x[13] + k2) >>> 0, 13);
    a = rotl((a + g(b, c, d) + x[2] + k2) >>> 0, 3);
    d = rotl((d + g(a, b, c) + x[6] + k2) >>> 0, 5);
    c = rotl((c + g(d, a, b) + x[10] + k2) >>> 0, 9);
    b = rotl((b + g(c, d, a) + x[14] + k2) >>> 0, 13);
    a = rotl((a + g(b, c, d) + x[3] + k2) >>> 0, 3);
    d = rotl((d + g(a, b, c) + x[7] + k2) >>> 0, 5);
    c = rotl((c + g(d, a, b) + x[11] + k2) >>> 0, 9);
    b = rotl((b + g(c, d, a) + x[15] + k2) >>> 0, 13);

    // Round 3
    const k3 = 0x6ed9eba1;
    a = rotl((a + h(b, c, d) + x[0] + k3) >>> 0, 3);
    d = rotl((d + h(a, b, c) + x[8] + k3) >>> 0, 9);
    c = rotl((c + h(d, a, b) + x[4] + k3) >>> 0, 11);
    b = rotl((b + h(c, d, a) + x[12] + k3) >>> 0, 15);
    a = rotl((a + h(b, c, d) + x[2] + k3) >>> 0, 3);
    d = rotl((d + h(a, b, c) + x[10] + k3) >>> 0, 9);
    c = rotl((c + h(d, a, b) + x[6] + k3) >>> 0, 11);
    b = rotl((b + h(c, d, a) + x[14] + k3) >>> 0, 15);
    a = rotl((a + h(b, c, d) + x[1] + k3) >>> 0, 3);
    d = rotl((d + h(a, b, c) + x[9] + k3) >>> 0, 9);
    c = rotl((c + h(d, a, b) + x[5] + k3) >>> 0, 11);
    b = rotl((b + h(c, d, a) + x[13] + k3) >>> 0, 15);
    a = rotl((a + h(b, c, d) + x[3] + k3) >>> 0, 3);
    d = rotl((d + h(a, b, c) + x[11] + k3) >>> 0, 9);
    c = rotl((c + h(d, a, b) + x[7] + k3) >>> 0, 11);
    b = rotl((b + h(c, d, a) + x[15] + k3) >>> 0, 15);

    a = (a + aa) >>> 0;
    b = (b + bb) >>> 0;
    c = (c + cc) >>> 0;
    d = (d + dd) >>> 0;
  }

  const out = Buffer.alloc(16);
  out.writeUInt32LE(a, 0);
  out.writeUInt32LE(b, 4);
  out.writeUInt32LE(c, 8);
  out.writeUInt32LE(d, 12);
  return out;
}

export class Rc4State {
  private s = new Uint8Array(256);
  private i = 0;
  private j = 0;

  constructor(key: Buffer) {
    for (let i = 0; i < 256; i++) this.s[i] = i;
    let j = 0;
    for (let i = 0; i < 256; i++) {
      j = (j + this.s[i] + key[i % key.length]) & 0xff;
      const tmp = this.s[i];
      this.s[i] = this.s[j];
      this.s[j] = tmp;
    }
  }

  process(data: Buffer): Buffer {
    const out = Buffer.allocUnsafe(data.length);
    for (let k = 0; k < data.length; k++) {
      this.i = (this.i + 1) & 0xff;
      this.j = (this.j + this.s[this.i]) & 0xff;
      const tmp = this.s[this.i];
      this.s[this.i] = this.s[this.j];
      this.s[this.j] = tmp;
      const rnd = this.s[(this.s[this.i] + this.s[this.j]) & 0xff];
      out[k] = data[k] ^ rnd;
    }
    return out;
  }
}

export const NTLM_FLAGS = {
  UNICODE: 0x00000001,
  OEM: 0x00000002,
  REQUEST_TARGET: 0x00000004,
  SIGN: 0x00000010,
  SEAL: 0x00000020,
  NTLM: 0x00000200,
  OEM_DOMAIN_SUPPLIED: 0x00001000,
  OEM_WORKSTATION_SUPPLIED: 0x00002000,
  ALWAYS_SIGN: 0x00008000,
  TARGET_TYPE_DOMAIN: 0x00010000,
  TARGET_TYPE_SERVER: 0x00020000,
  EXTENDED_SESSIONSECURITY: 0x00080000,
  TARGET_INFO: 0x00800000,
  VERSION: 0x02000000,
  KEY_128: 0x20000000,
  KEY_EXCH: 0x40000000,
  KEY_56: 0x80000000,
} as const;

export interface ParsedDomainUser {
  user: string;
  domain: string;
  isUpn: boolean;
}

export function parseDomainUser(rawUsername: string, fallbackDomain: string = ""): ParsedDomainUser {
  const trimmed = String(rawUsername || "").trim();
  if (trimmed.includes("\\")) {
    const [dom, ...rest] = trimmed.split("\\");
    return { domain: dom.trim(), user: rest.join("\\").trim(), isUpn: false };
  }
  if (trimmed.includes("@")) {
    const idx = trimmed.indexOf("@");
    return {
      user: trimmed.slice(0, idx).trim(),
      domain: trimmed.slice(idx + 1).trim(),
      isUpn: true,
    };
  }
  return { user: trimmed, domain: String(fallbackDomain || "").trim(), isUpn: false };
}

export interface NtlmType2Challenge {
  serverChallenge: Buffer;
  flags: number;
  targetName: string;
  targetInfoRaw: Buffer;
  nbDomainName?: string;
  dnsDomainName?: string;
  timestamp?: Buffer;
}

export function createNtlmType1(requestSeal: boolean = false): Buffer {
  let flags =
    NTLM_FLAGS.UNICODE |
    NTLM_FLAGS.OEM |
    NTLM_FLAGS.REQUEST_TARGET |
    NTLM_FLAGS.NTLM |
    NTLM_FLAGS.ALWAYS_SIGN |
    NTLM_FLAGS.EXTENDED_SESSIONSECURITY |
    NTLM_FLAGS.KEY_128 |
    NTLM_FLAGS.KEY_56;

  if (requestSeal) {
    flags |= NTLM_FLAGS.SIGN | NTLM_FLAGS.SEAL | NTLM_FLAGS.KEY_EXCH;
  } else {
    flags |= NTLM_FLAGS.KEY_EXCH;
  }

  const msg = Buffer.alloc(32);
  msg.write("NTLMSSP\0", 0, "ascii");
  msg.writeUInt32LE(1, 8); // Type 1
  msg.writeUInt32LE(flags >>> 0, 12);
  // DomainNameFields (0) & WorkstationFields (0) remain zeroed
  return msg;
}

export function parseNtlmType2(rawToken: Buffer): NtlmType2Challenge {
  const sigOffset = rawToken.indexOf(Buffer.from("NTLMSSP\0", "ascii"));
  if (sigOffset === -1) {
    throw new Error("Resposta NTLM Type 2 inválida (assinatura NTLMSSP ausente).");
  }
  const buf = sigOffset === 0 ? rawToken : rawToken.subarray(sigOffset);
  if (buf.length < 32 || buf.readUInt32LE(8) !== 2) {
    throw new Error("Token NTLM recebido não é Type 2 Challenge.");
  }

  const targetNameLen = buf.readUInt16LE(12);
  const targetNameOffset = buf.readUInt32LE(16);
  const flags = buf.readUInt32LE(20);
  const serverChallenge = Buffer.from(buf.subarray(24, 32));

  let targetName = "";
  if (targetNameLen > 0 && targetNameOffset + targetNameLen <= buf.length) {
    targetName = buf
      .subarray(targetNameOffset, targetNameOffset + targetNameLen)
      .toString(flags & NTLM_FLAGS.UNICODE ? "utf16le" : "latin1");
  }

  let targetInfoRaw = Buffer.alloc(0);
  let nbDomainName: string | undefined;
  let dnsDomainName: string | undefined;
  let timestamp: Buffer | undefined;

  if (flags & NTLM_FLAGS.TARGET_INFO && buf.length >= 48) {
    const tiLen = buf.readUInt16LE(40);
    const tiOffset = buf.readUInt32LE(44);
    if (tiLen > 0 && tiOffset + tiLen <= buf.length) {
      targetInfoRaw = Buffer.from(buf.subarray(tiOffset, tiOffset + tiLen));
      let pos = 0;
      while (pos + 4 <= targetInfoRaw.length) {
        const avId = targetInfoRaw.readUInt16LE(pos);
        const avLen = targetInfoRaw.readUInt16LE(pos + 2);
        pos += 4;
        if (avId === 0) break; // MsvAvEOL
        if (pos + avLen > targetInfoRaw.length) break;
        const val = targetInfoRaw.subarray(pos, pos + avLen);
        if (avId === 2) nbDomainName = val.toString("utf16le");
        else if (avId === 4) dnsDomainName = val.toString("utf16le");
        else if (avId === 7 && avLen === 8) timestamp = Buffer.from(val);
        pos += avLen;
      }
    }
  }

  return {
    serverChallenge,
    flags,
    targetName,
    targetInfoRaw,
    nbDomainName,
    dnsDomainName,
    timestamp,
  };
}

export interface NtlmSessionKeys {
  type3Message: Buffer;
  exportedSessionKey: Buffer;
  clientSignKey: Buffer;
  serverSignKey: Buffer;
  clientSealRc4: Rc4State;
  serverSealRc4: Rc4State;
  clientSeqNum: number;
  useExtendedSecurity: boolean;
}

function hmacMd5(key: Buffer, data: Buffer): Buffer {
  return crypto.createHmac("md5", key).update(data).digest();
}

function nowAsWindowsFiletime(): Buffer {
  const epochDiff = 11644473600000n; // ms between 1601-01-01 and 1970-01-01
  const ft = (BigInt(Date.now()) + epochDiff) * 10000n;
  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(ft, 0);
  return out;
}

export function createNtlmType3(params: {
  username: string;
  password: string;
  fallbackDomain?: string;
  workstation?: string;
  type2: NtlmType2Challenge;
  requestSeal?: boolean;
}): NtlmSessionKeys {
  const parsed = parseDomainUser(params.username, params.fallbackDomain);

  // If credential is UPN (user@inema.intranet) and Type2 reports matching DNS/NetBIOS domain (e.g. INEMA),
  // prefer the NetBIOS domain name for widest compatibility across Windows NTLM implementations.
  let domainToSend = parsed.domain;
  if (
    parsed.isUpn &&
    params.type2.nbDomainName &&
    params.type2.dnsDomainName &&
    params.type2.dnsDomainName.toLowerCase() === parsed.domain.toLowerCase()
  ) {
    domainToSend = params.type2.nbDomainName;
  }

  const userUpper = parsed.user.toUpperCase();
  const domainUpper = domainToSend.toUpperCase();

  const ntHash = md4(Buffer.from(params.password, "utf16le"));
  const responseKeyNT = hmacMd5(
    ntHash,
    Buffer.from(userUpper + domainUpper, "utf16le")
  );

  const clientChallenge = crypto.randomBytes(8);
  const timestamp = params.type2.timestamp || nowAsWindowsFiletime();
  const targetInfo =
    params.type2.targetInfoRaw.length > 0
      ? params.type2.targetInfoRaw
      : Buffer.from([0, 0, 0, 0]);

  // MS-NLMP 2.2.2.7 NTLMv2_CLIENT_CHALLENGE
  const temp = Buffer.alloc(28 + targetInfo.length + 4);
  temp[0] = 0x01; // RespType
  temp[1] = 0x01; // HiRespType
  // temp[2..8] zeroed
  timestamp.copy(temp, 8);
  clientChallenge.copy(temp, 16);
  // temp[24..28] zeroed
  targetInfo.copy(temp, 28);
  // trailing 4 zero bytes already zeroed

  const ntProofStr = hmacMd5(
    responseKeyNT,
    Buffer.concat([params.type2.serverChallenge, temp])
  );
  const ntChallengeResponse = Buffer.concat([ntProofStr, temp]);

  const lmChallengeResponse = params.type2.timestamp
    ? Buffer.alloc(24)
    : Buffer.concat([
        hmacMd5(responseKeyNT, Buffer.concat([params.type2.serverChallenge, clientChallenge])),
        clientChallenge,
      ]);

  const sessionBaseKey = hmacMd5(responseKeyNT, ntProofStr);

  const serverSupportsKeyExch = Boolean(params.type2.flags & NTLM_FLAGS.KEY_EXCH);
  const useExtendedSecurity = Boolean(
    params.type2.flags & NTLM_FLAGS.EXTENDED_SESSIONSECURITY
  );

  let flags =
    NTLM_FLAGS.UNICODE |
    NTLM_FLAGS.NTLM |
    NTLM_FLAGS.ALWAYS_SIGN |
    NTLM_FLAGS.EXTENDED_SESSIONSECURITY |
    NTLM_FLAGS.KEY_128 |
    NTLM_FLAGS.KEY_56;

  if (params.type2.flags & NTLM_FLAGS.TARGET_INFO) {
    flags |= NTLM_FLAGS.TARGET_INFO;
  }
  if (params.requestSeal) {
    flags |= NTLM_FLAGS.SIGN | NTLM_FLAGS.SEAL;
  }

  let exportedSessionKey = sessionBaseKey;
  let encryptedRandomSessionKey = Buffer.alloc(0);

  if (serverSupportsKeyExch) {
    flags |= NTLM_FLAGS.KEY_EXCH;
    exportedSessionKey = crypto.randomBytes(16);
    encryptedRandomSessionKey = new Rc4State(sessionBaseKey).process(exportedSessionKey);
  }

  const domainBuf = Buffer.from(domainToSend, "utf16le");
  const userBuf = Buffer.from(parsed.user, "utf16le");
  const wsBuf = Buffer.from((params.workstation || "DIRECTORYADMIN").toUpperCase(), "utf16le");

  const headerLen = 72; // With Version/MIC space; 64 minimum without MIC
  let offset = headerLen;

  const lmOff = offset;
  offset += lmChallengeResponse.length;

  const ntOff = offset;
  offset += ntChallengeResponse.length;

  const domOff = offset;
  offset += domainBuf.length;

  const userOff = offset;
  offset += userBuf.length;

  const wsOff = offset;
  offset += wsBuf.length;

  const encKeyOff = offset;
  offset += encryptedRandomSessionKey.length;

  const msg = Buffer.alloc(offset);
  msg.write("NTLMSSP\0", 0, "ascii");
  msg.writeUInt32LE(3, 8); // Type 3

  // LmChallengeResponseFields (12)
  msg.writeUInt16LE(lmChallengeResponse.length, 12);
  msg.writeUInt16LE(lmChallengeResponse.length, 14);
  msg.writeUInt32LE(lmOff, 16);

  // NtChallengeResponseFields (20)
  msg.writeUInt16LE(ntChallengeResponse.length, 20);
  msg.writeUInt16LE(ntChallengeResponse.length, 22);
  msg.writeUInt32LE(ntOff, 24);

  // DomainNameFields (28)
  msg.writeUInt16LE(domainBuf.length, 28);
  msg.writeUInt16LE(domainBuf.length, 30);
  msg.writeUInt32LE(domOff, 32);

  // UserNameFields (36)
  msg.writeUInt16LE(userBuf.length, 36);
  msg.writeUInt16LE(userBuf.length, 38);
  msg.writeUInt32LE(userOff, 40);

  // WorkstationFields (44)
  msg.writeUInt16LE(wsBuf.length, 44);
  msg.writeUInt16LE(wsBuf.length, 46);
  msg.writeUInt32LE(wsOff, 48);

  // EncryptedRandomSessionKeyFields (52)
  msg.writeUInt16LE(encryptedRandomSessionKey.length, 52);
  msg.writeUInt16LE(encryptedRandomSessionKey.length, 54);
  msg.writeUInt32LE(encKeyOff, 56);

  // NegotiateFlags (60)
  msg.writeUInt32LE(flags >>> 0, 60);

  // Version (64..72) zeroed
  lmChallengeResponse.copy(msg, lmOff);
  ntChallengeResponse.copy(msg, ntOff);
  domainBuf.copy(msg, domOff);
  userBuf.copy(msg, userOff);
  wsBuf.copy(msg, wsOff);
  if (encryptedRandomSessionKey.length > 0) {
    encryptedRandomSessionKey.copy(msg, encKeyOff);
  }

  // MS-NLMP 3.4.5.2 SIGNKEY / SEALKEY
  const md5 = (b: Buffer) => crypto.createHash("md5").update(b).digest();
  const clientSignKey = md5(
    Buffer.concat([
      exportedSessionKey,
      Buffer.from("session key to client-to-server signing key magic constant\0", "ascii"),
    ])
  );
  const serverSignKey = md5(
    Buffer.concat([
      exportedSessionKey,
      Buffer.from("session key to server-to-client signing key magic constant\0", "ascii"),
    ])
  );
  const clientSealKey = md5(
    Buffer.concat([
      exportedSessionKey,
      Buffer.from("session key to client-to-server sealing key magic constant\0", "ascii"),
    ])
  );
  const serverSealKey = md5(
    Buffer.concat([
      exportedSessionKey,
      Buffer.from("session key to server-to-client sealing key magic constant\0", "ascii"),
    ])
  );

  return {
    type3Message: msg,
    exportedSessionKey,
    clientSignKey,
    serverSignKey,
    clientSealRc4: new Rc4State(clientSealKey),
    serverSealRc4: new Rc4State(serverSealKey),
    clientSeqNum: 0,
    useExtendedSecurity,
  };
}

// MS-NLMP 3.4.3 / 3.4.4 Seal & Sign with Extended Session Security
export function ntlmSealMessage(
  session: NtlmSessionKeys,
  plaintext: Buffer
): { signature: Buffer; ciphertext: Buffer } {
  const seqBuf = Buffer.alloc(4);
  seqBuf.writeUInt32LE(session.clientSeqNum >>> 0, 0);

  // Checksum = HMAC_MD5(ClientSignKey, SeqNum || Plaintext)[0..8]
  const hmac = hmacMd5(session.clientSignKey, Buffer.concat([seqBuf, plaintext]));
  const rawChecksum = hmac.subarray(0, 8);

  // Seal plaintext first, then encrypt checksum with RC4(ClientSealKey)
  const ciphertext = session.clientSealRc4.process(plaintext);
  const encChecksum = session.clientSealRc4.process(rawChecksum);

  const signature = Buffer.alloc(16);
  signature.writeUInt32LE(1, 0); // Version = 1
  encChecksum.copy(signature, 4);
  seqBuf.copy(signature, 12);

  session.clientSeqNum = (session.clientSeqNum + 1) >>> 0;
  return { signature, ciphertext };
}
