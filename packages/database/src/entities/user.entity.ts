 
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany, Index } from 'typeorm';
import { Class } from './class.entity.js';


@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  userID: string;

  @Index('idx_users_email', { unique: true }) 
  @Column({ length: 255 })
  email: string;

  @Column({ length: 255 })
  passwordHash: string;

  @CreateDateColumn({ type: 'timestamptz' })
  registrationDate: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastActivityDate: Date;

  // Relationship: One User has Many Classes
  @OneToMany(() => Class, (cls) => cls.user)
  classes: Class[];
}
