const multer = require("multer");
const path = require("path");
const fs = require("fs");

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const storageFor = (baseDir) => {
  ensureDir(baseDir);

  return multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, baseDir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeExt = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)
        ? ext
        : ".jpg";
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${file.fieldname}-${unique}${safeExt}`);
    },
  });
};

const fileFilter = (req, file, cb) => {
  const okTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (okTypes.includes(file.mimetype)) cb(null, true);
  else cb(new Error("Only image files are allowed (jpg/png/webp/gif)"));
};

const makeUpload = (folderName) => {
  const baseDir = path.join(__dirname, "..", "uploads", folderName);
  return multer({
    storage: storageFor(baseDir),
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per image (adjust if needed)
  });
};

module.exports = {
  uploadCharityImages: makeUpload("charities"),
  uploadNeedImages: makeUpload("needs"),
};
