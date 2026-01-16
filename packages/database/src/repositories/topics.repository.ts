import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, DataSource } from 'typeorm';
import { Topic } from '../entities/topic.entity.js';

@Injectable()
export class TopicsRepository {
  constructor(
    @InjectRepository(Topic)
    private readonly repo: Repository<Topic>,
    private readonly dataSource: DataSource,
  ) {}

  // --- Methods from Processing Service ---
  create(data: Partial<Topic>): Topic {
    return this.repo.create(data);
  }

  async countByClassId(classId: string): Promise<number> {
    return this.repo.count({
      where: { class: { classID: classId } as any },
    });
  }

  // --- Methods from Quiz Service ---
  async findByIds(topicIds: string[]): Promise<Topic[]> {
    return this.repo.find({
      where: { topicID: In(topicIds) },
      relations: ['class'],
    });
  }

  // --- Methods from CDN Service ---
  async findByClassId(classId: string): Promise<Topic[]> {
    return this.repo.find({
      where: { class: { classID: classId } },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Replace all topics for a class atomically.
   * Deletes old topics and saves new ones. Runs in transaction.
   */
  async replaceForClass(
    classId: string,
    topicEntities: Topic[]
  ): Promise<Topic[]> {
    return this.dataSource.transaction(async (manager) => {
      // Delete old topics
      await manager.delete(Topic, { class: { classID: classId } as any });
      
      // Save new topics
      if (topicEntities.length > 0) {
        return manager.save(topicEntities);
      }
      
      return [];
    });
  }
}