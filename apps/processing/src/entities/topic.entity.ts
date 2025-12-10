import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('topics')
export class Topic {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'topic_random_id', unique: true })
  topicRandomId: string;

  @Column({ name: 'class_id' })
  classId: string;

  @Column({ name: 'topic_name' })
  topicName: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}