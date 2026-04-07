import pkg from 'pg';
import { config } from './config';

const { Pool } = pkg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
});

export const ensureSchema = async () => {
  await pool.query(`
    create table if not exists users (
      id serial primary key,
      username varchar(64) unique not null,
      email varchar(128),
      password_hash text not null,
      role varchar(16) not null default 'USER',
      status varchar(16) not null default 'ACTIVE',
      created_at timestamptz not null default now()
    );

    create table if not exists runs (
      id uuid primary key,
      user_id integer references users(id),
      module_key varchar(64) not null,
      workflow_id varchar(64) not null,
      input jsonb,
      output jsonb,
      status varchar(16) not null,
      created_at timestamptz not null default now(),
      finished_at timestamptz
    );

    create table if not exists copy_library (
      id serial primary key,
      user_id integer references users(id),
      name varchar(256) not null,
      buwei jsonb,
      changping varchar(256),
      donzuojiexi jsonb,
      erchuanwenan text,
      wenan_array_string jsonb,
      wenan_fenxi text,
      translated_lines jsonb,
      tts_individual jsonb,
      tts_merged jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
};
