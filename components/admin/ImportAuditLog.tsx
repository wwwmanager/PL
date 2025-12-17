
import React, { useEffect, useMemo, useState } from 'react';

import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../services/auth';
import {
  readAuditIndex,
  loadEventItems,
  saveEventItems,
  exportAuditEvent,
  deleteAuditEvent,
  AuditEventHeader,
  ImportAuditItem,
  UNKNOWN_STORAGE_PREFIX,
  purgeAuditItems,
  rollbackAuditItems,
  KeyCategory,
  ImportAuditAction,
} from '../../services/auditLog';
import ConfirmationModal from '../shared/ConfirmationModal';


function classNames(...x: (string | false | undefined)[]) {
  return x.filter(Boolean).join(' ');
}

// Diff helpers ----------------------------------------------------------------
type DiffEntry = {
  path: string;
  before: unknown;
  after: unknown;
  type: 'added' | 'removed' | 'changed';
};

function isObject(o: unknown) {
  return o && typeof o === 'object' && !Array.isArray(o);
}
function isEqual(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return a === b;
  }
}
function computeDiff(before: unknown, after: unknown, basePath = ''): DiffEntry[] {
  if (isEqual(before, after)) return [];
  const out: DiffEntry[] = [];
  const set = new Set<string>();
  if (isObject(before)) Object.keys(before as Record<string, unknown>).forEach((k) => set.add(k));
  if (isObject(after)) Object.keys(after as Record<string, unknown>).forEach((k) => set.add(k));

  if (Array.isArray(before) || Array.isArray(after)) {
    const max = Math.max((before as unknown[])?.length || 0, (after as unknown[])?.length || 0);
    for (let i = 0; i < max; i++) {
      const bp = (before as unknown[])?.[i];
      const ap = (after as unknown[])?.[i];
      const p = `${basePath}[${i}]`;
      if (typeof bp === 'undefined') out.push({ path: p, before: undefined, after: ap, type: 'added' });
      else if (typeof ap === 'undefined') out.push({ path: p, before: bp, after: undefined, type: 'removed' });
      else out.push(...computeDiff(bp, ap, p));
    }
    return out;
  }

  if (set.size) {
    for (const k of set) {
      const bp = (before as Record<string, unknown> | undefined)?.[k];
      const ap = (after as Record<string, unknown> | undefined)?.[k];
      const p = basePath ? `${basePath}.${k}` : k;
      if (typeof bp === 'undefined') out.push({ path: p, before: undefined, after: ap, type: 'added' });
      else if (typeof ap === 'undefined') out.push({ path: p, before: bp, after: undefined, type: 'removed' });
      else if (!isEqual(bp, ap)) {
        if ((isObject(bp) || Array.isArray(bp)) && (isObject(ap) || Array.isArray(ap))) {
          out.push(...computeDiff(bp, ap, p));
        } else {
          out.push({ path: p, before: bp, after: ap, type: 'changed' });
        }
      }
    }
    return out;
  }

  out.push({ path: basePath || '(value)', before, after, type: 'changed' });
  return out;
}

const DiffModal: React.FC<{ onClose: () => void; before: unknown; after: unknown; title?: string }> = ({
  onClose,
  before,
  after,
  title,
}) => {
  const diffs = useMemo(() => computeDiff(before, after), [before, after]);
  const pretty = (v: unknown) => {
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return String(v);
    }
  };
  const small = (v: unknown) => {
    if (v === null || v === undefined) return String(v);
    if (typeof v === 'object') {
      try {
        return JSON.stringify(v);
      } catch {
        return '[Object]';
      }
    }
    return String(v);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-6xl overflow-auto rounded-xl bg-white shadow-xl dark:bg-gray-800">
        <div className="flex items-center justify-between border-b p-3 dark:border-gray-700">
          <div className="text-lg font-semibold text-gray-900 dark:text-white">{title || 'Сравнение'}</div>
          <button onClick={onClose} className="rounded bg-gray-200 px-2 py-1 dark:bg-gray-700">
            Закрыть
          </button>
        </div>
        <div className="p-3">
          <div className="mb-3">
            <div className="text-sm text-gray-600 dark:text-gray-300">Изменений: {diffs.length}</div>
            <div className="mt-2 max-h-48 overflow-auto rounded border dark:border-gray-700">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 dark:bg-gray-700/40">
                  <tr className="text-left">
                    <th className="p-2">Путь</th>
                    <th className="p-2">Тип</th>
                    <th className="p-2">До</th>
                    <th className="p-2">После</th>
                  </tr>
                </thead>
                <tbody>
                  {diffs.slice(0, 300).map((d, i) => (
                    <tr key={i} className="border-t dark:border-gray-700">
                      <td className="p-2">{d.path}</td>
                      <td className="p-2">
                        <span
                          className={
                            d.type === 'added'
                              ? 'rounded bg-green-100 px-2 py-0.5 text-green-700'
                              : d.type === 'removed'
                              ? 'rounded bg-red-100 px-2 py-0.5 text-red-700'
                              : 'rounded bg-blue-100 px-2 py-0.5 text-blue-700'
                          }
                        >
                          {d.type}
                        </span>
                      </td>
                      <td className="whitespace-pre p-2 text-[11px]">{small(d.before)}</td>
                      <td className="whitespace-pre p-2 text-[11px]">{small(d.after)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="mb-1 text-sm font-semibold">До</div>
              <pre className="overflow-auto rounded bg-gray-50 p-2 text-[12px] dark:bg-gray-900">{pretty(before)}</pre>
            </div>
            <div>
              <div className="mb-1 text-sm font-semibold">После</div>
              <pre className="overflow-auto rounded bg-gray-50 p-2 text-[12px] dark:bg-gray-900">{pretty(after)}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// UI helpers ------------------------------------------------------------------
const categoryBadgeClass: Record<KeyCategory, string> = {
  dict: 'bg-emerald-100 text-emerald-700',
  docs: 'bg-blue-100 text-blue-700',
  other: 'bg-gray-100 text-gray-700',
  unknown: 'bg-amber-100 text-amber-700',
};
const rowTintClass: Record<KeyCategory, string> = {
  dict: 'bg-emerald-50/40',
  docs: 'bg-blue-50/40',
  other: 'bg-gray-50/40',
  unknown: 'bg-amber-50/40',
};

function columnsFromItems(items: ImportAuditItem[]) {
  const order = [
    'id',
    'code',
    'name',
    'title',
    'fullName',
    'number',
    'plateNumber',
    'brand',
    'from',
    'to',
    'date',
    'validFrom',
    'validTo',
    'organizationName',
    'routeCount',
    'vehiclePlate',
  ];
  const set = new Set<string>();
  for (const it of items) Object.keys(it.params || {}).forEach((k) => set.add(k));
  const cols = Array.from(set);
  cols.sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  return cols;
}

// Component -------------------------------------------------------------------
const ImportAuditLog: React.FC = () => {
  const { showToast } = useToast();
  const { can } = useAuth();

  const [index, setIndex] = useState<AuditEventHeader[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeItems, setActiveItems] = useState<ImportAuditItem[] | null>(null);
  const [loadingItems, setLoadingItems] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [eventsPage, setEventsPage] = useState(1);
  const [eventsPageSize, setEventsPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<KeyCategory | 'all'>('all');
  const [filterAction, setFilterAction] = useState<ImportAuditAction | 'all'>('all');
  const [itemPage, setItemPage] = useState(1);
  const [itemPageSize, setItemPageSize] = useState(25);
  const [diffItem, setDiffItem] = useState<{ before: unknown; after: unknown; title: string } | null>(null);
  const [rowBusy, setRowBusy] = useState<Record<string, 'export' | 'delete' | undefined>>({});
  const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void }>({
      isOpen: false, title: '', message: '', onConfirm: () => {}
  });

  const canRollback = can('audit.rollback');
  const canDelete = can('audit.delete');
  const canDiff = can('audit.diff');
  const canRead = can('audit.read');

  useEffect(() => {
    (async () => {
      const idx = await readAuditIndex();
      setIndex(idx);
      if (idx.length && !activeId) setActiveId(idx[0].id);
    })();
  }, [activeId]);

  const eventsTotal = index.length;
  const eventsPages = Math.max(1, Math.ceil(eventsTotal / eventsPageSize));
  const clampedEventsPage = Math.min(eventsPage, eventsPages);
  const eventsSlice = index.slice((clampedEventsPage - 1) * eventsPageSize, clampedEventsPage * eventsPageSize);

  useEffect(() => {
    if (activeId && !index.find((e) => e.id === activeId)) {
      setActiveId(eventsSlice[0]?.id ?? null);
    }
  }, [activeId, eventsSlice, index]);

  const activeHeader = useMemo(() => index.find((e) => e.id === activeId) || null, [index, activeId]);

  useEffect(() => {
    setSelected({});
    setItemPage(1);
    setActiveItems(null);
    if (!activeHeader) return;
    setLoadingItems(true);
    (async () => {
      try {
        const items = await loadEventItems(activeHeader);
        setActiveItems(items);
      } catch (e: unknown) {
        console.error(e);
        showToast((e as Error)?.message || 'Не удалось загрузить элементы события', 'error');
      } finally {
        setLoadingItems(false);
      }
    })();
  }, [activeHeader, showToast]);

  const filteredRows = useMemo(() => {
    const rows = activeItems || [];
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterCategory !== 'all' && (r.category || 'other') !== filterCategory) return false;
      if (filterAction !== 'all' && r.action !== filterAction) return false;
      if (!q) return true;
      const hay = [
        r.key,
        String(r.idValue ?? ''),
        r.label ?? '',
        ...Object.entries(r.params || {}).map(([k, v]) => `${k}:${v}`),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [activeItems, search, filterCategory, filterAction]);

  const itemsTotal = filteredRows.length;
  const itemsPages = Math.max(1, Math.ceil(itemsTotal / itemPageSize));
  const clampedItemPage = Math.min(itemPage, itemsPages);
  const pageRows = filteredRows.slice((clampedItemPage - 1) * itemPageSize, clampedItemPage * itemPageSize);
  const cols = useMemo(
    () => columnsFromItems(pageRows.length ? pageRows : filteredRows),
    [pageRows, filteredRows],
  );

  const selectedItems = useMemo(() => {
    if (!activeHeader) return [];
    const out: ImportAuditItem[] = [];
    filteredRows.forEach((it, i) => {
      if (selected[`${activeHeader.id}::${i}`]) out.push(it);
    });
    return out;
  }, [selected, activeHeader, filteredRows]);

  const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportEvent = async (header: AuditEventHeader) => {
    if (rowBusy[header.id]) return;
    setRowBusy((s) => ({ ...s, [header.id]: 'export' }));
    try {
      const { blob, fileName } = await exportAuditEvent(header);
      downloadBlob(blob, fileName);
      showToast('Событие экспортировано');
    } catch (e: unknown) {
      showToast((e as Error)?.message ?? 'Не удалось экспортировать событие', 'error');
    } finally {
      setRowBusy((s) => ({ ...s, [header.id]: undefined }));
    }
  };

  const handleDeleteEvent = (header: AuditEventHeader) => {
    if (rowBusy[header.id]) return;
    setModalConfig({
        isOpen: true,
        title: 'Удалить событие?',
        message: `Удалить событие журнала от ${new Date(header.at).toLocaleString()}? Действие необратимо.`,
        onConfirm: async () => {
            setModalConfig(prev => ({ ...prev, isOpen: false }));
            setRowBusy((s) => ({ ...s, [header.id]: 'delete' }));
            try {
              await deleteAuditEvent(header);
              setIndex((prev) => prev.filter((e) => e.id !== header.id));
              if (activeId === header.id) {
                setActiveId(null);
              }
              showToast('Событие удалено');
            } catch (e: unknown) {
              showToast((e as Error)?.message ?? 'Не удалось удалить событие', 'error');
            } finally {
              setRowBusy((s) => ({ ...s, [header.id]: undefined }));
            }
        }
    });
  };

  const removeSelected = () => {
    if (!activeHeader || !activeItems || selectedItems.length === 0) return;
    const arr = selectedItems.filter((x) => x.action !== 'delete');
    if (!arr.length) return showToast('Нет подходящих элементов для удаления (выбраны только delete).', 'info');
    
    setModalConfig({
        isOpen: true,
        title: 'Удалить элементы?',
        message: `Удалить ${arr.length} элемент(ов) из базы?`,
        onConfirm: async () => {
            setModalConfig(prev => ({ ...prev, isOpen: false }));
            const res = await purgeAuditItems(arr);
            const updated = activeItems.map((it) => {
              const idx = filteredRows.indexOf(it);
              return selected[`${activeHeader.id}::${idx}`] ? { ...it, purged: true, afterExists: false } : it;
            });
            await saveEventItems(activeHeader, updated);
            setActiveItems(updated);
            setSelected({});
            showToast(`Удалено: ${res.success}. Ошибок: ${res.failed}.`, res.failed ? 'error' : 'success');
        }
    });
  };

  const doRollbackSelected = () => {
    if (!activeHeader || !activeItems || selectedItems.length === 0) return;
    setModalConfig({
        isOpen: true,
        title: 'Откатить элементы?',
        message: `Откатить ${selectedItems.length} элемент(ов) к состоянию до импорта?`,
        onConfirm: async () => {
            setModalConfig(prev => ({ ...prev, isOpen: false }));
            const res = await rollbackAuditItems(selectedItems);
            const updated = activeItems.map((it) => {
              const idx = filteredRows.indexOf(it);
              return selected[`${activeHeader.id}::${idx}`]
                ? { ...it, rolledBack: true, afterExists: it.beforeExists }
                : it;
            });
            await saveEventItems(activeHeader, updated);
            setActiveItems(updated);
            setSelected({});
            showToast(`Откат выполнен. Успешно: ${res.success}. Ошибок: ${res.failed}.`, res.failed ? 'error' : 'success');
        }
    });
  };

  const rollbackEventAll = () => {
    if (!activeHeader || !activeItems) return;
    setModalConfig({
        isOpen: true,
        title: 'Откатить событие?',
        message: `Откатить всё событие (${activeHeader.itemCount} элементов) к состоянию до импорта?`,
        onConfirm: async () => {
            setModalConfig(prev => ({ ...prev, isOpen: false }));
            const res = await rollbackAuditItems(activeItems);
            const updated = activeItems.map((it) => ({ ...it, rolledBack: true, afterExists: it.beforeExists }));
            await saveEventItems(activeHeader, updated);
            setActiveItems(updated);
            setSelected({});
            showToast(`Откат события завершён. Успешно: ${res.success}. Ошибок: ${res.failed}.`, res.failed ? 'error' : 'success');
        }
    });
  };

  if (!canRead) return <div className="text-gray-500">Нет доступа к журналу.</div>;

  return (
    <div className="flex gap-4">
      <ConfirmationModal
        isOpen={modalConfig.isOpen}
        onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
        onConfirm={modalConfig.onConfirm}
        title={modalConfig.title}
        message={modalConfig.message}
        confirmText="Да"
        confirmButtonClass="bg-red-600 hover:bg-red-700"
      />
      <aside className="w-80 flex-shrink-0">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-lg font-semibold text-gray-800 dark:text-white">Журнал импорта</div>
        </div>
        <div className="mb-2 flex items-center justify-between text-sm">
          <div className="text-gray-600 dark:text-gray-300">
            События: {eventsTotal} • Стр. {clampedEventsPage}/{eventsPages}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setEventsPage((p) => Math.max(1, p - 1))}
              className="rounded bg-gray-200 px-2 py-1 disabled:opacity-50 dark:bg-gray-700"
              disabled={clampedEventsPage <= 1}
            >
              ‹
            </button>
            <button
              onClick={() => setEventsPage((p) => Math.min(eventsPages, p + 1))}
              className="rounded bg-gray-200 px-2 py-1 disabled:opacity-50 dark:bg-gray-700"
              disabled={clampedEventsPage >= eventsPages}
            >
              ›
            </button>
            <select
              className="ml-2 rounded bg-gray-100 px-2 py-1 dark:bg-gray-800"
              value={eventsPageSize}
              onChange={(e) => {
                setEventsPageSize(Number(e.target.value));
                setEventsPage(1);
              }}
            >
              {[5, 10, 20].map((s) => (
                <option key={s} value={s}>
                  {s}/стр
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="max-h-[60vh] space-y-2 overflow-auto">
          {eventsSlice.map((ev) => {
            const busy = rowBusy[ev.id];
            return (
              <div
                key={ev.id}
                className={classNames(
                  'w-full rounded border p-2 text-left dark:border-gray-700',
                  activeId === ev.id
                    ? 'border-blue-300 bg-blue-50 dark:bg-blue-900/30'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/40',
                )}
              >
                <button onClick={() => setActiveId(ev.id)} className="mb-2 block w-full text-left">
                  <div className="text-sm text-gray-900 dark:text-gray-100">{new Date(ev.at).toLocaleString()}</div>
                  <div className="text-xs text-gray-500">элементов: {ev.itemCount}</div>
                </button>
                <div className="mt-2 flex items-center gap-2 border-t pt-2 dark:border-gray-700/50">
                  {canRead && (
                    <button
                      onClick={() => handleExportEvent(ev)}
                      disabled={!!busy}
                      title="Экспортировать событие в JSON"
                      className="flex items-center gap-1.5 rounded bg-gray-200 px-2 py-1 text-sm hover:bg-gray-300 disabled:opacity-50 dark:bg-gray-700 dark:hover:bg-gray-600"
                    >
                      {busy === 'export' ? '⏳' : '📤'} Экспорт
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => handleDeleteEvent(ev)}
                      disabled={!!busy}
                      title="Удалить событие (индекс + чанки)"
                      className="flex items-center gap-1.5 rounded bg-red-100 px-2 py-1 text-sm text-red-700 hover:bg-red-200 disabled:opacity-50 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/60"
                    >
                      {busy === 'delete' ? '⏳' : '🗑️'} Удалить
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {!index.length && <div className="text-sm text-gray-500">Журнал пуст.</div>}
        </div>
      </aside>
      <section className="flex-1">
        {!activeHeader ? (
          <div className="text-gray-500">Выберите событие слева.</div>
        ) : loadingItems ? (
          <div className="text-gray-500">Загрузка элементов…</div>
        ) : !activeItems ? (
          <div className="text-gray-500">Нет данных по событию.</div>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <input
                  className="rounded border px-2 py-1 dark:border-gray-700 dark:bg-gray-800"
                  placeholder="Поиск: ключ, метка, ID…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setItemPage(1);
                  }}
                />
                <select
                  className="rounded border px-2 py-1 dark:border-gray-700 dark:bg-gray-800"
                  value={filterCategory}
                  onChange={(e) => {
                    setFilterCategory(e.target.value as KeyCategory | 'all');
                    setItemPage(1);
                  }}
                >
                  <option value="all">Все категории</option>
                  <option value="dict">Справочники</option>
                  <option value="docs">Документы</option>
                  <option value="other">Прочее</option>
                  <option value="unknown">Compat/Неизв.</option>
                </select>
                <select
                  className="rounded border px-2 py-1 dark:border-gray-700 dark:bg-gray-800"
                  value={filterAction}
                  onChange={(e) => {
                    setFilterAction(e.target.value as ImportAuditAction | 'all');
                    setItemPage(1);
                  }}
                >
                  <option value="all">Все действия</option>
                  {['insert', 'merge', 'overwrite', 'delete', 'skip'].map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={rollbackEventAll}
                  disabled={!canRollback}
                  className="rounded bg-indigo-600 px-3 py-1 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Откатить событие целиком
                </button>
                <button
                  onClick={() => {
                    const next = { ...selected };
                    pageRows.forEach((it) => {
                      const gi = filteredRows.indexOf(it);
                      next[`${activeHeader.id}::${gi}`] = true;
                    });
                    setSelected(next);
                  }}
                  className="rounded bg-gray-200 px-3 py-1 text-sm dark:bg-gray-700"
                >
                  Выбрать страницу
                </button>
                <button
                  onClick={() => setSelected({})}
                  className="rounded bg-gray-200 px-3 py-1 text-sm dark:bg-gray-700"
                >
                  Снять выбор
                </button>
                <button
                  onClick={doRollbackSelected}
                  className="rounded bg-indigo-600 px-3 py-1 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
                  disabled={!canRollback || !selectedItems.length}
                >
                  Откатить выбранные
                </button>
                <button
                  onClick={removeSelected}
                  className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                  disabled={!canDelete || !selectedItems.length}
                >
                  Удалить выбранные
                </button>
              </div>
            </div>
            <div className="mb-2 text-xs text-gray-600 dark:text-gray-300">
              Файл: формат v{activeHeader.sourceMeta?.formatVersion ?? '?'} •{' '}
              {activeHeader.sourceMeta?.appVersion ? `Приложение ${activeHeader.sourceMeta.appVersion} • ` : ''}
              Создан: {activeHeader.sourceMeta?.createdAt ? new Date(activeHeader.sourceMeta.createdAt).toLocaleString() : '—'} • найдено: {itemsTotal}
            </div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <div className="text-gray-600 dark:text-gray-300">
                Стр. {clampedItemPage}/{itemsPages}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setItemPage((p) => Math.max(1, p - 1))}
                  className="rounded bg-gray-200 px-2 py-1 disabled:opacity-50 dark:bg-gray-700"
                  disabled={clampedItemPage <= 1}
                >
                  ‹
                </button>
                <button
                  onClick={() => setItemPage((p) => Math.min(itemsPages, p + 1))}
                  className="rounded bg-gray-200 px-2 py-1 disabled:opacity-50 dark:bg-gray-700"
                  disabled={clampedItemPage >= itemsPages}
                >
                  ›
                </button>
                <select
                  className="ml-2 rounded bg-gray-100 px-2 py-1 dark:bg-gray-800"
                  value={itemPageSize}
                  onChange={(e) => {
                    setItemPageSize(Number(e.target.value));
                    setItemPage(1);
                  }}
                >
                  {[10, 25, 50, 100].map((s) => (
                    <option key={s} value={s}>
                      {s}/стр
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="overflow-auto rounded border dark:border-gray-700">
              <table className="min-w-[1000px] w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/40">
                  <tr className="text-left">
                    <th className="w-8 p-2" />
                    <th className="p-2">Категория</th>
                    <th className="p-2">Ключ</th>
                    <th className="p-2">ID</th>
                    <th className="p-2">Метка</th>
                    <th className="p-2">Действие</th>
                    <th className="p-2">Состояние</th>
                    {cols.map((c) => (
                      <th key={c} className="p-2">
                        {c}
                      </th>
                    ))}
                    <th className="p-2">Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((it) => {
                    const gi = filteredRows.indexOf(it);
                    const selKey = `${activeHeader.id}::${gi}`;
                    const cat = it.category || 'other';
                    return (
                      <tr key={selKey} className={classNames('border-t dark:border-gray-700', rowTintClass[cat])}>
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={!!selected[selKey]}
                            disabled={!canRollback && !canDelete}
                            onChange={(e) =>
                              setSelected((s) => ({
                                ...s,
                                [selKey]: e.target.checked,
                              }))
                            }
                          />
                        </td>
                        <td className="p-2">
                          <span className={classNames('rounded px-2 py-0.5 text-xs', categoryBadgeClass[cat])}>{cat}</span>
                          {it.rolledBack && <div className="text-[10px] text-indigo-600">rolled-back</div>}
                          {it.purged && <div className="text-[10px] text-rose-600">purged</div>}
                        </td>
                        <td className="p-2">
                          <div className="text-gray-900 dark:text-gray-100">{it.key}</div>
                          {it.storageKey.startsWith(UNKNOWN_STORAGE_PREFIX) && (
                            <div className="text-xs text-amber-600">compat</div>
                          )}
                        </td>
                        <td className="p-2">{it.idValue ?? '—'}</td>
                        <td className="p-2">{it.label ?? '—'}</td>
                        <td className="p-2">
                          <span
                            className={
                              it.action === 'insert'
                                ? 'rounded bg-green-100 px-2 py-0.5 text-xs text-green-700'
                                : it.action === 'merge' || it.action === 'update'
                                ? 'rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700'
                                : it.action === 'overwrite'
                                ? 'rounded bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700'
                                : it.action === 'delete'
                                ? 'rounded bg-red-100 px-2 py-0.5 text-xs text-red-700'
                                : 'rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700'
                            }
                          >
                            {it.action}
                          </span>
                        </td>
                        <td className="p-2 text-xs text-gray-700 dark:text-gray-300">
                          до: {it.beforeExists ? 'да' : 'нет'} • после: {it.afterExists ? 'да' : 'нет'}
                        </td>
                        {cols.map((c) => (
                          <td key={c} className="p-2">
                            {String(it.params?.[c] ?? '—')}
                          </td>
                        ))}
                        <td className="p-2">
                          {canDiff && (it.beforeSnapshot !== undefined || it.afterSnapshot !== undefined) ? (
                            <button
                              onClick={() =>
                                setDiffItem({
                                  before: it.beforeSnapshot,
                                  after: it.afterSnapshot,
                                  title: `${it.key} ${it.idValue ?? ''}`,
                                })
                              }
                              className="rounded bg-gray-200 px-2 py-1 text-xs dark:bg-gray-700"
                            >
                              Сравнить
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {diffItem && (
              <DiffModal
                before={diffItem.before}
                after={diffItem.after}
                title={diffItem.title}
                onClose={() => setDiffItem(null)}
              />
            )}
          </>
        )}
      </section>
    </div>
  );
};

export default ImportAuditLog;
