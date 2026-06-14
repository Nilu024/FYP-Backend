const mongoose = require("mongoose");

const CharitySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Charity name is required"],
      trim: true,
      unique: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    slug: {
      type: String,
      unique: true,
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      maxlength: [1000, "Description cannot exceed 1000 characters"],
    },
    categories: {
      type: [String],
      required: [true, "At least one category is required"],
      enum: [
        "Education",
        "Healthcare",
        "Poverty",
        "Environment",
        "Animal Welfare",
        "Disaster Relief",
        "Women Empowerment",
        "Child Welfare",
        "Elderly Care",
        "Disability Support",
        "Arts & Culture",
        "Sports",
        "Water & Sanitation",
        "Food Security",
        "Rural Development",
      ],
    },
    logo: { type: String, default: "" },
    banner: { type: String, default: "" },
    images: [String],
    // GeoJSON for KNN
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
      address: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      pincode: { type: String },
    },
    contact: {
      email: { type: String, required: true },
      phone: { type: String },
      website: { type: String },
    },
    registrationNumber: { type: String },
    // Admin verification
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    verifiedAt: Date,
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    // Stats
    totalRaised: { type: Number, default: 0 },
    totalDonors: { type: Number, default: 0 },
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    followerCount: { type: Number, default: 0 },
    // Owner (charity user account)
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Geo index for KNN queries
CharitySchema.index({ "location.coordinates": "2dsphere" });
CharitySchema.index({ categories: 1 });
CharitySchema.index({ isVerified: 1, isActive: 1 });

// Generate slug before save
CharitySchema.pre("save", function (next) {
  if (!this.isModified("name")) return next();
  this.slug = this.name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  next();
});

// Virtual: active needs count
CharitySchema.virtual("needs", {
  ref: "Need",
  localField: "_id",
  foreignField: "charity",
  justOne: false,
});

module.exports = mongoose.model("Charity", CharitySchema);
