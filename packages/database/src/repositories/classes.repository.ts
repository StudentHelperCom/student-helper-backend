import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Class } from '../entities/class.entity.js';
import { Topic } from '../entities/topic.entity.js';
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

  async findAllByUserId(userId: string): Promise<Class[]> {
    return this.repo.find({
      where: { user: { userID: userId } },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * TRANSACTIONAL: Create or find class for file upload.
   * Ensures atomic creation within transaction.
   */
  async findOrCreateClassTransactional(
    userId: string,
    className: string
  ): Promise<Class> {
    return this.dataSource.transaction(async (manager) => {
      let classEntity = await manager.findOne(Class, {
        where: { user: { userID: userId }, name: className },
      });

      if (!classEntity) {
        classEntity = manager.create(Class, {
          user: { userID: userId } as any,
          name: className,
        });
        await manager.save(classEntity);
      }

      return classEntity;
    });
  }

  /**
   * TRANSACTIONAL: Create class with existence check.
   * Throws error if class already exists.
   */
  async createClassTransactional(
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

  /**
   * TRANSACTIONAL: Delete class with all related topics.
   * Uses pessimistic lock to prevent concurrent modifications.
   */
  async deleteClassWithTopicsTransactional(
    classId: string,
    userId: string
  ): Promise<{ class: Class }> {
    return this.dataSource.transaction(async (manager) => {
      // Lock and verify ownership
      const classEntity = await manager.findOne(Class, {
        where: { classID: classId },
        relations: ['user'],
        lock: { mode: 'pessimistic_write' },
      });

      if (!classEntity) {
        throw new Error('CLASS_NOT_FOUND');
      }

      if (classEntity.user.userID !== userId) {
        throw new Error('FORBIDDEN');
      }

      // Delete topics first (cascade should handle this, but explicit is better)
      await manager.delete(Topic, { class: { classID: classId } as any });
      
      // Delete class
      await manager.delete(Class, classId);

      return { class: classEntity };
    });
  }
}