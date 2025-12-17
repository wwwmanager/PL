
// components/admin/Diagnostics.tsx
import React, { useMemo, useState } from 'react';
import { storageKeys, loadJSON, removeKey, saveJSON } from '../../services/storage';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../services/auth';
// FIX: Module '"../../services/mockApi"' has no exported member 'DB_KEYS'.
import { DB_KEYS } from '../../services/dbKeys';
import { databaseSchema } from '../../services/schemas';
import { AUDIT_INDEX_KEY, AUDIT_CHUNK_PREFIX } from '../../services/auditLog';
import ConfirmationModal from '../shared/ConfirmationModal';
import { runFullRecalculation, generateBalanceSnapshots } from '../../services/recalculationService';
import { ArrowUturnLeftIcon, SparklesIcon, WrenchScrewdriverIcon } from '../Icons';
import { fixWaybillDates } from '../../services/mockApi';

const UNKNOWN_PREFIX = 'compat:unknown:';
const CTX_PREFIX = '__ctx__:';
const BACKUP_KEY = '__backup_before_import__';

type KeyRow = { key: string; size: number; type: string };
type AuditSummary = {
  eventCount: number;
  firstEvent?: any;
  compression?: string;
  chunkCount?: number;
};
type StorageEstimate = {
  usage?: number;
  quota?: number;
  usageDetails?: Record<string, number>;
  driver?: string | null;
};
type EnvSupport = {
  appVersion?: string;
  userAgent: string;
  compressionStream: boolean;
  decompressionStream: boolean;
  pako: boolean;
};

function classNames(...x: (string | false | undefined)[]) {
  return x.filter(Boolean).join(' ');
}
function formatBytes(b?: number) {
  if (!b && b !== 0) return '—';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let n = b;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(1)} ${u[i]}`;
}
function short(s: any, max = 80) {
  const str = typeof s === 'string' ? s : JSON.stringify(s);
  if (!str) return '—';
  return str.length > max ? str.slice(0, max) + '…' : str;
}
async function getKeysWithSizes(limit?: number): Promise<KeyRow[]> {
  const keys = await storageKeys();
  const rows: KeyRow[] = [];
  for (const k of keys) {
    try {
      const v = await loadJSON(k, null);
      const size = typeof v === 'string' ? v.length : JSON.stringify(v || '').length;
      const type = Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
      rows.push({ key: k, size, type });
    } catch {
      rows.push({ key: k, size: -1, type: 'error' });
    }
  }
  rows.sort((a, b) => b.size - a.size);
  return typeof limit === 'number' ? rows.slice(0, limit) : rows;
}

async function getAuditSummary(): Promise<AuditSummary> {
  const idx = await loadJSON<any[]>(AUDIT_INDEX_KEY, []);
  const eventCount = Array.isArray(idx) ? idx.length : 0;
  const firstEvent = eventCount ? idx[0] : undefined;
  const compression = firstEvent?.chunk?.compression;
  const allKeys = await storageKeys();
  const chunkCount = allKeys.filter((k) => k.startsWith(AUDIT_CHUNK_PREFIX)).length;
  return { eventCount, firstEvent, compression, chunkCount };
}

async function getUnknownSummary() {
  const keys = await storageKeys();
  const unknown = keys.filter((k) => k.startsWith(UNKNOWN_PREFIX));
  const samples = unknown.slice(0, 10);
  return { count: unknown.length, samples };
}

async function estimateStorage(): Promise<StorageEstimate> {
  const out: StorageEstimate = {};
  try {
    // This is an approximation as we don't expose the driver directly.
    // localforage is the primary so this is a safe assumption for diagnostics.
    out.driver = 'localforage';
  } catch {
    out.driver = null;
  }
  try {
    // @ts-ignore
    const r = await (navigator.storage?.estimate?.() ?? Promise.resolve(null));
    if (r) {
      out.usage = r.usage;
      out.quota = r.quota;
      // @ts-ignore
      if (r.usageDetails) out.usageDetails = r.usageDetails;
    }
  } catch {}
  return out;
}
function getEnvSupport(): EnvSupport {
  const appVersion = (import.meta as any)?.env?.VITE_APP_VERSION;
  const ua = navigator.userAgent;
  const cs = typeof (globalThis as any).CompressionStream === 'function';
  const ds = typeof (globalThis as any).DecompressionStream === 'function';
  const pako = !!(globalThis as any).pako;
  return { appVersion, userAgent: ua, compressionStream: cs, decompressionStream: ds, pako };
}

async function dumpDbSnapshot(onlyKnown = true) {
  const keys = await storageKeys();
  const knownSet = new Set(Object.values(DB_KEYS) as string[]);
  const pick = onlyKnown ? keys.filter((k) => knownSet.has(k)) : keys;
  const out: Record<string, any> = {};
  for (const k of pick) {
    out[k] = await loadJSON(k, null);
  }
  return out;
}
function summarizeZodError(e: any, limit = 10) {
  try {
    const issues = e?.issues || e?.format?.() || e;
    const arr = Array.isArray(issues) ? issues : [];
    return arr.slice(0, limit).map((it: any) => ({
      path: Array.isArray(it?.path) ? it.path.join('.') : String(it?.path ?? ''),
      message: it?.message ?? String(it),
    }));
  } catch {
    return [{ path: '', message: 'Unknown zod error' }];
  }
}

const Diagnostics: React.FC = () => {
  const { showToast } = useToast();
  const { can } = useAuth();

  const [env, setEnv] = useState<EnvSupport | null>(null);
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null);
  const [keysTop, setKeysTop] = useState<KeyRow[] | null>(null);
  const [audit, setAudit] = useState<AuditSummary | null>(null);
  const [unknown, setUnknown] = useState<{ count: number; samples: string[] } | null>(null);
  const [validation, setValidation] = useState<{ ok: boolean; errors?: Array<{ path: string; message: string }> } | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void }>({
      isOpen: false, title: '', message: '', onConfirm: () => {}
  });

  if (!can('admin.panel')) {
    return (
      <div className="text-gray-500 dark:text-gray-400 p-4">
        Доступ к разделу диагностики есть только у администратора.
      </div>
    );
  }

  const runAll = async () => {
    setBusy('all');
    try {
      setEnv(getEnvSupport());
      setEstimate(await estimateStorage());
      setKeysTop(await getKeysWithSizes(20));
      setAudit(await getAuditSummary());
      setUnknown(await getUnknownSummary());
      await validateDb();
      showToast('Диагностика выполнена', 'success');
    } catch (e: any) {
      console.error(e);
      showToast(e?.message || 'Ошибка диагностики', 'error');
    } finally {
      setBusy(null);
    }
  };

  const validateDb = async () => {
    setBusy('validate');
    try {
      const snapshot = await dumpDbSnapshot(true);
      const res = (databaseSchema as any)?.safeParse?.(snapshot);
      if (res?.success) setValidation({ ok: true });
      else {
        const errs = res?.error ? summarizeZodError(res.error, 15) : [{ path: '', message: 'Unknown error' }];
        setValidation({ ok: false, errors: errs });
      }
      showToast('Валидация завершена', 'success');
    } catch (e: any) {
      console.error(e);
      setValidation({ ok: false, errors: [{ path: '(exception)', message: e?.message || 'Ошибка валидации' }] });
      showToast('Ошибка валидации', 'error');
    } finally {
      setBusy(null);
    }
  };

  const exportReport = async () => {
    try {
      const report = {
        at: new Date().toISOString(),
        env: env ?? getEnvSupport(),
        storage: estimate ?? (await estimateStorage()),
        audit: audit ?? (await getAuditSummary()),
        unknown: unknown ?? (await getUnknownSummary()),
        keysTop: keysTop ?? (await getKeysWithSizes(20)),
      };
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      a.download = `diagnostics_${ts}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error(e);
      showToast(e?.message || 'Не удалось экспортировать отчёт', 'error');
    }
  };

  const handleRecalculate = () => {
      setModalConfig({
          isOpen: true,
          title: 'Полный пересчет данных',
          message: 'Эта операция пересчитает остатки на складе, балансы топливных карт и состояние транспорта на основе истории документов. Это может занять некоторое время. Продолжить?',
          onConfirm: async () => {
              setModalConfig(prev => ({ ...prev, isOpen: false }));
              setBusy('recalc');
              try {
                  await runFullRecalculation((msg) => showToast(msg, 'info'));
                  showToast('Пересчет успешно завершен.', 'success');
                  // Trigger reload to refresh UI caches
                  setTimeout(() => window.location.reload(), 1500);
              } catch (e: any) {
                  showToast('Ошибка пересчета: ' + e.message, 'error');
              } finally {
                  setBusy(null);
              }
          }
      });
  };

  const handleGenerateSnapshots = () => {
      setModalConfig({
          isOpen: true,
          title: 'Создание снимков балансов',
          message: 'Будут созданы ежемесячные снимки балансов топливных карт. Это ускорит работу системы при большом объеме данных. Операция может занять время.',
          onConfirm: async () => {
              setModalConfig(prev => ({ ...prev, isOpen: false }));
              setBusy('snapshots');
              try {
                  await generateBalanceSnapshots((msg) => showToast(msg, 'info'));
                  showToast('Снимки успешно созданы.', 'success');
              } catch (e: any) {
                  showToast('Ошибка генерации снимков: ' + e.message, 'error');
              } finally {
                  setBusy(null);
              }
          }
      });
  };

  const handleFixDates = () => {
      setModalConfig({
          isOpen: true,
          title: 'Исправление формата дат',
          message: 'Запустить сканирование базы данных на наличие дат в старом формате (DD.MM.YYYY) и исправить их на ISO (YYYY-MM-DD)? Это необходимо, если импортированные путевые листы не отображаются в списке.',
          onConfirm: async () => {
              setModalConfig(prev => ({ ...prev, isOpen: false }));
              setBusy('fixDates');
              try {
                  const count = await fixWaybillDates();
                  showToast(`Исправлено и переиндексировано записей: ${count}`, 'success');
                  if (count > 0) {
                      setTimeout(() => window.location.reload(), 1500);
                  }
              } catch (e: any) {
                  showToast('Ошибка исправления: ' + e.message, 'error');
              } finally {
                  setBusy(null);
              }
          }
      });
  };

  // Danger zone
  const clearUnknownKeys = () => {
    setModalConfig({
        isOpen: true,
        title: 'Удалить неизвестные ключи?',
        message: 'Вы уверены, что хотите удалить все ключи compat:unknown:*? Это действие необратимо.',
        onConfirm: async () => {
            setModalConfig(prev => ({ ...prev, isOpen: false }));
            setBusy('clearUnknown');
            try {
              const keys = await storageKeys();
              const unknownKeys = keys.filter((k) => k.startsWith(UNKNOWN_PREFIX));
              await Promise.all(unknownKeys.map((k) => removeKey(k)));
              setUnknown(await getUnknownSummary());
              showToast(`Удалено: ${unknownKeys.length}`, 'success');
            } catch (e: any) {
              console.error(e);
              showToast(e?.message || 'Ошибка удаления unknown-ключей', 'error');
            } finally {
              setBusy(null);
            }
        }
    });
  };

  const clearAuditLog = () => {
    setModalConfig({
        isOpen: true,
        title: 'Очистить журнал аудита?',
        message: 'Вы уверены, что хотите удалить журнал аудита (индекс + чанки)? Это действие необратимо.',
        onConfirm: async () => {
            setModalConfig(prev => ({ ...prev, isOpen: false }));
            setBusy('clearAudit');
            try {
              const idx = await loadJSON<any[]>(AUDIT_INDEX_KEY, []);
              const events = Array.isArray(idx) ? idx : [];
              for (const ev of events) {
                const ks: string[] = ev?.chunk?.keys || [];
                await Promise.all(ks.map((k: string) => removeKey(k)));
              }
              await saveJSON(AUDIT_INDEX_KEY, []);
              setAudit(await getAuditSummary());
              showToast('Журнал очищен', 'success');
            } catch (e: any) {
              console.error(e);
              showToast(e?.message || 'Ошибка очистки журнала', 'error');
            } finally {
              setBusy(null);
            }
        }
    });
  };

  const clearUiContext = () => {
    setModalConfig({
        isOpen: true,
        title: 'Сбросить UI-контекст?',
        message: 'Вы уверены, что хотите сбросить UI-контекст (__ctx__:*)?',
        onConfirm: async () => {
            setModalConfig(prev => ({ ...prev, isOpen: false }));
            setBusy('clearCtx');
            try {
              const keys = await storageKeys();
              const ctxKeys = keys.filter((k) => k.startsWith(CTX_PREFIX));
              await Promise.all(ctxKeys.map((k) => removeKey(k)));
              showToast(`Сброшено: ${ctxKeys.length}`, 'success');
            } catch (e: any) {
              console.error(e);
              showToast(e?.message || 'Ошибка сброса контекста', 'error');
            } finally {
              setBusy(null);
            }
        }
    });
  };

  const backupDb = () => {
    setModalConfig({
        isOpen: true,
        title: 'Создать резервную копию?',
        message: `Сделать бэкап текущих данных (кроме служебных) в ${BACKUP_KEY}?`,
        onConfirm: async () => {
            setModalConfig(prev => ({ ...prev, isOpen: false }));
            setBusy('backup');
            try {
              const keys = await storageKeys();
              const blocked = new Set<string>([AUDIT_INDEX_KEY, BACKUP_KEY]);
              const data: Record<string, any> = {};
              const klist = keys.filter((k) => !blocked.has(k));
              for (const k of klist) data[k] = await loadJSON(k, null);
              await saveJSON(BACKUP_KEY, { createdAt: new Date().toISOString(), keys: klist, data });
              showToast('Бэкап сохранён', 'success');
            } catch (e: any) {
              console.error(e);
              showToast(e?.message || 'Ошибка бэкапа', 'error');
            } finally {
              setBusy(null);
            }
        }
    });
  };

  const envOk = useMemo(() => {
    if (!env) return null;
    return env.decompressionStream || env.pako;
  }, [env]);

  return (
    <div className="space-y-4">
      <ConfirmationModal
        isOpen={modalConfig.isOpen}
        onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
        onConfirm={modalConfig.onConfirm}
        title={modalConfig.title}
        message={modalConfig.message}
        confirmText="Да"
        confirmButtonClass="bg-red-600 hover:bg-red-700"
      />
      <div className="flex items-center justify-between">
        <div className="text-xl font-semibold text-gray-900 dark:text-white">Диагностика</div>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1.5 rounded bg-gray-200 dark:bg-gray-700"
            onClick={runAll}
            disabled={!!busy}
          >
            Запустить все проверки
          </button>
          <button
            className="px-3 py-1.5 rounded bg-gray-200 dark:bg-gray-700"
            onClick={exportReport}
          >
            Экспорт отчёта (JSON)
          </button>
        </div>
      </div>

      {/* Env */}
      <section className="border rounded-lg p-3 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">Окружение и поддержка</div>
          <div className="flex items-center gap-2">
            <button className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700" onClick={() => setEnv(getEnvSupport())}>Проверить</button>
          </div>
        </div>
        {env ? (
          <div className="text-sm grid md:grid-cols-2 gap-2">
            <div>Версия приложения: <b>{env.appVersion ?? '—'}</b></div>
            <div>Драйвер gzip (DecompressionStream/pako): <b className={classNames(envOk ? 'text-emerald-600' : 'text-amber-600')}>{env.decompressionStream ? 'DecompressionStream' : env.pako ? 'pako' : 'нет'}</b></div>
            <div>CompressionStream: <b>{env.compressionStream ? 'да' : 'нет'}</b></div>
            <div>DecompressionStream: <b>{env.decompressionStream ? 'да' : 'нет'}</b></div>
            <div className="md:col-span-2">User-Agent: <span className="text-gray-600">{env.userAgent}</span></div>
          </div>
        ) : <div className="text-sm text-gray-500">Нажмите «Проверить»</div>}
      </section>

      {/* Storage */}
      <section className="border rounded-lg p-3 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">Хранилище и квота</div>
          <button className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700" onClick={async () => setEstimate(await estimateStorage())}>Проверить</button>
        </div>
        {estimate ? (
          <div className="text-sm grid md:grid-cols-2 gap-2">
            <div>Драйвер localforage: <b>{estimate.driver ?? '—'}</b></div>
            <div>Оценка: <b>{formatBytes(estimate.usage)} / {formatBytes(estimate.quota)}</b></div>
            <div className="md:col-span-2 text-xs text-gray-500">usageDetails: {estimate.usageDetails ? JSON.stringify(estimate.usageDetails) : '—'}</div>
          </div>
        ) : <div className="text-sm text-gray-500">Нажмите «Проверить»</div>}
      </section>

      {/* Keys overview */}
      <section className="border rounded-lg p-3 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">Ключи и размеры (топ-20)</div>
          <div className="flex items-center gap-2">
            <button className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700" onClick={async () => setKeysTop(await getKeysWithSizes(20))}>Сканировать</button>
            {keysTop && (
              <button
                className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700"
                onClick={async () => {
                  const all = await getKeysWithSizes();
                  const csv = ['key,size,type', ...all.map(r => `"${r.key.replace(/"/g,'""')}",${r.size},${r.type}`)].join('\n');
                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a'); a.href = url; a.download = 'keys_sizes.csv';
                  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
                }}
              >
                Экспорт CSV
              </button>
            )}
          </div>
        </div>
        {keysTop ? (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/40">
                <tr className="text-left">
                  <th className="p-2">Ключ</th>
                  <th className="p-2">Тип</th>
                  <th className="p-2">Размер (≈)</th>
                </tr>
              </thead>
              <tbody>
                {keysTop.map(r => (
                  <tr key={r.key} className="border-t dark:border-gray-700">
                    <td className="p-2">{r.key}</td>
                    <td className="p-2">{r.type}</td>
                    <td className="p-2">{formatBytes(r.size)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="text-sm text-gray-500">Нажмите «Сканировать»</div>}
      </section>

      {/* Audit */}
      <section className="border rounded-lg p-3 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">Журнал импорта</div>
          <button className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700" onClick={async () => setAudit(await getAuditSummary())}>Проверить</button>
        </div>
        {audit ? (
          <div className="text-sm grid md:grid-cols-2 gap-2">
            <div>Событий: <b>{audit.eventCount}</b></div>
            <div>Чанков в хранилище: <b>{audit.chunkCount}</b></div>
            <div>Сжатие первого события: <b>{audit.compression ?? '—'}</b></div>
            <div className="md:col-span-2 text-xs text-gray-500">Первый header: {short(audit.firstEvent)}</div>
          </div>
        ) : <div className="text-sm text-gray-500">Нажмите «Проверить»</div>}
      </section>

      {/* Unknown keys */}
      <section className="border rounded-lg p-3 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">Неизвестные ключи (compat:unknown:*)</div>
          <button className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700" onClick={async () => setUnknown(await getUnknownSummary())}>Проверить</button>
        </div>
        {unknown ? (
          <div className="text-sm">
            Найдено: <b>{unknown.count}</b>
            <div className="text-xs text-gray-500 mt-1">Примеры: {unknown.samples.length ? unknown.samples.join(', ') : '—'}</div>
          </div>
        ) : <div className="text-sm text-gray-500">Нажмите «Проверить»</div>}
      </section>

      {/* Validation */}
      <section className="border rounded-lg p-3 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">Валидация БД по схеме (zod)</div>
          <button className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700" onClick={validateDb} disabled={busy === 'validate'}>Валидировать</button>
        </div>
        {validation ? (
          validation.ok ? (
            <div className="text-sm text-emerald-600">ОК: структура БД соответствует схеме.</div>
          ) : (
            <div className="text-sm">
              <div className="text-red-600 mb-1">Найдены несоответствия:</div>
              <div className="text-xs overflow-auto max-h-48 border rounded dark:border-gray-700">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700/40">
                    <tr className="text-left"><th className="p-1">Путь</th><th className="p-1">Ошибка</th></tr>
                  </thead>
                  <tbody>
                    {(validation.errors || []).map((e, i) => (
                      <tr key={i} className="border-t dark:border-gray-700">
                        <td className="p-1">{e.path || '—'}</td>
                        <td className="p-1">{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : <div className="text-sm text-gray-500">Нажмите «Валидировать»</div>}
      </section>

      {/* Maintenance & Danger zone */}
      <section className="border rounded-lg p-3 dark:border-gray-700">
        <div className="font-semibold mb-2 text-red-600">Обслуживание и Опасная зона</div>
        <div className="text-xs text-gray-600 mb-3">Действия ниже необратимы или могут существенно изменить данные.</div>
        
        <div className="flex flex-wrap gap-2">
          <button
            className="px-3 py-1 rounded bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 flex items-center gap-2"
            onClick={handleFixDates}
            disabled={!!busy}
            title="Исправить формат дат (DD.MM.YYYY -> YYYY-MM-DD) для совместимости"
          >
             <WrenchScrewdriverIcon className="w-4 h-4" />
             Починить даты (после импорта)
          </button>

          <button
            className="px-3 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
            onClick={handleRecalculate}
            disabled={!!busy}
          >
            <ArrowUturnLeftIcon className="w-4 h-4" />
            Полный пересчет данных
          </button>

          <button
            className="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            onClick={handleGenerateSnapshots}
            disabled={!!busy}
          >
            <SparklesIcon className="w-4 h-4" />
            Создать снимки балансов
          </button>
          
          <button className="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            onClick={clearUnknownKeys} disabled={busy === 'clearUnknown'}>Удалить compat:unknown:*</button>
          
          <button className="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            onClick={clearAuditLog} disabled={busy === 'clearAudit'}>Очистить журнал аудита</button>
          
          <button className="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            onClick={clearUiContext} disabled={busy === 'clearCtx'}>Сбросить UI-контекст</button>
          
          <button className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
            onClick={backupDb} disabled={busy === 'backup'}>Сделать бэкап</button>
        </div>
      </section>
    </div>
  );
};

export default Diagnostics;
