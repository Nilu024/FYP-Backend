// routes/auth.js
const express = require("express");
const router = express.Router();
const { register, login, getMe, updateProfile, updatePassword, logout } = require("../controllers/authController");
const { protect } = require("../middleware/auth");

router.post("/register", register);
router.post("/login", login);
router.post("/logout", protect, logout);
router.get("/me", protect, getMe);
router.put("/profile", protect, updateProfile);
router.put("/password", protect, updatePassword);

module.exports = router;
