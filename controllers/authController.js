const User = require("../models/User");
const bcrypt = require("bcryptjs");
const { sendWelcomeEmail, sendOTPEmail } = require("../services/emailService");
const admin = require('../config/firebase');

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

// Register
const register = async (req, res, next) => {
  try {
    console.log("🔐 Register attempt:", { email: req.body.email, role: req.body.role });

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

    console.log("👤 User lookup result:", user ? "existing user found" : "new user");

    if (user && user.isVerified) {
      return res.status(400).json({ success: false, error: "User already exists" });
    }

    const createOrUpdateLocalUser = async () => {
      if (user && !user.isVerified) {
        user.name = name;
        user.password = password;
        user.role = normalizedRole;
        user.location = location || user.location;
        user.otp = hashedOtp;
        user.otpExpiry = otpExpiry;
        await user.save();
        console.log("🔄 Updated existing unverified user");
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
        console.log("🆕 Created new user");
      }

      if (admin) {
        try {
          const existingFbUser = await admin.auth().getUserByEmail(email);
          if (!user.firebaseUid) {
            user.firebaseUid = existingFbUser.uid;
            await user.save();
            console.log("🔗 Linked existing Firebase user");
          }
        } catch (fbErr) {
          if (fbErr.code === 'auth/user-not-found' || fbErr.errorInfo?.code === 'auth/user-not-found') {
            const created = await admin.auth().createUser({ email, password, displayName: name });
            user.firebaseUid = created.uid;
            await user.save();
            console.log("🆕 Created Firebase user");
          } else {
            console.warn('Firebase user sync failed:', fbErr.message || fbErr);
          }
        }
      } else {
        console.warn('Firebase admin not configured, skipping Firebase user creation');
      }
    };

    await createOrUpdateLocalUser();

    console.log("📧 Attempting to send OTP email...");
    const emailSent = await sendOTPEmail(user, otp);

    if (!emailSent) {
      console.error("❌ Email sending failed");
      return res.status(500).json({
        success: false,
        error: "Could not send verification email. Please check email settings and try again.",
      });
    }

    console.log("✅ Registration successful, OTP sent");
    res.status(201).json({
      success: true,
      message: "Verification code sent to your email",
      userId: user._id,
    });
  } catch (err) {
    console.error("❌ Register error:", err);
    next(err);
  }
};

// Login
const login = async (req, res, next) => {
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

// Get Me
const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).populate("followedCharities", "name logo");
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

// Update Profile
const updateProfile = async (req, res, next) => {
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

// Update Password
const updatePassword = async (req, res, next) => {
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

// Verify Email OTP
const verifyEmailOTP = async (req, res, next) => {
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

// Resend Email OTP
const resendEmailOTP = async (req, res, next) => {
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

// Logout
const logout = async (req, res) => {
  res.json({ success: true, message: "Logged out successfully" });
};

// Verify Firebase ID Token
const verifyFirebaseToken = async (req, res, next) => {
  if (!admin) {
    return res.status(503).json({ success: false, error: 'Firebase Admin not configured - contact support' });
  }
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ success: false, error: "ID token required" });
    }

    const decodedToken = await admin.auth().verifyIdToken(idToken);
    let user = await User.findOne({ firebaseUid: decodedToken.uid });

    if (!user) {
      user = await User.create({
        firebaseUid: decodedToken.uid,
        name: decodedToken.name || decodedToken.email?.split('@')[0] || 'User',
        email: decodedToken.email,
        role: 'donor',
        isVerified: true,
      });
    }

    const token = user.getSignedJwtToken();
    const userData = user.toObject();
    delete userData.password;

    res.json({
      success: true,
      token,
      user: userData,
    });
  } catch (err) {
    console.error('Firebase token verification error:', err.message);
    res.status(401).json({ success: false, error: 'Invalid Firebase token: ' + err.message });
  }
};

module.exports = {
  register,
  login,
  getMe,
  updateProfile,
  updatePassword,
  logout,
  verifyEmailOTP: verifyEmailOTP,
  resendEmailOTP: resendEmailOTP,
  verifyFirebaseToken,
};

