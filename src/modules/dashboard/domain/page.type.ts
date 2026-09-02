import { BusinessId } from 'src/dddLib/core/businessId.vo';
import { Page, PageTypes } from './valueObjects/pageType.vo';
import { PageIndex } from './valueObjects/pageIndex.vo';
import { PageContent, Widget } from './valueObjects/pageContent.vo';
import { Name } from 'src/modules/shared/valueObjects/name.vo';

export interface PageValueObjects {
  tenantId: BusinessId;
  name: Name;
  nvrId: BusinessId;
  type: Page;
  pageIndex: PageIndex;
  content: PageContent;
}

export interface PageProps {
  tenantId: string;
  name: string;
  nvrId: string;
  type: PageTypes;
  pageIndex: number;
  content: Widget[];
}

export interface CreatePageProps {
  originId?: string;
  tenantId: string;
  name: string;
  type: PageTypes;
  nvrId: string;
  pageIndex?: number;
}

export interface UpdatePageProps {
  name?: string;
  pageIndex?: number;
  content?: Widget[];
}

export enum PageConfigs {
  CREATE_PAGE = 'CREATE_PAGE',
  UPDATE_PAGE = 'UPDATE_PAGE',
  DELETE_PAGE = 'DELETE_PAGE',
}

export interface PageSubMqttTopics {
  pageConfigs: string;
}

export type PageLanguageKeys = {
  dashboard: {
    actorLog: {
      created: string;
      deleted: string;
      nameUpdated: string;
      contentUpdated: string;
      pageIndexUpdated: string;
    };
    response: {
      http: {
        created: string;
        updated: string;
      };
      socket: {
        created: string;
        updated: string;
        deleted: string;
      };
    };
    errorResponse: {
      badRequest: {
        notExists: string;
        nameIsDuplicated: string;
      };
    };
  };
};
