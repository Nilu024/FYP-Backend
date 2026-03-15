// routes/donations.js
const express = require("express");
const router = express.Router();
const { createDonation, getMyDonations, getDonation, getCharityDonations } = require("../controllers/donationController");
const { protect, authorize } = require("../middleware/auth");

router.post("/", protect, createDonation);
router.get("/my", protect, getMyDonations);
router.get("/charity", protect, authorize("charity"), getCharityDonations);
router.get("/:id", protect, getDonation);

module.exports = router;
