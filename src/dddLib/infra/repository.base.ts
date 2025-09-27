/*  Most of repositories will probably need generic 
    save/find/delete/update operations, so it's easier
    to have some shared interfaces.
    More specific queries should be defined
    in a respective repository.
*/

import { PaginatedQueryBase, QueryBase } from '../applicationService';

export class Paginated<T> {
  readonly totalDocs: number;
  readonly limit: number;
  readonly page: number;
  readonly docs: readonly T[];

  constructor(props: Paginated<T>) {
    this.totalDocs = props.totalDocs;
    this.limit = props.limit;
    this.page = props.page;
    this.docs = props.docs;
  }
}

export interface RepositoryBase<Entity> {
  insert(entity: Entity): Promise<void>;
  findById(id: string): Promise<Entity | undefined>;
  findOne(filter: object): Promise<Entity | undefined>;
  findAll(params: QueryBase<any>): Promise<Entity[]>;
  findAllPaginated?(
    params: PaginatedQueryBase<any>,
  ): Promise<Paginated<Entity>>;
  update(entity: Entity): Promise<void>;
  delete(entity: Entity): Promise<void>;
  restoreAndInitRecordsToCache?(): Promise<void>;
}
