import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { CreatePageRequestDto } from '../applicationService/contracts/createPage.request.dto';
import {
  GetAllPagesResponseDto,
  PageResponseDto,
} from '../applicationService/contracts/page.response.dto';
import { UpdatePageRequestDto } from '../applicationService/contracts/updatePage.request.dto';
import { PagesHttpService } from '../applicationService/services/page.http.service';
import { OnlyIdParamRequestDto } from 'src/modules/shared/dtos/onlyIdParam.request.dto';

@ApiTags('/dashboard/pages')
@Controller('/dashboard/pages')
export class PageHttpController {
  constructor(private readonly pagesService: PagesHttpService) {}
  @Get('/')
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  find(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit = 10,
  ): Promise<GetAllPagesResponseDto> {
    return this.pagesService.find();
    console.log(page, limit);
  }

  @Get('/:id')
  findOne(@Param() params: OnlyIdParamRequestDto): Promise<PageResponseDto> {
    return this.pagesService.findOne(params.id);
  }

  @Post('/')
  @HttpCode(HttpStatus.ACCEPTED)
  create(@Body() body: CreatePageRequestDto): Promise<string> {
    return this.pagesService.create(body);
  }

  @Put('/:id')
  @HttpCode(HttpStatus.ACCEPTED)
  update(
    @Param() params: OnlyIdParamRequestDto,
    @Body() body: UpdatePageRequestDto,
  ): Promise<string> {
    return this.pagesService.update(params.id, body);
  }
}
