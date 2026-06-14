const express = require("express");
const router = express.Router();
const { getNeeds, getNeed, createNeed, updateNeed, updateNeedStatus, getNeedsByCharity } = require("../controllers/needController");
const { protect, authorize, optionalAuth } = require("../middleware/auth");

router.get("/", getNeeds);
router.get("/charity/:charityId", optionalAuth, getNeedsByCharity);
router.get("/:id", getNeed);
router.post("/", protect, authorize("charity"), createNeed);
router.put("/:id", protect, updateNeed);
router.patch("/:id/status", protect, authorize("admin"), updateNeedStatus);

module.exports = router;
