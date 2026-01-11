import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Unique, CreateDateColumn, Index, UpdateDateColumn } from 'typeorm';
// Use 'import type' to ensure this is erased at runtime
import type { Class } from './class.entity.js';

@Entity('topics')
@Unique('uq_class_topic_name', ['class', 'name'])
@Index('idx_topic_class_date', ['class', 'createdAt'])
export class Topic {
  @PrimaryGeneratedColumn('uuid')
  topicID: string;

  @Column({ length: 200 })
  name: string;
  
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
  
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column()
  classID: string;

  @ManyToOne('Class', 'topics', { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'classID' })
  class: Class;
}