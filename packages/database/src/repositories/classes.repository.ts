import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Class } from '../entities/class.entity.js';
import { CreateClassDto } from '@repo/common'; 

@Injectable()
export class ClassesRepository {
  constructor(
    @InjectRepository(Class)
    private readonly repo: Repository<Class>,
    private readonly dataSource: DataSource,
  ) {}

  async findByIdWithUser(classId: string): Promise<Class | null> {
    return this.repo.findOne({
      where: { classID: classId },
      relations: ['user'],
    });
  }

  async findByUserId(userId: string): Promise<Class[]> {
    return this.repo.find({
      where: { user: { userID: userId } },
      order: { createdAt: 'DESC' },
    });
  }

  async create(
    userId: string,
    data: CreateClassDto
  ): Promise<Class> {
    return this.dataSource.transaction(async (manager) => {
      const existingClass = await manager.findOne(Class, {
        where: { user: { userID: userId }, name: data.className },
      });

      if (existingClass) {
        throw new Error('CLASS_ALREADY_EXISTS');
      }

      const newClass = manager.create(Class, {
        user: { userID: userId } as any,
        name: data.className,
        examDate: data.examDate ? new Date(data.examDate) : undefined,
        examLocation: data.examLocation,
      });

      return manager.save(newClass);
    });
  }

  async deleteWithTopics(classId: string, userId: string): Promise<void> {
    return this.dataSource.transaction(async (manager) => {
      const classEntity = await manager
        .createQueryBuilder(Class, 'class')
        .innerJoinAndSelect('class.user', 'user')
        .setLock('pessimistic_write')
        .where('class.classID = :classId', { classId })
        .getOne();

      if (!classEntity) {
        throw new Error('CLASS_NOT_FOUND');
      }

      if (classEntity.user.userID !== userId) {
        throw new Error('FORBIDDEN');
      }
      
      await manager.delete(Class, classId);
    });
  }
}