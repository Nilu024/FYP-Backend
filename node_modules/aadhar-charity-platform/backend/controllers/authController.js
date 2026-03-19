const User = require("../models/User");
const bcrypt = require("bcryptjs");
const { sendWelcomeEmail, sendOTPEmail } = require("../services/emailService");

// Helper to send token response
const sendTokenResponse = (user, statusCode, res) => {
  const token = user.getSignedJwtToken();
  const userData = user.toObject();
  delete userData.password;

  res.status(statusCode).json({
    success: true,
    token,
    user: userData,
  });
};

const generateOTPData = async () => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const hashedOtp = await bcrypt.hash(otp, 12);
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

  return { otp, hashedOtp, otpExpiry };
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, role, location } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: "Name, email and password are required",
      });
    }

    let user = await User.findOne({ email }).select("+otp +otpExpiry");
    const { otp, hashedOtp, otpExpiry } = await generateOTPData();
    const normalizedRole = role === "charity" ? "charity" : "donor";

    if (user && user.isVerified) {
      return res.status(400).json({ success: false, error: "User already exists" });
    }

    if (user && !user.isVerified) {
      user.name = name;
      user.password = password;
      user.role = normalizedRole;
      user.location = location || user.location;
      user.otp = hashedOtp;
      user.otpExpiry = otpExpiry;
      await user.save();
    } else {
      user = await User.create({
        name,
        email,
        password,
        role: normalizedRole,
        location: location || undefined,
        isVerified: false,
        otp: hashedOtp,
        otpExpiry,
      });
    }

    const emailSent = await sendOTPEmail(user, otp);

    if (!emailSent) {
      return res.status(500).json({
        success: false,
        error: "Could not send verification email. Please check email settings and try again.",
      });
    }

    res.status(201).json({
      success: true,
      message: "Verification code sent to your email",
      userId: user._id,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Email and password are required" });
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({ success: false, error: "Invalid credentials" });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: "Invalid credentials" });
    }

    if (!user.isVerified) {
      return res.status(401).json({ success: false, error: "Please verify your email first" });
    }

    user.lastLogin = new Date();
    await user.save();

    sendTokenResponse(user, 200, res);
  } catch (err) {
    next(err);
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).populate("followedCharities", "name logo");
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, phone, location, preferences } = req.body;
    const updateData = {};

    if (name) updateData.name = name;
    if (phone) updateData.phone = phone;
    if (location) updateData.location = location;
    if (preferences) updateData.preferences = { ...req.user.preferences, ...preferences };

    const user = await User.findByIdAndUpdate(req.user.id, updateData, {
      new: true,
      runValidators: true,
    });

    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

// @desc    Update password
// @route   PUT /api/auth/password
// @access  Private
exports.updatePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id).select("+password");

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: "Current password is incorrect" });
    }

    user.password = newPassword;
    await user.save();

    sendTokenResponse(user, 200, res);
  } catch (err) {
    next(err);
  }
};

// @desc    Verify email OTP
// @route   POST /api/auth/verify-email
// @access  Public
exports.verifyEmailOTP = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        error: "Email and verification code are required",
      });
    }

    const user = await User.findOne({ email }).select("+otp +otpExpiry");
    if (!user) {
      return res.status(400).json({ success: false, error: "User not found" });
    }

    if (user.isVerified) {
      return res.status(400).json({ success: false, error: "Email already verified" });
    }

    if (!user.otp || !user.otpExpiry || Date.now() > user.otpExpiry.getTime()) {
      return res.status(400).json({
        success: false,
        error: "Verification code has expired. Please request a new one",
      });
    }

    const isMatch = await bcrypt.compare(otp, user.otp);
    if (!isMatch) {
      return res.status(400).json({ success: false, error: "Invalid verification code" });
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    sendWelcomeEmail(user).catch(console.error);

    sendTokenResponse(user, 200, res);
  } catch (err) {
    next(err);
  }
};

// @desc    Resend email OTP
// @route   POST /api/auth/resend-verification
// @access  Public
exports.resendEmailOTP = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: "Email is required" });
    }

    const user = await User.findOne({ email }).select("+otp +otpExpiry");
    if (!user) {
      return res.status(400).json({ success: false, error: "User not found" });
    }

    if (user.isVerified) {
      return res.status(400).json({ success: false, error: "Email already verified" });
    }

    const { otp, hashedOtp, otpExpiry } = await generateOTPData();

    user.otp = hashedOtp;
    user.otpExpiry = otpExpiry;
    await user.save();

    const emailSent = await sendOTPEmail(user, otp);

    if (!emailSent) {
      return res.status(500).json({
        success: false,
        error: "Could not resend verification email. Please try again later.",
      });
    }

    res.json({
      success: true,
      message: "A new verification code has been sent",
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Logout
// @route   POST /api/auth/logout
// @access  Private
exports.logout = async (req, res) => {
  res.json({ success: true, message: "Logged out successfully" });
};
