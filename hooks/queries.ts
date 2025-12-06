
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import {
  getWaybills,
  getVehicles,
  getEmployees,
  getOrganizations,
  getAppSettings,
  deleteWaybill,
  changeWaybillStatus,
  getFuelTypes,
  getSavedRoutes,
  getSeasonSettings,
  getGarageStockItems,
  getStockTransactions,
  fetchWaybillsInfinite,
  WaybillFilters
} from '../services/mockApi';
import { WaybillStatus } from '../types';

// Query Keys
export const QUERY_KEYS = {
  waybills: ['waybills'],
  waybillsInfinite: ['waybills', 'infinite'],
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

export const useInfiniteWaybills = (
    filters: WaybillFilters,
    sort: { key: string; direction: 'asc' | 'desc' }
) => {
    return useInfiniteQuery({
        queryKey: [...QUERY_KEYS.waybillsInfinite, { filters, sort }],
        initialPageParam: 1,
        queryFn: async ({ pageParam = 1 }) => {
            return fetchWaybillsInfinite({
                page: pageParam as number,
                pageSize: 20, // Load 20 items per chunk
                filters,
                sort
            });
        },
        getNextPageParam: (lastPage) => {
            return lastPage.hasMore ? lastPage.page + 1 : undefined;
        },
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
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.waybills });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.waybills });
      queryClient.invalidateQueries({ queryKey: ['blanks'] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.employees });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.vehicles });
    },
  });
};
