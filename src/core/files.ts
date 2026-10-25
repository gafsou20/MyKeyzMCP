import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { ToolError } from './errors.js';

/** Taille maximale d'un fichier envoyé à la GED (octets). */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  heic: 'image/heic', heif: 'image/heif', svg: 'image/svg+xml', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff',
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain', csv: 'text/csv', mp4: 'video/mp4', mov: 'video/quicktime',
};

/** Type MIME déduit de l'extension du nom de fichier (repli : application/octet-stream). */
export function mimeFromName(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

/** Extension correspondant à un type MIME (pour compléter un nom de fichier sans extension). */
export function extFromMime(mime: string): string | null {
  const m = mime.split(';')[0]!.trim().toLowerCase();
  if (m === 'image/jpeg') return 'jpg';
  const hit = Object.entries(MIME_BY_EXT).find(([, v]) => v === m);
  return hit ? hit[0] : null;
}

const B64 = /^[A-Za-z0-9+/_-]+={0,2}$/;

/**
 * Normalise un contenu en **data URL** (`data:<mime>;base64,<…>`), seul format compris par le back
 * (`GedController::base64ToFile` découpe sur la virgule et garde la 2ᵉ partie : du base64 brut y donnait
 * un FICHIER VIDE enregistré sans erreur). Accepte une data URL ou du base64 brut (espaces / retours ignorés).
 */
export function toDataUrl(content: string, fileName: string): string {
  const raw = content.trim();
  if (raw.startsWith('data:')) {
    const comma = raw.indexOf(',');
    if (comma < 0 || !/;base64$/i.test(raw.slice(0, comma))) {
      throw new ToolError('Data URL invalide : le format attendu est « data:<type>;base64,<contenu> ».');
    }
    checkBase64(raw.slice(comma + 1));
    return raw;
  }
  const b64 = raw.replace(/\s+/g, '');
  checkBase64(b64);
  return `data:${mimeFromName(fileName)};base64,${b64}`;
}

function checkBase64(b64: string): void {
  if (!b64 || !B64.test(b64)) throw new ToolError('Contenu du fichier invalide : base64 attendu.');
  const bytes = Math.floor((b64.length * 3) / 4);
  if (bytes > MAX_FILE_BYTES) throw new ToolError(`Fichier trop volumineux (max ${MAX_FILE_BYTES / 1024 / 1024} Mo).`);
}

/** Adresse IP privée, locale ou réservée (protection SSRF du téléchargement par URL). */
export function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === '::1' || v === '::') return true;
    if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
    return /^(fc|fd|fe8|fe9|fea|feb)/.test(v);
  }
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p as [number, number, number, number];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

/**
 * Télécharge un fichier public (https uniquement, hôtes privés refusés, 20 Mo max, 30 s) et le renvoie en
 * data URL + nom de fichier (déduit de l'URL, complété par l'extension du type MIME si besoin).
 */
export async function fetchAsDataUrl(url: string, fileName?: string): Promise<{ dataUrl: string; fileName: string }> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new ToolError('URL de fichier invalide.');
  }
  if (u.protocol !== 'https:') throw new ToolError('Seules les URL https sont acceptées.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((r) => r.address);
  if (!ips.length) throw new ToolError(`Hôte introuvable : ${u.hostname}.`);
  if (ips.some(isPrivateIp)) throw new ToolError('Adresse non autorisée (réseau privé).');

  const res = await fetch(u, { redirect: 'error', signal: AbortSignal.timeout(30_000) }).catch((e: Error) => {
    throw new ToolError(`Téléchargement impossible : ${e.message}`);
  });
  if (!res.ok) throw new ToolError(`Téléchargement impossible : HTTP ${res.status}.`);
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > MAX_FILE_BYTES) throw new ToolError(`Fichier trop volumineux (max ${MAX_FILE_BYTES / 1024 / 1024} Mo).`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_FILE_BYTES) throw new ToolError(`Fichier trop volumineux (max ${MAX_FILE_BYTES / 1024 / 1024} Mo).`);
  if (!buf.length) throw new ToolError('Le fichier téléchargé est vide.');

  const ctype = (res.headers.get('content-type') ?? '').split(';')[0]!.trim();
  let name = fileName || decodeURIComponent(u.pathname.split('/').pop() || '') || 'document';
  if (!/\.[a-z0-9]{2,5}$/i.test(name)) name += `.${extFromMime(ctype) ?? 'bin'}`;
  const mime = ctype && ctype !== 'application/octet-stream' ? ctype : mimeFromName(name);
  return { dataUrl: `data:${mime};base64,${buf.toString('base64')}`, fileName: name };
}
