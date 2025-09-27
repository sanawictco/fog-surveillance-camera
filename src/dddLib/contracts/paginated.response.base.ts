import { Paginated } from '../infra/repository.base';

export abstract class PaginatedResponseDto<T> extends Paginated<T> {}
