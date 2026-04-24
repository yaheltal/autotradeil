-- ==========================================================================
-- Seed admin users for AutoTradeIL
-- ==========================================================================
-- PREREQUISITE: the two people below must ALREADY exist in auth.users.
-- Create them via Supabase dashboard:
--   Authentication → Users → "Invite user"  (they set password via email)
-- or via the `supabase.auth.admin.createUser()` API (service key).
--
-- The `on_auth_user_created` trigger (migration 10e02d1b0a76) mirrors the
-- row into public.users with user_type='dealer', verified=false. This
-- script elevates those rows to user_type='admin' and flips verified=true.
-- ==========================================================================

UPDATE public.users
SET user_type = 'admin',
    verified = true,
    updated_at = NOW()
WHERE email IN ('talyahel4@gmail.com', 'talniv93@gmail.com');

-- Verify — expect 2 rows:
SELECT id, email, user_type, verified, created_at
FROM public.users
WHERE user_type = 'admin'
ORDER BY email;
