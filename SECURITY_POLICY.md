# Security Policy

## Overview

This document outlines security practices and policies for AutoTradeIL production environment.

---

## 🔐 Secrets Rotation Schedule

| Secret                | Rotation Period           | Last Rotated | Next Rotation |
| --------------------- | ------------------------- | ------------ | ------------- |
| SUPABASE_SERVICE_KEY  | Every 6 months            | May 2026     | November 2026 |
| SUPABASE_ANON_KEY     | Every 6 months            | May 2026     | November 2026 |
| JWT_SECRET            | Every 6 months            | May 2026     | November 2026 |
| ANTHROPIC_API_KEY     | Yearly                    | May 2026     | May 2027      |
| CLOUDINARY_API_SECRET | Yearly                    | May 2026     | May 2027      |
| REDIS_URL             | Never (managed by Render) | -            | -             |

---

## 📋 Rotation Procedure

### Before Rotation:

1. Schedule maintenance window (notify users 24h ahead)
2. Create full database backup
3. Document current secret in secure vault

### Rotation Steps:

1. Generate new secret in service dashboard
2. Add new secret to Render Environment Variables with temp name (e.g., `JWT_SECRET_NEW`)
3. Update code to check both old and new secrets (grace period)
4. Deploy new version
5. Monitor for 24 hours
6. Remove old secret
7. Rename `JWT_SECRET_NEW` to `JWT_SECRET`
8. Update this document

### After Rotation:

1. Verify all services operational
2. Delete old secret from vault
3. Update rotation log

---

## 🛡️ Security Headers

Enabled in production (apps/api/app/main.py):

- ✅ X-Content-Type-Options: nosniff
- ✅ X-Frame-Options: DENY
- ✅ X-XSS-Protection: 1; mode=block
- ✅ Strict-Transport-Security: max-age=31536000
- ✅ Referrer-Policy: strict-origin-when-cross-origin
- ✅ Permissions-Policy: restrictive

---

## 🔒 Database Security

### Row-Level Security (RLS):

- ✅ Enabled on all tables
- ✅ Policies: dealer isolation, admin access
- ✅ Service role key used only in backend (never exposed to frontend)

### Access Control:

- ✅ Multi-tenancy enforced via dealer_id
- ✅ All queries scoped by dealer context
- ✅ Admin-only tables protected

---

## 🚨 Incident Response

### Security Incident Levels:

**Level 1 - Critical:**

- Data breach, unauthorized access to PII
- Response time: Immediate
- Action: Rotate all secrets, notify users, investigate

**Level 2 - High:**

- Attempted breach, suspicious activity
- Response time: Within 1 hour
- Action: Review logs, strengthen access controls

**Level 3 - Medium:**

- Rate limit abuse, unusual traffic
- Response time: Within 24 hours
- Action: Adjust rate limits, monitor

### Incident Response Team:

- Primary: [Your name/email]
- Backup: [Backup contact]
- Escalation: Anthropic support, Supabase support

---

## 📊 Security Monitoring

### Automated Monitoring:

- ✅ Sentry: Error tracking and alerting
- ✅ UptimeRobot: Uptime monitoring (5 min intervals)
- ✅ Render: Performance metrics

### Manual Reviews:

- Weekly: Sentry error dashboard
- Monthly: Access logs review
- Quarterly: Full security audit

---

## 🔍 Compliance & Privacy

### Data Protection:

- ✅ HTTPS enforced
- ✅ Passwords hashed (bcrypt)
- ✅ JWTs for authentication
- ✅ No PII in logs

### User Privacy:

- ✅ Minimal data collection
- ✅ Clear privacy policy
- ✅ User data deletion on request

---

## 📅 Review Schedule

- **This document:** Review quarterly
- **Next review:** August 2026
- **Last updated:** May 2, 2026

---

## 🆘 Emergency Contacts

- **Supabase Support:** https://supabase.com/support
- **Render Support:** https://render.com/docs/support
- **Anthropic Support:** https://support.anthropic.com
- **Sentry Support:** https://sentry.io/support
