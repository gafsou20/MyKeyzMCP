import express from 'express';
import * as gedApi from './api/ged.js';
import { runWithToken } from './core/context.js';
import { unsealDepot } from './core/depot.js';
import { MAX_FILE_BYTES, toDataUrl } from './core/files.js';
import { explain } from './core/errors.js';
import type { Ged } from './types/models.js';

/**
 * Page de dépôt de fichiers ouverte par un lien `ged_lien_depot` :
 *   GET  /depot/:jeton → page web (mobile d'abord) pour choisir / prendre des photos et documents ;
 *   POST /depot/:jeton → { file: dataURL, file_name } → POST /ged/upload du back avec le token de l'utilisateur.
 * À monter AVANT le `express.json` global (5 Mo) : un fichier de 20 Mo fait ~27 Mo en base64.
 */
export const depotRouter = express.Router();

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function secure(res: express.Response) {
  res.set({
    'Referrer-Policy': 'no-referrer', // le jeton est dans l'URL
    'X-Robots-Tag': 'noindex, nofollow',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
}

const STYLE = `*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f6fb;color:#1c2333}
main{max-width:560px;margin:0 auto;padding:24px 18px}h1{font-size:22px;margin:0 0 4px}p.sub{margin:0 0 20px;color:#5b6475}
.card{background:#fff;border-radius:16px;padding:20px;box-shadow:0 6px 24px -12px rgba(20,30,60,.25)}
label.drop{display:flex;flex-direction:column;align-items:center;gap:6px;border:2px dashed #b7c2d9;border-radius:14px;padding:28px 12px;text-align:center;cursor:pointer;font-weight:600}
label.drop:focus-within,label.drop.on{border-color:#2f5bd3;background:#eef3ff}input[type=file]{position:absolute;opacity:0;width:1px;height:1px}
ul{list-style:none;padding:0;margin:16px 0 0}li{display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-top:1px solid #edf0f5;font-size:15px}
li span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ok{color:#1d7a46;font-weight:700}.ko{color:#c0392b;font-weight:700}.en{color:#5b6475}
.note{font-size:13px;color:#5b6475;margin-top:14px}`;

function page(title: string, body: string): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>${esc(title)} — MyKeyz</title><style>${STYLE}</style></head>
<body><main>${body}</main></body></html>`;
}

depotRouter.get('/depot/:jeton', async (req, res) => {
  secure(res);
  const c = await unsealDepot(req.params.jeton);
  if (!c) {
    res.status(410).type('html').send(page('Lien expiré', `<h1>Lien expiré ou invalide</h1>
<p class="sub">Ce lien de dépôt n'est plus valable (il dure 30 minutes). Demandez-en un nouveau à l'assistant.</p>`));
    return;
  }
  const fin = new Date(c.exp * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });
  res.type('html').send(page('Ajouter des documents', `<h1>Ajouter des documents</h1>
<p class="sub">${esc(c.fiche)} · type : <b>${esc(c.type_label)}</b></p>
<div class="card">
  <label class="drop" id="drop"><span style="font-size:30px" aria-hidden="true">📎</span>Choisir ou prendre des photos / documents
    <span style="font-weight:400;color:#5b6475;font-size:14px">Plusieurs fichiers possibles · ${MAX_FILE_BYTES / 1024 / 1024} Mo max par fichier</span>
    <input id="f" type="file" multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"></label>
  <ul id="l" aria-live="polite"></ul>
  <p class="note">Les fichiers sont ajoutés directement à la fiche dans le CRM. Lien valable jusqu'à ${esc(fin)}.</p>
</div>
<script>
const MAX=${MAX_FILE_BYTES},url=location.pathname,l=document.getElementById('l'),drop=document.getElementById('drop');
const read=f=>new Promise((ok,ko)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=()=>ko(r.error);r.readAsDataURL(f)});
// Photos : réduites à 2560 px (JPEG 85 %) si plus grandes — un envoi plus léger et plus sûr. Sinon fichier d'origine.
async function prep(f){
  if(!/^image\\/(jpeg|png|webp)$/.test(f.type)) return {data:await read(f),name:f.name};
  try{const b=await createImageBitmap(f),m=Math.max(b.width,b.height);
    if(m<=2560&&f.size<=4e6) return {data:await read(f),name:f.name};
    const k=Math.min(1,2560/m),c=document.createElement('canvas');c.width=Math.round(b.width*k);c.height=Math.round(b.height*k);
    c.getContext('2d').drawImage(b,0,0,c.width,c.height);
    return {data:c.toDataURL('image/jpeg',.85),name:f.name.replace(/\\.[^.]+$/,'')+'.jpg'};
  }catch(e){return {data:await read(f),name:f.name}}
}
async function send(f){
  const li=document.createElement('li'),n=document.createElement('span'),s=document.createElement('span');
  n.textContent=f.name;s.className='en';s.textContent='Envoi…';li.append(n,s);l.prepend(li);
  try{
    if(f.size>MAX*1.5) throw new Error('trop volumineux');
    const p=await prep(f);
    const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({file:p.data,file_name:p.name})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok||!j.ok) throw new Error(j.error||('erreur '+r.status));
    s.className='ok';s.textContent='Ajouté ✓';
  }catch(e){s.className='ko';s.textContent='Échec : '+e.message}
}
document.getElementById('f').addEventListener('change',async e=>{for(const f of e.target.files) await send(f);e.target.value=''});
['dragover','dragenter'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.add('on')}));
['dragleave','drop'].forEach(t=>drop.addEventListener(t,()=>drop.classList.remove('on')));
drop.addEventListener('drop',async e=>{e.preventDefault();for(const f of e.dataTransfer.files) await send(f)});
</script>`));
});

depotRouter.post('/depot/:jeton', express.json({ limit: '30mb' }), async (req, res) => {
  secure(res);
  const c = await unsealDepot(req.params.jeton);
  if (!c) {
    res.status(410).json({ ok: false, error: 'lien expiré, demandez-en un nouveau' });
    return;
  }
  const { file, file_name } = (req.body ?? {}) as { file?: unknown; file_name?: unknown };
  if (typeof file !== 'string' || typeof file_name !== 'string' || !file_name.trim()) {
    res.status(400).json({ ok: false, error: 'fichier manquant' });
    return;
  }
  const name = file_name.trim().replace(/[\\/]/g, '_').slice(0, 150);
  try {
    const dataUrl = toDataUrl(file, name);
    const g = await runWithToken(c.tok, () =>
      gedApi.upload(dataUrl, name, { model: c.model, model_id: c.model_id, type_id: c.type_id }),
    );
    const doc = typeof g === 'object' && g ? (g as Ged) : null;
    res.json({ ok: true, id: doc?.id ?? null, url: doc?.link || doc?.url || null });
  } catch (e) {
    res.status(502).json({ ok: false, error: explain(e) });
  }
});
