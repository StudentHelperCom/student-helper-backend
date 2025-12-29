import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { UserEntity } from './user.entity.js';


@Entity('classes')
export class ClassEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  userId: string;

  // This establishes the Foreign Key constraint
  @ManyToOne(() => UserEntity, (user) => user.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column()
  name: string; 

  @Index()
  @Column({ type: 'timestamp', nullable: true })
  examDate: Date;

  @Column({ nullable: true })
  examLocation: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}