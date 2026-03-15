const User = require("../models/User");
const Charity = require("../models/Charity");
const Need = require("../models/Need");
const Donation = require("../models/Donation");

// @desc    Admin dashboard stats
// @route   GET /api/admin/stats
// @access  Private (admin)
exports.getDashboardStats = async (req, res, next) => {
  try {
    const [users, charities, needs, donations] = await Promise.all([
      User.countDocuments(),
      Charity.countDocuments(),
      Need.countDocuments(),
      Donation.aggregate([{ $match: { status: "completed" } }, { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } }]),
    ]);

    const pendingCharities = await Charity.countDocuments({ isVerified: false });
    const pendingNeeds = await Need.countDocuments({ status: "pending" });
    const criticalNeeds = await Need.countDocuments({ urgency: "critical", status: "approved" });

    // Monthly donation trend (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyDonations = await Donation.aggregate([
      { $match: { status: "completed", createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    // Category breakdown
    const categoryBreakdown = await Need.aggregate([
      { $match: { status: "approved" } },
      { $group: { _id: "$category", count: { $sum: 1 }, totalTarget: { $sum: "$targetAmount" }, totalRaised: { $sum: "$raisedAmount" } } },
      { $sort: { count: -1 } },
    ]);

    res.json({
      success: true,
      data: {
        totalUsers: users,
        totalCharities: charities,
        verifiedCharities: charities - pendingCharities,
        pendingCharities,
        totalNeeds: needs,
        pendingNeeds,
        criticalNeeds,
        totalDonations: donations[0]?.total || 0,
        donationCount: donations[0]?.count || 0,
        monthlyDonations,
        categoryBreakdown,
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get pending charities
// @route   GET /api/admin/charities/pending
// @access  Private (admin)
exports.getPendingCharities = async (req, res, next) => {
  try {
    const charities = await Charity.find({ isVerified: false })
      .populate("owner", "name email")
      .sort({ createdAt: -1 });
    res.json({ success: true, count: charities.length, data: charities });
  } catch (err) {
    next(err);
  }
};

// @desc    Get pending needs
// @route   GET /api/admin/needs/pending
// @access  Private (admin)
exports.getPendingNeeds = async (req, res, next) => {
  try {
    const needs = await Need.find({ status: "pending" })
      .populate("charity", "name logo isVerified")
      .sort({ createdAt: -1 });
    res.json({ success: true, count: needs.length, data: needs });
  } catch (err) {
    next(err);
  }
};

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private (admin)
exports.getAllUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, role, search } = req.query;
    const query = {};
    if (role) query.role = role;
    if (search) query.$or = [{ name: new RegExp(search, "i") }, { email: new RegExp(search, "i") }];

    const users = await User.find(query)
      .select("-password -pushSubscriptions -interactionHistory")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);
    res.json({ success: true, count: users.length, total, data: users });
  } catch (err) {
    next(err);
  }
};

// @desc    Toggle user active status
// @route   PATCH /api/admin/users/:id/toggle
// @access  Private (admin)
exports.toggleUserStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: "User not found" });
    if (user.role === "admin") return res.status(403).json({ success: false, error: "Cannot modify admin accounts" });

    user.isActive = !user.isActive;
    await user.save();

    res.json({ success: true, data: { isActive: user.isActive } });
  } catch (err) {
    next(err);
  }
};

// @desc    Get platform analytics
// @route   GET /api/admin/analytics
// @access  Private (admin)
exports.getAnalytics = async (req, res, next) => {
  try {
    // Category distribution
    const categoryDist = await Need.aggregate([
      { $match: { status: "approved" } },
      { $group: { _id: "$category", count: { $sum: 1 }, raised: { $sum: "$raisedAmount" }, target: { $sum: "$targetAmount" } } },
      { $sort: { count: -1 } },
    ]);

    // Donation trend last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const donationTrend = await Donation.aggregate([
      { $match: { status: "completed", createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Top charities by donations
    const topCharities = await Donation.aggregate([
      { $match: { status: "completed" } },
      { $group: { _id: "$charity", total: { $sum: "$amount" }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: 5 },
      { $lookup: { from: "charities", localField: "_id", foreignField: "_id", as: "charity" } },
      { $unwind: "$charity" },
      { $project: { name: "$charity.name", logo: "$charity.logo", total: 1, count: 1 } },
    ]);

    res.json({
      success: true,
      data: { categoryDistribution: categoryDist, donationTrend, topCharities },
    });
  } catch (err) {
    next(err);
  }
};
