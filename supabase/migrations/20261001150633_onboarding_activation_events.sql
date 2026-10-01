-- Estende o catálogo first-party para medir abertura do produto e segunda ferramenta.
-- first_generation já existe no CHECK e é único por usuário.
alter table marketing.acquisition_events
  drop constraint if exists acquisition_events_event_type_check;
alter table marketing.acquisition_events
  add constraint acquisition_events_event_type_check check (event_type in (
    'lp_view', 'lp_cta_click', 'signup', 'first_generation',
    'project_created', 'checkout_started', 'subscription_started',
    'subscription_renewed', 'subscription_canceled',
    'landing_view', 'cta_clicked', 'plans_viewed',
    'signup_started', 'onboarding_completed',
    'dashboard_viewed', 'renderizar_viewed', 'render_reference_selected',
    'image_uploaded', 'generation_started', 'generation_completed',
    'generation_failed', 'second_tool_completed',
    'result_approved', 'result_rejected', 'result_downloaded',
    'checkout_completed'
  ));
