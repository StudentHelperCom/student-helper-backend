import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, Unique, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity.js';
import type { Topic } from './topic.entity.js';

@Entity('classes')
@Unique('uq_user_class_name', ['user', 'name']) 
export class Class {
  @PrimaryGeneratedColumn('uuid')
  classID: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'timestamptz', nullable: true })
  examDate: Date;

  @Column({ length: 150, nullable: true })
  examLocation: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
  
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column()
  userID: string;
  
  @ManyToOne(() => User, (user) => user.classes, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'userID' })
  user: User;

  // Use string reference 'Topic' here too
  @OneToMany('Topic', 'class')
  topics: Topic[];
}