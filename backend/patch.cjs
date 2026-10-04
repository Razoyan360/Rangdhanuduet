const fs = require('fs');
let js = fs.readFileSync('D:/Rangdhanu Turso/backend/server.js', 'utf8');

js = js.replace(
    /WHERE status = 'APPROVED' AND \(record_type IS NULL OR record_type != 'Teacher'\)/g,
    "WHERE status = 'APPROVED' AND (record_type IS NULL OR (record_type != 'Teacher' AND record_type != 'Officer'))"
);

js = js.replace(
    /WHERE status = 'APPROVED' AND record_type = 'Teacher'/g,
    "WHERE status = 'APPROVED' AND (record_type = 'Teacher' OR record_type = 'Officer')"
);

const facultyRegex = /if \(action === 'faculty'\) \{[\s\S]*?\/\/ Find alumni who are faculty at DUET \(based on email or organization\)[\s\S]*?return res\.json\(\{ data \}\);\s*\}/g;
js = js.replace(facultyRegex, '');

fs.writeFileSync('D:/Rangdhanu Turso/backend/server.js', js);
console.log('Done');
