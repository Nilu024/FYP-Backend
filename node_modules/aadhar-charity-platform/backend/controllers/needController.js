const Need = require("../models/Need");
const Charity = require("../models/Charity");
const { notifyCharityFollowers, broadcastUrgentNeed } = require("../services/notificationService");
const { sendNewNeedEmailAlerts } = require("../services/emailService");

// @desc    Get all approved needs (with filters)
// @route   GET /api/needs
// @access  Public
exports.getNeeds = async (req, res, next) => {
  try {
    const { category, urgency, search, page = 1, limit = 12 } = req.query;
    const query = { status: "approved" };

    if (category) query.category = category;
    if (urgency) query.urgency = urgency;
    if (search) query.$text = { $search: search };

    const skip = (page - 1) * limit;
    const needs = await Need.find(query)
      .populate("charity", "name logo location city rating isVerified")
      .sort({ isFeatured: -1, urgency: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Need.countDocuments(query);

    res.json({
      success: true,
      count: needs.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      data: needs,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single need
// @route   GET /api/needs/:id
// @access  Public
exports.getNeed = async (req, res, next) => {
  try {
    const need = await Need.findById(req.params.id).populate(
      "charity",
      "name logo location contact rating followerCount totalRaised description"
    );

    if (!need) return res.status(404).json({ success: false, error: "Need not found" });

    // Increment view count
    need.viewCount += 1;
    await need.save();

    res.json({ success: true, data: need });
  } catch (err) {
    next(err);
  }
};

// @desc    Create a need (charity only)
// @route   POST /api/needs
// @access  Private (charity)
exports.createNeed = async (req, res, next) => {
  try {
    const charity = await Charity.findOne({ owner: req.user.id });
    if (!charity) {
      return res.status(403).json({ success: false, error: "No charity associated with your account" });
    }

    if (!charity.isVerified) {
      return res.status(403).json({ success: false, error: "Your charity must be verified before listing needs" });
    }

    const need = await Need.create({ ...req.body, charity: charity._id });

    res.status(201).json({ success: true, data: need });
  } catch (err) {
    next(err);
  }
};

// @desc    Update a need
// @route   PUT /api/needs/:id
// @access  Private (charity owner)
exports.updateNeed = async (req, res, next) => {
  try {
    let need = await Need.findById(req.params.id).populate("charity");

    if (!need) return res.status(404).json({ success: false, error: "Need not found" });

    if (need.charity.owner.toString() !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }

    // If re-submitting after rejection, reset to pending
    if (need.status === "rejected" && req.body.status !== "rejected") {
      req.body.status = "pending";
    }

    need = await Need.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.json({ success: true, data: need });
  } catch (err) {
    next(err);
  }
};

// @desc    Admin approve/reject need
// @route   PATCH /api/needs/:id/status
// @access  Private (admin)
exports.updateNeedStatus = async (req, res, next) => {
  try {
    const { status, rejectionReason } = req.body;
    const validStatuses = ["approved", "rejected", "paused", "completed"];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: "Invalid status" });
    }

    const need = await Need.findByIdAndUpdate(
      req.params.id,
      {
        status,
        rejectionReason: status === "rejected" ? rejectionReason : undefined,
        verifiedAt: ["approved", "rejected"].includes(status) ? new Date() : undefined,
        verifiedBy: req.user.id,
      },
      { new: true }
    ).populate("charity");

    if (!need) return res.status(404).json({ success: false, error: "Need not found" });

    // Notify charity followers + send email alerts if approved
    if (status === "approved" && need.charity) {
      // 1. Push notification to followers
      await notifyCharityFollowers(need.charity._id, {
        title: `New Need: ${need.charity.name}`,
        body: need.title,
        type: "new_need",
        data: { needId: need._id.toString(), charityId: need.charity._id.toString(), url: `/needs/${need._id}` },
      });

      // 2. Email alerts to nearby donors with matching preferences
      sendNewNeedEmailAlerts(need, need.charity).catch((err) =>
        console.error("Email alert error:", err.message)
      );

      // 3. Broadcast urgently nearby if critical
      if (need.urgency === "critical") {
        await broadcastUrgentNeed(need, need.charity);
      }
    }

    res.json({ success: true, data: need });
  } catch (err) {
    next(err);
  }
};

// @desc    Get needs by charity
// @route   GET /api/needs/charity/:charityId
// @access  Public (approved only) / Private charity owner (all statuses)
exports.getNeedsByCharity = async (req, res, next) => {
  try {
    // If authenticated charity owner or admin, return all statuses
    const isOwnerOrAdmin =
      req.user &&
      (req.user.role === "admin" ||
        (req.user.role === "charity"));

    const query = {
      charity: req.params.charityId,
      ...(isOwnerOrAdmin ? {} : { status: "approved" }),
    };

    const needs = await Need.find(query).sort({ createdAt: -1 });
    res.json({ success: true, count: needs.length, data: needs });
  } catch (err) {
    next(err);
  }
};
