-- GreenProof — trunk measurement taps
--
-- The user taps the left and right edge of the trunk on screen. We store WHERE
-- THEY TAPPED, never the resulting width.
--
-- WHY THE SPLIT MATTERS:
-- millimetres = pixel distance x (marker_mm / marker_px), and the marker is
-- found by ArUco detection on the server. If the client computed the width, a
-- forged request could claim any trunk diameter it liked — and trunk width is a
-- growth-plausibility signal, so a forged value would defeat the "a trunk
-- cannot shrink" check. Taps are raw observation; millimetres are a derived
-- verification result, and derived results are service-role only.
--
-- Coordinates are NORMALISED 0..1 against the stored 800px image, so they stay
-- correct regardless of the screen the taps were made on.

alter table checkins
  add column if not exists trunk_taps jsonb;

comment on column checkins.trunk_taps is
  'User-tapped trunk edges on the close-up: {"left":{"x":0.42,"y":0.55},'
  '"right":{"x":0.58,"y":0.55}}. Normalised 0..1. The server converts these to '
  'millimetres using the ArUco marker; the client never writes a width.';

-- The client may write the taps. It still may NOT write confidence, verdict,
-- signals, phash or the embeddings.
grant insert (trunk_taps) on checkins to authenticated;

-- Deliberately no UPDATE grant: a check-in's observations are fixed once
-- submitted. Re-measuring means a new visit, not editing history.
