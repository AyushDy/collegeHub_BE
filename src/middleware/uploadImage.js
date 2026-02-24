const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

/**
 * Factory — returns a multer instance configured for a specific Cloudinary folder.
 * Usage:  uploadImage("profile_pictures").single("image")
 */
const uploadImage = (folder = "collegehub") => {
  const storage = new CloudinaryStorage({
    cloudinary,
    params: {
      folder: `collegehub/${folder}`,
      allowed_formats: ["jpg", "jpeg", "png", "webp"],
      transformation: [{ quality: "auto", fetch_format: "auto" }],
    },
  });

  return multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith("image/")) cb(null, true);
      else cb(new Error("Only image files (jpg, png, webp) are allowed."), false);
    },
  });
};

module.exports = uploadImage;
