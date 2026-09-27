// Synthetic contract fixture; not a runnable UI library.
export interface SearchProps {
  query: string;
  onSearch: (query: string) => void;
}
export const SEARCH_MIN_LENGTH = 2;
