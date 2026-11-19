-- Two more accounts may hold the admin role. Kept in step with OWNER_EMAILS in lib/owner.ts;
-- change both together.
alter table public.profiles drop constraint profiles_admin_is_owner;
alter table public.profiles
  add constraint profiles_admin_is_owner check (
    role <> 'admin' or email in ('ericnans@gmail.com', '1126kentziti@gmail.com', 'cesar.cruz2622@gmail.com')
  );

-- Promote them if their accounts already exist.
update public.profiles set role = 'admin', disabled = false
  where email in ('1126kentziti@gmail.com', 'cesar.cruz2622@gmail.com');
