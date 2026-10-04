const xlsx = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '..', 'Format Alumni Directory Sheet (1).xlsx');
const workbook = xlsx.readFile(filePath);

const result = {};

for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet['!ref']) continue;
    
    // Get range to only read the first row (headers)
    const range = xlsx.utils.decode_range(sheet['!ref']);
    
    // Read only first row
    const headers = [];
    for(let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = {c:C, r:0}; // First row (0-indexed)
        const cellRef = xlsx.utils.encode_cell(cellAddress);
        const cell = sheet[cellRef];
        headers.push(cell ? cell.v : null);
    }
    result[sheetName] = headers;
}

console.log(JSON.stringify(result, null, 2));
