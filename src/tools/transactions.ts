import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as transactionsApi from '../api/transactions.js';
import { defaultListQuery } from '../types/api.js';
import * as ref from '../core/referentials.js';
import { structured } from './respond.js';
import { transactionItem, transactionList } from './outputs.js';
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
  server.registerTool(
    'list_transactions',
    {
      description:
        "Liste les transactions (ventes/locations conclues). Ids résolus : type←TransactionType ; agents nommés (User) avec commission. Nécessite l'ACL transactions (29).",
      inputSchema: {
        limit: z.number().int().min(1).max(100).default(25),
        page: z.number().int().min(1).default(1),
      },
      outputSchema: transactionList,
      annotations: { readOnlyHint: true },
    },
    async ({ limit, page }) => {
      await ref.ensureLoaded();
      const res = await transactionsApi.list(defaultListQuery({ limit, page }));
      return structured({
        total: res.totalRow,
        page: res.currentPage,
        count: res.data.length,
        transactions: res.data.map(présenter),
      });
    },
  );

  server.registerTool(
    'get_transaction',
    {
      description:
        "Fiche détaillée d'une transaction (montants HT/TTC, client, bien, agents + commissions). Id résolu : type←TransactionType.",
      inputSchema: { id: z.number().int().describe('Identifiant de la transaction.') },
      outputSchema: transactionItem,
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      await ref.ensureLoaded();
      const tr = await transactionsApi.get(id);
      return structured(présenter(tr));
    },
  );

  // ── Écriture ────────────────────────────────────────────────────────────────

  server.registerTool(
    'create_transaction',
    {
      description:
        "Enregistre une transaction (ou MAJ via `id`). `type_id`→TransactionType (list_referentials). `client_id` = id d'un contact, `propriete_id` = id d'un bien. Sensible — ACL 29.",
      inputSchema: {
        id: z.number().int().optional().describe('Présent = mise à jour.'),
        type_id: z.number().int().describe('Type de transaction (référentiel TransactionType).'),
        client_id: z.number().int().describe('Contact client.'),
        propriete_id: z.number().int().describe('Bien concerné.'),
        montant_ht: z.number().describe('Montant hors taxes.'),
        tva_percent: z.number().default(0).describe('Taux de TVA en %.'),
        date: z.string().nullable().optional().describe('Date YYYY-MM-DD.'),
      },
      outputSchema: transactionItem,
    },
    async ({ id, type_id, client_id, propriete_id, montant_ht, tva_percent, date }) => {
      await ref.ensureLoaded();
      const saved = await transactionsApi.create({
        ...(id ? { id } : {}),
        type_id,
        client: { id: client_id, nom: null, prenom: null },
        propriete: { id: propriete_id, titre: null },
        montant_ht,
        tva_percent,
        date: date ?? null,
      });
      return structured(présenter(saved));
    },
  );
}
