import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { PageProps } from '../domain/page.type';
import { PageTypes } from '../domain/valueObjects/pageType.vo';
import { Widget } from '../domain/valueObjects/pageContent.vo';

@Schema({ collection: 'pages' })
export class PageModel implements PageProps {
  @Prop({ unique: true, required: true })
  id!: string;

  @Prop({ required: true, index: true })
  tenantId!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  nvrId!: string;

  @Prop({
    default: PageTypes.WIDGET,
    required: true,
    type: String,
    enum: PageTypes,
  })
  type!: PageTypes;

  @Prop({ required: true })
  pageIndex!: number;

  @Prop([Object])
  content!: Widget[];

  @Prop({ default: new Date() })
  createdAt!: Date;

  @Prop({ default: new Date() })
  updatedAt!: Date;
}
export const PageSchema = SchemaFactory.createForClass(PageModel);
PageSchema.index({ tenantId: 1, id: 1 });
PageSchema.index({ tenantId: 1, nvrId: 1, type: 1, pageIndex: 1 });
PageSchema.index({ tenantId: 1, nvrId: 1, name: 1 });
export function pageCacheKey(tenantId: string, id: string): string {
  if (!tenantId) throw new Error('tenantId is required');
  return `tenant:${tenantId}:${PageModel.name}:${id}`;
}
