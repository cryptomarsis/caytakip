import { useCallback, useEffect, useRef, useState } from 'react';

import { API_URL } from '../services/api';
import { AiChatMessage, AiCreditTransaction, AuthFetch, fetchAiWallet, sendAiMessage, transcribeAiVoice } from '../services/aiAssistant';

const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const useAiAssistant = (userId: string | undefined, authFetch: AuthFetch) => {
  const requestRef = useRef(authFetch);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [credits, setCredits] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<AiCreditTransaction[]>([]);
  const [busy, setBusy] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { requestRef.current = authFetch; }, [authFetch]);

  const refreshWallet = useCallback(async () => {
    if (!userId) return;
    try {
      const wallet = await fetchAiWallet(requestRef.current, API_URL);
      setCredits(wallet.credits);
      setTransactions(wallet.transactions);
    } catch (walletError) {
      setError(walletError instanceof Error ? walletError.message : 'Kredi bilgisi alınamadı.');
    }
  }, [userId]);

  useEffect(() => {
    // Reset assistant state when a different account becomes active.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages([]);
    setCredits(null);
    setTransactions([]);
    setError('');
    if (userId) void refreshWallet();
  }, [refreshWallet, userId]);

  const ask = async (rawMessage: string) => {
    const message = rawMessage.trim();
    if (!userId || busy || message.length < 2) return false;
    const userMessage: AiChatMessage = { id: makeId('user'), role: 'user', text: message };
    const previous = messages;
    setMessages((current) => [...current, userMessage].slice(-20));
    setBusy(true);
    setError('');
    try {
      const result = await sendAiMessage(requestRef.current, API_URL, message, previous, makeId(`ai-${userId}`));
      setCredits(result.credits);
      const assistantMessage: AiChatMessage = {
        id: makeId('assistant'), role: 'assistant', text: result.answer, creditsUsed: result.creditsUsed,
      };
      setMessages((current) => [...current, assistantMessage].slice(-20));
      void refreshWallet();
      return true;
    } catch (chatError: any) {
      if (Number.isFinite(chatError?.credits)) setCredits(chatError.credits);
      setError(chatError instanceof Error ? chatError.message : 'Asistan yanıt oluşturamadı.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const clearConversation = () => {
    setMessages([]);
    setError('');
  };

  const transcribeVoice = async (audioBase64: string, mimeType: string) => {
    if (!userId || transcribing || busy || !audioBase64) return null;
    setTranscribing(true);
    setError('');
    try {
      const result = await transcribeAiVoice(
        requestRef.current,
        API_URL,
        audioBase64,
        mimeType,
        makeId(`voice-${userId}`),
      );
      setCredits(result.credits);
      void refreshWallet();
      return result.text || null;
    } catch (transcriptionError: any) {
      if (Number.isFinite(transcriptionError?.credits)) setCredits(transcriptionError.credits);
      setError(transcriptionError instanceof Error ? transcriptionError.message : 'Ses kaydı metne çevrilemedi.');
      return null;
    } finally {
      setTranscribing(false);
    }
  };

  return { messages, credits, transactions, busy, transcribing, error, ask, transcribeVoice, refreshWallet, clearConversation };
};
