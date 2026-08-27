export type AiChatMessage = { id: string; role: 'user' | 'assistant'; text: string; creditsUsed?: number };
export type AiCreditTransaction = {
  _id?: string;
  type: 'welcome' | 'assistant' | 'purchase' | 'refund' | 'admin';
  amount: number;
  balanceAfter: number;
  description?: string;
  createdAt?: string;
};
export type AiWallet = { credits: number; transactions: AiCreditTransaction[] };
export type AiChatResponse = { answer: string; creditsUsed: number; credits: number; replayed?: boolean };
export type AiTranscriptionResponse = { text: string; creditsUsed: number; credits: number; replayed?: boolean };
export type AuthFetch = (url: string, options?: RequestInit, timeout?: number) => Promise<Response>;

const readJson = async (response: Response) => response.json().catch(() => ({}));

export const fetchAiWallet = async (authFetch: AuthFetch, apiUrl: string): Promise<AiWallet> => {
  const response = await authFetch(`${apiUrl}/ai/wallet`);
  const data = await readJson(response);
  if (!response.ok) throw new Error(data?.error || 'Kredi bilgisi alınamadı.');
  return { credits: Number(data?.credits || 0), transactions: Array.isArray(data?.transactions) ? data.transactions : [] };
};

export const sendAiMessage = async (
  authFetch: AuthFetch,
  apiUrl: string,
  message: string,
  history: AiChatMessage[],
  requestId: string,
): Promise<AiChatResponse> => {
  const response = await authFetch(`${apiUrl}/ai/chat`, {
    method: 'POST',
    body: JSON.stringify({
      requestId,
      message,
      history: history.slice(-6).map((item) => ({ role: item.role, text: item.text })),
    }),
  }, 60000);
  const data = await readJson(response);
  if (!response.ok) {
    const error = new Error(data?.error || 'Asistan yanıt oluşturamadı.') as Error & { code?: string; credits?: number };
    error.code = data?.code;
    error.credits = Number(data?.credits || 0);
    throw error;
  }
  return {
    answer: String(data?.answer || ''),
    creditsUsed: Number(data?.creditsUsed || 0),
    credits: Number(data?.credits || 0),
    replayed: Boolean(data?.replayed),
  };
};

export const transcribeAiVoice = async (
  authFetch: AuthFetch,
  apiUrl: string,
  audioBase64: string,
  mimeType: string,
  requestId: string,
): Promise<AiTranscriptionResponse> => {
  const response = await authFetch(`${apiUrl}/ai/transcribe`, {
    method: 'POST',
    body: JSON.stringify({ requestId, audioBase64, mimeType }),
  }, 60000);
  const data = await readJson(response);
  if (!response.ok) {
    const error = new Error(data?.error || 'Ses kaydı metne çevrilemedi.') as Error & { code?: string; credits?: number };
    error.code = data?.code;
    if (Number.isFinite(Number(data?.credits))) error.credits = Number(data.credits);
    throw error;
  }
  return {
    text: String(data?.text || '').trim(),
    creditsUsed: Number(data?.creditsUsed || 0),
    credits: Number(data?.credits || 0),
    replayed: Boolean(data?.replayed),
  };
};
