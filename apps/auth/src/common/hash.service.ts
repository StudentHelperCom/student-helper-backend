import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

@Injectable()
export class HashService {
  private readonly saltRounds = 12;

  async hashData(data: string): Promise<string> {
    return bcrypt.hash(data, this.saltRounds);
  }

  async compareData(data: string, hashedData: string): Promise<boolean> {
    return bcrypt.compare(data, hashedData);
  }
}