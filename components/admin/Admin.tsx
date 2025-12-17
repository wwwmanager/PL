
import React, { useState, useEffect, lazy, Suspense, useRef } from 'react';
import { dumpAllDataForExport } from '../../services/mockApi';
import { broadcast } from '../../services/bus';
import { DownloadIcon, UploadIcon, ExclamationCircleIcon, TrashIcon } from '../Icons'; 
import { useToast } from '../../hooks/useToast';
import ImportAuditLog from './ImportAuditLog';
import Diagnostics from './Diagnostics';
import { appendAuditEventChunked, uid, isEntityArray, ImportAuditItem } from '../../services/auditLog';
import { useAuth } from '../../services/auth';
import { AppSettingsComponent } from './AppSettingsComponent';
import Archiving from './Archiving';

import {
  AdminTab,
  ExportBundle,
  KeyCategory,
  UpdateMode,
  ImportRow,
  ImportPolicy,
} from '../../src/features/admin/types';

import {
    LAST_EXPORT_META_KEY,
    KEY_BLOCKLIST,
    deepMerge,
    mergeEntitiesArray,
} from '../../src/features/admin/utils/importLogic';

import {
    getDataForKey,
    setDataForKey,
    deleteDataForKey,
} from '../../src/features/admin/utils/storageHelpers';

import {
    toBundle,
    applyMigrations,
    getKeysToExport,
    backupCurrent,
    APP_VERSION
} from '../../src/features/admin/utils/migrationLogic';

import { SelectiveClearModal } from '../../src/features/admin/components/SelectiveClearModal';
import { ExportModal } from '../../src/features/admin/components/ExportModal';
import { ImportPreviewModal } from '../../src/features/admin/components/ImportPreviewModal';

import { saveJSON } from '../../services/storage';

const UserManagement = lazy(() => import('./UserManagement'));
const RoleManagement = lazy(() => import('./RoleManagement'));
const BusinessAuditLog = lazy(() => import('./BusinessAuditLog'));
const BlankManagement = lazy(() => import('./BlankManagement'));
const ProductionCalendarSettings = lazy(() => import('./ProductionCalendarSettings'));
const IntegrityManagement = lazy(() => import('./IntegrityManagement'));

const ADMIN_IMPORT_POLICY: ImportPolicy = {
  allowCategories: null,
  denyKeys: KEY_BLOCKLIST,
  allowUnknownKeys: true,
  allowedModes: new Set<UpdateMode>(['merge', 'overwrite', 'skip']),
  allowDeleteMissing: true,
};

const USER_IMPORT_POLICY: ImportPolicy = {
  allowCategories: new Set<KeyCategory>(['docs']),
  denyKeys: KEY_BLOCKLIST,
  allowUnknownKeys: false,
  allowedModes: new Set<UpdateMode>(['merge', 'skip']),
  allowDeleteMissing: false,
};

const Admin: React.FC = () => {
  const { can } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<AdminTab>('settings');
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isSelectiveClearOpen, setIsSelectiveClearOpen] = useState(false);
  const [importBundle, setImportBundle] = useState<ExportBundle | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if ((activeTab === 'diag' || activeTab === 'users' || activeTab === 'blanks') && !can('admin.panel')) {
      setActiveTab('settings');
    }
  }, [activeTab, can]);
  
  // Handlers for Export
  const handleExportConfirm = async (keys: string[], data?: Record<string, unknown>) => {
      setIsExportOpen(false);
      try {
          const exportData = data || {};
          if (!data) {
              const keysToExport = await getKeysToExport(keys);
              const snapshot = await dumpAllDataForExport(); 
              for (const k of keysToExport) {
                  if (snapshot[k]) exportData[k] = snapshot[k];
              }
          }
          
          const bundle = toBundle(exportData);
          bundle.meta.keys = Object.keys(exportData);
          bundle.meta.appVersion = APP_VERSION;
          
          const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `waybill_backup_${new Date().toISOString().split('T')[0]}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          showToast('Экспорт выполнен успешно', 'success');
          
          await saveJSON(LAST_EXPORT_META_KEY, bundle.meta);
      } catch (e: any) {
          console.error(e);
          showToast('Ошибка экспорта: ' + e.message, 'error');
      }
  };

  // Handlers for Import
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      try {
          const text = await file.text();
          const json = JSON.parse(text);
          const bundle = applyMigrations(toBundle(json));
          setImportBundle(bundle);
          if (fileInputRef.current) fileInputRef.current.value = '';
      } catch (err) {
          showToast('Ошибка чтения файла импорта', 'error');
      }
  };

  const handleImportApply = async (rows: ImportRow[]) => {
      if (!importBundle) return;
      setImportBundle(null);
      
      try {
          const keysToBackup = rows.filter(r => r.action.enabled).map(r => r.key);
          await backupCurrent(keysToBackup);

          const auditItems: ImportAuditItem[] = [];
          
          for (const row of rows) {
              if (!row.action.enabled) continue;
              
              const key = row.key;
              const mode = row.action.updateMode;
              const incoming = row.incoming;
              const current = await getDataForKey(key);
              
              let finalData;
              if (isEntityArray(incoming) || isEntityArray(current)) {
                  finalData = mergeEntitiesArray(current as any[], incoming as any[], mode, row.action.insertNew, row.action.deleteMissing);
              } else {
                  if (mode === 'overwrite') finalData = incoming;
                  else if (mode === 'merge' && typeof current === 'object' && typeof incoming === 'object') {
                      finalData = deepMerge(current, incoming);
                  } else {
                      finalData = incoming;
                  }
              }
              
              await setDataForKey(key, finalData);
              
              auditItems.push({
                  storageKey: key,
                  key: key,
                  category: row.category as any, // Cast to any to align types if they differ slightly
                  action: mode === 'overwrite' ? 'overwrite' : mode === 'merge' ? 'merge' : 'insert',
                  label: `Imported ${key}`
              });
          }
          
          await appendAuditEventChunked({
              id: uid(),
              at: new Date().toISOString(),
              sourceMeta: importBundle.meta,
              items: auditItems
          });

          broadcast('settings');
          showToast('Импорт завершен успешно', 'success');
          setTimeout(() => window.location.reload(), 1000);

      } catch (e: any) {
          console.error(e);
          showToast('Ошибка при импорте: ' + e.message, 'error');
      }
  };

  const handleClearConfirm = async (selections: Record<string, Set<string>>) => {
      setIsSelectiveClearOpen(false);
      try {
          for (const key of Object.keys(selections)) {
              const ids = selections[key];
              if (ids.has('single')) {
                  await deleteDataForKey(key);
              } else {
                  await deleteDataForKey(key, Array.from(ids));
              }
          }
          showToast('Данные очищены', 'success');
          setTimeout(() => window.location.reload(), 1000);
      } catch (e: any) {
          showToast('Ошибка очистки: ' + e.message, 'error');
      }
  };
  
  const tabs = [
    { id: 'settings', label: 'Общие', show: true },
    { id: 'users', label: 'Пользователи', show: can('admin.panel') },
    { id: 'roles', label: 'Роли', show: can('admin.panel') },
    { id: 'blanks', label: 'Бланки ПЛ', show: can('admin.panel') },
    { id: 'calendar', label: 'Календарь', show: true },
    { id: 'integrity', label: 'Целостность', show: can('admin.panel') },
    { id: 'archiving', label: 'Архивация', show: true },
    { id: 'business_audit', label: 'Бизнес-аудит', show: can('audit.business.read') },
    { id: 'import_audit', label: 'Журнал импорта', show: true },
    { id: 'diag', label: 'Диагностика', show: can('admin.panel') },
  ];

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'settings': return <AppSettingsComponent />;
      case 'users': return <Suspense fallback={<div>...</div>}><UserManagement /></Suspense>;
      case 'roles': return <Suspense fallback={<div>...</div>}><RoleManagement /></Suspense>;
      case 'blanks': return <Suspense fallback={<div>...</div>}><BlankManagement /></Suspense>;
      case 'calendar': return <Suspense fallback={<div>...</div>}><ProductionCalendarSettings /></Suspense>;
      case 'archiving': return <Archiving />;
      case 'integrity': return <Suspense fallback={<div>...</div>}><IntegrityManagement /></Suspense>;
      case 'import_audit': return <ImportAuditLog />;
      case 'business_audit': return <Suspense fallback={<div>...</div>}><BusinessAuditLog /></Suspense>;
      case 'diag': return <Diagnostics />;
      default: return null;
    }
  };

  return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col min-h-[600px]">
          <input type="file" ref={fileInputRef} onChange={handleImportFile} accept=".json" className="hidden" />
          
          {/* Header & Tabs */}
          <div className="border-b border-gray-200 dark:border-gray-700">
             <div className="px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Настройки</h2>
                <div className="flex gap-3">
                     {can('import.limited') && (
                          <button 
                            onClick={() => fileInputRef.current?.click()} 
                            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-blue-600 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-sm font-medium shadow-sm"
                          >
                              <UploadIcon className="w-5 h-5" /> Импорт
                          </button>
                      )}
                      {can('export.run') && (
                          <button 
                            onClick={() => setIsExportOpen(true)} 
                            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-blue-600 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-sm font-medium shadow-sm"
                          >
                              <DownloadIcon className="w-5 h-5" /> Экспорт
                          </button>
                      )}
                </div>
             </div>
             
             {/* Navigation Tabs (Material Style) */}
             <div className="px-6 flex overflow-x-auto gap-6 hide-scrollbar">
                {tabs.filter(t => t.show).map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as AdminTab)}
                        className={`pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                            activeTab === tab.id
                            ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:border-gray-600'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
             </div>
          </div>

          <div className="p-6 overflow-x-auto flex-1">
            {renderActiveTab()}
          </div>

          {/* Danger Zone */}
          {can('admin.panel') && (
            <div className="px-6 py-8 mt-auto border-t border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-bold text-red-600 dark:text-red-500 mb-4 flex items-center gap-2">
                    <ExclamationCircleIcon className="h-5 w-5" />
                    Опасная зона
                </h3>
                <div className="p-6 border border-red-200 dark:border-red-900/50 rounded-xl bg-red-50/50 dark:bg-red-900/10 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">Безвозвратное удаление данных</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            Вы можете удалить отдельные категории данных (например, справочники или историю) или полностью очистить базу приложения.
                        </p>
                    </div>
                    <button
                        onClick={() => setIsSelectiveClearOpen(true)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-gray-800 border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 font-medium rounded-lg shadow-sm hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors whitespace-nowrap"
                    >
                        <TrashIcon className="h-5 w-5" />
                        Выборочная очистка
                    </button>
                </div>
            </div>
        )}

          {isExportOpen && (
              <ExportModal 
                  onClose={() => setIsExportOpen(false)} 
                  onConfirm={handleExportConfirm} 
              />
          )}
          
          {isSelectiveClearOpen && (
              <SelectiveClearModal 
                  onClose={() => setIsSelectiveClearOpen(false)}
                  onConfirm={handleClearConfirm}
              />
          )}

          {importBundle && (
              <ImportPreviewModal 
                  bundle={importBundle}
                  policy={can('admin.panel') ? ADMIN_IMPORT_POLICY : USER_IMPORT_POLICY}
                  onClose={() => { setImportBundle(null); if(fileInputRef.current) fileInputRef.current.value = ''; }}
                  onApply={handleImportApply}
              />
          )}
      </div>
  );
};

export default Admin;
