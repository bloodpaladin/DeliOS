-- Development seed data ONLY.
-- Run manually after migrations when you have a test user.
-- Do NOT run in production.

-- Example: insert a few Trinidad & Tobago business locations (unverified → confirmed)
-- Replace '00000000-0000-0000-0000-000000000001' with a real auth.users id after sign-up.

/*
INSERT INTO public.business_locations (
  id,
  canonical_business_name,
  original_business_name,
  original_address,
  normalized_address,
  country,
  region,
  town,
  latitude,
  longitude,
  place_id,
  geocoding_provider,
  geocoding_confidence,
  verification_status,
  created_by
) VALUES
(
  'a1000000-0000-4000-8000-000000000001',
  'SuperPharm Westmall',
  'SuperPharm Westmall',
  'Westmall, Westmoorings, Trinidad',
  'Westmall, Westmoorings, Diego Martin, Trinidad and Tobago',
  'TT',
  'Trinidad',
  'Westmoorings',
  10.6825,
  -61.5603,
  NULL,
  'manual',
  0.95,
  'confirmed',
  NULL
),
(
  'a1000000-0000-4000-8000-000000000002',
  'PriceSmart Trincity',
  'PriceSmart',
  'Trincity Mall, Trinidad',
  'Trincity Mall, Trincity, Tunapuna-Piarco, Trinidad and Tobago',
  'TT',
  'Trinidad',
  'Trincity',
  10.6308,
  -61.3667,
  NULL,
  'manual',
  0.90,
  'confirmed',
  NULL
),
(
  'a1000000-0000-4000-8000-000000000003',
  'Massy Stores Maraval',
  'Massy Stores',
  'Maraval Road, Port of Spain',
  'Maraval Road, Port of Spain, Trinidad and Tobago',
  'TT',
  'Trinidad',
  'Port of Spain',
  10.6667,
  -61.5167,
  NULL,
  'manual',
  0.85,
  'approximate',
  NULL
);

INSERT INTO public.business_aliases (business_location_id, alias_name, alias_address, source)
VALUES
  ('a1000000-0000-4000-8000-000000000001', 'SuperPharm Westmoorings', 'Westmall', 'manual'),
  ('a1000000-0000-4000-8000-000000000002', 'PriceSmart', 'Trincity', 'ocr');
*/
