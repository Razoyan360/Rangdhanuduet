import { createClient } from '@libsql/client';
const db = createClient({url: 'file:local.db'});
async function run() {
  await db.execute("PRAGMA foreign_keys = OFF;");
  await db.execute("UPDATE event_gallery SET event_id = 'EVENT-S001' WHERE event_id = 'EVENT-0001'");
  await db.execute("UPDATE event_gallery SET event_id = 'EVENT-S002' WHERE event_id = 'EVENT-0002'");
  await db.execute("UPDATE event_gallery SET event_id = 'EVENT-S003' WHERE event_id = 'EVENT-0003'");
  await db.execute("UPDATE event_gallery SET event_id = 'EVENT-S004' WHERE event_id = 'EVENT-0004'");
  await db.execute("PRAGMA foreign_keys = ON;");
  console.log('Fixed');
}
run();
