import { google } from 'googleapis';
import stream from 'stream';

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const ROOT_FOLDER_ID = '1pKusmYS424WJphqz5x2L46na43mQQs2T';

// OAuth2 Credentials
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
auth.setCredentials({ refresh_token: REFRESH_TOKEN });

const drive = google.drive({ version: 'v3', auth });

const folderCache = {};

export async function getOrCreateSubfolder(folderName) {
  if (folderCache[folderName]) return folderCache[folderName];

  const query = "name = '" + folderName + "' and '" + ROOT_FOLDER_ID + "' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
  const res = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  if (res.data.files.length > 0) {
    folderCache[folderName] = res.data.files[0].id;
    return folderCache[folderName];
  }

  const createRes = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [ROOT_FOLDER_ID]
    },
    fields: 'id'
  });
  
  await drive.permissions.create({
    fileId: createRes.data.id,
    requestBody: {
      role: 'reader',
      type: 'anyone'
    }
  });

  folderCache[folderName] = createRes.data.id;
  return folderCache[folderName];
}

export async function uploadBase64ToDrive(base64String, fileName, mimeType, subfolderName) {
  try {
    const parentFolderId = await getOrCreateSubfolder(subfolderName);

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
      url: "https://drive.google.com/uc?export=view&id=" + res.data.id
    };
  } catch (error) {
    console.error('Error uploading to Drive:', error.message);
    return { success: false, error: error.message };
  }
}

