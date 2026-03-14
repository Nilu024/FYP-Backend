const express = require("express");
const router = express.Router();
const { getRecommendations, getNearbyCauses, getForYouFeed, trackUserInteraction } = require("../controllers/recommendationController");
const { protect } = require("../middleware/auth");

router.get("/", protect, getRecommendations);
router.get("/nearby", protect, getNearbyCauses);
router.get("/for-you", protect, getForYouFeed);
router.post("/track", protect, trackUserInteraction);

module.exports = router;
