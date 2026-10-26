import { connect as connectTls, type TLSSocket } from "node:tls";
import { TextDecoder } from "node:util";

export type MailboxMessageSummary = {
  uid: string;
  from: string;
  fromEmail: string;
  to: string;
  subject: string;
  date: string;
  seen: boolean;
};
export type MailboxMessage = MailboxMessageSummary & { text: string };

const CRLF = Buffer.from("\r\n");
const MAX_MESSAGE_BYTES = 150_000;

function config() {
  const host = (process.env.IMAP_HOST || "imap.beget.com").trim();
  const port = Number(process.env.IMAP_PORT || 993);
  const user = (process.env.IMAP_USER || process.env.SMTP_USER || "").trim();
  const password = process.env.IMAP_PASSWORD || process.env.SMTP_PASSWORD || "";
  if (!/^[A-Za-z0-9.-]+$/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid IMAP configuration");
  return { host, port, user, password };
}

export function mailboxConfigured() {
  try {
    const c = config();
    return !!c.user && !!c.password && process.env.MAILBOX_ENABLED !== "false";
  } catch { return false; }
}
export function mailboxAccount() {
  try { return config().user; } catch { return ""; }
}

class ImapClient {
  private socket!: TLSSocket;
  private buffer = Buffer.alloc(0);
  private error?: Error;
  private waiters: Array<() => void> = [];
  private serial = 0;
  private readonly host: string;
  private readonly port: number;

  private constructor(host: string, port: number) { this.host = host; this.port = port; }

  static async open() {
    const { host, port, user, password } = config();
    if (!user || !password) throw new Error("Mailbox credentials are missing");
    const client = new ImapClient(host, port);
    try {
      await client.connect();
      const greeting = await client.readResponse();
      if (!greeting.toString("latin1").startsWith("* OK")) throw new Error("IMAP greeting failed");
      await client.command(`LOGIN ${quoteImap(user)} ${quoteImap(password)}`);
      return client;
    } catch (error) {
      client.socket?.destroy();
      throw error;
    }
  }

  private async connect() {
    this.socket = connectTls({ host: this.host, port: this.port, servername: this.host, minVersion: "TLSv1.2", rejectUnauthorized: true });
    this.socket.on("data", chunk => {
      this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : Buffer.from(chunk);
      const ready = this.waiters.splice(0);
      for (const wake of ready) wake();
    });
    this.socket.on("error", error => { this.error = error; for (const wake of this.waiters.splice(0)) wake(); });
    this.socket.on("close", () => { if (!this.error) this.error = new Error("IMAP connection closed"); for (const wake of this.waiters.splice(0)) wake(); });
    this.socket.setTimeout(12_000, () => this.socket.destroy(new Error("IMAP timeout")));
    await new Promise<void>((resolve, reject) => {
      const connected = () => { cleanup(); resolve(); };
      const failed = (error: Error) => { cleanup(); reject(error); };
      const cleanup = () => { this.socket.off("secureConnect", connected); this.socket.off("error", failed); };
      this.socket.once("secureConnect", connected);
      this.socket.once("error", failed);
    });
  }

  private async waitForData() {
    if (this.error) throw this.error;
    await new Promise<void>(resolve => this.waiters.push(resolve));
    if (this.error) throw this.error;
  }

  private async readLine(): Promise<Buffer> {
    while (true) {
      const end = this.buffer.indexOf(0x0a);
      if (end >= 0) {
        let line = this.buffer.subarray(0, end);
        if (line.length && line[line.length - 1] === 0x0d) line = line.subarray(0, line.length - 1);
        this.buffer = this.buffer.subarray(end + 1);
        return line;
      }
      await this.waitForData();
    }
  }

  private async readExact(count: number): Promise<Buffer> {
    if (count < 0 || count > 15_000_000) throw new Error("Invalid IMAP literal size");
    while (this.buffer.length < count) await this.waitForData();
    const value = this.buffer.subarray(0, count);
    this.buffer = this.buffer.subarray(count);
    return value;
  }

  private async readResponse(): Promise<Buffer> {
    const parts: Buffer[] = [];
    let line = await this.readLine();
    parts.push(line, CRLF);
    let literal: RegExpExecArray | null;
    while ((literal = /\{(\d+)\+?\}$/.exec(line.toString("latin1")))) {
      parts.push(await this.readExact(Number(literal[1])));
      line = await this.readLine();
      parts.push(line, CRLF);
    }
    return Buffer.concat(parts);
  }

  async command(command: string): Promise<Buffer[]> {
    if (/[\r\n\0]/.test(command)) throw new Error("Invalid IMAP command");
    const tag = `S${String(++this.serial).padStart(4, "0")}`;
    this.socket.write(`${tag} ${command}\r\n`);
    const responses: Buffer[] = [];
    while (true) {
      const response = await this.readResponse();
      responses.push(response);
      const firstLine = response.subarray(0, response.indexOf(CRLF) < 0 ? response.length : response.indexOf(CRLF)).toString("latin1");
      if (firstLine.startsWith(`${tag} `)) {
        if (!new RegExp(`^${tag} OK(?: |$)`, "i").test(firstLine)) throw new Error("IMAP command failed");
        return responses;
      }
    }
  }

  async close() {
    try { await this.command("LOGOUT"); } catch { /* Closing a stale IMAP session is best effort. */ }
    this.socket.end();
    this.socket.destroy();
  }
}

function quoteImap(value: string) {
  if (/[\r\n\0]/.test(value)) throw new Error("Invalid IMAP credential");
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

function literalFrom(response: Buffer): Buffer | undefined {
  const latin = response.toString("latin1");
  const marker = /\{(\d+)\+?\}\r\n/.exec(latin);
  if (!marker) return undefined;
  const start = marker.index + marker[0].length;
  return Buffer.from(latin.slice(start, start + Number(marker[1])), "latin1");
}

function headerMap(headerText: string) {
  const unfolded = headerText.replace(/\r?\n[\t ]+/g, " ");
  const result: Record<string, string> = {};
  for (const line of unfolded.split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    result[key] = result[key] ? `${result[key]}, ${line.slice(colon + 1).trim()}` : line.slice(colon + 1).trim();
  }
  return result;
}

function decodeBytes(bytes: Buffer, charset = "utf-8") {
  const normalized = charset.replace(/^"|"$/g, "").trim() || "utf-8";
  try { return new TextDecoder(normalized, { fatal: false }).decode(bytes); }
  catch { return new TextDecoder("utf-8", { fatal: false }).decode(bytes); }
}
function quotedPrintableBytes(value: string) {
  const withoutSoftBreaks = value.replace(/=\r?\n/g, "");
  let result = "";
  for (let i = 0; i < withoutSoftBreaks.length; i++) {
    if (withoutSoftBreaks[i] === "=" && /^[\da-f]{2}$/i.test(withoutSoftBreaks.slice(i + 1, i + 3))) {
      result += String.fromCharCode(parseInt(withoutSoftBreaks.slice(i + 1, i + 3), 16));
      i += 2;
    } else result += withoutSoftBreaks[i];
  }
  return Buffer.from(result, "latin1");
}
function decodeMimeWords(value: string) {
  return value.replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (_whole, charset: string, encoding: string, encoded: string) => {
    try {
      const bytes = encoding.toLowerCase() === "b"
        ? Buffer.from(encoded, "base64")
        : quotedPrintableBytes(encoded.replace(/_/g, " "));
      return decodeBytes(bytes, charset);
    } catch { return ""; }
  }).replace(/\s{2,}/g, " ").trim();
}
function extractLiteralHeaders(response: Buffer) {
  const literal = literalFrom(response);
  return literal ? headerMap(literal.toString("latin1")) : {};
}
function emailFromAddress(from: string) {
  const angle = /<([^<>\s]+@[^<>\s]+)>/.exec(from)?.[1];
  if (angle) return angle;
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(from)?.[0] || "";
}
function summaryFromResponse(response: Buffer): MailboxMessageSummary | undefined {
  const lineEnd = response.indexOf(CRLF);
  const first = response.subarray(0, lineEnd < 0 ? response.length : lineEnd).toString("latin1");
  if (!/^\* \d+ FETCH\b/i.test(first)) return undefined;
  const uid = /\bUID\s+(\d+)/i.exec(first)?.[1] || /\bUID\s+(\d+)/i.exec(response.toString("latin1"))?.[1];
  if (!uid) return undefined;
  const headers = extractLiteralHeaders(response);
  const from = decodeMimeWords(headers.from || "(без отправителя)");
  return {
    uid,
    from,
    fromEmail: emailFromAddress(from),
    to: decodeMimeWords(headers.to || ""),
    subject: decodeMimeWords(headers.subject || "(без темы)"),
    date: headers.date || "",
    seen: /\\Seen/i.test(first) || /\\Seen/i.test(response.toString("latin1").slice(0, lineEnd)),
  };
}

function decodeBody(body: string, contentType: string, transferEncoding: string): string {
  const charset = /charset\s*=\s*([^;\s]+)/i.exec(contentType)?.[1] || "utf-8";
  let bytes: Buffer;
  if (/base64/i.test(transferEncoding)) bytes = Buffer.from(body.replace(/\s/g, ""), "base64");
  else if (/quoted-printable/i.test(transferEncoding)) bytes = quotedPrintableBytes(body);
  else bytes = Buffer.from(body, "latin1");
  return decodeBytes(bytes, charset).replace(/\0/g, "").trim();
}

function parseBody(headers: Record<string, string>, body: string): string {
  const type = headers["content-type"] || "text/plain; charset=utf-8";
  const boundary = /boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i.exec(type);
  if (/multipart\//i.test(type) && boundary) {
    const delimiter = `--${boundary[1] || boundary[2]}`;
    const parts = body.split(delimiter).slice(1);
    for (const part of parts) {
      if (part.startsWith("--")) continue;
      const split = part.search(/\r?\n\r?\n/);
      if (split < 0) continue;
      const partHeaders = headerMap(part.slice(0, split));
      const partBody = part.slice(split).replace(/^\r?\n\r?\n/, "").replace(/\r?\n--?\s*$/, "");
      if ((partHeaders["content-type"] || "text/plain").toLowerCase().startsWith("text/plain") && !/attachment/i.test(partHeaders["content-disposition"] || "")) {
        return decodeBody(partBody, partHeaders["content-type"] || "text/plain; charset=utf-8", partHeaders["content-transfer-encoding"] || "").slice(0, 12000);
      }
    }
    for (const part of parts) {
      const split = part.search(/\r?\n\r?\n/);
      if (split < 0) continue;
      const partHeaders = headerMap(part.slice(0, split));
      if ((partHeaders["content-type"] || "").toLowerCase().startsWith("text/html")) {
        return decodeBody(part.slice(split).replace(/^\r?\n\r?\n/, ""), partHeaders["content-type"] || "text/html; charset=utf-8", partHeaders["content-transfer-encoding"] || "")
          .replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h[1-6])\s*>/gi, "\n\n").replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/[\t ]{2,}/g, " ").trim().slice(0, 12000);
      }
    }
    return "(В письме не найден текстовый фрагмент.)";
  }
  if (/text\/html/i.test(type)) {
    return decodeBody(body, type, headers["content-transfer-encoding"] || "").replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h[1-6])\s*>/gi, "\n\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").trim().slice(0, 12000);
  }
  return decodeBody(body, type, headers["content-transfer-encoding"] || "").slice(0, 12000);
}

export function parseRawMessage(raw: Buffer, uid: string, seen = false): MailboxMessage {
  const latin = raw.toString("latin1");
  const separator = latin.search(/\r?\n\r?\n/);
  const splitLength = separator >= 0 && latin.slice(separator, separator + 4).startsWith("\r\n\r\n") ? 4 : 2;
  const headerText = separator >= 0 ? latin.slice(0, separator) : latin;
  const bodyText = separator >= 0 ? latin.slice(separator + splitLength) : "";
  const headers = headerMap(headerText);
  const from = decodeMimeWords(headers.from || "(без отправителя)");
  return {
    uid,
    from,
    fromEmail: emailFromAddress(from),
    to: decodeMimeWords(headers.to || ""),
    subject: decodeMimeWords(headers.subject || "(без темы)"),
    date: headers.date || "",
    seen,
    text: parseBody(headers, bodyText),
  };
}

async function selectedInbox(client: ImapClient) {
  await client.command("SELECT INBOX");
  const search = await client.command("UID SEARCH ALL");
  const line = search.map(response => response.toString("latin1")).find(response => /^\* SEARCH(?: |\r?\n|$)/.test(response));
  const uids = (line?.replace(/^\* SEARCH\s*/i, "").trim() || "").split(/\s+/).filter(value => /^\d+$/.test(value));
  return uids.sort((a, b) => Number(b) - Number(a));
}

export async function listMailboxMessages(limit = 20): Promise<MailboxMessageSummary[]> {
  if (!mailboxConfigured()) throw new Error("Mailbox is not configured");
  const client = await ImapClient.open();
  try {
    const uids = (await selectedInbox(client)).slice(0, Math.max(1, Math.min(30, limit)));
    if (!uids.length) return [];
    const responses = await client.command(`UID FETCH ${uids.join(",")} (UID FLAGS BODY.PEEK[HEADER.FIELDS (DATE FROM TO SUBJECT)])`);
    return responses.map(summaryFromResponse).filter((message): message is MailboxMessageSummary => !!message).sort((a, b) => Number(b.uid) - Number(a.uid));
  } finally { await client.close(); }
}

export async function readMailboxMessage(uid: string): Promise<MailboxMessage | null> {
  if (!mailboxConfigured()) throw new Error("Mailbox is not configured");
  if (!/^\d{1,20}$/.test(uid)) throw new Error("Invalid mailbox UID");
  const client = await ImapClient.open();
  try {
    await client.command("SELECT INBOX");
    const responses = await client.command(`UID FETCH ${uid} (UID FLAGS BODY.PEEK[]<0.${MAX_MESSAGE_BYTES}>)`);
    for (const response of responses) {
      const lineEnd = response.indexOf(CRLF);
      const first = response.subarray(0, lineEnd < 0 ? response.length : lineEnd).toString("latin1");
      if (!/^\* \d+ FETCH\b/i.test(first) || !new RegExp(`\\bUID\\s+${uid}\\b`).test(response.toString("latin1").slice(0, lineEnd < 0 ? response.length : lineEnd))) continue;
      const raw = literalFrom(response);
      if (!raw) continue;
      const seen = /\\Seen/i.test(first);
      const parsed = parseRawMessage(raw, uid, seen);
      if (!seen) {
        try { await client.command(`UID STORE ${uid} +FLAGS.SILENT (\\Seen)`); parsed.seen = true; }
        catch { /* Reading the message is still useful even if the IMAP server rejects changing flags. */ }
      }
      return parsed;
    }
    return null;
  } finally { await client.close(); }
}
