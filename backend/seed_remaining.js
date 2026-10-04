import { createClient } from '@libsql/client';
import xlsx from 'xlsx';

const db = createClient({ url: 'file:local.db' });
const wb = xlsx.readFile('../Format Alumni Directory Sheet (1).xlsx');

function excelDate(serial) {
    if (!serial || typeof serial !== 'number') return null;
    const epoch = new Date(1899, 11, 30);
    return new Date(epoch.getTime() + serial * 86400000).toISOString();
}

async function seed() {
    let totalInserted = 0;

    // ============ 1. Registrations (into alumni with original registration data) ============
    console.log('\n=== Seeding Registrations ===');
    if (wb.SheetNames.includes('Registrations')) {
        const data = xlsx.utils.sheet_to_json(wb.Sheets['Registrations']);
        for (const row of data) {
            const regId = row['Registration ID'];
            if (!regId) continue;
            // Check if already exists in alumni
            const existing = await db.execute({ sql: 'SELECT member_id FROM alumni WHERE member_id = ?', args: [regId] });
            if (existing.rows.length > 0) continue;

            try {
                await db.execute({
                    sql: `INSERT OR IGNORE INTO alumni (
                        member_id, full_name_english, mobile_number, whatsapp_number, email,
                        permanent_address, present_address, blood_group, department, series, batch,
                        employment_type, current_organization, current_designation, work_location,
                        former_position, status, registration_date, approved_date, admin_note
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    args: [
                        regId,
                        row['Full Name (English)'] || '',
                        String(row['Mobile Number'] || ''),
                        String(row['WhatsApp Number'] || ''),
                        row['Email'] || '',
                        row['Permanent Address'] || '',
                        row['Present Address'] || '',
                        row['Blood Group'] || '',
                        row['Department'] || '',
                        String(row['Series'] || ''),
                        String(row['Batch'] || ''),
                        row['Employment Type'] || '',
                        row['Current Organization / Company'] || '',
                        row['Current Designation'] || '',
                        row['Work Location (Division / Country)'] || '',
                        row['Former Position at Rangdhanu / PDACC'] || '',
                        row['Status'] || 'PENDING',
                        excelDate(row['Registration Date']),
                        excelDate(row['Approved Date']),
                        row['Admin Note'] || ''
                    ]
                });
                totalInserted++;
            } catch (err) {
                console.error('  Reg insert error:', regId, err.message);
            }
        }
        console.log(`  Inserted ${totalInserted} registrations`);
    }

    // ============ 2. Admins ============
    console.log('\n=== Seeding Admins ===');
    let adminCount = 0;
    if (wb.SheetNames.includes('Admins')) {
        const data = xlsx.utils.sheet_to_json(wb.Sheets['Admins']);
        for (const row of data) {
            try {
                await db.execute({
                    sql: `INSERT OR REPLACE INTO admins (admin_id, full_name, email, role, status, created_date, last_login)
                          VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    args: [
                        row['Admin ID'],
                        row['Full Name'],
                        row['Email'],
                        row['Role'],
                        row['Status'],
                        excelDate(row['Created Date']),
                        excelDate(row['Last Login'])
                    ]
                });
                adminCount++;
            } catch (err) {
                console.error('  Admin insert error:', err.message);
            }
        }
        console.log(`  Inserted ${adminCount} admins`);
    }

    // ============ 3. Admin Activity ============
    console.log('\n=== Seeding Admin Activity ===');
    // Create admin_activity table if not exists
    await db.execute(`CREATE TABLE IF NOT EXISTS admin_activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date_time DATETIME,
        admin_email TEXT,
        role TEXT,
        action TEXT,
        detail TEXT
    )`);
    let actCount = 0;
    if (wb.SheetNames.includes('Admin Activity')) {
        const data = xlsx.utils.sheet_to_json(wb.Sheets['Admin Activity']);
        for (const row of data) {
            try {
                await db.execute({
                    sql: `INSERT INTO admin_activity (date_time, admin_email, role, action, detail) VALUES (?, ?, ?, ?, ?)`,
                    args: [
                        excelDate(row['Date Time']),
                        row['Admin Email'] || '',
                        row['Role'] || '',
                        row['Action'] || '',
                        row['Detail'] || ''
                    ]
                });
                actCount++;
            } catch (err) {
                console.error('  Activity insert error:', err.message);
            }
        }
        console.log(`  Inserted ${actCount} activity logs`);
    }

    // ============ 4. Polls ============
    console.log('\n=== Seeding Polls ===');
    let pollCount = 0;
    if (wb.SheetNames.includes('Polls')) {
        const data = xlsx.utils.sheet_to_json(wb.Sheets['Polls']);
        for (const row of data) {
            try {
                await db.execute({
                    sql: `INSERT OR REPLACE INTO polls (poll_id, question, poll_type, max_pick, options, eligible_series, end_at, status, result_visibility, created_at, updated_at)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    args: [
                        row['Poll ID'],
                        row['Question'],
                        row['Type'],
                        row['Max Pick'] || 1,
                        row['Options'] || '[]',
                        row['Eligible Series'] || '[]',
                        row['End At'] || null,
                        row['Status'] || 'open',
                        row['Result Visibility'] || 'voters',
                        excelDate(row['Created At']),
                        excelDate(row['Updated At'])
                    ]
                });
                pollCount++;
            } catch (err) {
                console.error('  Poll insert error:', err.message);
            }
        }
        console.log(`  Inserted ${pollCount} polls`);
    }

    // ============ 5. Poll_Votes ============
    console.log('\n=== Seeding Poll Votes ===');
    let voteCount = 0;
    if (wb.SheetNames.includes('Poll_Votes')) {
        const data = xlsx.utils.sheet_to_json(wb.Sheets['Poll_Votes']);
        for (const row of data) {
            try {
                await db.execute({
                    sql: `INSERT OR REPLACE INTO poll_votes (vote_id, poll_id, member_id, voter_name, choice, voted_at) VALUES (?, ?, ?, ?, ?, ?)`,
                    args: [
                        row['Vote ID'],
                        row['Poll ID'],
                        row['Member ID'],
                        row['Voter Name'],
                        row['Choice'] || '[]',
                        excelDate(row['Voted At'])
                    ]
                });
                voteCount++;
            } catch (err) {
                console.error('  Vote insert error:', err.message);
            }
        }
        console.log(`  Inserted ${voteCount} poll votes`);
    }

    // ============ 6. Unclaimed_Profiles ============
    console.log('\n=== Seeding Unclaimed Profiles ===');
    await db.execute(`CREATE TABLE IF NOT EXISTS unclaimed_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        unclaimed_id TEXT UNIQUE,
        source_entry_id TEXT,
        full_name TEXT,
        department TEXT,
        series TEXT,
        mobile_number TEXT,
        email TEXT,
        photo TEXT,
        committee TEXT,
        session TEXT,
        position TEXT,
        message TEXT,
        approved_date DATETIME,
        status TEXT,
        created_date DATETIME,
        updated_date DATETIME
    )`);
    let uncCount = 0;
    if (wb.SheetNames.includes('Unclaimed_Profiles')) {
        const data = xlsx.utils.sheet_to_json(wb.Sheets['Unclaimed_Profiles']);
        for (const row of data) {
            try {
                await db.execute({
                    sql: `INSERT OR REPLACE INTO unclaimed_profiles (
                        unclaimed_id, source_entry_id, full_name, department, series, mobile_number,
                        email, photo, committee, session, position, message, approved_date, status,
                        created_date, updated_date
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    args: [
                        row['Unclaimed ID'],
                        row['Source Committee Entry ID'] || '',
                        row['Full Name'] || '',
                        row['Department'] || '',
                        String(row['Series'] || ''),
                        String(row['Mobile Number'] || ''),
                        row['Email'] || '',
                        row['Photo'] || '',
                        row['Committee'] || '',
                        row['Session'] || '',
                        row['Position'] || '',
                        row['Message'] || '',
                        excelDate(row['Approved Date']),
                        row['Status'] || '',
                        excelDate(row['Created Date']),
                        excelDate(row['Updated Date'])
                    ]
                });
                uncCount++;
            } catch (err) {
                console.error('  Unclaimed insert error:', err.message);
            }
        }
        console.log(`  Inserted ${uncCount} unclaimed profiles`);
    }

    // ============ 7. Unclaimed_Matches ============
    console.log('\n=== Seeding Unclaimed Matches ===');
    await db.execute(`CREATE TABLE IF NOT EXISTS unclaimed_matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id TEXT UNIQUE,
        unclaimed_id TEXT,
        member_id TEXT,
        match_score REAL,
        match_fields TEXT,
        status TEXT,
        created_date DATETIME
    )`);
    // 0 rows, skip

    // ============ 8. Unclaimed_Merge_Audit ============
    console.log('\n=== Seeding Unclaimed Merge Audit ===');
    await db.execute(`CREATE TABLE IF NOT EXISTS unclaimed_merge_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        audit_id TEXT UNIQUE,
        unclaimed_id TEXT,
        member_id TEXT,
        action TEXT,
        admin_email TEXT,
        date_time DATETIME,
        detail TEXT
    )`);
    // 0 rows, skip

    // ============ 9. PDACC Chance ============
    console.log('\n=== Seeding PDACC Chance ===');
    await db.execute(`CREATE TABLE IF NOT EXISTS pdacc_chance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT,
        label TEXT,
        sub TEXT,
        count TEXT,
        sort INTEGER
    )`);
    let chanceCount = 0;
    if (wb.SheetNames.includes('PDACC Chance')) {
        const data = xlsx.utils.sheet_to_json(wb.Sheets['PDACC Chance']);
        for (const row of data) {
            try {
                await db.execute({
                    sql: `INSERT INTO pdacc_chance (type, label, sub, count, sort) VALUES (?, ?, ?, ?, ?)`,
                    args: [row['Type'], row['Label'], row['Sub'] || '', row['Count'] || '', row['Sort'] || 0]
                });
                chanceCount++;
            } catch (err) {
                console.error('  PDACC Chance insert error:', err.message);
            }
        }
        console.log(`  Inserted ${chanceCount} PDACC Chance rows`);
    }

    // ============ 10. AssetCDN ============
    console.log('\n=== Seeding AssetCDN ===');
    await db.execute(`CREATE TABLE IF NOT EXISTS asset_cdn (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id TEXT UNIQUE,
        path TEXT,
        url TEXT,
        bytes INTEGER,
        source TEXT,
        mirrored_date DATETIME
    )`);
    let cdnCount = 0;
    if (wb.SheetNames.includes('AssetCDN')) {
        const data = xlsx.utils.sheet_to_json(wb.Sheets['AssetCDN']);
        for (const row of data) {
            try {
                await db.execute({
                    sql: `INSERT OR REPLACE INTO asset_cdn (file_id, path, url, bytes, source, mirrored_date) VALUES (?, ?, ?, ?, ?, ?)`,
                    args: [row['File ID'], row['Path'], row['URL'], row['Bytes'] || 0, row['Source'] || '', excelDate(row['Mirrored Date'])]
                });
                cdnCount++;
            } catch (err) {
                console.error('  CDN insert error:', err.message);
            }
        }
        console.log(`  Inserted ${cdnCount} AssetCDN rows`);
    }

    // ============ 11. Settings ============
    console.log('\n=== Seeding Settings ===');
    let settingsCount = 0;
    if (wb.SheetNames.includes('Settings')) {
        const data = xlsx.utils.sheet_to_json(wb.Sheets['Settings']);
        for (const row of data) {
            try {
                await db.execute({
                    sql: `INSERT OR REPLACE INTO settings (setting_key, setting_value) VALUES (?, ?)`,
                    args: [row['Setting'], String(row['Value'] || '')]
                });
                settingsCount++;
            } catch (err) {
                console.error('  Settings insert error:', err.message);
            }
        }
        console.log(`  Inserted ${settingsCount} settings`);
    }

    // ============ 12. Config ============
    console.log('\n=== Seeding Config ===');
    await db.execute(`CREATE TABLE IF NOT EXISTS config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        config_key TEXT UNIQUE,
        config_value TEXT
    )`);
    let configCount = 0;
    if (wb.SheetNames.includes('Config')) {
        const data = xlsx.utils.sheet_to_json(wb.Sheets['Config']);
        // Config sheet has unusual headers: "20" and "AlumniCutoffSeries"
        // Let's just dump them as key-value
        for (const row of data) {
            const keys = Object.keys(row);
            if (keys.length >= 2) {
                try {
                    await db.execute({
                        sql: `INSERT OR REPLACE INTO config (config_key, config_value) VALUES (?, ?)`,
                        args: [String(keys[1] ? row[keys[1]] : keys[0]), String(row[keys[0]] || '')]
                    });
                    configCount++;
                } catch (err) {
                    console.error('  Config insert error:', err.message);
                }
            }
        }
        console.log(`  Inserted ${configCount} config rows`);
    }

    // ============ Summary ============
    console.log('\n========== SEED COMPLETE ==========');
    console.log('Verify counts:');
    const tables = [
        'alumni', 'admins', 'admin_activity', 'polls', 'poll_votes',
        'unclaimed_profiles', 'unclaimed_matches', 'unclaimed_merge_audit',
        'pdacc_chance', 'asset_cdn', 'settings', 'config',
        'notices', 'social_posts', 'slideshow', 'pdacc_stats', 'pdacc_updates', 'pdacc_notices',
        'events', 'event_gallery', 'executive_committee'
    ];
    for (const t of tables) {
        try {
            const r = await db.execute(`SELECT COUNT(*) as c FROM ${t}`);
            console.log(`  ${t}: ${r.rows[0].c} rows`);
        } catch (err) {
            console.log(`  ${t}: TABLE MISSING`);
        }
    }
}

seed().catch(err => console.error('FATAL:', err));
