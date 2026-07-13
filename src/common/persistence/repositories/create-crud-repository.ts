import type {
  Attributes,
  CountOptions,
  CreateOptions,
  CreationAttributes,
  FindOptions,
  InstanceUpdateOptions,
  Model,
  ModelStatic,
  Transaction,
  WhereOptions,
} from 'sequelize';
import type { CrudRepository, CrudRepositoryOptions } from './crud-repository.types';
import type { PaginatedResult } from './pagination.types';

interface CrudRepositoryFactoryOptions<M extends Model> {
  model: ModelStatic<M>;
  primaryKey?: keyof Attributes<M> & string;
}

function resolveRepositoryOptions<M extends Model>(
  input: ModelStatic<M> | CrudRepositoryFactoryOptions<M>,
): Required<CrudRepositoryFactoryOptions<M>> {
  if (typeof input === 'function') {
    return { model: input, primaryKey: 'id' as keyof Attributes<M> & string };
  }

  return {
    model: input.model,
    primaryKey: input.primaryKey ?? ('id' as keyof Attributes<M> & string),
  };
}

function withTransaction<TOptions extends object>(
  options: TOptions,
  transaction?: Transaction,
): TOptions & { transaction?: Transaction } {
  return transaction ? { ...options, transaction } : options;
}

export function createCrudRepository<M extends Model>(
  input: ModelStatic<M> | CrudRepositoryFactoryOptions<M>,
): CrudRepository<M> {
  const options = resolveRepositoryOptions(input);

  return {
    findById(id: string, repositoryOptions?: CrudRepositoryOptions<M>): Promise<M | null> {
      const queryOptions = withTransaction(
        { ...(repositoryOptions ?? {}), ...(repositoryOptions?.findOptions ?? {}) } as Omit<
          FindOptions<Attributes<M>>,
          'where'
        >,
        repositoryOptions?.transaction,
      );

      delete (queryOptions as Record<string, unknown>).findOptions;
      return options.model.findOne({
        ...queryOptions,
        where: { [options.primaryKey]: id } as WhereOptions<Attributes<M>>,
      });
    },

    findOne(
      where: WhereOptions<Attributes<M>>,
      repositoryOptions?: CrudRepositoryOptions<M>,
    ): Promise<M | null> {
      const queryOptions = withTransaction(
        {
          ...(repositoryOptions ?? {}),
          ...(repositoryOptions?.findOptions ?? {}),
          where,
        } as FindOptions<Attributes<M>>,
        repositoryOptions?.transaction,
      );

      delete (queryOptions as Record<string, unknown>).findOptions;
      return options.model.findOne(queryOptions);
    },

    create(
      inputValues: CreationAttributes<M>,
      repositoryOptions?: CrudRepositoryOptions<M>,
    ): Promise<M> {
      const createOptions = withTransaction(
        {} as CreateOptions<Attributes<M>>,
        repositoryOptions?.transaction,
      );
      return options.model.create(inputValues, createOptions);
    },

    async updateById(
      id: string,
      inputValues: Partial<Attributes<M>>,
      repositoryOptions?: CrudRepositoryOptions<M>,
    ): Promise<M | null> {
      const entity = await this.findById(id, repositoryOptions);

      if (!entity) {
        return null;
      }

      const updateOptions = withTransaction(
        {} as InstanceUpdateOptions<Attributes<M>>,
        repositoryOptions?.transaction,
      );
      await entity.update(inputValues, updateOptions);
      return entity;
    },

    count(
      where?: WhereOptions<Attributes<M>>,
      repositoryOptions?: CrudRepositoryOptions<M>,
    ): Promise<number> {
      const countOptions = withTransaction(
        { ...(where ? { where } : {}) } as Omit<CountOptions<Attributes<M>>, 'group'>,
        repositoryOptions?.transaction,
      );

      return options.model.count(countOptions);
    },

    async exists(
      where: WhereOptions<Attributes<M>>,
      repositoryOptions?: CrudRepositoryOptions<M>,
    ): Promise<boolean> {
      const total = await this.count(where, repositoryOptions);
      return total > 0;
    },

    async paginate(
      where: WhereOptions<Attributes<M>>,
      page: number,
      limit: number,
      findOptions: Omit<FindOptions<Attributes<M>>, 'where' | 'limit' | 'offset'> = {},
    ): Promise<PaginatedResult<M>> {
      const offset = (page - 1) * limit;
      const result = await options.model.findAndCountAll({
        ...findOptions,
        where,
        limit,
        offset,
        distinct: true,
      });
      const totalPages = Math.ceil(result.count / limit);

      return {
        items: result.rows,
        page,
        limit,
        total: result.count,
        totalPages,
        meta: {
          page,
          limit,
          totalItems: result.count,
          totalPages,
        },
      };
    },
  };
}
