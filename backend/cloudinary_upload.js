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

export async function uploadBase64ToCloudinary(base64String, folderName) {
  try {
    let imageStr = base64String;
    if (!imageStr.startsWith('data:image')) {
      imageStr = `data:image/jpeg;base64,${base64String}`;
    }

    const result = await cloudinary.uploader.upload(imageStr, {
      folder: folderName,
      resource_type: 'image',
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
