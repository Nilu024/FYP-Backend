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

    const needId = needIdFromBody || needIdAlt;
    const charityId = charityIdFromBody || charityAlt;

    if (!needId) {
      return res.status(400).json({ success: false, error: "needId is required" });
    }

    const need = await Need.findById(needId).populate("charity");
    if (!need || need.status === "rejected" || need.status === "completed" || (need.deadline && new Date() > need.deadline)) {
      return res.status(404).json({ success: false, error: "Need not found or not accepting donations" });
    }

    // Create donation record (status: pending — real payment gateway would update this)
    const donation = await Donation.create({
      donor: req.user.id,
      charity: need.charity._id,
      need: needId,
      amount,
      message,
      isAnonymous,
      paymentMethod,
      // Simulate completed for demo — replace with payment gateway callback
      status: "completed",
      transactionId: `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
    });

    // Update need raised amount
    need.raisedAmount += amount;
    need.donorCount += 1;
    if (need.raisedAmount >= need.targetAmount) need.status = "completed";
    await need.save();

    // Update charity stats
    await Charity.findByIdAndUpdate(need.charity._id, {
      $inc: { totalRaised: amount, totalDonors: 1 },
    });

    // Track interaction for KNN
    const user = await User.findById(req.user.id);
    await trackInteraction(user, need.category, need.charity._id, "donate");

    // Push notification to donor
    await sendUserNotification(req.user.id, {
      title: "Donation Confirmed! 🎉",
      body: `₹${amount} donated to ${need.charity.name}. Thank you!`,
      type: "donation_confirmed",
      data: { donationId: donation._id.toString(), url: `/donations/${donation._id}` },
    }).catch(() => {});

    // Email receipt (non-blocking)
    sendDonationConfirmEmail(user, donation, need, need.charity).catch(() => {});

    res.status(201).json({ success: true, data: donation });
  } catch (err) {
    next(err);
  }
};

// @desc    Get my donations
// @route   GET /api/donations/my
// @access  Private
exports.getMyDonations = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const donations = await Donation.find({ donor: req.user.id, status: "completed" })
      .populate("charity", "name logo")
      .populate("need", "title category")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Donation.countDocuments({ donor: req.user.id, status: "completed" });
    const totalAmount = await Donation.aggregate([
      { $match: { donor: req.user.id._id || req.user._id, status: "completed" } },
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
