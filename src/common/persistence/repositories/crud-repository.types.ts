import type {
  Attributes,
  CreationAttributes,
  FindOptions,
  Model,
  Transaction,
  WhereOptions,
} from 'sequelize';
import type { PaginatedResult } from './pagination.types';

export interface CrudRepositoryOptions<M extends Model> extends Omit<
  FindOptions<Attributes<M>>,
  'where'
> {
  transaction?: Transaction;
  findOptions?: Omit<FindOptions<Attributes<M>>, 'where' | 'transaction'>;
}

export interface CrudRepository<M extends Model> {
  findById(id: string, options?: CrudRepositoryOptions<M>): Promise<M | null>;
  findOne(
    where: WhereOptions<Attributes<M>>,
    options?: CrudRepositoryOptions<M>,
  ): Promise<M | null>;
  create(input: CreationAttributes<M>, options?: CrudRepositoryOptions<M>): Promise<M>;
  updateById(
    id: string,
    input: Partial<Attributes<M>>,
    options?: CrudRepositoryOptions<M>,
  ): Promise<M | null>;
  count(where?: WhereOptions<Attributes<M>>, options?: CrudRepositoryOptions<M>): Promise<number>;
  exists(where: WhereOptions<Attributes<M>>, options?: CrudRepositoryOptions<M>): Promise<boolean>;
  paginate(
    where: WhereOptions<Attributes<M>>,
    page: number,
    limit: number,
    findOptions?: Omit<FindOptions<Attributes<M>>, 'where' | 'limit' | 'offset'>,
  ): Promise<PaginatedResult<M>>;
}
