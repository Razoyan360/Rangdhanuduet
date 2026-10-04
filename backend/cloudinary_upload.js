import { v2 as cloudinary } from 'cloudinary';

// Using the provided CLOUDINARY_URL
cloudinary.config({
  cloudinary_url: process.env.CLOUDINARY_URL || 'cloudinary://151434745655158:HgeFEF0d2cCgV3Kln85H8wfKFh0@cax3cl27'
});

export async function uploadBase64ToCloudinary(base64String, folderName) {
  try {
    // Check if it already has the data URI prefix
    let imageStr = base64String;
    if (!imageStr.startsWith('data:image')) {
      // Best guess prefix if not provided
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
