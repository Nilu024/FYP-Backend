const Charity = require("../models/Charity");
const User = require("../models/User");
const { trackInteraction } = require("../services/knnService");

// @desc    Get all verified charities
// @route   GET /api/charities
// @access  Public
exports.getCharities = async (req, res, next) => {
  try {
    const { category, city, search, page = 1, limit = 12 } = req.query;
    const query = { isVerified: true, isActive: true };

    if (category) query.categories = category;
    if (city) query["location.city"] = new RegExp(city, "i");
    if (search) query.$or = [
      { name: new RegExp(search, "i") },
      { description: new RegExp(search, "i") },
    ];

    const skip = (page - 1) * limit;
    const charities = await Charity.find(query)
      .select("-__v")
      .sort({ rating: -1, followerCount: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Charity.countDocuments(query);

    res.json({
      success: true,
      count: charities.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      data: charities,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single charity
// @route   GET /api/charities/:id
// @access  Public
exports.getCharity = async (req, res, next) => {
  try {
    const charity = await Charity.findById(req.params.id)
      .populate("owner", "name email")
      .populate({ path: "needs", match: { status: "approved" }, options: { sort: { urgency: -1 } } });

    if (!charity) return res.status(404).json({ success: false, error: "Charity not found" });

    res.json({ success: true, data: charity });
  } catch (err) {
    next(err);
  }
};

// @desc    Register a charity
// @route   POST /api/charities
// @access  Private (charity role)
exports.createCharity = async (req, res, next) => {
  try {
    const existing = await Charity.findOne({ owner: req.user.id });
    if (existing) {
      return res.status(400).json({ success: false, error: "You already have a registered charity" });
    }

    const charity = await Charity.create({ ...req.body, owner: req.user.id });
    res.status(201).json({ success: true, data: charity });
  } catch (err) {
    next(err);
  }
};

// @desc    Update charity
// @route   PUT /api/charities/:id
// @access  Private (owner or admin)
exports.updateCharity = async (req, res, next) => {
  try {
    let charity = await Charity.findById(req.params.id);
    if (!charity) return res.status(404).json({ success: false, error: "Charity not found" });

    if (charity.owner.toString() !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }

    // Prevent owner from self-verifying
    if (req.user.role !== "admin") {
      delete req.body.isVerified;
      delete req.body.verifiedAt;
      delete req.body.verifiedBy;
    }

    charity = await Charity.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    res.json({ success: true, data: charity });
  } catch (err) {
    next(err);
  }
};

// @desc    Follow / unfollow a charity
// @route   POST /api/charities/:id/follow
// @access  Private
exports.toggleFollow = async (req, res, next) => {
  try {
    const charity = await Charity.findById(req.params.id);
    if (!charity) return res.status(404).json({ success: false, error: "Charity not found" });

    const user = await User.findById(req.user.id);
    const isFollowing = user.followedCharities.includes(charity._id);

    if (isFollowing) {
      user.followedCharities = user.followedCharities.filter((id) => id.toString() !== charity._id.toString());
      charity.followers = charity.followers.filter((id) => id.toString() !== req.user.id);
      charity.followerCount = Math.max(0, charity.followerCount - 1);
    } else {
      user.followedCharities.push(charity._id);
      charity.followers.push(req.user.id);
      charity.followerCount += 1;

      // Track interaction for KNN
      if (charity.categories.length > 0) {
        await trackInteraction(user, charity.categories[0], charity._id, "follow");
      }
    }

    await user.save();
    await charity.save();

    res.json({ success: true, isFollowing: !isFollowing, followerCount: charity.followerCount });
  } catch (err) {
    next(err);
  }
};

// @desc    Admin verify charity
// @route   PATCH /api/charities/:id/verify
// @access  Private (admin)
exports.verifyCharity = async (req, res, next) => {
  try {
    const { isVerified } = req.body;
    const charity = await Charity.findByIdAndUpdate(
      req.params.id,
      { isVerified, verifiedAt: isVerified ? new Date() : null, verifiedBy: req.user.id },
      { new: true }
    );
    if (!charity) return res.status(404).json({ success: false, error: "Charity not found" });
    res.json({ success: true, data: charity });
  } catch (err) {
    next(err);
  }
};

// @desc    Get my charity (for charity dashboard)
// @route   GET /api/charities/my
// @access  Private (charity)
exports.getMyCharity = async (req, res, next) => {
  try {
    const charity = await Charity.findOne({ owner: req.user.id });
    if (!charity) return res.status(404).json({ success: false, error: "No charity found for your account" });
    res.json({ success: true, data: charity });
  } catch (err) {
    next(err);
  }
};
