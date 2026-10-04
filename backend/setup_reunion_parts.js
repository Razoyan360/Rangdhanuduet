import { createClient } from '@libsql/client'; const db = createClient({url: 'file:local.db'}); async function run() { 
const parts = [
{n: 1, icon: 'flag', bn: 'উদ্বোধন ও বর্ণিল র্যালি', en: 'Opening Ceremony & Grand Rally'},
{n: 2, icon: 'users', bn: 'ক্যাম্পাস আড্ডা, আউটডোর ও গ্রুপ ছবি', en: 'Campus Hangout & Outdoor Group Photos'},
{n: 3, icon: 'book-open', bn: 'প্রকৌশলী কোচিং পরিদর্শন ও শুভেচ্ছা', en: 'PDACC Visit & Directors Meetup'},
{n: 4, icon: 'award', bn: 'অডিটোরিয়াম সেশন ও অ্যাওয়ার্ড', en: 'Auditorium Session & Award Ceremony'},
{n: 5, icon: 'sparkles', bn: 'মঞ্চের স্মৃতি ও সমাপনী', en: 'Stage Group Photos & Closing'}
];
for(const p of parts) {
await db.execute({sql: 'INSERT OR IGNORE INTO reunion_parts (part_number, icon, title_bn, title_en) VALUES (?, ?, ?, ?)', args: [p.n, p.icon, p.bn, p.en]});
}
console.log('Parts inserted'); } run();
