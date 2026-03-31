const { getKNNRecommendations, getNearbyCauses, trackInteraction } = require("../services/knnService");
const User = require("../models/User");

// @desc    Get KNN personalized recommendations
// @route   GET /api/recommendations
// @access  Private
exports.getRecommendations = async (req, res, next) => {
  try {
    const k = parseInt(req.query.k) || 10;
    const maxDistanceKm = parseInt(req.query.maxDistanceKm) || undefined;

    const user = await User.findById(req.user.id);
    const results = await getKNNRecommendations(user, { k, maxDistanceKm });

    res.json({
      success: true,
      count: results.length,
      data: results.map(({ need, score, distanceKm, breakdown }) => ({
        need,
        score: Math.round(score * 100) / 100,
        distanceKm,
        breakdown,
      })),
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get nearby causes (geo-based)
// @route   GET /api/recommendations/nearby
// @access  Private
exports.getNearbyCauses = async (req, res, next) => {
  try {
    const maxDistanceKm = parseInt(req.query.maxDistanceKm) || 25;
    const limit = parseInt(req.query.limit) || 10;

    const user = await User.findById(req.user.id).select("location");
    const userCoords = user.location.coordinates;

    if (!userCoords || (userCoords[0] === 0 && userCoords[1] === 0)) {
      return res.status(400).json({
        success: false,
        error: "Please set your location to see nearby causes",
      });
    }

    const results = await getNearbyCauses(userCoords, maxDistanceKm, limit);

    res.json({
      success: true,
      count: results.length,
      data: results,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get "For You" feed - preference-based
// @route   GET /api/recommendations/for-you
// @access  Private
exports.getForYouFeed = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    const k = parseInt(req.query.k) || 12;

    // If user has no preferences yet, return general recommendations
    if (user.preferences.categoryWeights.size === 0 && user.preferences.categories.length === 0) {
      return res.json({
        success: true,
        isPersonalized: false,
        message: "Start exploring to get personalized recommendations",
        data: [],
      });
    }

    const results = await getKNNRecommendations(user, { k, includeAll: true });

    res.json({
      success: true,
      isPersonalized: true,
      count: results.length,
      topCategory: getTopCategory(user.preferences.categoryWeights),
      data: results,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Track user interaction (for KNN learning)
// @route   POST /api/recommendations/track
// @access  Private
exports.trackUserInteraction = async (req, res, next) => {
  try {
    const { category, charityId, action } = req.body;

    if (!category || !action) {
      return res.status(400).json({ success: false, error: "category and action are required" });
    }

    const validActions = ["view", "click", "donate", "follow"];
    if (!validActions.includes(action)) {
      return res.status(400).json({ success: false, error: `Action must be one of: ${validActions.join(", ")}` });
    }

    const user = await User.findById(req.user.id);
    await trackInteraction(user, category, charityId, action);

    res.json({ success: true, message: "Interaction tracked" });
  } catch (err) {
    next(err);
  }
};

const getTopCategory = (categoryWeights) => {
  if (!categoryWeights || categoryWeights.size === 0) return null;
  let top = null, maxWeight = 0;
  categoryWeights.forEach((weight, cat) => {
    if (weight > maxWeight) { maxWeight = weight; top = cat; }
  });
  return top;
};
