// Synthetic consumer contract.
import { SEARCH_MIN_LENGTH } from './search';
export const resultQueryIsValid = (query: string) => query.length >= SEARCH_MIN_LENGTH;
