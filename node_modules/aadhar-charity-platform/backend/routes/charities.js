const express = require("express");
const router = express.Router();
const { getCharities, getCharity, createCharity, updateCharity, toggleFollow, verifyCharity, getMyCharity } = require("../controllers/charityController");
const { protect, authorize } = require("../middleware/auth");

router.get("/", getCharities);
router.get("/my", protect, authorize("charity"), getMyCharity);
router.get("/:id", getCharity);
router.post("/", protect, authorize("charity"), createCharity);
router.put("/:id", protect, updateCharity);
router.post("/:id/follow", protect, toggleFollow);
router.patch("/:id/verify", protect, authorize("admin"), verifyCharity);

module.exports = router;
