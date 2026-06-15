/**
 * Construit une réponse d'outil MCP avec sortie structurée : le `structuredContent`
 * (validé contre l'outputSchema) + une version texte JSON pour les clients qui ne
 * lisent que `content`.
 */
export function structured<T extends Record<string, unknown>>(obj: T) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(obj, null, 2) }],
    structuredContent: obj,
  };
}
