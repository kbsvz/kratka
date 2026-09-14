-- Local dev convenience only: a ready-to-use signed-in test account.
-- Runs after migrations on every `supabase db reset` (supabase/config.toml
-- [db.seed]). This inserts directly into auth.users/auth.identities,
-- bypassing the GoTrue signup API entirely (`db reset` also blows the whole
-- local database away each run, which is why fixed ids are safe here).

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'test@example.com',
  extensions.crypt('password123', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now(),
  '',
  '',
  '',
  ''
)
on conflict (id) do nothing;

-- Email/password sign-in checks this alongside auth.users; without it
-- GoTrue treats the account as having no email identity.
insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'email',
  '{"sub":"00000000-0000-0000-0000-000000000001","email":"test@example.com"}',
  now(),
  now(),
  now()
)
on conflict (provider_id, provider) do nothing;

-- Fixture pattern for the test user, so the Playwright critical-path smoke
-- test (test-plan.md §3 Phase 3) has something to open and print. The
-- patterns_before_insert trigger always derives slot/seq/name itself, so
-- only user_id/width/height need to be supplied here.
insert into public.patterns (user_id, width, height)
values ('00000000-0000-0000-0000-000000000001', 20, 20);
