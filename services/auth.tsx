
// services/auth.tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { loadJSON, saveJSON, removeKey } from './storage';
import { getRolePolicies, getAppSettings } from './mockApi';
import { subscribe } from './bus';
import type { Role, Capability, User, AppSettings } from '../types';
import { DEFAULT_ROLE_POLICIES, ALL_CAPS } from '../constants';

type AuthContextValue = {
  currentUser: User | null;
  appSettings: AppSettings | null;
  can: (cap: Capability | Capability[]) => boolean;
  hasRole: (role: Role | Role[]) => boolean;
  loginAs: (user: User) => Promise<void>; // простая заглушка (локальная авторизация)
  logout: () => Promise<void>;
  // утилиты для UI
  allCaps: Capability[];
  rolePolicies: Record<Role, Capability[]>;
};

const CURRENT_USER_KEY = '__current_user__';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode; defaultRole?: Role }> = ({ children, defaultRole = 'admin' as Role }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [appSettingsState, setAppSettingsState] = useState<AppSettings | null>(null);
  const [rolePolicies, setRolePolicies] = useState<Record<Role, Capability[]>>(DEFAULT_ROLE_POLICIES);

  const fetchPolicies = useCallback(async () => {
    try {
        const policies = await getRolePolicies();
        // Fallback to default if API/storage returns nothing or null
        if (policies && typeof policies === 'object') {
             setRolePolicies(policies);
        } else {
             setRolePolicies(DEFAULT_ROLE_POLICIES);
        }
    } catch (e) {
        console.error("Failed to fetch role policies, using default", e);
        setRolePolicies(DEFAULT_ROLE_POLICIES);
    }
  }, []);

  // начальная загрузка
  useEffect(() => {
    let alive = true;
    (async () => {
      const saved = await loadJSON<User | null>(CURRENT_USER_KEY, null);
      if (alive) {
        if (saved) setCurrentUser(saved);
        else {
          // дефолтный пользователь (для DEV). На проде — замените настоящей авторизацией.
          const dev: User = { id: 'dev-admin', role: defaultRole, displayName: 'Admin' };
          setCurrentUser(dev);
          await saveJSON(CURRENT_USER_KEY, dev);
        }
      }
    })();
    
    getAppSettings().then(settings => {
        if(alive) {
            setAppSettingsState(settings);
        }
    });

    fetchPolicies(); // Загружаем политики при старте

    // Подписываемся на обновление политик
    const unsubscribe = subscribe(msg => {
      if (msg.topic === 'policies') {
        fetchPolicies();
      }
    });

    return () => { 
      alive = false;
      unsubscribe();
    };
  }, [defaultRole, fetchPolicies]);

  const roleCaps = useMemo(() => {
    const role = currentUser?.role || 'user';
    // HARDCODED SAFETY: Admin always gets all capabilities, regardless of DB settings.
    if (role === 'admin') {
        return ALL_CAPS;
    }
    // Safe access
    return (rolePolicies && rolePolicies[role]) ? rolePolicies[role] : [];
  }, [currentUser?.role, rolePolicies]);

  const can = useCallback((cap: Capability | Capability[]) => {
    const list = Array.isArray(cap) ? cap : [cap];
    const extras = currentUser?.extraCaps || [];
    return list.every(c => roleCaps.includes(c) || extras.includes(c));
  }, [roleCaps, currentUser?.extraCaps]);

  const hasRole = useCallback((role: Role | Role[]) => {
    const r = Array.isArray(role) ? role : [role];
    return currentUser ? r.includes(currentUser.role) : false;
  }, [currentUser]);

  const loginAs = useCallback(async (user: User) => {
    setCurrentUser(user);
    await saveJSON(CURRENT_USER_KEY, user);
  }, []);

  const logout = useCallback(async () => {
    setCurrentUser(null);
    await removeKey(CURRENT_USER_KEY);
  }, []);

  const value: AuthContextValue = {
    currentUser,
    appSettings: appSettingsState,
    can,
    hasRole,
    loginAs,
    logout,
    allCaps: ALL_CAPS,
    rolePolicies: rolePolicies || DEFAULT_ROLE_POLICIES,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// Обёртки для маршрутов/блоков UI

export const RequireCapability: React.FC<{ cap: Capability | Capability[]; fallback?: React.ReactNode; children: React.ReactNode }> = ({ cap, fallback = null, children }) => {
  const { can } = useAuth();
  if (!can(cap)) return <>{fallback}</>;
  return <>{children}</>;
};

export const RequireRole: React.FC<{ role: Role | Role[]; fallback?: React.ReactNode; children: React.ReactNode }> = ({ role, fallback = null, children }) => {
  const { hasRole } = useAuth();
  if (!hasRole(role)) return <>{fallback}</>;
  return <>{children}</>;
};

// Быстрый dev-переключатель роли (опционально подключите в шапку)
export const DevRoleSwitcher: React.FC = () => {
  const { currentUser, loginAs, rolePolicies } = useAuth();
  const roles: Role[] = ['admin','auditor','user', 'driver', 'reviewer', 'accountant', 'mechanic', 'viewer'];
  
  // Calculate display count correctly considering admin override
  const getCapCount = (r: Role) => {
      if (r === 'admin') return ALL_CAPS.length;
      return (rolePolicies && rolePolicies[r]) ? rolePolicies[r].length : 0;
  };

  return (
    <div className="text-xs flex items-center gap-2 p-1 rounded bg-gray-100 dark:bg-gray-800">
      <span>Роль:</span>
      <select
        value={currentUser?.role || 'user'}
        onChange={(e) => {
          const role = e.target.value as Role;
          const displayName = role.charAt(0).toUpperCase() + role.slice(1);
          loginAs({ id: `dev-${role}`, role, displayName });
        }}
        className="px-1 py-0.5 rounded border dark:border-gray-700 dark:bg-gray-900"
      >
        {roles.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      <span className="text-gray-500">прав: {getCapCount(currentUser?.role || 'user')}</span>
    </div>
  );
};
