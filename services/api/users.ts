
import { User, Role, Capability } from '../../types';
import { createRepo } from '../repo';
import { loadJSON, saveJSON } from '../storage';
import { DB_KEYS } from '../dbKeys';
import { DEFAULT_ROLE_POLICIES } from '../../constants';

const userRepo = createRepo<User>(DB_KEYS.USERS);

export const getUsers = async () => (await userRepo.list()).data;
export const addUser = (item: Omit<User, 'id'>) => userRepo.create(item);
export const updateUser = (item: User) => userRepo.update(item.id, item);
export const deleteUser = (id: string) => userRepo.remove(id);

export const getRolePolicies = async (): Promise<Record<Role, Capability[]>> => {
    return await loadJSON(DB_KEYS.ROLE_POLICIES, DEFAULT_ROLE_POLICIES);
};
export const saveRolePolicies = async (policies: Record<Role, Capability[]>) => {
    await saveJSON(DB_KEYS.ROLE_POLICIES, policies);
};
