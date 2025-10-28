import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';

@Injectable()
export class CdnService {
  private uploadDir = path.join(process.cwd(), process.env.UPLOAD_DIR || 'uploads');

  async saveFile(data: { filename: string; content: Buffer }) {
    await fs.mkdir(this.uploadDir, { recursive: true });
    const filePath = path.join(this.uploadDir, data.filename);
    await fs.writeFile(filePath, data.content);
    return { message: 'File saved successfully', path: filePath };
  }
}
