import { BaseEntity, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('users')
export class UserEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100, unique: true, nullable: false })
  login!: string; 

  @Column({ type: 'varchar', length: 100, nullable: false })
  password!: string; // Hashed password

  @Column({ type: 'timestamp', nullable: true })
  lastActivityDate?: Date | null
  }