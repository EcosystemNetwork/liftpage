-- Stripe Invoicing for requests. An admin can send a Stripe invoice instead of (or as well
-- as) the client's checkout button. This holds the invoice that's out, so the admin sees it
-- and a checkout that pays first can void it.
--
-- stripe_session_id keeps meaning "the Stripe object that paid this request": a Checkout
-- session (cs_...) or, when the invoice paid, the invoice (in_...).
alter table public.holds add column if not exists stripe_invoice_id text unique;
