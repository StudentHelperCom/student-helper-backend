import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Class } from '../entities/class.entity.js';
import { CreateClassDto } from '@repo/common'; 

@Injectable()
export class ClassesRepository {
  constructor(
    @InjectRepository(Class)
    private readonly repo: Repository<Class>,
  ) {}

  async findByUserIdAndName(userId: string, className: string): Promise<Class | null> {
    return this.repo.findOne({
      where: { user: { userID: userId }, name: className },
    });
  }

  async findByIdWithUser(classId: string): Promise<Class | null> {
    return this.repo.findOne({
      where: { classID: classId },
      relations: ['user'],
    });
  }

  async findAllByUserId(userId: string): Promise<Class[]> {
    return this.repo.find({
      where: { user: { userID: userId } },
      order: { createdAt: 'DESC' },
    });
  }

  async create(userId: string, data: CreateClassDto | { className: string; examDate?: string; examLocation?: string }): Promise<Class> {
    const newClass = this.repo.create({
      user: { userID: userId } as any,
      name: data.className,
      examDate: 'examDate' in data && data.examDate ? new Date(data.examDate) : undefined,
      examLocation: 'examLocation' in data ? data.examLocation : undefined,
    });
    return this.repo.save(newClass);
  }

  async delete(classId: string): Promise<void> {
    await this.repo.delete(classId);
  }
}