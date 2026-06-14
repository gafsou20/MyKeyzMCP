import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as transactionsApi from '../api/transactions.js';
import { defaultListQuery } from '../types/api.js';
import * as ref from '../core/referentials.js';
import type { Transaction } from '../types/models.js';

function clientName(tr: Transaction): string | null {
  const c = tr.client;
  return c ? [c.prenom, c.nom].filter(Boolean).join(' ').trim() || null : null;
}

/** Total TTC = HT × (1 + tva%). */
function ttc(tr: Transaction): number {
  return Math.round(tr.montant_ht * (1 + (tr.tva_percent ?? 0) / 100));
}

function présenter(tr: Transaction) {
  return {
    id: tr.id,
    type: ref.label('TransactionType', tr.type_id) || tr.type_id,
    client: clientName(tr),
    bien: tr.propriete?.titre ?? null,
    montant_ht: tr.montant_ht,
    tva_percent: tr.tva_percent,
    total_ttc: ttc(tr),
    date: tr.date,
    agents: (tr.agents ?? []).map((a) => ({
      agent: [a.prenom, a.nom].filter(Boolean).join(' ').trim() || `#${a.id}`,
      commission_ht: a.commission_ht,
    })),
  };
}

export function registerTransactionTools(server: McpServer): void {
  server.tool(
    'list_transactions',
    'Liste les transactions (ventes/locations conclues) du CRM MyKeyz. Nécessite le droit ACL transactions.',
    {
      limit: z.number().int().min(1).max(100).default(25),
      page: z.number().int().min(1).default(1),
    },
    async ({ limit, page }) => {
      await ref.ensureLoaded();
      const res = await transactionsApi.list(defaultListQuery({ limit, page }));
      const payload = {
        total: res.totalRow,
        page: res.currentPage,
        count: res.data.length,
        transactions: res.data.map(présenter),
      };
      return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
    },
  );

  server.tool(
    'get_transaction',
    "Fiche détaillée d'une transaction (montants, client, bien, agents + commissions).",
    {
      id: z.number().int().describe('Identifiant de la transaction.'),
    },
    async ({ id }) => {
      await ref.ensureLoaded();
      const tr = await transactionsApi.get(id);
      return { content: [{ type: 'text', text: JSON.stringify(présenter(tr), null, 2) }] };
    },
  );
}
