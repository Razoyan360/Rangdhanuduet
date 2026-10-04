import { createClient } from '@libsql/client'; const db = createClient({url: 'file:local.db'}); async function run() { 
await db.execute('CREATE TABLE IF NOT EXISTS reunion_parts (id INTEGER PRIMARY KEY AUTOINCREMENT, part_number INTEGER UNIQUE, icon TEXT, title_bn TEXT, title_en TEXT)');
await db.execute('CREATE TABLE IF NOT EXISTS reunion_photos (id INTEGER PRIMARY KEY AUTOINCREMENT, photo_id TEXT UNIQUE, part_number INTEGER, image_url TEXT, caption TEXT, sort_order INTEGER)');
console.log('Tables created'); } run();
