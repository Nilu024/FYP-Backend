const express = require("express");
const router = express.Router();
const { getVapidKey, subscribe, unsubscribe, getNotifications, markAsRead, deleteNotification } = require("../controllers/notificationController");
const { protect } = require("../middleware/auth");

router.get("/vapid-key", getVapidKey);
router.post("/subscribe", protect, subscribe);
router.delete("/subscribe", protect, unsubscribe);
router.get("/", protect, getNotifications);
router.patch("/read", protect, markAsRead);
router.delete("/:id", protect, deleteNotification);

module.exports = router;
