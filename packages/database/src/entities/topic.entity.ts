import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { ClassEntity } from './class.entity.js';


@Entity('topics')
export class TopicEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index() // Critical for fetching topics within a class
  @Column({ name: 'class_id' })
  classId: string;

  @ManyToOne(() => ClassEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'class_id' })
  class: ClassEntity;

  @Index()
  @Column({ name: 'topic_name' })
  topicName: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}