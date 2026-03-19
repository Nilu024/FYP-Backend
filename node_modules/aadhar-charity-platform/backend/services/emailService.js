const nodemailer = require("nodemailer");
const User = require("../models/User");
const { haversineDistance } = require("./knnService");

// ─── Create transporter ────────────────────────────────────────────────────
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_PASSWORD,
    },
  });
};

const FROM = `"${process.env.EMAIL_FROM_NAME || "AADHAR"}" <${process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_EMAIL}>`;
const APP_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// ─── HTML Email Template ───────────────────────────────────────────────────
const baseTemplate = ({ title, preheader, body, ctaText, ctaUrl }) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background:#f5f4f0; color:#1a1a1a; }
    .wrapper { max-width:600px; margin:0 auto; padding:32px 16px; }
    .card { background:#ffffff; border-radius:20px; overflow:hidden; box-shadow:0 4px 32px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #f97316 0%, #fb923c 50%, #10b981 100%); padding:40px 32px; text-align:center; }
    .logo { display:inline-flex; align-items:center; gap:10px; }
    .logo-icon { width:42px; height:42px; background:rgba(255,255,255,0.25); border-radius:12px; display:inline-flex; align-items:center; justify-content:center; }
    .logo-text { color:#fff; font-size:22px; font-weight:800; letter-spacing:-0.5px; }
    .header-title { color:#fff; font-size:28px; font-weight:800; margin-top:16px; line-height:1.2; }
    .header-sub { color:rgba(255,255,255,0.85); font-size:15px; margin-top:8px; }
    .content { padding:36px 32px; }
    .greeting { font-size:18px; font-weight:600; color:#1a1a1a; margin-bottom:12px; }
    .body-text { font-size:15px; line-height:1.7; color:#4a4a4a; margin-bottom:20px; }
    .need-card { background:#fff9f5; border:2px solid #fed7aa; border-radius:16px; padding:24px; margin:24px 0; }
    .need-category { display:inline-block; background:#fff3e8; color:#ea580c; font-size:12px; font-weight:700; padding:4px 12px; border-radius:100px; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:12px; }
    .need-title { font-size:20px; font-weight:800; color:#1a1a1a; margin-bottom:8px; line-height:1.3; }
    .need-desc { font-size:14px; color:#666; line-height:1.6; margin-bottom:16px; }
    .need-meta { display:flex; gap:16px; flex-wrap:wrap; }
    .meta-item { display:flex; align-items:center; gap:6px; font-size:13px; color:#888; }
    .meta-icon { font-size:14px; }
    .urgency-critical { background:#fef2f2; border-color:#fca5a5; }
    .urgency-critical .need-category { background:#fee2e2; color:#dc2626; }
    .urgency-high { background:#fff7ed; border-color:#fdba74; }
    .progress-wrap { margin:20px 0; }
    .progress-label { display:flex; justify-content:space-between; font-size:13px; color:#666; margin-bottom:6px; }
    .progress-bar { height:8px; background:#f0ede8; border-radius:100px; overflow:hidden; }
    .progress-fill { height:100%; border-radius:100px; background:linear-gradient(90deg,#f97316,#10b981); }
    .cta-wrap { text-align:center; margin:32px 0 12px; }
    .cta-btn { display:inline-block; background:linear-gradient(135deg,#f97316,#ea580c); color:#fff; text-decoration:none; font-size:16px; font-weight:700; padding:16px 40px; border-radius:14px; letter-spacing:0.2px; }
    .divider { height:1px; background:#f0ede8; margin:28px 0; }
    .tip-box { background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:16px 20px; margin:20px 0; }
    .tip-text { font-size:13px; color:#166534; line-height:1.5; }
    .footer { background:#faf9f7; padding:28px 32px; text-align:center; border-top:1px solid #f0ede8; }
    .footer-logo { font-size:16px; font-weight:800; color:#f97316; margin-bottom:8px; }
    .footer-text { font-size:12px; color:#aaa; line-height:1.6; }
    .footer-link { color:#f97316; text-decoration:none; }
    .social-row { margin:12px 0; }
    @media(max-width:480px) {
      .content { padding:24px 20px; }
      .header { padding:28px 20px; }
      .header-title { font-size:22px; }
      .need-title { font-size:17px; }
      .need-meta { gap:10px; }
      .cta-btn { padding:14px 28px; font-size:15px; }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <!-- Header -->
      <div class="header">
        <div class="logo">
          <div class="logo-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402z" fill="white"/>
            </svg>
          </div>
          <span class="logo-text">AADHAR</span>
        </div>
        <div class="header-title">${title}</div>
        ${preheader ? `<div class="header-sub">${preheader}</div>` : ""}
      </div>

      <!-- Content -->
      <div class="content">
        ${body}
        ${ctaText && ctaUrl ? `
        <div class="cta-wrap">
          <a href="${ctaUrl}" class="cta-btn">${ctaText}</a>
        </div>
        ` : ""}
      </div>

      <!-- Footer -->
      <div class="footer">
        <div class="footer-logo">❤️ AADHAR</div>
        <div class="footer-text">
          Connect. Care. Change.<br/>
          You're receiving this because you signed up for AADHAR.<br/>
          <a href="${APP_URL}/profile" class="footer-link">Manage preferences</a> · 
          <a href="${APP_URL}" class="footer-link">Visit platform</a>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`;

// ─── Format currency ───────────────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

// ─── Send a single email ───────────────────────────────────────────────────
const sendEmail = async ({ to, subject, html, text }) => {
  if (!process.env.SMTP_EMAIL || !process.env.SMTP_PASSWORD) {
    console.warn("⚠  Email not configured — skipping send to", to);
    return false;
  }
  try {
    const transporter = createTransporter();
    await transporter.sendMail({ from: FROM, to, subject, html, text });
    return true;
  } catch (err) {
    console.error(`❌ Email failed to ${to}:`, err.message);
    return false;
  }
};

// ─── NEW NEED ALERT: send to nearby donors ────────────────────────────────
/**
 * When a need is approved, find all users who:
 *  1. Have a location set
 *  2. Are within their preferred maxDistanceKm
 *  3. Have a matching category preference (or no preference — send anyway)
 * Then send a beautiful HTML email to each.
 */
const sendNewNeedEmailAlerts = async (need, charity) => {
  if (!need || !charity) return { sent: 0, skipped: 0 };

  const charityCoords = charity.location?.coordinates;
  if (!charityCoords || (charityCoords[0] === 0 && charityCoords[1] === 0)) {
    console.warn("⚠  Charity has no coordinates — skipping email alerts");
    return { sent: 0, skipped: 0 };
  }

  // Fetch all active donor users with location set
  const users = await User.find({
    role: "donor",
    isActive: true,
    "location.coordinates": { $ne: [0, 0] },
  }).select("name email location preferences");

  const urgencyMap = { low: "Low", medium: "Medium", high: "High", critical: "🚨 Critical" };
  const urgencyClass = { low: "", medium: "", high: "urgency-high", critical: "urgency-critical" };
  const progress = need.targetAmount > 0 ? Math.min(Math.round((need.raisedAmount / need.targetAmount) * 100), 100) : 0;

  let sent = 0, skipped = 0;
  const errors = [];

  for (const user of users) {
    try {
      const userCoords = user.location.coordinates;
      const distKm = haversineDistance(userCoords, charityCoords);
      const maxDist = user.preferences?.maxDistanceKm || 50;

      // Check distance threshold
      if (distKm > maxDist) { skipped++; continue; }

      // Check category preference (if user has set preferences, only send matching)
      const userCategories = user.preferences?.categories || [];
      if (userCategories.length > 0 && !userCategories.includes(need.category)) {
        skipped++;
        continue;
      }

      const needUrl = `${APP_URL}/needs/${need._id}`;
      const donateUrl = `${APP_URL}/donate/${need._id}`;
      const distLabel = distKm < 1 ? `${Math.round(distKm * 1000)}m` : `${distKm.toFixed(1)}km`;

      const body = `
        <p class="greeting">Hi ${user.name?.split(" ")[0] || "there"} 👋</p>
        <p class="body-text">
          A new cause has been listed <strong>${distLabel} from you</strong> that matches your interests.
          Here's your chance to make a real difference today.
        </p>

        <div class="need-card ${urgencyClass[need.urgency] || ""}">
          <div class="need-category">${need.category}</div>
          <div class="need-title">${need.title}</div>
          <div class="need-desc">${need.description?.slice(0, 180)}${need.description?.length > 180 ? "..." : ""}</div>

          <div class="progress-wrap">
            <div class="progress-label">
              <span><strong>${fmt(need.raisedAmount)}</strong> raised</span>
              <span>Goal: ${fmt(need.targetAmount)}</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width:${progress}%"></div>
            </div>
            <div style="font-size:12px;color:#aaa;margin-top:4px;">${progress}% funded · ${need.donorCount || 0} donors</div>
          </div>

          <div class="need-meta">
            <div class="meta-item"><span class="meta-icon">🏛</span> ${charity.name}</div>
            <div class="meta-item"><span class="meta-icon">📍</span> ${distLabel} from you</div>
            <div class="meta-item"><span class="meta-icon">⚡</span> ${urgencyMap[need.urgency] || need.urgency} urgency</div>
            ${need.beneficiaryCount ? `<div class="meta-item"><span class="meta-icon">👥</span> ${need.beneficiaryCount} beneficiaries</div>` : ""}
            ${need.deadline ? `<div class="meta-item"><span class="meta-icon">📅</span> Ends ${new Date(need.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</div>` : ""}
          </div>
        </div>

        <div class="tip-box">
          <div class="tip-text">
            💡 <strong>Why you're seeing this:</strong> This cause is within ${distLabel} of your location
            ${userCategories.length > 0 ? ` and matches your interest in <strong>${need.category}</strong>` : ""}.
            Our KNN algorithm matched it specifically to you.
          </div>
        </div>

        <div class="divider"></div>

        <p class="body-text" style="font-size:14px;color:#888;">
          Even a small contribution moves the progress bar. Every ₹10 counts.
          Your donation will be confirmed immediately with a receipt.
        </p>
      `;

      const subject = need.urgency === "critical"
        ? `🚨 Urgent: ${need.title} — ${distLabel} from you`
        : `New cause near you: ${need.title} (${distLabel})`;

      const ok = await sendEmail({
        to: user.email,
        subject,
        html: baseTemplate({
          title: need.urgency === "critical" ? "Urgent Cause Nearby" : "New Cause Near You",
          preheader: `${charity.name} needs your help · ${distLabel} from you`,
          body,
          ctaText: "Donate Now →",
          ctaUrl: donateUrl,
        }),
        text: `Hi ${user.name}, a new cause "${need.title}" by ${charity.name} is ${distLabel} from you. Goal: ${fmt(need.targetAmount)}. View: ${needUrl}`,
      });

      if (ok) sent++;
      else errors.push(user.email);

      // Small delay to avoid SMTP rate limits
      await new Promise(r => setTimeout(r, 80));
    } catch (err) {
      console.error(`Email error for ${user.email}:`, err.message);
      errors.push(user.email);
      skipped++;
    }
  }

  console.log(`📧 Need email alerts: ${sent} sent, ${skipped} skipped${errors.length ? `, ${errors.length} failed` : ""}`);
  return { sent, skipped, errors };
};

// ─── Welcome email ─────────────────────────────────────────────────────────
const sendWelcomeEmail = async (user) => {
  const body = `
    <p class="greeting">Welcome to AADHAR, ${user.name?.split(" ")[0] || "friend"}! 🎉</p>
    <p class="body-text">
      You've just joined India's smartest charity platform. We use AI to connect you
      with causes that matter most — right in your neighborhood.
    </p>
    <div class="tip-box">
      <div class="tip-text">
        🗺 <strong>Set your location</strong> in your profile to start receiving alerts for causes near you.<br/><br/>
        💛 <strong>Choose your interests</strong> (Education, Healthcare, etc.) and our KNN engine will
        personalise your feed automatically.
      </div>
    </div>
    <div class="divider"></div>
    <p class="body-text">Ready to make your first impact?</p>
  `;

  return sendEmail({
    to: user.email,
    subject: "Welcome to AADHAR — Let's make a difference together 💛",
    html: baseTemplate({
      title: "Welcome! You're in.",
      preheader: "Your journey to local impact starts here",
      body,
      ctaText: "Explore Causes Near You →",
      ctaUrl: `${APP_URL}/needs`,
    }),
    text: `Welcome to AADHAR, ${user.name}! Visit ${APP_URL} to find causes near you.`,
  });
};

// ─── Donation confirmation email ───────────────────────────────────────────
const sendDonationConfirmEmail = async (user, donation, need, charity) => {
  const body = `
    <p class="greeting">Thank you, ${user.name?.split(" ")[0] || "donor"}! 💛</p>
    <p class="body-text">
      Your donation of <strong style="color:#059669;font-size:18px;">${fmt(donation.amount)}</strong> 
      has been received. Here's your confirmation:
    </p>

    <div class="need-card" style="background:#f0fdf4;border-color:#bbf7d0;">
      <div class="need-category" style="background:#dcfce7;color:#166534;">Donation Confirmed ✅</div>
      <div class="need-title">${need?.title || charity?.name || "Your Donation"}</div>
      <div class="need-meta" style="margin-top:8px;">
        <div class="meta-item"><span class="meta-icon">🏛</span> ${charity?.name || "Charity"}</div>
        <div class="meta-item"><span class="meta-icon">💰</span> ${fmt(donation.amount)}</div>
        <div class="meta-item"><span class="meta-icon">🧾</span> ${donation.receiptNumber || donation._id}</div>
        <div class="meta-item"><span class="meta-icon">📅</span> ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</div>
      </div>
    </div>

    <div class="tip-box">
      <div class="tip-text">
        🌟 Your contribution directly helps real people. Share this cause with friends to double the impact!
      </div>
    </div>
    <div class="divider"></div>
    <p class="body-text" style="font-size:13px;color:#aaa;">
      This receipt is for your records. The charity has been notified of your donation.
      For 80G tax exemption, contact the charity directly with this receipt number.
    </p>
  `;

  return sendEmail({
    to: user.email,
    subject: `Donation Confirmed ✅ — ${fmt(donation.amount)} to ${charity?.name || "charity"}`,
    html: baseTemplate({
      title: "Donation Confirmed!",
      preheader: `Your ${fmt(donation.amount)} is making a difference`,
      body,
      ctaText: "View Your Donation History →",
      ctaUrl: `${APP_URL}/my-donations`,
    }),
    text: `Thank you ${user.name}! Your donation of ${fmt(donation.amount)} to ${charity?.name} has been confirmed. Receipt: ${donation.receiptNumber || donation._id}`,
  });
};

module.exports = {
  sendEmail,
  sendNewNeedEmailAlerts,
  sendWelcomeEmail,
  sendDonationConfirmEmail,
};
