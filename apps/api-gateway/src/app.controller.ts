import { Controller, Post, UploadedFile, UseInterceptors, Inject } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';

@ApiTags('CDN')
@Controller('cdn')
export class AppController {
  constructor(@Inject('CDN_SERVICE') private readonly cdnClient: ClientProxy) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    const payload = {
    filename: file.originalname,
    content: file.buffer.toString('base64'), // encode as string
  };
  return this.cdnClient.send('upload_file', payload);

  }
}
