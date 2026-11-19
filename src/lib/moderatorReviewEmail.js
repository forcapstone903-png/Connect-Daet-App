import sgMail from '@sendgrid/mail'
import { getEmailSender } from './emailSettings'

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function formatDate(value) {
  if (!value) return 'Not specified'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Not specified'
    : date.toLocaleString('en-PH', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Manila',
      })
}

function getAccountAppealUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()
    || process.env.SITE_URL?.trim()
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.trim()}` : '')
  try {
    const url = new URL(configured)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost')) return null
    return `${url.origin}/info/account-appeal`
  } catch {
    return null
  }
}

async function sendEmail(email, { subject, heading, paragraphs, actionUrl, logLabel }) {
  if (!email) return { sent: false, reason: 'missing_recipient' }

  const sender = await getEmailSender()
  if (!sender.configured) return { sent: false, reason: 'not_configured' }

  const text = `${paragraphs.join('\n\n')}${actionUrl ? `\n\nOpen secure appeal link: ${actionUrl}` : ''}${sender.footerText}`
  const htmlParagraphs = paragraphs
    .map((paragraph) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6">${escapeHtml(paragraph)}</p>`)
    .join('')
  const htmlActionLink = actionUrl
    ? `<p style="margin:20px 0"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;border-radius:9999px;background:#0369a1;padding:12px 20px;color:#fff;text-decoration:none;font-weight:700">Open secure appeal link</a></p>`
    : ''

  try {
    sgMail.setApiKey(sender.apiKey)
    await sgMail.send({
      to: email,
      from: sender.from,
      replyTo: sender.replyTo,
      subject,
      text,
      html: `<div style="margin:0;background:#f1f5f9;padding:32px 16px;font-family:Arial,sans-serif;color:#0f172a"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #dbeafe;border-radius:16px;overflow:hidden"><div style="padding:22px 28px;background:#172554;color:#fff;font-size:18px;font-weight:700;letter-spacing:.04em">DAET CONNECT</div><div style="padding:28px"><h1 style="margin:0 0 18px;font-size:22px">${escapeHtml(heading)}</h1>${htmlParagraphs}${htmlActionLink}</div><div style="padding:16px 28px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px">This is an automated account notification.${sender.footerHtml}</div></div></div>`,
    })
    return { sent: true }
  } catch (error) {
    console.error(`${logLabel} email delivery failed:`, {
      code: error.code || null,
      status: error.response?.statusCode || null,
    })
    return { sent: false, reason: 'delivery_failed' }
  }
}

export function sendSuspensionEmail(email, {
  username,
  reason,
  guideline,
  startAt,
  expiresAt,
  caseReference,
}) {
  return sendEmail(email, {
    subject: 'Your Daet Connect Account Has Been Temporarily Suspended',
    heading: 'Account suspension',
    logLabel: 'Suspension',
    paragraphs: [
      `Username: ${username || 'Account holder'}`,
      `Reason for suspension: ${reason || 'A community guideline violation was confirmed.'}`,
      `Relevant community guideline: ${guideline || 'Daet Connect Community Guidelines'}`,
      `Suspension start: ${formatDate(startAt)}`,
      `Suspension expiration: ${formatDate(expiresAt)}`,
      `Case reference: ${caseReference || 'Available in Account and Posting Restriction Appeals'}`,
      'To appeal, sign in and open Account and Posting Restriction Appeals. If you cannot access your account, use the Account Appeal page and request a secure link using your case reference and registered email address.',
    ],
    actionUrl: getAccountAppealUrl(),
  })
}

export function sendPermanentBanEmail(email, {
  username,
  reason,
  guideline,
  startAt,
  caseReference,
}) {
  return sendEmail(email, {
    subject: 'Your Daet Connect Account Has Been Permanently Banned',
    heading: 'Permanent account ban',
    logLabel: 'Permanent ban',
    paragraphs: [
      `Username: ${username || 'Account holder'}`,
      'Decision: Your account has been permanently banned following an authorized moderation decision.',
      `Explanation: ${reason || 'A community guideline violation was confirmed.'}`,
      `Applicable community guideline: ${guideline || 'Daet Connect Community Guidelines'}`,
      `Decision date: ${formatDate(startAt)}`,
      `Case reference: ${caseReference || 'Included in your case information'}`,
      'To appeal, open the Daet Connect Account Appeal page, enter your case reference and registered email address, and request a secure appeal link. The link will be sent only to the registered address.',
    ],
    actionUrl: getAccountAppealUrl(),
  })
}

export function sendAccountWarningEmail(email, { username, reason, guideline }) {
  return sendEmail(email, {
    subject: 'Daet Connect Community Guidelines Warning',
    heading: 'Community guidelines warning',
    logLabel: 'Account warning',
    paragraphs: [
      `Username: ${username || 'Account holder'}`,
      `Warning: ${reason}`,
      `Relevant community guideline: ${guideline || 'Daet Connect Community Guidelines'}`,
      'Please review the Daet Connect Community Guidelines before participating further.',
    ],
  })
}

export function sendAccountReviewPendingEmail(email, { username }) {
  return sendEmail(email, {
    subject: 'Your Daet Connect Account Is Under Review',
    heading: 'Account under review',
    logLabel: 'Account review pending',
    paragraphs: [
      `Username: ${username || 'Account holder'}`,
      'Your account has been reported and is currently under review by the administration. No final decision has been made yet.',
    ],
  })
}

export function sendRestrictionLiftedEmail(email, { banType, reason } = {}) {
  if (banType === 'suspension') {
    return sendEmail(email, {
      subject: 'Your Daet Connect Account Suspension Has Been Lifted',
      heading: 'Your account suspension has been lifted',
      logLabel: 'Suspension lifted',
      paragraphs: [
        'Your account suspension has expired or has been officially lifted.',
        'You may now access the permitted Daet Connect community features, including creating posts, commenting, reacting, and joining discussions.',
        'Thank you for being part of Daet Connect.',
      ],
    })
  }

  return sendEmail(email, {
    subject: banType === 'permanent'
      ? 'Your Daet Connect Permanent Ban Has Been Reversed'
      : 'Your Daet Connect Posting Restriction Has Been Lifted',
    heading: banType === 'permanent' ? 'Permanent ban reversed' : 'Posting restriction lifted',
    logLabel: 'Restriction lifted',
    paragraphs: [
      banType === 'permanent'
        ? 'An authorized System Administrator reversed your permanent ban. Your account access has been restored if no other restriction applies.'
        : 'Your posting restriction has been lifted. You may publish posts, comments, and replies again.',
      reason ? `Decision explanation: ${reason}` : 'Thank you for being part of Daet Connect.',
    ],
  })
}

export function sendSuspensionDurationChangedEmail(email, { username, expiresAt }) {
  return sendEmail(email, {
    subject: 'Your Daet Connect Suspension Duration Was Reduced',
    heading: 'Suspension duration reduced',
    logLabel: 'Suspension duration update',
    paragraphs: [
      `Username: ${username || 'Account holder'}`,
      `Your suspension duration was reduced. The updated expiration is ${formatDate(expiresAt)}.`,
      'You can view your case and appeal status in Account and Posting Restriction Appeals.',
    ],
  })
}

export function sendSuspensionExpirationNoticeEmail(email, { username, newStatus }) {
  return sendEmail(email, {
    subject: 'Your Daet Connect suspension period has ended',
    heading: 'Suspension period ended',
    logLabel: 'Suspension expiration',
    paragraphs: [
      `Username: ${username || 'Account holder'}`,
      `Your suspension period has ended. Another active account restriction remains, so your current account status is ${String(newStatus || 'restricted').toUpperCase()}.`,
      'If you believe this is incorrect, sign in to Account and Posting Restriction Appeals or use the secure Account Appeal page.',
    ],
  })
}

export function sendAppealAccessEmail(email, { appealUrl, caseReference }) {
  return sendEmail(email, {
    subject: 'Secure link to appeal your Daet Connect account ban',
    heading: 'Complete your account appeal',
    logLabel: 'Appeal access',
    paragraphs: [
      `Case reference: ${caseReference}`,
      'Use this one-time link to submit or update the appeal for this case. It expires in 30 minutes and can be used once.',
      'If you did not request this link, you can ignore this email. No account or appeal details were changed.',
    ],
    actionUrl: appealUrl,
  })
}

export function sendAppealMoreInformationEmail(email, { appealType, caseReference, reason }) {
  return sendEmail(email, {
    subject: 'More information is needed for your Daet Connect appeal',
    heading: 'Additional appeal information requested',
    logLabel: 'Appeal information request',
    paragraphs: [
      `Case reference: ${caseReference || 'See your appeal history'}`,
      'The review team needs more information to continue reviewing your appeal. Sign in to Account and Posting Restriction Appeals, or use the Account Appeal page if you cannot access your account.',
      reason ? `Requested information: ${reason}` : "Open your appeal history to see the review team's request.",
      `Appeal type: ${appealType || 'Account restriction'}`,
    ],
    actionUrl: getAccountAppealUrl(),
  })
}

export function sendModerationAppealDecisionEmail(email, { appealType, decision, newStatus, reason }) {
  const approved = decision === 'approve'
  const isPermanentBan = appealType === 'permanent_ban'
  const isSuspension = appealType === 'account_suspension'
  const subject = isPermanentBan
    ? `Your permanent ban appeal was ${approved ? 'approved' : 'rejected'}`
    : isSuspension
      ? `Your account suspension appeal was ${approved ? 'approved' : 'rejected'}`
      : `Your posting restriction appeal was ${approved ? 'approved' : 'rejected'}`
  const result = approved
    ? `Your appeal was approved. Your current account status is ${String(newStatus || 'unchanged').toUpperCase()}.`
    : 'Your appeal was rejected. The existing account restriction remains in effect.'

  return sendEmail(email, {
    subject,
    heading: approved ? 'Appeal approved' : 'Appeal rejected',
    logLabel: 'Moderation appeal decision',
    paragraphs: [
      result,
      reason ? `Decision explanation: ${reason}` : 'Sign in or use the secure Account Appeal page to review your case.',
      'For account-access issues, use the Daet Connect Account Appeal page with your case reference and registered email address.',
    ],
    actionUrl: getAccountAppealUrl(),
  })
}
