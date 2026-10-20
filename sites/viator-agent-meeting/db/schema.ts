import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
export const rooms=sqliteTable('hub_rooms',{
  id:text('id').primaryKey(),project:text('project').notNull(),title:text('title').notNull(),
  status:text('status').notNull(),directorTurns:integer('director_turns').notNull().default(0),
  maxTurns:integer('max_turns').notNull().default(6),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
});
export const messages=sqliteTable('hub_messages',{
  id:text('id').primaryKey(),roomId:text('room_id').notNull().references(()=>rooms.id),
  project:text('project').notNull(),sender:text('sender').notNull(),body:text('body').notNull(),
  replyTo:text('reply_to'),createdAt:text('created_at').notNull(),
},t=>[uniqueIndex('hub_reply_once').on(t.replyTo,t.sender),index('hub_room_messages').on(t.roomId,t.createdAt)]);
export const deliveries=sqliteTable('hub_deliveries',{
  id:text('id').primaryKey(),messageId:text('message_id').notNull().references(()=>messages.id),
  roomId:text('room_id').notNull().references(()=>rooms.id),project:text('project').notNull(),
  status:text('status').notNull(),attempts:integer('attempts').notNull().default(0),
  leaseId:text('lease_id'),expires:integer('expires'),nextAt:integer('next_at').notNull().default(0),
},t=>[uniqueIndex('hub_delivery_once').on(t.messageId),index('hub_delivery_project').on(t.project,t.status)]);
export const agentKeys=sqliteTable('hub_agent_keys',{
  id:text('id').primaryKey(),project:text('project').notNull(),hash:text('hash').notNull(),
  enabled:integer('enabled').notNull().default(1),lastSeen:text('last_seen'),createdAt:text('created_at').notNull(),
},t=>[uniqueIndex('hub_key_hash').on(t.hash)]);
export const generations=sqliteTable('hub_generations',{
  incomingId:text('incoming_id').primaryKey(),roomId:text('room_id').notNull(),
  status:text('status').notNull(),responseId:text('response_id'),error:text('error'),createdAt:text('created_at').notNull(),
});
export const receipts=sqliteTable('hub_receipts',{
  key:text('key').primaryKey(),actor:text('actor').notNull(),fingerprint:text('fingerprint').notNull(),
  response:text('response').notNull(),createdAt:text('created_at').notNull(),
});
export const audit=sqliteTable('hub_audit',{
  id:text('id').primaryKey(),actor:text('actor').notNull(),project:text('project').notNull(),
  action:text('action').notNull(),target:text('target'),createdAt:text('created_at').notNull(),
});
export const roomMemory=sqliteTable('hub_room_memory',{
  roomId:text('room_id').primaryKey().references(()=>rooms.id),project:text('project').notNull(),
  summary:text('summary').notNull(),throughCursor:integer('through_cursor').notNull().default(0),
  coveredMessages:integer('covered_messages').notNull().default(0),updatedAt:text('updated_at').notNull(),
});
export const studioKeys=sqliteTable('hub_studio_keys',{
  id:text('id').primaryKey(),project:text('project').notNull(),hash:text('hash').notNull(),
  enabled:integer('enabled').notNull().default(1),lastSeen:text('last_seen'),createdAt:text('created_at').notNull(),
},t=>[uniqueIndex('hub_studio_key_hash').on(t.hash)]);
export const productionJobs=sqliteTable('hub_production_jobs',{
  id:text('id').primaryKey(),roomId:text('room_id').notNull().references(()=>rooms.id),project:text('project').notNull(),
  title:text('title').notNull(),mode:text('mode').notNull(),prompt:text('prompt').notNull(),negative:text('negative').notNull().default(''),
  aspect:text('aspect').notNull().default('9:16'),quality:text('quality').notNull().default('high'),duration:integer('duration').notNull().default(10),
  seed:integer('seed').notNull().default(42),guidance:integer('guidance').notNull().default(1),resolution:text('resolution').notNull(),model:text('model'),
  status:text('status').notNull(),approvedBy:text('approved_by'),approvedAt:text('approved_at'),leaseId:text('lease_id'),expires:integer('expires'),
  studioJobId:text('studio_job_id'),result:text('result'),error:text('error'),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[index('hub_production_project_status').on(t.project,t.status),index('hub_production_room').on(t.roomId,t.createdAt)]);
