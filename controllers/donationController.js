const Donation = require("../models/Donation");
const Need = require("../models/Need");
const Charity = require("../models/Charity");
const { sendUserNotification } = require("../services/notificationService");
const { trackInteraction } = require("../services/knnService");
const { sendDonationConfirmEmail } = require("../services/emailService");
const User = require("../models/User");

// @desc    Create a donation
// @route   POST /api/donations
// @access  Private
const Razorpay = require("razorpay");

exports.createDonation = async (req, res, next) => {
  try {
    const {
      needId: needIdFromBody,
      need: needIdAlt,
      charityId: charityIdFromBody,
      charity: charityAlt,
      amount,
      message,
      isAnonymous,
      paymentMethod,
    } = req.body;

    // Validate Razorpay configuration
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({ 
        success: false, 
        error: "Payment gateway not configured. Please contact support." 
      });
    }

    const needId = needIdFromBody || needIdAlt;
    const charityId = charityIdFromBody || charityAlt;

    if (!needId) {
      return res.status(400).json({ success: false, error: "needId is required" });
    }

    if (!amount || amount < 10) {
      return res.status(400).json({ success: false, error: "Valid amount (>= ₹10) is required" });
    }

    const need = await Need.findById(needId).populate("charity");
    if (!need || need.status === "rejected" || need.status === "completed" || (need.deadline && new Date() > need.deadline)) {
      return res.status(404).json({ success: false, error: "Need not found or not accepting donations" });
    }

    // Create pending donation record
    const donation = await Donation.create({
      donor: req.user.id,
      charity: need.charity._id,
      need: needId,
      amount,
      message,
      isAnonymous,
      paymentMethod,
      status: "pending",
    });

    // Create Razorpay order
    const razorpayInstance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const razorpayOrder = await razorpayInstance.orders.create({
      amount: Math.round(amount * 100), // paise
      currency: "INR",
      receipt: `receipt_${donation._id}`,
      payment_capture: 1, // auto-capture
    });

    // Save order ID to donation
    donation.razorpayOrderId = razorpayOrder.id;
    await donation.save();

    res.status(201).json({
      success: true,
      data: {
        id: donation._id,
        key: process.env.RAZORPAY_KEY_ID,
        amount: amount * 100,
        currency: "INR",
        name: "AADHAR Charity Platform",
        description: `Support "${need.title}" by ${need.charity.name}`,
        order_id: razorpayOrder.id,
        prefill: {
          name: req.user.name,
          email: req.user.email,
          contact: req.user.phone || "",
        },
        theme: { color: "#f59e0b" }, // saffron
        modal: { ondismiss: () => { /* handle dismiss */ } },
      },
    });
    return;
    return;
  } catch (err) {
    next(err);
  }
};

// @desc    Get my donations
// @route   GET /api/donations/my
// @access  Private

// @desc    Get my donations
// @route   GET /api/donations/my
// @access  Private
exports.getMyDonations = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const donations = await Donation.find({ donor: req.user.id })
      .populate("charity", "name logo")
      .populate("need", "title category")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Donation.countDocuments({ donor: req.user.id });
    const totalAmount = await Donation.aggregate([
      { $match: { donor: req.user.id, status: "completed" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    res.json({
      success: true,
      count: donations.length,
      total,
      totalAmount: totalAmount[0]?.total || 0,
      data: donations,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Verify Razorpay payment
// @route   POST /api/donations/verify
// @access  Private
exports.verifyPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, donationId } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !donationId) {
      return res.status(400).json({ success: false, error: "Missing payment details" });
    }

    const donation = await Donation.findById(donationId).populate("need charity donor");
    if (!donation || donation.status !== "pending") {
      return res.status(400).json({ success: false, error: "Invalid donation" });
    }

    if (donation.razorpayOrderId && donation.razorpayOrderId !== razorpay_order_id) {
      return res.status(400).json({ success: false, error: "Order ID mismatch" });
    }

    // Verify Razorpay signature
    const crypto = require("crypto");
    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generated_signature !== razorpay_signature) {
      // Mark as failed
      donation.status = "failed";
      await donation.save();
      return res.status(400).json({ success: false, error: "Payment verification failed" });
    }

    // Payment successful - complete donation
    donation.status = "completed";
    donation.razorpayPaymentId = razorpay_payment_id;
    donation.razorpaySignature = razorpay_signature;
    donation.transactionId = razorpay_payment_id;
    donation.receiptNumber = `AADHAR-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    await donation.save();

    // Update need & charity stats
    const need = donation.need;
    if (need) {
      need.raisedAmount += donation.amount;
      need.donorCount += 1;
      if (need.raisedAmount >= need.targetAmount) need.status = "completed";
      await need.save();
    }

    await Charity.findByIdAndUpdate(donation.charity._id, {
      $inc: { totalRaised: donation.amount, totalDonors: 1 },
    });

    // Notifications & email
    const user = donation.donor;
    await sendUserNotification(user.id, {
      title: "Donation Confirmed! 🎉",
      body: `₹${donation.amount} donated to ${donation.charity.name}. Thank you!`,
      type: "donation_confirmed",
      data: { donationId: donation._id.toString(), url: `/donations/${donation._id}` },
    }).catch(() => {});

    sendDonationConfirmEmail(user, donation, need, donation.charity).catch(() => {});

    res.json({ success: true, data: donation });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single donation
// @route   GET /api/donations/:id
// @access  Private
exports.getDonation = async (req, res, next) => {
  try {
    const donation = await Donation.findById(req.params.id)
      .populate("charity", "name logo contact")
      .populate("need", "title category");

    if (!donation) return res.status(404).json({ success: false, error: "Donation not found" });
    if (donation.donor.toString() !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }

    res.json({ success: true, data: donation });
  } catch (err) {
    next(err);
  }
};

// @desc    Get donations for a charity (charity dashboard)
// @route   GET /api/donations/charity
// @access  Private (charity)
exports.getCharityDonations = async (req, res, next) => {
  try {
    const Charity = require("../models/Charity");
    const charity = await Charity.findOne({ owner: req.user.id });
    if (!charity) return res.status(403).json({ success: false, error: "No charity for this account" });

    const donations = await Donation.find({ charity: charity._id, status: "completed" })
      .populate("donor", "name avatar")
      .populate("need", "title")
      .sort({ createdAt: -1 })
      .limit(50);

    const stats = await Donation.aggregate([
      { $match: { charity: charity._id, status: "completed" } },
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]);

    res.json({
      success: true,
      stats: stats[0] || { total: 0, count: 0 },
      data: donations,
    });
  } catch (err) {
    next(err);
  }
};
