const express = require("express");
const path = require("path");
const router = express.Router();

const { protect, authorize } = require("../middleware/auth");
const {
  uploadCharityImages,
  uploadNeedImages,
} = require("../middleware/upload");

// Upload charity images (owner-only or admin)
router.post(
  "/charities/:charityId",
  protect,
  authorize("charity"),
  uploadCharityImages.array("images", 6),
  (req, res) => {
    try {
      const { charityId } = req.params;
      if (!req.files || req.files.length === 0) {
        return res
          .status(400)
          .json({ success: false, error: "No images uploaded" });
      }

      // These are saved into Mongo. We store public URLs:
      // /uploads/charities/<filename>
      const imageUrls = req.files.map(
        (f) => `/uploads/charities/${path.basename(f.filename)}`,
      );

      // Update Charity.images
      const Charity = require("../models/Charity");
      return Charity.findByIdAndUpdate(
        charityId,
        { $push: { images: { $each: imageUrls } } },
        { new: true },
      )
        .then((charity) => {
          if (!charity)
            return res
              .status(404)
              .json({ success: false, error: "Charity not found" });
          res.json({ success: true, data: charity });
        })
        .catch((e) =>
          res.status(500).json({ success: false, error: e.message }),
        );
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  },
);

// Upload need images (owner-only or admin)
router.post(
  "/needs/:needId",
  protect,
  authorize("charity"),
  uploadNeedImages.array("images", 6),
  async (req, res) => {
    try {
      const { needId } = req.params;

      if (!req.files || req.files.length === 0) {
        return res
          .status(400)
          .json({ success: false, error: "No images uploaded" });
      }

      const imageUrls = req.files.map(
        (f) => `/uploads/needs/${path.basename(f.filename)}`,
      );

      const Need = require("../models/Need");

      // Security: ensure the logged-in charity owns this need
      const need = await Need.findById(needId).populate("charity", "owner");
      if (!need)
        return res
          .status(404)
          .json({ success: false, error: "Need not found" });

      const ownerId = need.charity?.owner?.toString?.();
      const reqUserId = req.user?.id?.toString?.();

      if (ownerId !== reqUserId && req.user.role !== "admin") {
        return res
          .status(403)
          .json({
            success: false,
            error: "Not authorized to upload for this need",
          });
      }

      need.images = [...(need.images || []), ...imageUrls];
      await need.save();

      res.json({ success: true, data: need });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  },
);

module.exports = router;
