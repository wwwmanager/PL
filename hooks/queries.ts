
import { useQuery, useMutation, useQueryClient, useInfiniteQuery, InfiniteData, QueryKey, keepPreviousData } from '@tanstack/react-query';
import {
  getWaybills,
  getVehicles,
  getEmployees,
  getOrganizations,
  getAppSettings,
  deleteWaybill,
  changeWaybillStatus,
  changeWaybillStatusBulk, 
  getFuelTypes,
  getSavedRoutes,
  getSeasonSettings,
  getGarageStockItems,
  getStockTransactions,
  fetchWaybillsInfinite,
  fetchWaybillsPaged,
  invalidateRepoCache,
  WaybillFilters
} from '../services/mockApi';
import { WaybillStatus, Waybill } from '../types';

// Query Keys
export const QUERY_KEYS = {
  waybills: ['waybills'],
  waybillsInfinite: ['waybills', 'infinite'],
  waybillsPaged: ['waybills', 'paged'], // New key for paged list
  vehicles: ['vehicles'],
  employees: ['employees'],
  organizations: ['organizations'],
  settings: ['settings'],
  fuelTypes: ['fuelTypes'],
  savedRoutes: ['savedRoutes'],
  seasonSettings: ['seasonSettings'],
  stockItems: ['stockItems'],
  stockTransactions: ['stockTransactions'],
};

// --- Queries ---

export const useWaybills = () => {
  return useQuery({
    queryKey: QUERY_KEYS.waybills,
    queryFn: getWaybills,
    staleTime: 1000 * 60 * 5,
  });
};

type WaybillsResponse = Awaited<ReturnType<typeof fetchWaybillsInfinite>>;

export const useInfiniteWaybills = (
    filters: WaybillFilters,
    sort: { key: string; direction: 'asc' | 'desc' }
) => {
    return useInfiniteQuery<WaybillsResponse, Error, InfiniteData<WaybillsResponse>, QueryKey, number>({
        queryKey: [...QUERY_KEYS.waybillsInfinite, { filters, sort }],
        queryFn: async ({ pageParam }) => {
            return fetchWaybillsInfinite({
                page: (pageParam as number),
                pageSize: 20, // Load 20 items per chunk
                filters,
                sort
            });
        },
        initialPageParam: 1,
        getNextPageParam: (lastPage) => {
            return lastPage.hasMore ? lastPage.page + 1 : undefined;
        },
    });
};

// NEW: Use Paged Hook
export const useWaybillsPaged = (params: {
    page: number;
    pageSize?: number;
    filters?: WaybillFilters;
    sort?: { key: string; direction: 'asc' | 'desc' };
}) => {
    return useQuery({
        // Include sort in queryKey to trigger refetch on change
        queryKey: [...QUERY_KEYS.waybillsPaged, params],
        queryFn: () => fetchWaybillsPaged({
            page: params.page,
            pageSize: params.pageSize || 20,
            filters: params.filters,
            sortBy: params.sort?.key,
            sortDir: params.sort?.direction
        }),
        placeholderData: keepPreviousData, // Smooth transitions
    });
};

export const useVehicles = () => {
  return useQuery({
    queryKey: QUERY_KEYS.vehicles,
    queryFn: getVehicles,
    staleTime: 1000 * 60 * 10,
  });
};

export const useEmployees = () => {
  return useQuery({
    queryKey: QUERY_KEYS.employees,
    queryFn: getEmployees,
    staleTime: 1000 * 60 * 10,
  });
};

export const useOrganizations = () => {
  return useQuery({
    queryKey: QUERY_KEYS.organizations,
    queryFn: getOrganizations,
    staleTime: 1000 * 60 * 10,
  });
};

export const useAppSettings = () => {
  return useQuery({
    queryKey: QUERY_KEYS.settings,
    queryFn: getAppSettings,
    staleTime: Infinity, 
  });
};

export const useFuelTypes = () => {
  return useQuery({
    queryKey: QUERY_KEYS.fuelTypes,
    queryFn: getFuelTypes,
    staleTime: 1000 * 60 * 30,
  });
};

export const useSavedRoutes = () => {
  return useQuery({
    queryKey: QUERY_KEYS.savedRoutes,
    queryFn: getSavedRoutes,
    staleTime: 1000 * 60 * 10,
  });
};

export const useSeasonSettings = () => {
  return useQuery({
    queryKey: QUERY_KEYS.seasonSettings,
    queryFn: getSeasonSettings,
    staleTime: 1000 * 60 * 60, // Rarely changes
  });
};

export const useGarageStockItems = () => {
  return useQuery({
    queryKey: QUERY_KEYS.stockItems,
    queryFn: getGarageStockItems,
    staleTime: 1000 * 60 * 5,
  });
};

export const useStockTransactions = () => {
  return useQuery({
    queryKey: QUERY_KEYS.stockTransactions,
    queryFn: getStockTransactions,
    staleTime: 1000 * 60 * 5,
  });
};

// --- Mutations ---

export const useDeleteWaybill = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, markAsSpoiled }: { id: string; markAsSpoiled: boolean }) => {
      await deleteWaybill(id, markAsSpoiled);
    },
    onSuccess: () => {
      invalidateRepoCache('waybills');
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.waybills });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.waybillsPaged }); // Invalidate paged query too
      queryClient.invalidateQueries({ queryKey: ['blanks'] });
    },
  });
};

export const useChangeWaybillStatus = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      context,
    }: {
      id: string;
      status: WaybillStatus;
      context?: any;
    }) => {
      return await changeWaybillStatus(id, status, context);
    },
    onSuccess: (result) => {
      // 1. СБРОС СЛОЯ ДАННЫХ (REPO):
      invalidateRepoCache('waybills');

      // 2. Optimistic Update (UI)
      // Note: Updating paged cache is trickier, simplified invalidation is safer
      
      // 3. СБРОС СЛОЯ UI
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.waybills, refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.waybillsPaged, refetchType: 'all' }); // Invalidate paged query
      
      queryClient.invalidateQueries({ queryKey: ['blanks'] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.employees });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.vehicles });
    },
  });
};

export const useChangeWaybillStatusBulk = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ids,
      status,
      context,
    }: {
      ids: string[];
      status: WaybillStatus;
      context?: any;
    }) => {
      return await changeWaybillStatusBulk(ids, status, context);
    },
    onSuccess: (result) => {
      invalidateRepoCache('waybills');
      // Invalidate relevant caches
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.waybills, refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.waybillsPaged, refetchType: 'all' }); // Invalidate paged query
      
      queryClient.invalidateQueries({ queryKey: ['blanks'] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.employees });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.vehicles });
    },
  });
};
