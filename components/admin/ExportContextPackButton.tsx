import React, { useState } from 'react';
import { loadJSON } from '../../services/storage';
import { DownloadIcon } from '../Icons';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../services/auth';

interface ExportContextPackButtonProps {
  packSkeleton: any;
  mode: 'skeleton';
}

const ExportContextPackButton: React.FC<ExportContextPackButtonProps> = ({ packSkeleton, mode }) => {
  const [isExporting, setIsExporting] = useState(false);
  const { showToast } = useToast();
  const { currentUser } = useAuth();

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const output: any = {
        meta: {
          ...packSkeleton.meta,
          createdAt: new Date().toISOString(),
        },
        data: {},
      };

      if (mode === 'skeleton' && packSkeleton.data) {
        for (const [key, config] of Object.entries(packSkeleton.data as Record<string, any>)) {
          const sourceKey = config.source;
          if (!sourceKey) continue;
          
          let data = await loadJSON<any[] | null>(sourceKey, null);
          
          if (Array.isArray(data) && config.query === 'latest' && config.limit) {
            // Safe sort: check if date exists, fallback to 0 difference if not
            data.sort((a, b) => {
                const dateA = a.date || a.at || a.createdAt || '';
                const dateB = b.date || b.at || b.createdAt || '';
                if (!dateA || !dateB) return 0;
                return new Date(dateB).getTime() - new Date(dateA).getTime();
            });
            output.data[key] = data.slice(0, config.limit);
          } else {
            output.data[key] = data;
          }
        }
      }

      const jsonString = JSON.stringify(output, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `context-pack_${timestamp}.json`;

      // FIX: Property 'showSaveFilePicker' does not exist on type 'Window & typeof globalThis'. Cast to any to access this experimental API.
      if ((window as any).showSaveFilePicker && (currentUser?.role === 'user' || currentUser?.role === 'auditor')) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: fileName,
            types: [{
              description: 'JSON Files',
              accept: { 'application/json': ['.json'] },
            }],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          showToast('Пакет контекста экспортирован.', 'success');
        } catch (err: any) {
          if (err.name !== 'AbortError') {
            console.error(err.name, err.message);
            showToast(`Не удалось экспортировать пакет контекста: ${err.message}`, 'error');
          }
        }
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showToast('Пакет контекста экспортирован.', 'success');
      }
    } catch (error) {
      console.error('Failed to export context pack:', error);
      showToast('Не удалось экспортировать пакет контекста.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={isExporting}
      className="flex items-center gap-2 bg-teal-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-teal-700 transition-colors disabled:opacity-50"
    >
      <DownloadIcon className="h-5 w-5" />
      {isExporting ? 'Экспорт...' : 'Экспорт пакета контекста'}
    </button>
  );
};

export default ExportContextPackButton;