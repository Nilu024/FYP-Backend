const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const User = require("../models/User");

// @desc    Get user public profile
router.get("/:id", async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select("name avatar role createdAt");
    if (!user) return res.status(404).json({ success: false, error: "User not found" });
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

// @desc    Update user location
router.patch("/location", protect, async (req, res, next) => {
  try {
    const { coordinates, address, city, state, pincode } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { location: { type: "Point", coordinates, address, city, state, pincode } },
      { new: true }
    );
    res.json({ success: true, data: user.location });
  } catch (err) { next(err); }
});

// @desc    Update preferences
router.patch("/preferences", protect, async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { "preferences.categories": req.body.categories, "preferences.maxDistanceKm": req.body.maxDistanceKm },
      { new: true }
    );
    res.json({ success: true, data: user.preferences });
  } catch (err) { next(err); }
});

module.exports = router;
