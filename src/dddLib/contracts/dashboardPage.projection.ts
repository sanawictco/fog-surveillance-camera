import { AggregateID } from 'src/dddLib/core';

export interface DashboardPageProjection {
  id: AggregateID;
  type: string;
}
