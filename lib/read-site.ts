import "server-only";
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from "node:dns";
import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import { Readable } from "node:stream";

/*
 * Reads a public web page for the Research agent. The URL comes from a person, so this is
 * an SSRF surface: http(s) on the default ports only, no credentials in the URL, and every
 * hop (including redirects) must resolve only to public addresses.
 *
 * DNS rebinding: the connection's own lookup is `safeLookup`, which refuses any non-public
 * answer. The address we judge is the address we connect to, so a DNS server can't hand
 * our pre-check a public address and the socket a private one.
 */

export type SitePage = {
  url: string;
  title: string;
  description: string;
  headings: string[];
  text: string;
};

const MAX_BYTES = 2_000_000;
const MAX_TEXT = 12_000;
const MAX_HOPS = 4;

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

/** True only for addresses that are routable on the public internet. */
export function isPublicAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, "");
  const kind = isIP(ip);
  if (kind === 4) return !blocked.check(ip, "ipv4");
  if (kind === 6) {
    // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible forms are judged by their IPv4 part.
    const mapped = ip.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/i);
    if (mapped) return isPublicAddress(mapped[1]);
    if (/^::ffff:/i.test(ip)) return false;
    return !blocked.check(ip, "ipv6");
  }
  return false;
}

/** Accepts "example.com" or a full URL; returns a normalized URL or null. Doesn't touch the network. */
export function normalizeUrl(input: string): URL | null {
  const raw = input.trim();
  if (!raw || raw.length > 2000) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== "80" && url.port !== "443") return null;
  const host = url.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return null;
  if (isIP(host.replace(/^\[|\]$/g, "")) && !isPublicAddress(host)) return null;
  if (!isIP(host.replace(/^\[|\]$/g, "")) && !host.includes(".")) return null;
  url.hash = "";
  return url;
}

async function assertPublic(url: URL): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (!isPublicAddress(host)) throw new Error("That address isn't on the public internet.");
    return;
  }
  const addresses = await lookup(host, { all: true, verbatim: true }).catch(() => []);
  if (addresses.length === 0) throw new Error(`Couldn't find ${host}.`);
  if (addresses.some((entry) => !isPublicAddress(entry.address))) throw new Error("That address isn't on the public internet.");
}

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/**
 * A drop-in for dns.lookup that fails when any resolved address isn't public. Node calls it
 * with `all: true` (happy eyeballs) or without; both shapes are answered. `resolve` is
 * injectable for tests.
 */
export function safeLookup(
  hostname: string,
  options: LookupOptions,
  callback: LookupCallback,
  resolve: (host: string, done: (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void) => void = (host, done) =>
    dnsLookup(host, { all: true, verbatim: true }, done),
): void {
  resolve(hostname, (error, addresses) => {
    if (error) return callback(error, options.all ? [] : "", 0);
    const wanted = options.family === 4 || options.family === 6 ? addresses.filter((entry) => entry.family === options.family) : addresses;
    if (!wanted.length || wanted.some((entry) => !isPublicAddress(entry.address))) {
      const refused: NodeJS.ErrnoException = new Error("That address isn't on the public internet.");
      refused.code = "EADDRNOTPUBLIC";
      return callback(refused, options.all ? [] : "", 0);
    }
    if (options.all) return callback(null, wanted);
    callback(null, wanted[0].address, wanted[0].family);
  });
}

/** One GET with no redirects followed, connecting only through safeLookup. */
function pinnedGet(url: URL, headers: Record<string, string>, timeoutMs: number): Promise<Response> {
  const send = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = send(url, { method: "GET", headers: { ...headers, "Accept-Encoding": "identity" }, lookup: safeLookup as never, timeout: timeoutMs }, (res: IncomingMessage) => {
      const status = res.statusCode ?? 502;
      const head = new Headers();
      for (const [key, value] of Object.entries(res.headers)) {
        if (value === undefined) continue;
        for (const item of Array.isArray(value) ? value : [value]) head.append(key, item);
      }
      if (status < 200 || status > 599) {
        res.destroy();
        return reject(new Error(`The site answered ${status}.`));
      }
      const body = status === 204 || status === 304 ? null : (Readable.toWeb(res) as ReadableStream<Uint8Array>);
      resolve(new Response(body, { status, headers: head }));
    });
    req.on("timeout", () => req.destroy(new Error("The site took too long to answer.")));
    req.on("error", (error: NodeJS.ErrnoException) =>
      reject(error.code === "EADDRNOTPUBLIC" ? new Error("That address isn't on the public internet.") : new Error(`Couldn't load ${url.hostname}.`)),
    );
    req.end();
  });
}

async function readCapped(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  const joined = new Uint8Array(Math.min(size, MAX_BYTES));
  let offset = 0;
  for (const chunk of chunks) {
    const room = joined.length - offset;
    if (room <= 0) break;
    joined.set(chunk.subarray(0, room), offset);
    offset += Math.min(chunk.byteLength, room);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(joined);
}

/** Fetches a public page and reduces it to text. Throws a message safe to show the operator. */
export async function readSite(input: string): Promise<SitePage> {
  const first = normalizeUrl(input);
  if (!first) throw new Error("That isn't a public web address.");
  let url: URL = first;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    await assertPublic(url);
    const response: Response = await pinnedGet(url, { "User-Agent": "LiftPageResearch/1.0", Accept: "text/html,application/xhtml+xml,text/plain;q=0.8" }, 10_000);
    if (response.status >= 300 && response.status < 400) {
      const location: string | null = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      const next: URL | null = location ? normalizeUrl(new URL(location, url).toString()) : null;
      if (!next) throw new Error("The site redirected somewhere we won't follow.");
      url = next;
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`The site answered ${response.status}.`);
    }
    const type = response.headers.get("content-type") ?? "";
    if (type && !/html|text\/plain/i.test(type)) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("That address isn't a web page.");
    }
    return htmlToPage(await readCapped(response), url.toString());
  }
  throw new Error("Too many redirects.");
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

function decode(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : " ";
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

const squash = (value: string) => decode(value).replace(/\s+/g, " ").trim();

function attr(tag: string, name: string): string {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match ? (match[2] ?? match[3] ?? match[4] ?? "") : "";
}

/** Pure: pulls title, description, headings, and visible text out of HTML. */
export function htmlToPage(html: string, url: string): SitePage {
  const meta = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (attr(tag, "name") || attr(tag, "property")).toLowerCase();
    const content = attr(tag, "content");
    if (key && content && !meta.has(key)) meta.set(key, squash(content));
  }
  const body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1\s*>/gi, " ");
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const headings = [...body.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
    .map((match) => squash(match[1].replace(/<[^>]+>/g, " ")))
    .filter((line) => line.length > 1)
    .slice(0, 30);
  const text = decode(
    body
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/section|\/article|\/tr)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_TEXT);
  return {
    url,
    title: squash(titleMatch?.[1] ?? "") || meta.get("og:title") || "",
    description: meta.get("description") || meta.get("og:description") || "",
    headings,
    text,
  };
}
