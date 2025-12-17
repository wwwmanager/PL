
import { type FC, type ReactNode } from 'react';

const AuthContext: FC<{ children: ReactNode }> = ({ children }) => {
  return <>{children}</>;
};

export const AuthProvider = AuthContext;

export const useAuth = () => {
    // This hook is now a no-op as auth has been removed.
    // It's kept for compatibility to avoid breaking imports.
    return {
        currentUser: null,
        users: [],
        login: () => {},
        logout: () => {},
        hasPermission: () => true, // In single-user mode, all permissions are granted.
    };
};
