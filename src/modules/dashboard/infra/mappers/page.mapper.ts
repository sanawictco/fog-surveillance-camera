import { Injectable } from '@nestjs/common';
import { BusinessId } from 'src/dddLib/core/businessId.vo';
import { Mapper } from 'src/dddLib/infra';
import { PageEntity } from '../../domain/page.entity';
import { PageContent } from '../../domain/valueObjects/pageContent.vo';
import { PageIndex } from '../../domain/valueObjects/pageIndex.vo';
import { PageModel } from '../schemas/page.schema';
import { PageResponseDto } from '../../applicationService/contracts/page.response.dto';
import { Page } from '../../domain/valueObjects/pageType.vo';
import { RunningConfigs } from 'src/modules/shared/valueObjects/runningConfigs.vo';
import { Name } from 'src/modules/shared/valueObjects/name.vo';

/**
 * Mapper constructs objects that are used in different layers:
 * Record is an object that is stored in a database,
 * Entity is an object that is used in application domain layer,
 * and a ResponseDTO is an object returned to a user (usually as json).
 */

@Injectable()
export class PageMapper implements Mapper<
  PageEntity,
  PageModel,
  PageResponseDto
> {
  toPersistence(entity: PageEntity): PageModel {
    const copy = entity.getProps();
    const record: PageModel = {
      id: copy.id,
      name: copy.name,
      nvrId: copy.id,
      type: copy.type,
      pageIndex: copy.pageIndex,
      content: copy.content,
      runningConfigs: copy.runningConfigs,
      createdAt: copy.createdAt,
      updatedAt: copy.updatedAt,
    };
    return record;
  }

  toDomain(record: PageModel): PageEntity {
    const entity = new PageEntity({
      id: record.id,
      createdAt: new Date(record.createdAt),
      updatedAt: new Date(record.updatedAt),
      props: {
        name: new Name(record.name),
        nvrId: new BusinessId(record.nvrId),
        type: new Page(record.type),
        pageIndex: new PageIndex(record.pageIndex),
        content: new PageContent(record.content),
        runningConfigs: new RunningConfigs(record.runningConfigs),
      },
    });
    return entity;
  }

  toResponse(entity: PageEntity): PageResponseDto {
    const props = entity.getProps();
    const response = new PageResponseDto(entity);
    response.name = props.name;
    response.type = props.type;
    response.pageIndex = props.pageIndex;
    response.content = props.content;

    return response;
  }

  toResponseAll(entities: PageEntity[]): PageResponseDto[] {
    const responseArr: PageResponseDto[] = [];
    for (const entity of entities) {
      const props = entity.getProps();
      const response = new PageResponseDto(entity);
      response.name = props.name;
      response.type = props.type;
      response.pageIndex = props.pageIndex;
      response.content = props.content;
      responseArr.push(response);
    }
    return responseArr;
  }
}
