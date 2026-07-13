export interface PaginationInput<TSortBy extends string = string> {
  page: number;
  limit: number;
  sortBy?: TSortBy;
  sortOrder?: 'ASC' | 'DESC';
}

export interface PaginatedResult<TItem> {
  items: TItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  meta: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}
