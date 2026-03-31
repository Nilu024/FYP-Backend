const express = require("express");
const router = express.Router();
const {
  getDashboardStats,
  getPendingCharities,
  getPendingNeeds,
  getAllUsers,
  toggleUserStatus,
  getAnalytics,
} = require("../controllers/adminController");
const { protect, authorize } = require("../middleware/auth");

router.use(protect, authorize("admin"));

router.get("/dashboard", getDashboardStats);
router.get("/stats", getDashboardStats);
router.get("/charities/pending", getPendingCharities);
router.get("/needs/pending", getPendingNeeds);
router.get("/users", getAllUsers);
router.get("/analytics", getAnalytics);
router.patch("/users/:id/status", toggleUserStatus);
router.patch("/users/:id/toggle", toggleUserStatus);

module.exports = router;
