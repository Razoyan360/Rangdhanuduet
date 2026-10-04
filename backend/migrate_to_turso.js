import { createClient as createTursoClient } from "@libsql/client";
import { createClient as createLocalClient } from "@libsql/client";
import fs from 'fs';
import path from 'path';

async function migrate() {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!url || !authToken) {
        console.error("Please set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN environment variables!");
        process.exit(1);
    }

    console.log("Connecting to local database...");
    const localDb = createLocalClient({ url: `file:local.db` });

    console.log("Connecting to Turso database...");
    const tursoDb = createTursoClient({ url, authToken });

    const tables = [
        'executive_committee',
        'unclaimed_profiles',
        'unclaimed_matches',
        'unclaimed_audit',
        'alumni',
        'admins',
        'settings'
    ];

    for (const table of tables) {
        console.log(`\nMigrating table: ${table}...`);
        
        // 1. Get schema from local
        const schemaRes = await localDb.execute(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${table}'`);
        if (schemaRes.rows.length === 0) continue;
        let createSql = schemaRes.rows[0].sql;
        
        // Minor fix for autoincrement compatibility if needed
        createSql = createSql.replace('AUTOINCREMENT', 'AUTOINCREMENT');

        // 2. Create table in Turso
        try {
            await tursoDb.execute(`DROP TABLE IF EXISTS ${table}`);
            await tursoDb.execute(createSql);
            console.log(`Created table ${table} on Turso.`);
        } catch (e) {
            console.error(`Error creating ${table}:`, e.message);
        }

        // 3. Migrate data
        const dataRes = await localDb.execute(`SELECT * FROM ${table}`);
        const rows = dataRes.rows;
        
        if (rows.length === 0) {
            console.log(`No data to migrate for ${table}.`);
            continue;
        }

        const columns = Object.keys(rows[0]);
        console.log(`Migrating ${rows.length} rows into ${table}...`);

        for (let i = 0; i < rows.length; i += 50) {
            const batch = rows.slice(i, i + 50);
            
            const insertStatements = batch.map(row => {
                const args = columns.map(col => row[col]);
                return {
                    sql: `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
                    args: args
                };
            });

            try {
                await tursoDb.batch(insertStatements, 'write');
                process.stdout.write(`.`);
            } catch (e) {
                console.error(`\nError inserting batch in ${table}:`, e.message);
            }
        }
        console.log(`\nFinished ${table}.`);
    }

    console.log("\nMigration completed successfully!");
}

migrate().catch(console.error);
