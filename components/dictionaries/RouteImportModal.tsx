import React, { useEffect, useRef, useState } from 'react';
import Modal from '../shared/Modal';
import { parseAndPreviewRouteFile, type RouteSegment } from '../../services/routeParserService';

type Props = {
  onClose: () => void;
  onConfirm: (segments: RouteSegment[]) => void;
};

export const RouteImportModal: React.FC<Props> = ({ onClose, onConfirm }) => {
  const [file, setFile] = useState<File | null>(null);
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string>('');

  // контейнер предпросмотра
  const previewRef = useRef<HTMLDivElement | null>(null);

  // тут копим индексы, удалённые пользователем (через кнопки)
  const excludedRef = useRef<Set<number>>(new Set());

  // слушаем кастомное событие на случай не-React окружения
  useEffect(() => {
    const root = previewRef.current;
    if (!root) return;

    const onDelete = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      const idxs: number[] = (detail?.indexes || []).filter((n: any) => Number.isFinite(n));
      idxs.forEach(i => excludedRef.current.add(i));
    };

    root.addEventListener('routePreviewDeleteSelected', onDelete as EventListener);
    return () => {
      root.removeEventListener('routePreviewDeleteSelected', onDelete as EventListener);
    };
  }, [previewHtml]);

  // Вешаем обработчики (в React) — скрипт из HTML не исполняется
  useEffect(() => {
    const rootNode = previewRef.current;
    if (!rootNode) return;

    const refreshSelectAllState = () => {
      const root = previewRef.current;
      if (!root) return;
      const chkAll = root.querySelector('.rp-chk-all') as HTMLInputElement | null;
      if (!chkAll) return;
      const items = (Array.from(root.querySelectorAll('input.route-row-select')) as HTMLInputElement[]).filter(cb => !cb.disabled);
      chkAll.checked = items.length > 0 && items.every(cb => cb.checked);
    };

    const onChkAllChange = (event: Event) => {
      const root = previewRef.current;
      if (!root) return;
      const checked = (event.target as HTMLInputElement).checked;
      (Array.from(root.querySelectorAll('input.route-row-select:not(:disabled)')) as HTMLInputElement[]).forEach(cb => { cb.checked = checked; });
    };

    const onBtnClear = () => {
      const root = previewRef.current;
      if (!root) return;
      (Array.from(root.querySelectorAll('input.route-row-select')) as HTMLInputElement[]).forEach(cb => { cb.checked = false; });
      const chkAll = root.querySelector('.rp-chk-all') as HTMLInputElement | null;
      if (chkAll) chkAll.checked = false;
    };

    const onBtnUncheckNZ = () => {
      const root = previewRef.current;
      if (!root) return;
      const rows = Array.from(root.querySelectorAll('tr.row-nz'));
      rows.forEach((tr: Element) => {
        const cb = tr.querySelector('input.route-row-select') as HTMLInputElement | null;
        if (cb && !cb.disabled) cb.checked = false;
      });
      refreshSelectAllState();
    };
    
    const onBtnKeepNZ = () => {
      const root = previewRef.current;
      if (!root) return;
      const empties = Array.from(root.querySelectorAll('tr:not(.row-nz) input.route-row-select:not(:disabled)')) as HTMLInputElement[];
      if (!empties.length) return;

      const idxs = empties.map(cb => parseInt(cb.dataset.index || '', 10)).filter(Number.isFinite);

      idxs.forEach(i => excludedRef.current.add(i));
      empties.forEach(cb => {
        const tr = cb.closest('tr');
        if (tr && tr.parentNode) tr.parentNode.removeChild(tr);
      });

      root.dispatchEvent(new CustomEvent('routePreviewDeleteSelected', { bubbles: true, detail: { indexes: Array.from(new Set(idxs)) } }));
      refreshSelectAllState();
    };
    
    const onBtnKeepEmpty = () => {
      const root = previewRef.current;
      if (!root) return;
      const nonEmpty = Array.from(root.querySelectorAll('tr.row-nz input.route-row-select:not(:disabled)')) as HTMLInputElement[];
      if (!nonEmpty.length) return;

      const idxs = nonEmpty.map(cb => parseInt(cb.dataset.index || '', 10)).filter(Number.isFinite);

      idxs.forEach(i => excludedRef.current.add(i));
      nonEmpty.forEach(cb => {
        const tr = cb.closest('tr');
        if (tr && tr.parentNode) tr.parentNode.removeChild(tr);
      });

      root.dispatchEvent(new CustomEvent('routePreviewDeleteSelected', { bubbles: true, detail: { indexes: Array.from(new Set(idxs)) } }));
      refreshSelectAllState();
    };

    const onBtnDelete = () => {
      const root = previewRef.current;
      if (!root) return;
      const checkedBoxes = Array.from(root.querySelectorAll('input.route-row-select:checked')) as HTMLInputElement[];
      const idxs = checkedBoxes.map(el => parseInt(el.dataset.index || '', 10)).filter(Number.isFinite);
      if (!idxs.length) return;

      idxs.forEach(i => excludedRef.current.add(i));

      checkedBoxes.forEach(cb => {
        const tr = cb.closest('tr');
        if (tr && tr.parentNode) tr.parentNode.removeChild(tr);
      });

      root.dispatchEvent(new CustomEvent('routePreviewDeleteSelected', { bubbles: true, detail: { indexes: idxs } }));
      refreshSelectAllState();
    };

    const chkAll        = rootNode.querySelector('.rp-chk-all') as HTMLInputElement | null;
    const btnDelete     = rootNode.querySelector('.rp-btn-delete') as HTMLButtonElement | null;
    const btnClear      = rootNode.querySelector('.rp-btn-clear') as HTMLButtonElement | null;
    const btnUncheckNZ  = rootNode.querySelector('.rp-btn-uncheck-nz') as HTMLButtonElement | null;
    const btnKeepNZ     = rootNode.querySelector('.rp-btn-keep-nz') as HTMLButtonElement | null;
    const btnKeepEmpty  = rootNode.querySelector('.rp-btn-keep-empty') as HTMLButtonElement | null;

    chkAll?.addEventListener('change', onChkAllChange);
    btnUncheckNZ?.addEventListener('click', onBtnUncheckNZ);
    btnKeepNZ?.addEventListener('click', onBtnKeepNZ);
    btnKeepEmpty?.addEventListener('click', onBtnKeepEmpty);
    btnDelete?.addEventListener('click', onBtnDelete);
    btnClear?.addEventListener('click', onBtnClear);

    const rowCheckboxes = Array.from(rootNode.querySelectorAll('input.route-row-select')) as HTMLInputElement[];
    rowCheckboxes.forEach(cb => cb.addEventListener('change', refreshSelectAllState));
    
    refreshSelectAllState();

    return () => {
      chkAll?.removeEventListener('change', onChkAllChange);
      btnUncheckNZ?.removeEventListener('click', onBtnUncheckNZ);
      btnKeepNZ?.removeEventListener('click', onBtnKeepNZ);
      btnKeepEmpty?.removeEventListener('click', onBtnKeepEmpty);
      btnDelete?.removeEventListener('click', onBtnDelete);
      btnClear?.removeEventListener('click', onBtnClear);
      rowCheckboxes.forEach(cb => cb.removeEventListener('change', refreshSelectAllState));
    };
  }, [previewHtml]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    const f = e.target.files?.[0] || null;
    setFile(f);
    setPreviewHtml('');
    excludedRef.current.clear();

    if (!f) {
      setBuffer(null);
      return;
    }

    try {
      const buf = await f.arrayBuffer();
      setBuffer(buf);
    } catch {
      setError('Не удалось прочитать файл');
      setBuffer(null);
    }
  };

  const buildPreview = async () => {
    if (!file || !buffer) {
      setError('Сначала выберите файл .html/.htm');
      return;
    }
    setError('');
    setIsBusy(true);
    try {
      const { previewHtml } = await parseAndPreviewRouteFile(buffer, file.name, file.type, {
        excludeRowIndexes: Array.from(excludedRef.current),
        autoSelectRules: {
          markZeroMovement: true,
          markTinyMovementBelowKm: 0.3
        }
      });
      setPreviewHtml(previewHtml);
    } catch (e: any) {
      setError(e?.message || 'Ошибка построения предпросмотра');
    } finally {
      setIsBusy(false);
    }
  };

  const collectCheckedIndexes = (): number[] => {
    const root = previewRef.current;
    if (!root) return [];
    return Array.from(root.querySelectorAll('input.route-row-select:checked'))
      .map(el => parseInt((el as HTMLInputElement).dataset.index || '', 10))
      .filter(Number.isFinite);
  };

  const handleImport = async () => {
    if (!file || !buffer) {
      setError('Сначала выберите файл .html/.htm и постройте предпросмотр');
      return;
    }
    setError('');
    setIsBusy(true);
    try {
      collectCheckedIndexes().forEach(i => excludedRef.current.add(i));

      const { routeSegments } = await parseAndPreviewRouteFile(buffer, file.name, file.type, {
        excludeRowIndexes: Array.from(excludedRef.current),
        autoSelectRules: {
          markZeroMovement: true,
          markTinyMovementBelowKm: 0.3
        }
      });

      if (!routeSegments || routeSegments.length === 0) {
        setError('После фильтрации не осталось данных для импорта');
        setIsBusy(false);
        return;
      }

      onConfirm(routeSegments);
    } catch (e: any) {
      setError(e?.message || 'Ошибка импорта');
    } finally {
      setIsBusy(false);
    }
  };

  const modalFooter = (
    <>
      <button
        onClick={onClose}
        className="px-4 py-2 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100"
      >
        Отмена
      </button>
      <button
        onClick={handleImport}
        disabled={!previewHtml || isBusy}
        className="px-4 py-2 rounded-md bg-green-600 text-white disabled:opacity-50"
      >
        Импортировать
      </button>
    </>
  );

  return (
    <Modal isOpen={true} onClose={onClose} title="Импорт маршрутов из файла" footer={modalFooter}>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <input
            type="file"
            accept=".html,.htm,text/html"
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-700 dark:text-gray-200
                       file:mr-4 file:py-2 file:px-4
                       file:rounded-md file:border-0
                       file:text-sm file:font-semibold
                       file:bg-blue-50 file:text-blue-700
                       hover:file:bg-blue-100"
          />
          <button
            onClick={buildPreview}
            disabled={!file || !buffer || isBusy}
            className="px-4 py-2 rounded-md bg-indigo-600 text-white disabled:opacity-50"
          >
            {isBusy ? 'Загрузка...' : 'Предпросмотр'}
          </button>
        </div>

        {error && <div className="text-sm text-red-600">{error}</div>}

        <div
          ref={previewRef}
          className="border border-gray-300 dark:border-gray-600 rounded-md max-h-[420px] overflow-auto bg-white dark:bg-gray-800 p-2"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      </div>
    </Modal>
  );
};
