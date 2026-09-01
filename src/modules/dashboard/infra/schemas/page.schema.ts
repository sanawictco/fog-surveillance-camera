import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { PageProps } from '../../domain/page.type';
import { PageTypes } from '../../domain/valueObjects/pageType.vo';
import { Widget } from '../../domain/valueObjects/pageContent.vo';

@Schema({ collection: 'pages' })
export class PageModel implements PageProps {
  @Prop({ unique: true, required: true })
  id!: string;

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

  @Prop({ type: Object, required: true })
  runningConfigs!: Record<string, string>;
}
export const PageSchema = SchemaFactory.createForClass(PageModel);
