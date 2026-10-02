import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { API_URL } from '../services/api';
import { AiChatMessage, AiCreditTransaction, AuthFetch, fetchAiWallet, sendAiMessage, transcribeAiVoice } from '../services/aiAssistant';

const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const useAiAssistant = (userId: string | undefined, authFetch: AuthFetch) => {
  const requestRef = useRef(authFetch);
  // Identity is renewed even for A → logout → A. User ID alone isn't enough.
  const scope = useMemo(() => ({ userId }), [userId]);
  const active = useRef<typeof scope | null>(null);
  const work = useRef({ wallet: 0, chat: false, voice: false });
  const [dataScope, setDataScope] = useState(scope);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [credits, setCredits] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<AiCreditTransaction[]>([]);
  const [busy, setBusy] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState('');

  useLayoutEffect(() => { requestRef.current = authFetch; }, [authFetch]);
  useLayoutEffect(() => {
    active.current = scope;
    work.current = { wallet: 0, chat: false, voice: false };
    return () => { active.current = null; };
  }, [scope]);
  const isCurrent = useCallback(() => Boolean(scope.userId) && active.current === scope, [scope]);

  const refreshWallet = useCallback(async () => {
    if (!isCurrent()) return;
    const version = ++work.current.wallet;
    try {
      const wallet = await fetchAiWallet(requestRef.current, API_URL);
      if (!isCurrent() || version !== work.current.wallet) return;
      setCredits(wallet.credits);
      setTransactions(wallet.transactions);
    } catch (walletError) {
      if (!isCurrent() || version !== work.current.wallet) return;
      setError(walletError instanceof Error ? walletError.message : 'Kredi bilgisi alınamadı.');
    }
  }, [isCurrent]);

  useEffect(() => {
    // Reset assistant state when a different account becomes active.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages([]);
    setDataScope(scope);
    setCredits(null);
    setTransactions([]);
    setError('');
    setBusy(false);
    setTranscribing(false);
    if (userId) void refreshWallet();
  }, [refreshWallet, userId, scope]);

  const ask = async (rawMessage: string) => {
    const message = rawMessage.trim();
    if (!isCurrent() || work.current.chat || work.current.voice || message.length < 2) return false;
    work.current.chat = true;
    work.current.wallet++;
    const userMessage: AiChatMessage = { id: makeId('user'), role: 'user', text: message };
    const previous = dataScope === scope ? messages : [];
    setMessages((current) => [...current, userMessage].slice(-20));
    setBusy(true);
    setError('');
    try {
      const result = await sendAiMessage(requestRef.current, API_URL, message, previous, makeId(`ai-${userId}`));
      if (!isCurrent()) return false;
      setCredits(result.credits);
      const assistantMessage: AiChatMessage = {
        id: makeId('assistant'), role: 'assistant', text: result.answer, creditsUsed: result.creditsUsed,
      };
      setMessages((current) => [...current, assistantMessage].slice(-20));
      void refreshWallet();
      return true;
    } catch (chatError: any) {
      if (!isCurrent()) return false;
      if (Number.isFinite(chatError?.credits)) setCredits(chatError.credits);
      setError(chatError instanceof Error ? chatError.message : 'Asistan yanıt oluşturamadı.');
      return false;
    } finally {
      if (isCurrent()) { work.current.chat = false; setBusy(false); }
    }
  };

  const clearConversation = () => {
    if (!isCurrent()) return;
    setMessages([]);
    setError('');
  };

  const transcribeVoice = async (audioBase64: string, mimeType: string) => {
    if (!isCurrent() || work.current.voice || work.current.chat || !audioBase64) return null;
    work.current.voice = true;
    work.current.wallet++;
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
      if (!isCurrent()) return null;
      setCredits(result.credits);
      void refreshWallet();
      return result.text || null;
    } catch (transcriptionError: any) {
      if (!isCurrent()) return null;
      if (Number.isFinite(transcriptionError?.credits)) setCredits(transcriptionError.credits);
      setError(transcriptionError instanceof Error ? transcriptionError.message : 'Ses kaydı metne çevrilemedi.');
      return null;
    } finally {
      if (isCurrent()) { work.current.voice = false; setTranscribing(false); }
    }
  };

  const owned = Boolean(userId) && dataScope === scope;
  return { messages: owned ? messages : [], credits: owned ? credits : null, transactions: owned ? transactions : [], busy: owned && busy, transcribing: owned && transcribing, error: owned ? error : '', ask, transcribeVoice, refreshWallet, clearConversation };
};
