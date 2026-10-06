import { v2 as cloudinary } from 'cloudinary';

const url = process.env.CLOUDINARY_URL || 'cloudinary://151434745655158:HgeFEF0d2cCgV3Kln85H8wfKFh0@cax3cl27';
const cleanUrl = url.replace('cloudinary://', '');
const [api_key, rest] = cleanUrl.split(':');
const [api_secret, cloud_name] = rest.split('@');

cloudinary.config({
  cloud_name,
  api_key,
  api_secret
});

export async function uploadBase64ToCloudinary(base64String, folderName, mimeType = 'image/jpeg') {
  try {
    let imageStr = base64String;
    if (!/^data:/i.test(imageStr)) {
      imageStr = `data:${mimeType};base64,${base64String}`;
    }

    const result = await cloudinary.uploader.upload(imageStr, {
      folder: folderName,
      resource_type: String(mimeType).toLowerCase() === 'application/pdf' ? 'raw' : 'image',
    });

    return {
      success: true,
      fileId: result.public_id,
      url: result.secure_url
    };
  } catch (error) {
    console.error('Error uploading to Cloudinary:', error.message);
    return { success: false, error: error.message };
  }
}
