import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useAuthContext } from './AuthContext';
import type { WeightUnit } from '../lib/units';

interface UserContextType {
  preferredUnit: 'imperial' | 'metric';
  weightUnit: WeightUnit;
  setPreferredUnit: (unit: 'imperial' | 'metric') => void;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const { user } = useAuthContext();

  // Initialize from user preference or localStorage
  const [preferredUnit, setPreferredUnitState] = useState<'imperial' | 'metric'>(() => {
    if (user?.preferred_unit) return user.preferred_unit;
    const saved = localStorage.getItem('iron-log-preferred-unit');
    return (saved as 'imperial' | 'metric') || 'imperial';
  });

  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('iron-log-dark-mode');
    if (saved !== null) return saved === 'true';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const setPreferredUnit = (unit: 'imperial' | 'metric') => {
    setPreferredUnitState(unit);
    localStorage.setItem('iron-log-preferred-unit', unit);
  };

  const toggleDarkMode = () => {
    setIsDarkMode((prev) => {
      const newValue = !prev;
      localStorage.setItem('iron-log-dark-mode', String(newValue));

      if (newValue) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }

      return newValue;
    });
  };

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const value: UserContextType = {
    preferredUnit,
    weightUnit: preferredUnit === 'metric' ? 'kg' : 'lbs',
    setPreferredUnit,
    isDarkMode,
    toggleDarkMode,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUserContext() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUserContext must be used within a UserProvider');
  }
  return context;
}
