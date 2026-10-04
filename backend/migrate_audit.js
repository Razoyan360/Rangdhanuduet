import { createClient } from '@libsql/client';
const db = createClient({ url: 'file:local.db' });
async function migrate() {
    await db.execute(`
    CREATE TABLE IF NOT EXISTS unclaimed_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        audit_id TEXT UNIQUE,
        match_id TEXT,
        unclaimed_id TEXT,
        member_id TEXT,
        admin_email TEXT,
        merged_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT,
        admin_note TEXT,
        undo_date DATETIME,
        undo_admin TEXT
    )`);
    console.log("Table created.");
}
migrate();
