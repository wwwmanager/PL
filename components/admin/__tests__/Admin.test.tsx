import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Admin from '../Admin';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const getAppSettings = vi.fn();
const saveAppSettings = vi.fn();
const dumpAllDataForExport = vi.fn();

vi.mock('../../../services/mockApi', () => ({
  getAppSettings: (...args: unknown[]) => getAppSettings(...args),
  saveAppSettings: (...args: unknown[]) => saveAppSettings(...args),
  dumpAllDataForExport: (...args: unknown[]) => dumpAllDataForExport(...args),
}));

vi.mock('../../../services/storage', () => ({
  storageKeys: vi.fn(async () => ['waybills']),
  storageClear: vi.fn(),
  loadJSON: vi.fn(),
  saveJSON: vi.fn(async () => undefined),
}));

vi.mock('../ImportAuditLog', () => ({ default: () => <div>Import audit mock</div> }));
vi.mock('../Diagnostics', () => ({ default: () => <div>Diagnostics mock</div> }));
vi.mock('../UserManagement', () => ({ default: () => <div>User management mock</div> }));
vi.mock('../RoleManagement', () => ({ default: () => <div>Role management mock</div> }));
vi.mock('../BlankManagement', () => ({ default: () => <div>Blank management mock</div> }));
vi.mock('../BusinessAuditLog', () => ({ default: () => <div>Business audit mock</div> }));
vi.mock('../ExportContextPackButton', () => ({
  default: () => <button>Mocked Context Pack</button>,
}));
vi.mock('../shared/ConfirmationModal', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div>Modal open</div> : null),
}));

const showToast = vi.fn();
vi.mock('../../../hooks/useToast', () => ({
  useToast: () => ({ showToast }),
}));

let allowedPermissions = new Set<string>();
const useAuthMock = () => ({
  can: (permission: string) => allowedPermissions.has(permission),
  currentUser: {
    id: 'u1',
    role: allowedPermissions.has('role:admin') ? 'admin' : 'user',
    displayName: 'Test User',
  },
});
vi.mock('../../../services/auth', () => ({
  useAuth: () => useAuthMock(),
}));

const baseSettings = {
  isParserEnabled: false,
  appMode: 'driver' as const,
  blanks: { driverCanAddBatches: false },
};

describe('Admin component', () => {
  beforeEach(() => {
    allowedPermissions = new Set();
    getAppSettings.mockResolvedValue(baseSettings);
    saveAppSettings.mockResolvedValue(undefined);
    dumpAllDataForExport.mockResolvedValue({});
    showToast.mockClear();
  });

  it('отключает импорт/экспорт для пользователя без прав', async () => {
    render(<Admin />);

    await screen.findByText('Настройки');

    const importBtn = screen.getByRole('button', { name: /^Импорт$/ });
    const exportBtn = screen.getByRole('button', { name: /^Экспорт$/ });

    expect(importBtn).toBeDisabled();
    expect(exportBtn).toBeDisabled();
  });

  it('разрешает импорт (limited) и успешно выполняет экспорт', async () => {
    allowedPermissions = new Set(['admin.panel', 'import.limited', 'export.run', 'role:admin']);
    dumpAllDataForExport.mockResolvedValue({
      waybills: [{ id: 'w1' }],
      vehicles: [],
    });

    render(<Admin />);

    await screen.findByText(/Общие настройки/);
    const importBtn = screen.getByRole('button', { name: /^Импорт$/ });
    expect(importBtn).toBeEnabled();

    const exportBtn = screen.getByRole('button', { name: /^Экспорт$/ });
    const user = userEvent.setup();
    await user.click(exportBtn);

    await waitFor(() => expect(dumpAllDataForExport).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('Данные экспортированы.', 'success')
    );

    const saveJSON = (await import('../../../services/storage')).saveJSON as ReturnType<
      typeof vi.fn
    >;
    expect(saveJSON).toHaveBeenCalledWith('__last_export_meta__', expect.objectContaining({
      keys: ['vehicles', 'waybills'],
      formatVersion: 2,
    }));
  });
});