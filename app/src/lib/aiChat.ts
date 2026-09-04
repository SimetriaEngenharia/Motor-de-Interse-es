/* Ponte de IA do Criador de Seção Tipo.
 *
 * O app nasceu falando com um backend próprio em /api/chat. Esse backend não
 * existe em todo lugar onde o Simetria roda, então aqui há um segundo caminho:
 * se houver chave do Gemini, falamos direto com a API do Google.
 *
 * Chave (qualquer um dos dois):
 *   - .env.local  ->  GEMINI_API_KEY=...        (injetada pelo Vite / AI Studio)
 *   - console     ->  globalThis.__GEMINI_API_KEY = "..."   (teste rápido)
 */

const MODELO = "gemini-2.5-flash";

// O Vite troca `process.env.API_KEY` por um literal; fora dele a leitura nem acontece.
declare const process: { env: Record<string, string | undefined> };

function chaveGemini(): string {
  const g = globalThis as any;
  if (g.__GEMINI_API_KEY) return String(g.__GEMINI_API_KEY);
  // Vite troca este texto por um literal no build; sem Vite, dá ReferenceError.
  try { return (process.env.API_KEY as string) || ""; } catch { return ""; }
}

export function iaDisponivel(): boolean {
  return !!chaveGemini();
}

async function viaBackend(payload: unknown): Promise<any> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("backend /api/chat: " + res.status);
  return res.json();
}

async function viaGemini(prompt: string, planoAtual: unknown): Promise<any> {
  const chave = chaveGemini();
  if (!chave) throw new Error("sem GEMINI_API_KEY");
  const instrucao = [
    "Você é projetista rodoviário e monta seções tipo (subassemblies) do Civil 3D.",
    "Responda SOMENTE com JSON válido, sem cercas de código, neste formato:",
    '{"reply":string,"packetSettings":{"subassemblyName":string,"description":string,"version":string},',
    '"parameters":[{"name","type","direction","defaultValue","description"}],',
    '"targetParameters":[{"name","type","description"}],',
    '"flowchart":[{"step":number,"type","name","description","howToCreate"}],',
    '"expressions":[{"elementType","elementName","property","formula","explanation"}],',
    '"decisions":[{"name","condition","truePath","falsePath","explanation"}]}',
    planoAtual ? "Plano atual para revisar:\n" + JSON.stringify(planoAtual) : "",
    "Pedido do usuário:\n" + prompt,
  ].filter(Boolean).join("\n\n");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": chave },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: instrucao }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
      }),
    },
  );
  if (!res.ok) throw new Error("Gemini " + res.status + ": " + (await res.text()).slice(0, 200));
  const data = await res.json();
  const texto = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
  return JSON.parse(texto.replace(/^\s*\`\`\`(?:json)?|\`\`\`\s*$/g, ""));
}

/** Tenta o backend; se ele não existir, cai no Gemini. Lança se os dois falharem. */
export async function pedirPlanoIA(prompt: string, planoAtual: unknown): Promise<any> {
  try {
    return await viaBackend({ history: [{ role: "user", content: prompt }], currentPlan: planoAtual });
  } catch (erroBackend) {
    if (!chaveGemini()) throw erroBackend;
    return viaGemini(prompt, planoAtual);
  }
}
