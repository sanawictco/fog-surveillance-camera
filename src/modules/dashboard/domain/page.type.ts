import { BusinessId } from 'src/dddLib/core/businessId.vo';
import { Page, PageTypes } from './valueObjects/pageType.vo';
import { PageIndex } from './valueObjects/pageIndex.vo';
import { PageContent, Widget } from './valueObjects/pageContent.vo';
import { Name } from 'src/modules/shared/valueObjects/name.vo';
import { RunningConfigs } from 'src/modules/shared/valueObjects/runningConfigs.vo';

export interface PageValueObjects {
  name: Name;
  nvrId: BusinessId;
  type: Page;
  pageIndex: PageIndex;
  content: PageContent;
  runningConfigs: RunningConfigs; // not used in fog but only for cloud recovery scenario (have sync schema in cloud and fog)
}

export interface PageProps {
  name: string;
  nvrId: string;
  type: PageTypes;
  pageIndex: number;
  content: Widget[];
  runningConfigs: Record<string, string>;
}

export interface CreatePageProps {
  generatedIdFromCloud?: string;
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
