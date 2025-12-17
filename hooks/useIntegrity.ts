
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  getPeriodLocks, 
  closePeriod, 
  verifyPeriod,
  deletePeriodLock
} from '../services/mockApi';

export const QUERY_KEYS = {
    periodLocks: ['periodLocks'],
};

export const usePeriodLocks = () => {
  return useQuery({
    queryKey: QUERY_KEYS.periodLocks,
    queryFn: getPeriodLocks,
    staleTime: 0, // Always fetch fresh to see new locks
  });
};

export const useClosePeriod = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ period, userId, notes }: { period: string; userId: string; notes?: string }) => 
      closePeriod(period, userId, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.periodLocks });
    }
  });
};

export const useVerifyPeriod = () => {
  return useMutation({
    mutationFn: (lockId: string) => verifyPeriod(lockId),
  });
};

export const useDeletePeriodLock = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (lockId: string) => deletePeriodLock(lockId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.periodLocks });
        }
    });
};
