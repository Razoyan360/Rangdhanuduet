const { google } = require('googleapis');
const stream = require('stream');

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const ROOT_FOLDER_ID = '1pKusmYS424WJphqz5x2L46na43mQQs2T'; // The folder shared by the user

const auth = new google.auth.GoogleAuth({
  keyFile: './gcp-service-account.json',
  scopes: SCOPES,
});

const drive = google.drive({ version: 'v3', auth });

// Cache subfolder IDs to avoid multiple API calls
const folderCache = {};

/**
 * Gets or creates a subfolder inside the ROOT_FOLDER_ID.
 */
async function getOrCreateSubfolder(folderName) {
  if (folderCache[folderName]) return folderCache[folderName];

  // Search if folder exists
  const query = `name = '${folderName}' and '${ROOT_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const res = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  if (res.data.files.length > 0) {
    folderCache[folderName] = res.data.files[0].id;
    return folderCache[folderName];
  }

  // If not exists, create it
  const createRes = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [ROOT_FOLDER_ID]
    },
    fields: 'id'
  });
  
  folderCache[folderName] = createRes.data.id;
  return folderCache[folderName];
}

/**
 * Uploads a base64 string as a file to Google Drive in the specified subfolder.
 * Returns the file ID and direct view URL.
 */
async function uploadBase64ToDrive(base64String, fileName, mimeType, subfolderName) {
  try {
    const parentFolderId = await getOrCreateSubfolder(subfolderName);

    // Convert base64 to buffer and then to stream
    const buffer = Buffer.from(base64String, 'base64');
    const bufferStream = new stream.PassThrough();
    bufferStream.end(buffer);

    const fileMetadata = {
      name: fileName,
      parents: [parentFolderId]
    };
    
    const media = {
      mimeType: mimeType,
      body: bufferStream
    };

    const res = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, webViewLink'
    });

    return {
      success: true,
      fileId: res.data.id,
      url: \`https://drive.google.com/uc?export=view&id=\${res.data.id}\`
    };
  } catch (error) {
    console.error('Error uploading to Drive:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  uploadBase64ToDrive,
  getOrCreateSubfolder
};
