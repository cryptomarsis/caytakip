import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const USER_SESSION_KEY = '@user_session';

// --- Yardımcı Depolama Fonksiyonları ---

export const saveSession = async (userData) => {
  try {
    const jsonValue = JSON.stringify(userData);
    await AsyncStorage.setItem(USER_SESSION_KEY, jsonValue);
  } catch (e) {
    console.error('Oturum kaydedilirken hata oluştu:', e);
  }
};

export const getSession = async () => {
  try {
    const jsonValue = await AsyncStorage.getItem(USER_SESSION_KEY);
    return jsonValue != null ? JSON.parse(jsonValue) : null;
  } catch (e) {
    console.error('Oturum okunurken hata oluştu:', e);
    return null;
  }
};

export const clearSession = async () => {
  try {
    await AsyncStorage.removeItem(USER_SESSION_KEY);
  } catch (e) {
    console.error('Oturum silinirken hata oluştu:', e);
  }
};

// --- Context API Yapısı ---

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkToken = async () => {
    try {
      const storedUser = await getSession();
      if (storedUser) {
        setUser(storedUser);
      }
    } catch (error) {
      console.error('Oturum bilgisi okunurken hata oluştu:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Restoring the persisted session is the provider's mount-time side effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkToken();
  }, []);

  const login = async (userData) => {
    try {
      setUser(userData);
      await saveSession(userData);
    } catch (error) {
      console.error('Oturum kaydedilirken hata oluştu:', error);
    }
  };

  const logout = async () => {
    try {
      setUser(null);
      await clearSession();
    } catch (error) {
      console.error('Oturum silinirken hata oluştu:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth bir AuthProvider içerisinde kullanılmalıdır.');
  }
  return context;
};
