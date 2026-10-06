-- schema.sql for Rangdhanu Turso Migration (SQLite / LibSQL compatible)

-- ==========================================
-- 1. ALUMNI & MEMBERS DIRECTORY
-- ==========================================
CREATE TABLE IF NOT EXISTS alumni (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id TEXT UNIQUE,
    full_name_english TEXT NOT NULL,
    mobile_number TEXT,
    whatsapp_number TEXT,
    email TEXT,
    present_address TEXT,
    permanent_address TEXT,
    blood_group TEXT,
    department TEXT,
    series TEXT,
    batch TEXT,
    employment_type TEXT,
    current_organization TEXT,
    current_designation TEXT,
    work_location TEXT,
    former_position TEXT,
    passport_size_image TEXT,
    cover_photo TEXT,
    cover_position TEXT,
      record_type TEXT,
      academic_degree TEXT,
      office_phone TEXT,
    social_links TEXT,
    positions TEXT,
    work_history TEXT,
    education TEXT,
    thesis_topic TEXT,
    thesis_details TEXT,
    papers TEXT,
    status TEXT,
    profile_visibility TEXT,
    registration_date DATETIME,
    approved_date DATETIME,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    admin_note TEXT,
    visible_mobile_number BOOLEAN DEFAULT 1,
    visible_whatsapp_number BOOLEAN DEFAULT 1,
    visible_email BOOLEAN DEFAULT 1,
    visible_permanent_address BOOLEAN DEFAULT 1,
    visible_present_address BOOLEAN DEFAULT 1,
    visible_social_links BOOLEAN DEFAULT 1,
    blood_donor BOOLEAN DEFAULT 0,
    last_blood_donation DATETIME
);

-- ==========================================
-- 2. AUTHENTICATION & USERS
-- ==========================================
CREATE TABLE IF NOT EXISTS members_auth (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id TEXT UNIQUE,
    email TEXT UNIQUE,
    mobile_number TEXT,
    password_hash TEXT,
    account_status TEXT,
    created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME,
    failed_login_attempts INTEGER DEFAULT 0,
    last_password_change DATETIME,
    FOREIGN KEY(member_id) REFERENCES alumni(member_id)
);

CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id TEXT UNIQUE,
    full_name TEXT,
    email TEXT UNIQUE NOT NULL,
    role TEXT,
    status TEXT,
    created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
);

-- ==========================================
-- 3. EVENTS & GALLERIES
-- ==========================================
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT UNIQUE,
    event_name TEXT NOT NULL,
    category TEXT,
    short_description TEXT,
    full_description TEXT,
    event_date DATE,
    start_time TEXT,
    end_time TEXT,
    venue TEXT,
    google_maps_link TEXT,
    organized_by TEXT,
    contact_person TEXT,
    contact_number TEXT,
    main_image TEXT,
    registration_link TEXT,
    facebook_link TEXT,
    submitted_by TEXT,
    submitter_email TEXT,
    submitter_mobile TEXT,
    status TEXT,
    featured BOOLEAN DEFAULT 0,
    submitted_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved_date DATETIME,
    sponsors TEXT,
    admin_note TEXT
);

CREATE TABLE IF NOT EXISTS event_gallery (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gallery_id TEXT UNIQUE,
    event_id TEXT,
    image_url TEXT,
    caption TEXT,
    sort_order INTEGER,
    uploaded_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT,
    admin_note TEXT,
    FOREIGN KEY(event_id) REFERENCES events(event_id)
);

-- ==========================================
-- 4. COMMITTEES & FACULTY
-- ==========================================
CREATE TABLE IF NOT EXISTS executive_committee (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id TEXT UNIQUE,
    committee_name TEXT,
    session_year TEXT,
    position TEXT,
    full_name TEXT,
    department TEXT,
    series TEXT,
    mobile_number TEXT,
    email TEXT,
    message TEXT,
    photo_url TEXT,
    designation TEXT,
    organization TEXT,
    status TEXT,
    target_member_id TEXT,
    submitted_by TEXT,
    submission_mode TEXT,
    submitted_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved_date DATETIME,
    admin_note TEXT
);

-- ==========================================
-- 5. NOTICES, SOCIAL POSTS & SLIDESHOW
-- ==========================================
CREATE TABLE IF NOT EXISTS notices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    notice_id TEXT UNIQUE,
    kind TEXT,
    title TEXT,
    body TEXT,
    file_url TEXT,
    file_type TEXT,
    file_id TEXT,
    is_show BOOLEAN DEFAULT 1,
    posted_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_date DATETIME,
    admin_note TEXT
);

CREATE TABLE IF NOT EXISTS social_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id TEXT UNIQUE,
    kind TEXT,
    title TEXT,
    caption TEXT,
    link TEXT,
    image_url TEXT,
    is_show BOOLEAN DEFAULT 1,
    health TEXT,
    checked_date DATETIME,
    posted_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_date DATETIME
);

CREATE TABLE IF NOT EXISTS slideshow (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id TEXT UNIQUE,
    caption TEXT,
    badge TEXT,
    file_name TEXT,
    sort_order INTEGER,
    is_show BOOLEAN DEFAULT 1,
    place TEXT,
    posted_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_date DATETIME,
    admin_note TEXT
);

-- ==========================================
-- 6. PDACC (Prokoushali)
-- ==========================================
CREATE TABLE IF NOT EXISTS pdacc_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stat_key TEXT UNIQUE,
    kicker TEXT,
    title TEXT,
    figure TEXT,
    unit TEXT,
    note TEXT,
    years TEXT,
    years_from TEXT,
    updated_date DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pdacc_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    update_id TEXT UNIQUE,
    title TEXT,
    description TEXT,
    link TEXT,
    image_url TEXT,
    image_id TEXT,
    is_show BOOLEAN DEFAULT 1,
    posted_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_date DATETIME,
    admin_note TEXT
);

CREATE TABLE IF NOT EXISTS pdacc_notices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    line_id TEXT UNIQUE,
    notice_text TEXT,
    is_show BOOLEAN DEFAULT 1,
    posted_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_date DATETIME,
    admin_note TEXT
);

-- ==========================================
-- 7. POLLS
-- ==========================================
CREATE TABLE IF NOT EXISTS polls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    poll_id TEXT UNIQUE,
    question TEXT,
    poll_type TEXT,
    max_pick INTEGER DEFAULT 1,
    options TEXT,
    eligible_series TEXT,
    start_at DATETIME,
    end_at DATETIME,
    status TEXT,
    result_visibility TEXT,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
);

CREATE TABLE IF NOT EXISTS poll_votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vote_id TEXT UNIQUE,
    poll_id TEXT,
    member_id TEXT,
    voter_name TEXT,
    choice TEXT,
    voted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(poll_id) REFERENCES polls(poll_id),
    FOREIGN KEY(member_id) REFERENCES alumni(member_id)
);

-- ==========================================
-- 8. SYSTEM LOGS & CONFIG
-- ==========================================
CREATE TABLE IF NOT EXISTS settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT
);

CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    log_id TEXT UNIQUE,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_member_id TEXT,
    user_email TEXT,
    action TEXT,
    target_member_id TEXT,
    details TEXT,
    ip_address TEXT,
    result TEXT
);

-- ==========================================
-- 9. REUNION CONTENT
-- ==========================================
CREATE TABLE IF NOT EXISTS reunion_parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    part_number INTEGER UNIQUE,
    icon TEXT,
    title_bn TEXT,
    title_en TEXT,
    video_link TEXT,
    desc_bn TEXT,
    desc_en TEXT,
    video_link TEXT,
    desc_bn TEXT,
    desc_en TEXT
);

CREATE TABLE IF NOT EXISTS reunion_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    photo_id TEXT UNIQUE,
    part_number INTEGER,
    image_url TEXT,
    caption TEXT,
    sort_order INTEGER,
    uploaded_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(part_number) REFERENCES reunion_parts(part_number)
);
