const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    type: {
      type: String,
      enum: ["new_need", "urgent_need", "donation_confirmed", "need_completed", "charity_update", "system"],
      default: "system",
    },
    data: {
      charityId: { type: mongoose.Schema.Types.ObjectId, ref: "Charity" },
      needId: { type: mongoose.Schema.Types.ObjectId, ref: "Need" },
      donationId: { type: mongoose.Schema.Types.ObjectId, ref: "Donation" },
      url: String,
    },
    isRead: { type: Boolean, default: false },
    readAt: Date,
    isSent: { type: Boolean, default: false },
    sentAt: Date,
    channel: {
      type: String,
      enum: ["push", "in_app", "email"],
      default: "in_app",
    },
  },
  { timestamps: true }
);

NotificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", NotificationSchema);
