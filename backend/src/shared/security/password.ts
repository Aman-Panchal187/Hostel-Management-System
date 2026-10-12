import bcrypt from 'bcrypt';
import { config } from '../../config/env';

export const hashPassword = (plain: string): Promise<string> => bcrypt.hash(plain, config.bcryptRounds);

export const verifyPassword = (plain: string, hash: string): Promise<boolean> => bcrypt.compare(plain, hash);

// Used to keep login timing similar when the account does not exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 4);
export const verifyAgainstDummy = (plain: string): Promise<boolean> => bcrypt.compare(plain, DUMMY_HASH);
