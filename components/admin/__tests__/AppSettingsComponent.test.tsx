import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppSettingsComponent } from '../AppSettingsComponent';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const getAppSettings = vi.fn();
const saveAppSettings = vi.fn();
vi.mock('../../../services/mockApi', () => ({
  getAppSettings: (...args: unknown[]) => getAppSettings(...args),
  saveAppSettings: (...args: unknown[]) => saveAppSettings(...args),
  dumpAllDataForExport: vi.fn(),
}));

const showToast = vi.fn();
vi.mock('../../../hooks/useToast', () => ({
  useToast: () => ({ showToast }),
}));

let canPermissions = new Set<string>();
const useAuthMock = () => ({
  can: (permission: string) => canPermissions.has(permission),
});
vi.mock('../../../services/auth', () => ({
  useAuth: () => useAuthMock(),
}));

const baseSettings = {
  isParserEnabled: false,
  appMode: 'driver',
  blanks: { driverCanAddBatches: false },
};

describe('AppSettingsComponent', () => {
  beforeEach(() => {
    canPermissions = new Set();
    getAppSettings.mockResolvedValue(baseSettings);
    saveAppSettings.mockResolvedValue(undefined);
    showToast.mockClear();
  });

  it('скрывает настройки для пользователей без admin.panel', async () => {
    const user = userEvent.setup();
    render(<AppSettingsComponent />);
    expect(await screen.findByText(/Доступ к общим настройкам/)).toBeInTheDocument();
    expect(getAppSettings).toHaveBeenCalledTimes(1);
    await user.click(document.body); // trigger userEvent
  });

  it('показывает и сохраняет изменение настроек для администратора', async () => {
    canPermissions = new Set(['admin.panel']);
    render(<AppSettingsComponent />);

    const parserToggle = await screen.findByRole('checkbox', {
      name: /парсер маршрутов из файла/i,
    });
    const blanksToggle = screen.getByRole('checkbox', {
      name: /водитель может добавлять пачки/i,
    });

    expect(parserToggle).not.toBeChecked();
    expect(blanksToggle).not.toBeChecked();

    const user = userEvent.setup();
    await user.click(parserToggle);

    await waitFor(() =>
      expect(saveAppSettings).toHaveBeenNthCalledWith(1, {
        ...baseSettings,
        isParserEnabled: true,
      })
    );
    expect(showToast).toHaveBeenLastCalledWith('Настройки сохранены.', 'success');

    await user.click(blanksToggle);

    await waitFor(() =>
      expect(saveAppSettings).toHaveBeenNthCalledWith(2, {
        ...baseSettings,
        isParserEnabled: true,
        blanks: { driverCanAddBatches: true },
      })
    );
    expect(showToast).toHaveBeenCalledTimes(2);
  });
});