import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as ref from '../core/referentials.js';
import * as authApi from '../api/auth.js';
import { ToolError } from '../core/errors.js';
import { USED_BY } from '../domain/joins.js';
import { handler } from './run.js';

export function registerReferentialTools(server: McpServer): void {
  server.registerTool(
    'list_referentials',
    {
      title: 'Valeurs des référentiels',
      description:
        "Liste les valeurs possibles d'un référentiel (statuts, sources, catégories, types de bien, villes, quartiers, agents…) avec id, libellé, définition et parent éventuel. Utile pour proposer des choix ou expliquer une valeur. Inutile avant une écriture : les outils acceptent directement les libellés.",
      inputSchema: {
        model: z.string().optional().describe('Ex. "ContactStatus". Omis = liste des référentiels et des champs qui les utilisent.'),
      },
      annotations: { readOnlyHint: true },
    },
    handler(async ({ model }) => {
      if (!model) {
        return {
          referentiels: ref.modelNames().map((m) => ({
            model: m,
            nb_valeurs: ref.list(m).length,
            ...(USED_BY[m] ? { utilise_par: USED_BY[m] } : {}),
          })),
        };
      }
      const name = ref.modelNames().find((m) => m.toLowerCase() === model.toLowerCase());
      if (!name) throw new ToolError(`Référentiel « ${model} » inconnu. Disponibles : ${ref.modelNames().join(', ')}`);
      return {
        model: name,
        ...(USED_BY[name] ? { utilise_par: USED_BY[name] } : {}),
        valeurs: ref.entries(name),
      };
    }),
  );

  server.registerTool(
    'whoami',
    {
      title: 'Utilisateur connecté',
      description:
        "Profil de l'utilisateur connecté : rôle, agents dont il voit les données (périmètre), environnement (marque) actif. À appeler pour interpréter « mes contacts » / « mon agenda ».",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    handler(async () => {
      const u = await authApi.verify();
      const ids = Array.isArray(u.user_id) ? (u.user_id as number[]) : [];
      return {
        id: u.id,
        nom: `${u.prenom ?? ''} ${u.nom ?? ''}`.trim(),
        email: u.email,
        role: ref.pair('UserRole', u.role_id),
        environnement: ref.pair('Env', u.current_env),
        agents_visibles: ids.map((i) => ref.pair('User', i)).filter(Boolean),
        session_expire_le: typeof u.expire_at === 'number' ? new Date(u.expire_at * 1000).toISOString() : null,
      };
    }),
  );
}
