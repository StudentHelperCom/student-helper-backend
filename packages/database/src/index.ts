// Export entities
export * from './entities/class.entity.js';
export * from './entities/topic.entity.js';
export * from './entities/user.entity.js';

// Export database module
export * from './database.module.js';

// Export repository tokens for easy dependency injection
export const CLASS_REPOSITORY = 'CLASS_REPOSITORY';
export const TOPIC_REPOSITORY = 'TOPIC_REPOSITORY';
export const USER_REPOSITORY = 'USER_REPOSITORY';

export * from './repositories/users.repository.js';
export * from './repositories/topics.repository.js';
export * from './repositories/classes.repository.js';