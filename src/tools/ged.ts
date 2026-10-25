import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as gedApi from '../api/ged.js';
import * as ref from '../core/referentials.js';
import { handler } from './run.js';
import { ref as refIn, refs } from './schemas.js';
import type { Ged } from '../types/models.js';
import { fetchAsDataUrl, toDataUrl } from '../core/files.js';
import { currentBaseUrl, currentToken } from '../core/context.js';
import { DEPOT_TTL, sealDepot } from '../core/depot.js';
import { ToolError } from '../core/errors.js';

const entity = z.enum(['Propriete', 'Projet']).describe('Type de fiche : bien ou projet.');

function present(g: Ged) {
  return {
    id: g.id,
    titre: g.titre ?? null,
    type: ref.pair('GedType', g.type_id),
    url: g.link || g.url || null,
    rattachement: g.model && g.model_id ? { type: g.model, id: g.model_id } : null,
  };
}

export function registerGedTools(server: McpServer): void {
  server.registerTool(
    'list_ged',
    {
      title: 'Documents d’un bien / projet',
      description: 'Fichiers (photos, plans, brochures…) rattachés à un bien ou un projet, filtrables par type.',
      inputSchema: {
        type: entity,
        id: z.number().int(),
        type_document: refs('GedType', 'Ex. "Image", "Plan", "Brochure".').optional(),
      },
      annotations: { readOnlyHint: true },
    },
    handler(async (a) => {
      const res = await gedApi.list(a.type, a.id);
      let files = Array.isArray(res) ? res : [];
      if (a.type_document !== undefined) {
        const ids = ref.resolveMany('GedType', a.type_document);
        files = files.filter((f) => ids.includes(f.type_id));
      }
      return { count: files.length, documents: files.map(present) };
    }),
  );

  server.registerTool(
    'ged_upload',
    {
      title: 'Ajouter un document',
      description:
        'Ajoute un fichier à un bien ou un projet À PARTIR D’UNE URL https publique (file_url : lien d’une photo, d’un PDF…) '
        + 'ou d’un contenu base64 déjà disponible (file). ⚠️ Une pièce jointe envoyée dans la conversation n’est PAS '
        + 'transmissible ici : pour que l’utilisateur ajoute ses propres photos / documents, utilise ged_lien_depot. ACL 21.',
      inputSchema: {
        file_url: z.string().url().optional().describe('URL https publique du fichier (le serveur le télécharge, 20 Mo max).'),
        file: z.string().optional().describe('Contenu base64 brut ou data URL (petits fichiers uniquement).'),
        file_name: z.string().optional().describe('Nom du fichier avec extension (déduit de l’URL si absent).'),
        type: entity,
        id: z.number().int(),
        type_document: refIn('GedType').default('image'),
      },
    },
    handler(async (a) => {
      let dataUrl: string;
      let name = a.file_name?.trim() || '';
      if (a.file_url) {
        const got = await fetchAsDataUrl(a.file_url, name || undefined);
        dataUrl = got.dataUrl;
        name = got.fileName;
      } else if (a.file) {
        if (!name) throw new ToolError('file_name est obligatoire avec file (base64).');
        dataUrl = toDataUrl(a.file, name); // le back n'accepte qu'une data URL (sinon fichier vide)
      } else {
        throw new ToolError('Fournis file_url (URL https) ou file (base64). Pour les fichiers de l’utilisateur : ged_lien_depot.');
      }
      const res = await gedApi.upload(dataUrl, name, {
        model: a.type,
        model_id: a.id,
        type_id: ref.resolve('GedType', a.type_document) as number,
      });
      return { ok: true, document: typeof res === 'object' && res ? present(res as Ged) : res };
    }),
  );

  server.registerTool(
    'ged_lien_depot',
    {
      title: 'Lien pour déposer des fichiers',
      description:
        'Crée un lien web temporaire (30 min) où l’UTILISATEUR dépose lui-même photos et documents (depuis son téléphone '
        + 'ou son ordinateur) ; ils sont ajoutés à la GED du bien ou du projet. À utiliser dès que l’utilisateur veut ajouter '
        + 'des photos / documents qu’il possède (une pièce jointe de la conversation ne peut pas être transmise à un outil). '
        + 'Donne-lui le lien tel quel, puis vérifie avec list_ged quand il a terminé. ACL 21.',
      inputSchema: {
        type: entity,
        id: z.number().int(),
        type_document: refIn('GedType').default('image'),
      },
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    handler(async (a) => {
      const base = currentBaseUrl();
      const tok = currentToken();
      if (!base || !tok) throw new ToolError('Lien de dépôt indisponible dans ce mode (serveur HTTP requis).');
      const type_id = ref.resolve('GedType', a.type_document) as number;
      const type_label = ref.pair('GedType', type_id)?.label ?? String(a.type_document);
      const jeton = await sealDepot({
        tok, model: a.type, model_id: a.id, type_id, type_label,
        fiche: `${a.type === 'Propriete' ? 'Bien' : 'Projet'} n° ${a.id}`,
      });
      return {
        lien: `${base}/depot/${jeton}`,
        valable: DEPOT_TTL.replace('m', ' minutes'),
        fiche: { type: a.type, id: a.id },
        type_document: { id: type_id, label: type_label },
        consigne: 'Transmets ce lien à l’utilisateur : il y choisit ou prend ses photos / documents, ajoutés aussitôt à la fiche.',
      };
    }),
  );

  server.registerTool(
    'ged_delete',
    {
      title: 'Supprimer un document',
      description: '⚠️ Supprime définitivement un document (irréversible). Confirme avec l’utilisateur avant. ACL 21.',
      inputSchema: { id: z.number().int() },
      annotations: { destructiveHint: true },
    },
    handler(async ({ id }) => {
      await gedApi.remove(id);
      return { ok: true, supprime: id };
    }),
  );
}
