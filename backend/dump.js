import { createClient } from '@libsql/client';
const db = createClient({ url: 'file:local.db' });
async function dump() {
    const res = await db.execute("SELECT name, sql FROM sqlite_master WHERE type='table' AND name IN ('executive_committee', 'unclaimed_profiles', 'unclaimed_matches', 'unclaimed_audit', 'alumni')");
    res.rows.forEach(r => console.log(r.sql));
}
dump();
