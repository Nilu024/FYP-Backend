/**
 * AADHAR KNN Recommendation Engine
 * Combines geospatial proximity + user preference weights
 * to recommend the most relevant charity needs.
 */

const Need = require("../models/Need");
const Charity = require("../models/Charity");

/**
 * Haversine formula - distance between two geo points in km
 * @param {number[]} coord1 [longitude, latitude]
 * @param {number[]} coord2 [longitude, latitude]
 */
const haversineDistance = (coord1, coord2) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371; // Earth radius in km

  const [lon1, lat1] = coord1;
  const [lon2, lat2] = coord2;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Normalize a value to 0-1 range
 */
const normalize = (value, min, max) => {
  if (max === min) return 0;
  return (value - min) / (max - min);
};

/**
 * KNN Score function
 * Combines:
 *  - Distance score (closer = higher)
 *  - Category preference score (user weights)
 *  - Urgency boost
 *  - Progress boost (needs that are close to goal)
 *
 * @param {Object} need - Need document with populated charity
 * @param {number[]} userCoords - User [lon, lat]
 * @param {Map} categoryWeights - User category weights map
 * @param {number} maxDistKm - Max distance threshold
 */
const computeKNNScore = (need, userCoords, categoryWeights, maxDistKm = 50) => {
  const charityCoords = need.charity.location.coordinates;

  // 1. Distance score (0-1, higher = closer)
  const distanceKm = haversineDistance(userCoords, charityCoords);
  const distanceScore = Math.max(0, 1 - distanceKm / maxDistKm);

  // 2. Category preference score (0-1)
  const totalWeight = Array.from(categoryWeights.values()).reduce((a, b) => a + b, 0) || 1;
  const catWeight = categoryWeights.get(need.category) || 0;
  const categoryScore = catWeight / totalWeight;

  // 3. Urgency boost
  const urgencyBoost = { low: 0, medium: 0.1, high: 0.25, critical: 0.4 };
  const urgencyScore = urgencyBoost[need.urgency] || 0;

  // 4. Progress boost (50-80% funded needs get boosted - almost there!)
  const progress = need.targetAmount > 0 ? need.raisedAmount / need.targetAmount : 0;
  const progressBoost = progress >= 0.5 && progress < 0.9 ? 0.15 : 0;

  // 5. Recency boost (newer = slightly higher)
  const ageMs = Date.now() - new Date(need.createdAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const recencyScore = Math.max(0, 1 - ageDays / 30) * 0.1;

  // Weighted composite score
  const score =
    distanceScore * 0.4 +
    categoryScore * 0.3 +
    urgencyScore * 0.15 +
    progressBoost * 0.1 +
    recencyScore * 0.05;

  return {
    need,
    score,
    distanceKm: Math.round(distanceKm * 10) / 10,
    breakdown: {
      distanceScore: Math.round(distanceScore * 100) / 100,
      categoryScore: Math.round(categoryScore * 100) / 100,
      urgencyScore,
      progressBoost,
      recencyScore: Math.round(recencyScore * 100) / 100,
    },
  };
};

/**
 * Get KNN recommendations for a user
 * @param {Object} user - User document
 * @param {Object} options - { k, maxDistanceKm, includeAll }
 */
const getKNNRecommendations = async (user, options = {}) => {
  const k = options.k || parseInt(process.env.KNN_DEFAULT_K) || 5;
  const maxDistanceKm =
    options.maxDistanceKm ||
    user.preferences.maxDistanceKm ||
    parseInt(process.env.KNN_MAX_DISTANCE_KM) ||
    50;

  const userCoords = user.location.coordinates;

  // Fetch approved needs with populated charity
  let query = {
    status: "approved",
  };

  // If user has preferences, optionally filter to preferred categories
  if (user.preferences.categories.length > 0 && !options.includeAll) {
    query.category = { $in: user.preferences.categories };
  }

  const needs = await Need.find(query)
    .populate({
      path: "charity",
      match: { isVerified: true, isActive: true },
      select: "name logo location categories rating followerCount",
    })
    .limit(200); // Process top 200 candidates

  // Filter out needs where charity didn't match
  const validNeeds = needs.filter((n) => n.charity !== null);

  if (validNeeds.length === 0) {
    // Fallback: return without location/preference filter
    return getKNNRecommendations(user, { ...options, includeAll: true, k });
  }

  // Compute KNN scores for each need
  const categoryWeights = user.preferences.categoryWeights || new Map();
  const scored = validNeeds.map((need) =>
    computeKNNScore(need, userCoords, categoryWeights, maxDistanceKm)
  );

  // Sort by score descending and return top K
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
};

/**
 * Get "Causes Near You" - purely geo-based, top K nearest
 * Uses MongoDB $near for efficient geospatial query
 */
const getNearbyCauses = async (userCoords, maxDistanceKm = 25, limit = 10) => {
  const charities = await Charity.find({
    isVerified: true,
    isActive: true,
    "location.coordinates": {
      $near: {
        $geometry: { type: "Point", coordinates: userCoords },
        $maxDistance: maxDistanceKm * 1000, // meters
      },
    },
  }).limit(limit);

  if (charities.length === 0) return [];

  const charityIds = charities.map((c) => c._id);
  const needs = await Need.find({
    charity: { $in: charityIds },
    status: "approved",
  })
    .populate("charity", "name logo location rating")
    .limit(limit * 2);

  // Add distance to each need
  return needs.map((need) => ({
    need,
    distanceKm: Math.round(
      haversineDistance(userCoords, need.charity.location.coordinates) * 10
    ) / 10,
  }));
};

/**
 * Update user interaction (for preference learning)
 */
const trackInteraction = async (user, category, charityId, action) => {
  await user.updateCategoryWeight(category, action);

  user.interactionHistory.push({
    category,
    charityId,
    action,
    weight: { view: 1, click: 2, donate: 5, follow: 3 }[action] || 1,
  });

  // Keep only last 100 interactions
  if (user.interactionHistory.length > 100) {
    user.interactionHistory = user.interactionHistory.slice(-100);
  }

  await user.save();
};

module.exports = {
  getKNNRecommendations,
  getNearbyCauses,
  trackInteraction,
  haversineDistance,
};
