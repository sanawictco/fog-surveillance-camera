import { Injectable } from '@nestjs/common';
import { Model as DbModel, QueryFilter } from 'mongoose';
import {
  OrderStates,
  PaginatedQueryBase,
  QueryBase,
} from 'src/dddLib/applicationService';
import { AggregateRoot } from 'src/dddLib/core';
import * as infra from 'src/dddLib/infra';
import { CacheService } from 'src/extensions/caching/cache.service';
import { ServiceProvider } from 'src/extensions/serviceProvider/serviceProvider.service';

@Injectable()
export class ParentRepository<
  Model, // Props
  ValueObject,
  Entity extends AggregateRoot<ValueObject, Model>,
  EntityResponseDto,
> implements infra.RepositoryBase<Entity> {
  constructor(
    protected readonly entityModel: DbModel<Model>,
    protected readonly ModelClass: new (...args: any[]) => Model,
    protected readonly mapper: infra.Mapper<Entity, Model, EntityResponseDto>,
    protected readonly cache: CacheService<Model>,
    protected readonly serviceProvider: ServiceProvider,
  ) {}
  async insert(entity: Entity): Promise<void> {
    const props: Model & { id: string } = entity.getProps();
    const _id = props.id.replace(/-/g, '').substring(0, 24); // for cloudRecovery and use --upsert in mongorestore
    const newEntity = new this.entityModel({ ...props, _id });
    await newEntity.save();
    await this.cache.set(`${this.ModelClass.name}:${props.id}`, props);
    entity.publishEvents(
      this.serviceProvider.logger,
      this.serviceProvider.eventEmitter,
    );
  }

  async findById(id: string): Promise<Entity | undefined> {
    const cachedEntity: Model | undefined = await this.cache.get(
      `${this.ModelClass.name}:${id}`,
    );
    if (cachedEntity) {
      return this.mapper.toDomain(cachedEntity);
    }

    const entity = await this.entityModel.findOne({ id }).lean();
    if (entity) return this.mapper.toDomain(entity);
    return undefined;
  }

  async findOne(filter: QueryFilter<any>): Promise<Entity | undefined> {
    if (Object.keys(filter).length === 1 && filter.id !== undefined) {
      const cachedEntity: Model | undefined = await this.cache.get(
        `${this.ModelClass.name}:${filter.id}`,
      );
      if (cachedEntity) return this.mapper.toDomain(cachedEntity);
    }
    const entity = await this.entityModel.findOne(filter).lean();
    if (entity) return this.mapper.toDomain(entity);
    return undefined;
  }

  async findAll(params: QueryBase<any>): Promise<Entity[]> {
    const { filter, orderBy } = params;
    const query = this.entityModel.find();

    if (filter) query.find(filter);
    if (orderBy) {
      const { column, status } = orderBy;
      query.sort({
        [column]: status === OrderStates.ASCENDING ? 1 : -1,
      });
    }

    const entities = await query.lean().exec();

    const entityEntities: Entity[] = [];
    for (const entity of entities)
      entityEntities.push(this.mapper.toDomain(entity));
    return entityEntities;
  }

  async findAllPaginated(
    params: PaginatedQueryBase<any>,
  ): Promise<infra.Paginated<Entity>> {
    const { filter, orderBy, page, limit } = params;
    const query = this.entityModel.find();
    if (filter) query.find(filter);
    if (orderBy) {
      const { column, status } = orderBy;
      query.sort({
        [column]: status === OrderStates.ASCENDING ? 1 : -1,
      });
    }
    query.skip((page - 1) * limit).limit(limit);

    const entities = await query.lean().exec();

    const entityEntities: Entity[] = [];
    for (const entity of entities)
      entityEntities.push(this.mapper.toDomain(entity));
    const totalentityCount: number = await this.entityModel
      .countDocuments()
      .exec();
    return {
      totalDocs: totalentityCount,
      page,
      limit,
      docs: entityEntities,
    };
  }

  async update(entity: Entity, updatedAt: Date = new Date()): Promise<void> {
    const props: any = { ...entity.getProps(), updatedAt };
    await this.entityModel.updateOne({ id: entity.id }, props);
    const cacheProps = await this.cache.get(
      `${this.ModelClass.name}:${props.id}`,
    );
    if (!cacheProps) return;
    await this.cache.set(`${this.ModelClass.name}:${props.id}`, props);
    entity.publishEvents(
      this.serviceProvider.logger,
      this.serviceProvider.eventEmitter,
    );
  }

  async delete(entity: Entity): Promise<void> {
    await this.entityModel.deleteOne({ id: entity.id });
    await this.cache.delete(`${this.ModelClass.name}:${entity.id}`);
    entity.publishEvents(
      this.serviceProvider.logger,
      this.serviceProvider.eventEmitter,
    );
  }

  async aggregate(value: object) {
    const queryOutput = await this.entityModel.aggregate([
      {
        $match: {},
      },
      {
        $group: {
          _id: '',
          ...value,
        },
      },
    ]);
    return queryOutput;
  }

  async restoreAndInitRecordsToCache(): Promise<void> {
    const entities: any[] = await this.entityModel.find().lean();
    for (const entity of entities) {
      await this.cache.set(`${this.ModelClass.name}:${entity.id}`, entity);
    }
  }
}
