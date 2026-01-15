import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Topic } from '../entities/topic.entity.js';

@Injectable()
export class TopicsRepository {
  constructor(
    @InjectRepository(Topic)
    private readonly repo: Repository<Topic>,
  ) {}

  // --- Methods from Processing Service ---
  async deleteByClassId(classId: string): Promise<void> {
    await this.repo.delete({ class: { classID: classId } as any });
  }

  create(data: Partial<Topic>): Topic {
    return this.repo.create(data);
  }

  async saveMany(topics: Topic[]): Promise<Topic[]> {
    return this.repo.save(topics);
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
}