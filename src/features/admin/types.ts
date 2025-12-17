
export type AdminTab = 'settings' | 'users' | 'roles' | 'blanks' | 'calendar' | 'archiving' | 'integrity' | 'import_audit' | 'business_audit' | 'diag';

export type ExportBundle = {
  meta: {
    app: 'waybill-app';
    formatVersion: number;
    createdAt: string;
    appVersion?: string;
    locale?: string;
    keys?: string[];
    summary?: Record<string, unknown>;
  };
  data: Record<string, unknown>;
};

export type KeyCategory = 'dict' | 'docs' | 'other' | 'unknown';
export type UpdateMode = 'skip' | 'overwrite' | 'merge';

export type ImportAction = { enabled: boolean; insertNew: boolean; updateMode: UpdateMode; deleteMissing: boolean; };

export type ImportSubItem = {
    id: string | number;
    label: string;
    status: 'new' | 'update' | 'same';
    selected: boolean;
    data: any; 
};

export type ImportRow = {
  key: string;
  category: KeyCategory;
  known: boolean;
  incoming: unknown;
  action: ImportAction;
  stats?: {
    existingCount: number;
    incomingCount: number;
    newCount: number;
    updateCount: number;
  };
  subItems?: ImportSubItem[];
  isExpanded?: boolean;
};

export type ImportPolicy = {
  allowCategories: Set<KeyCategory> | null; 
  denyKeys: Set<string>;
  allowUnknownKeys: boolean;
  allowedModes: Set<UpdateMode>;
  allowDeleteMissing: boolean;
};
