import pg from 'pg';
import { config } from '../config.ts';

// Created lazily by pg: no connection is opened until the first query.
export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
